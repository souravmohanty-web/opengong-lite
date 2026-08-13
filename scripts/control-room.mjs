#!/usr/bin/env node
// scripts/control-room.mjs — internal ops dashboard (team/plans/control-room.md).
// Zero-dep ESM, Node >=22. Aggregates data that ALREADY EXISTS on disk (bundles,
// run records, the scorecard) into one self-contained static page:
//   node scripts/control-room.mjs   (wired as `npm run control-room`)
// writes ./control-room.html — open it in a browser, nothing else runs.
//
// Iron law (control-room.md): THE CONTROL ROOM OBSERVES AND PROPOSES; IT NEVER
// SILENTLY CHANGES THE PIPELINE. This script only reads. It writes exactly one
// file: control-room.html.
//
// Every panel says, honestly, whether a number is real (computed from files on
// disk right now) or a stub (no data source exists yet, and where it will come
// from once one does). Never fake a green.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

function safeReadJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function listJsonFiles(dir, suffix = '.json') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .sort()
    .map((f) => path.join(dir, f));
}

// ── data loading ─────────────────────────────────────────────────────────

export function loadBundles(root = ROOT) {
  const dir = path.join(root, 'samples/bundles');
  return listJsonFiles(dir, '.bundle.json')
    .map((p) => ({ file: path.relative(root, p), data: safeReadJson(p) }))
    .filter((b) => b.data);
}

// Run records live in two places: committed sample notes (samples/notes/*.run.json,
// always present) and live runs/<id>/run.json (gitignored, may not exist in a
// fresh checkout — read it if it's there, don't fail if it isn't).
export function loadRunRecords(root = ROOT) {
  const notes = listJsonFiles(path.join(root, 'samples/notes'), '.run.json').map((p) => ({
    file: path.relative(root, p),
    source: 'sample',
    data: safeReadJson(p),
  }));
  const runsDir = path.join(root, 'runs');
  const live = existsSync(runsDir)
    ? readdirSync(runsDir)
        .filter((d) => existsSync(path.join(runsDir, d, 'run.json')))
        .sort()
        .map((d) => ({
          file: path.relative(root, path.join(runsDir, d, 'run.json')),
          source: 'live',
          data: safeReadJson(path.join(runsDir, d, 'run.json')),
        }))
    : [];
  return [...notes, ...live].filter((r) => r.data);
}

export function loadScorecard(root = ROOT) {
  const p = path.join(root, 'team/score-run.json');
  return existsSync(p) ? safeReadJson(p) : null;
}

// team/labels.json (golden real-call labels) and an evals/ directory (mark-wrong
// feedback loop, team/plans/master-plan.md L~132) are both DESIGNED but not built
// yet anywhere in this repo — confirmed by search, not assumed. Report presence
// honestly so the page never implies data that isn't there.
export function loadLabels(root = ROOT) {
  const p = path.join(root, 'team/labels.json');
  return existsSync(p) ? safeReadJson(p) : null;
}

export function loadEvals(root = ROOT) {
  const dir = path.join(root, 'evals');
  if (!existsSync(dir)) return [];
  return listJsonFiles(dir, '.json').map((p) => ({ file: path.relative(root, p), data: safeReadJson(p) }));
}

// ── panel 1: quality ─────────────────────────────────────────────────────

export function aggregateQuality(bundles) {
  const statusTotals = { verified: 0, segment_corrected: 0, uncorroborated: 0, blocked_injection: 0 };
  const matchTypeTotals = {}; // real evidence.match_type breakdown (exact/none/segment_corrected today)
  const confTotals = { high: 0, medium: 0, low: 0, unset: 0 };
  const flagTotals = {};
  const perCall = [];

  for (const { file, data } of bundles) {
    const claims = data.claims ?? [];
    const callStatus = { verified: 0, segment_corrected: 0, uncorroborated: 0, blocked_injection: 0 };
    for (const c of claims) {
      if (callStatus[c.status] !== undefined) callStatus[c.status] += 1;
      if (statusTotals[c.status] !== undefined) statusTotals[c.status] += 1;

      for (const e of c.evidence ?? []) {
        matchTypeTotals[e.match_type] = (matchTypeTotals[e.match_type] ?? 0) + 1;
      }

      const conf = c.interpretation_confidence ?? 'unset';
      confTotals[conf] = (confTotals[conf] ?? 0) + 1;

      for (const cf of c.context_flags ?? []) {
        flagTotals[cf.flag] = (flagTotals[cf.flag] ?? 0) + 1;
      }
    }
    const total = claims.length;
    const passed = callStatus.verified + callStatus.segment_corrected;
    perCall.push({
      call: data.call?.id ?? file,
      title: data.call?.title ?? '',
      total,
      passRate: total ? passed / total : null,
      ...callStatus,
    });
  }

  const totalClaims = Object.values(statusTotals).reduce((a, b) => a + b, 0);
  const passRate = totalClaims ? (statusTotals.verified + statusTotals.segment_corrected) / totalClaims : null;

  const topFlags = Object.entries(flagTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([flag, count]) => ({ flag, count }));

  return { statusTotals, matchTypeTotals, confTotals, topFlags, perCall, totalClaims, passRate };
}

// ── panel 2: performance & cost ─────────────────────────────────────────

export function aggregatePerformance(runRecords) {
  let costUsd = 0;
  let liveCostUsd = 0;
  let offlineRuns = 0;
  let liveRuns = 0;
  const tokens = { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
  const cacheActions = {};
  let cacheMissesUnexpected = 0;
  const durationsMs = [];
  const budgetDecisions = [];

  for (const { data } of runRecords) {
    const ledger = data.context_ledger ?? [];
    let runCost = 0;
    for (const entry of ledger) {
      const c = entry.cost_usd ?? 0;
      runCost += c;
      tokens.input += entry.usage?.input_tokens ?? 0;
      tokens.output += entry.usage?.output_tokens ?? 0;
      tokens.cache_creation += entry.usage?.cache_creation_input_tokens ?? 0;
      tokens.cache_read += entry.usage?.cache_read_input_tokens ?? 0;
      cacheActions[entry.cache_action ?? 'none'] = (cacheActions[entry.cache_action ?? 'none'] ?? 0) + 1;
    }
    costUsd += runCost;
    if (runCost > 0) {
      liveCostUsd += runCost;
      liveRuns += 1;
    } else {
      offlineRuns += 1;
    }
    cacheMissesUnexpected += data.cache_misses_unexpected ?? 0;
    if (data.started_at && data.completed_at) {
      const ms = Date.parse(data.completed_at) - Date.parse(data.started_at);
      if (Number.isFinite(ms) && ms >= 0) durationsMs.push(ms);
    }
    for (const d of data.budget?.decisions ?? []) budgetDecisions.push(d);
  }

  return {
    costUsd,
    liveCostUsd,
    liveRuns,
    offlineRuns,
    tokens,
    cacheActions,
    cacheMissesUnexpected,
    durationsMs,
    budgetDecisions,
    runCount: runRecords.length,
  };
}

// ── panel 3: reliability ────────────────────────────────────────────────

export function aggregateReliability(runRecords) {
  const exitReasons = {};
  let extractorFailures = 0;
  let repairCount = 0;
  let crashedCount = 0;

  for (const { data } of runRecords) {
    const reason = data.exit_reason ?? 'UNKNOWN';
    exitReasons[reason] = (exitReasons[reason] ?? 0) + 1;
    if (reason === 'CRASHED') crashedCount += 1;
    extractorFailures += (data.extractor_failures ?? []).length;
    for (const entry of data.context_ledger ?? []) {
      if (entry.repair) repairCount += 1;
    }
  }

  return { exitReasons, extractorFailures, repairCount, crashedCount, runCount: runRecords.length };
}

// ── threshold contracts (control-room.md §"Threshold config") ──────────
// Bands are illustrative until enough volume exists to fit them for real
// (v1 note in control-room.md). Each row still gets a live `actual` value
// where the data on disk can produce one, so the page shows real status
// against illustrative bands rather than pretending the bands are load-bearing.

export function buildThresholds({ quality, performance, reliability }) {
  const gatePct = quality.passRate == null ? null : Math.round(quality.passRate * 1000) / 10;
  const cacheMiss = performance.cacheMissesUnexpected;
  const crashed = reliability.crashedCount;
  const failed = (reliability.exitReasons.FAILED ?? 0) + (reliability.exitReasons.PARTIAL ?? 0);

  function bandFor(value, green, redDirection = 'below') {
    if (value == null) return 'pending';
    if (redDirection === 'below') return value >= green ? 'green' : value >= green - 15 ? 'amber' : 'red';
    return value <= green ? 'green' : value <= green + 0 ? 'amber' : 'red'; // exact-match metrics
  }

  return [
    {
      metric: 'Gate pass-rate (verified + segment_corrected / total)',
      actual: gatePct == null ? 'no bundles' : `${gatePct}%`,
      green: '≥ 95%',
      amber: '85–95%',
      red: '< 85%',
      status: bandFor(gatePct, 95),
      named_action_on_red: 'run traps suite; check canonical-text invariant; review last prompt change',
    },
    {
      metric: 'Precision vs golden labels',
      actual: 'PENDING — no team/labels.json yet',
      green: '≥ 90%',
      amber: '75–90%',
      red: '< 75%',
      status: 'pending',
      named_action_on_red: 'flip gate to exact-only via config',
    },
    {
      metric: 'cache_misses_unexpected (sum across runs)',
      actual: String(cacheMiss),
      green: '0',
      amber: 'n/a',
      red: '> 0 (any)',
      status: cacheMiss > 0 ? 'red' : 'green',
      named_action_on_red: 'diff prefix hashes; find the invalidator',
    },
    {
      metric: 'Exit-reason: CRASHED count',
      actual: String(crashed),
      green: '0',
      amber: 'n/a',
      red: '> 0 (any)',
      status: crashed > 0 ? 'red' : 'green',
      named_action_on_red: 'read crashed_stage + heartbeat gap; file incident',
    },
    {
      metric: 'Exit-reason: FAILED / PARTIAL count',
      actual: String(failed),
      green: '0',
      amber: '1–2',
      red: '≥ 3',
      status: failed === 0 ? 'green' : failed <= 2 ? 'amber' : 'red',
      named_action_on_red: 'check extractor_failures per run; isolate the failing extractor',
    },
    {
      metric: 'Outcome-correlation contract (score → deal stage)',
      actual: 'PENDING — v2, needs CRM sync + volume (control-room.md §Build cost & phasing)',
      green: 'HOLDING',
      amber: 'DRIFTING',
      red: 'BROKEN (≥5 same-direction mismatches, rolling window)',
      status: 'pending',
      named_action_on_red: 'emit written reconciliation proposal — human accepts, never auto-applied',
    },
  ];
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function pct(n, d) {
  if (!d) return '—';
  return `${Math.round((n / d) * 1000) / 10}%`;
}

function bar(n, d, cls = '') {
  const w = d ? Math.round((n / d) * 1000) / 10 : 0;
  return `<div class="bar-track"><div class="bar-fill ${cls}" style="width:${w}%"></div></div>`;
}

function badge(status) {
  const label = { green: 'GREEN', amber: 'AMBER', red: 'RED', pending: 'PENDING' }[status] ?? status.toUpperCase();
  return `<span class="badge badge-${status}">${label}</span>`;
}

function fmtUsd(n) {
  return `$${n.toFixed(6)}`;
}

function fmtMs(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return { p50: at(50), p90: at(90), n: sorted.length };
}

// ── render ───────────────────────────────────────────────────────────────

export function renderHtml({ quality, performance, reliability, thresholds, scorecard, labels, evals, bundles, runRecords, generatedAt }) {
  const q = quality;
  const p = performance;
  const r = reliability;

  const confRows = ['high', 'medium', 'low', 'unset']
    .map((k) => ({ k, n: q.confTotals[k] ?? 0 }))
    .filter((row) => row.n > 0 || row.k !== 'unset');

  const perCallRows = q.perCall
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.call)}${c.title ? `<div class="muted small">${escapeHtml(c.title)}</div>` : ''}</td>
        <td class="num">${c.total}</td>
        <td class="num">${c.passRate == null ? '—' : pct(c.total * c.passRate, c.total)}</td>
        <td class="num">${c.verified}</td>
        <td class="num">${c.segment_corrected}</td>
        <td class="num">${c.uncorroborated}</td>
        <td class="num">${c.blocked_injection}</td>
      </tr>`,
    )
    .join('\n');

  const flagRows = q.topFlags.length
    ? q.topFlags
        .map(
          (f) => `<tr><td>${escapeHtml(f.flag)}</td><td class="num">${f.count}</td><td>${bar(f.count, q.topFlags[0].count, 'fill-amber')}</td></tr>`,
        )
        .join('\n')
    : '<tr><td colspan="3" class="muted">no context_flags fired across any loaded bundle</td></tr>';

  const matchTypeRows = Object.entries(q.matchTypeTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${n}</td></tr>`)
    .join('\n');

  const dur = fmtMs(p.durationsMs);
  const totalTok = p.tokens.input + p.tokens.output + p.tokens.cache_creation + p.tokens.cache_read;

  const exitRows = Object.entries(r.exitReasons)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([reason, n]) =>
        `<tr><td>${escapeHtml(reason)}</td><td class="num">${n}</td><td>${bar(n, r.runCount, reason === 'CRASHED' || reason === 'FAILED' ? 'fill-red' : 'fill-green')}</td></tr>`,
    )
    .join('\n');

  const thresholdRows = thresholds
    .map(
      (t) => `<tr>
        <td>${escapeHtml(t.metric)}</td>
        <td class="num">${escapeHtml(t.actual)}</td>
        <td class="band">${escapeHtml(t.green)}</td>
        <td class="band">${escapeHtml(t.amber)}</td>
        <td class="band">${escapeHtml(t.red)}</td>
        <td>${badge(t.status)}</td>
        <td class="muted small">${escapeHtml(t.named_action_on_red)}</td>
      </tr>`,
    )
    .join('\n');

  const scorecardBlock = scorecard
    ? `<p class="real">REAL — team/score-run.json, generated ${escapeHtml(scorecard.generated_at ?? '?')}</p>
       <p>green <b>${scorecard.summary?.green ?? '?'}</b> · amber <b>${scorecard.summary?.yellow ?? '?'}</b> · red <b>${scorecard.summary?.red ?? '?'}</b> · pending <b>${scorecard.summary?.pending ?? '?'}</b> · total metrics <b>${scorecard.summary?.total_metrics ?? '?'}</b></p>`
    : `<p class="stub">STUB — team/score-run.json not found in this checkout (it's gitignored; run <code>npm run scorecard</code> to generate it locally).</p>`;

  const labelsBlock = labels
    ? `<p class="real">REAL — team/labels.json found, ${Array.isArray(labels) ? labels.length : Object.keys(labels).length} entries.</p>`
    : `<p class="stub">PENDING — no <code>team/labels.json</code> golden-label file yet. Precision-vs-golden re-scores automatically on every prompt/model change once the labeled real call(s) land (control-room.md §1).</p>`;

  const evalsBlock = evals.length
    ? `<p class="real">REAL — ${evals.length} file(s) under <code>evals/</code>.</p>`
    : `<p class="stub">NO EVAL DATA YET, WIRE ON FIRST EVAL RUN. Design (master-plan.md): mark-a-claim-wrong in the viewer → logged to <code>evals/</code> with evidence → an <code>evals</code> replay command reports precision drift per extractor → documented fix cycle. Runs quietly in the background; this panel is where its output surfaces once the loop exists.</p>`;

  const budgetBlock = p.budgetDecisions.length
    ? `<p class="real">REAL — ${p.budgetDecisions.length} budget/degrade-ladder decision(s) logged.</p>`
    : `<p class="muted">No degrade-ladder rungs have fired in any loaded run — <code>budget.decisions</code> is empty everywhere. That is expected at this volume, not a stub.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenGong Lite — Control Room</title>
<style>
${CSS}
</style>
</head>
<body>
<header class="topbar">
  <div>
    <h1>Control Room</h1>
    <p class="muted">Internal ops console — quality, cost, reliability, drift. Generated ${escapeHtml(generatedAt)} from ${bundles.length} bundle(s) and ${runRecords.length} run record(s) on disk. Not part of the end-user product.</p>
  </div>
  <div class="iron-law">THE CONTROL ROOM OBSERVES AND PROPOSES;<br>IT NEVER SILENTLY CHANGES THE PIPELINE</div>
</header>

<main>

<section id="panel-quality" class="panel">
  <h2>1 · Quality</h2>

  <div class="grid-2">
    <div>
      <h3>Gate pass-rate (aggregate)</h3>
      <p class="big">${q.passRate == null ? '—' : pct(q.statusTotals.verified + q.statusTotals.segment_corrected, q.totalClaims)}</p>
      <p class="muted small">${q.statusTotals.verified + q.statusTotals.segment_corrected} of ${q.totalClaims} claims verified or segment-corrected across ${bundles.length} bundle(s). <span class="real-tag">REAL</span></p>
      <table class="mini">
        <tbody>
          <tr><td>verified</td><td class="num">${q.statusTotals.verified}</td><td>${bar(q.statusTotals.verified, q.totalClaims, 'fill-green')}</td></tr>
          <tr><td>segment_corrected</td><td class="num">${q.statusTotals.segment_corrected}</td><td>${bar(q.statusTotals.segment_corrected, q.totalClaims, 'fill-amber')}</td></tr>
          <tr><td>uncorroborated</td><td class="num">${q.statusTotals.uncorroborated}</td><td>${bar(q.statusTotals.uncorroborated, q.totalClaims, 'fill-amber')}</td></tr>
          <tr><td>blocked_injection</td><td class="num">${q.statusTotals.blocked_injection}</td><td>${bar(q.statusTotals.blocked_injection, q.totalClaims, 'fill-red')}</td></tr>
        </tbody>
      </table>
    </div>
    <div>
      <h3>Interpretation-confidence mix</h3>
      <table class="mini">
        <tbody>
          ${confRows.map((c) => `<tr><td>${c.k}</td><td class="num">${c.n}</td><td>${bar(c.n, q.totalClaims, c.k === 'high' ? 'fill-green' : c.k === 'low' ? 'fill-red' : 'fill-amber')}</td></tr>`).join('\n')}
        </tbody>
      </table>
      <p class="muted small">7-day trend not shown — only one snapshot of bundles exists in this checkout; trending needs repeated runs over time. <span class="stub-tag">STUB (trend)</span></p>
    </div>
  </div>

  <h3>Per-call gate pass-rate</h3>
  <div class="table-wrap">
  <table>
    <thead><tr><th>Call</th><th class="num">Claims</th><th class="num">Pass rate</th><th class="num">verified</th><th class="num">seg_corrected</th><th class="num">uncorroborated</th><th class="num">blocked_injection</th></tr></thead>
    <tbody>${perCallRows}</tbody>
  </table>
  </div>

  <div class="grid-2">
    <div>
      <h3>Top firing context_flags</h3>
      <div class="table-wrap">
      <table>
        <thead><tr><th>Flag</th><th class="num">Count</th><th></th></tr></thead>
        <tbody>${flagRows}</tbody>
      </table>
      </div>
      <p class="muted small">A spike in one flag localizes to a prompt/lexicon problem (control-room.md §1). <span class="real-tag">REAL</span></p>
    </div>
    <div>
      <h3>Evidence match_type breakdown</h3>
      <div class="table-wrap">
      <table>
        <thead><tr><th>match_type</th><th class="num">Count</th></tr></thead>
        <tbody>${matchTypeRows || '<tr><td colspan="2" class="muted">no evidence loaded</td></tr>'}</tbody>
      </table>
      </div>
      <p class="muted small">Real breakdown from <code>evidence[].match_type</code> across loaded bundles — the design doc's "exact / normalized" split is shown as whatever match types the data actually contains today. <span class="real-tag">REAL</span></p>
    </div>
  </div>

  <div class="grid-2">
    <div>
      <h3>Precision vs golden labels</h3>
      ${labelsBlock}
    </div>
    <div>
      <h3>Feedback score &amp; triage health</h3>
      <p class="stub">STUB — no background evals loop exists yet (see panel 4). Mark-wrong rate per extractor and mismatch/shadow-sample false-negative rate both depend on it.</p>
    </div>
  </div>
</section>

<section id="panel-performance" class="panel">
  <h2>2 · Performance &amp; cost</h2>

  <div class="grid-3">
    <div>
      <h3>Latency per stage</h3>
      ${
        dur
          ? `<p class="real">REAL — total run wall-time (started_at→completed_at) across ${dur.n} run(s): p50 <b>${dur.p50}ms</b>, p90 <b>${dur.p90}ms</b>.</p>
             <p class="muted small">Run records stamp <code>started_at</code>/<code>completed_at</code>/<code>current_stage</code> but not a per-stage timing array yet — this is END-TO-END wall time, not a per-stage p50/p90 breakdown. <span class="stub-tag">STUB (per-stage)</span></p>`
          : `<p class="stub">STUB — no run records with both started_at and completed_at were found.</p>`
      }
    </div>
    <div>
      <h3>Cost per call</h3>
      <p class="real">REAL — ${fmtUsd(p.costUsd)} total across ${p.runCount} run record(s): ${fmtUsd(p.liveCostUsd)} on ${p.liveRuns} live-API run(s), $0.000000 (BYO-LLM/offline) on ${p.offlineRuns} offline run(s).</p>
      <p class="muted small">Stamped from <code>context_ledger[].cost_usd</code>, never estimated. The offline sample bundles are genuinely $0 — shown honestly, not hidden.</p>
    </div>
    <div>
      <h3>Cache economics</h3>
      <table class="mini">
        <tbody>
          ${Object.entries(p.cacheActions).map(([k, n]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${n}</td></tr>`).join('\n') || '<tr><td colspan="2" class="muted">no ledger entries</td></tr>'}
        </tbody>
      </table>
      <p class="${p.cacheMissesUnexpected > 0 ? 'alarm' : 'real'} small">cache_misses_unexpected: <b>${p.cacheMissesUnexpected}</b> ${p.cacheMissesUnexpected > 0 ? '— ALARM: any nonzero is a silent 2× bill.' : '(0 across all runs — holding).'}</p>
    </div>
  </div>

  <div class="grid-2">
    <div>
      <h3>Token mix</h3>
      <table class="mini">
        <tbody>
          <tr><td>input</td><td class="num">${p.tokens.input.toLocaleString()}</td></tr>
          <tr><td>output</td><td class="num">${p.tokens.output.toLocaleString()}</td></tr>
          <tr><td>cache_creation</td><td class="num">${p.tokens.cache_creation.toLocaleString()}</td></tr>
          <tr><td>cache_read</td><td class="num">${p.tokens.cache_read.toLocaleString()}</td></tr>
          <tr><td><b>total</b></td><td class="num"><b>${totalTok.toLocaleString()}</b></td></tr>
        </tbody>
      </table>
    </div>
    <div>
      <h3>Budget events</h3>
      ${budgetBlock}
    </div>
  </div>
</section>

<section id="panel-reliability" class="panel">
  <h2>3 · Reliability</h2>
  <div class="grid-2">
    <div>
      <h3>Exit-reason distribution</h3>
      <div class="table-wrap">
      <table>
        <thead><tr><th>Exit reason</th><th class="num">Count</th><th></th></tr></thead>
        <tbody>${exitRows || '<tr><td colspan="3" class="muted">no run records loaded</td></tr>'}</tbody>
      </table>
      </div>
      <p class="${r.crashedCount > 0 ? 'alarm' : 'real'} small">CRASHED: <b>${r.crashedCount}</b> ${r.crashedCount > 0 ? '— ALARM' : '(none — holding)'}. <span class="real-tag">REAL</span> across ${r.runCount} run record(s).</p>
    </div>
    <div>
      <h3>Repairs, retries &amp; extractor failures</h3>
      <table class="mini">
        <tbody>
          <tr><td>context_ledger repair=true count</td><td class="num">${r.repairCount}</td></tr>
          <tr><td>extractor_failures (summed)</td><td class="num">${r.extractorFailures}</td></tr>
        </tbody>
      </table>
      <p class="stub small">STUB — transport-retry counts per vendor, API error classes with request_ids, and sandbox-key age are not stamped into run records yet; wire when those fields land.</p>
    </div>
  </div>
</section>

<section id="panel-confidence" class="panel">
  <h2>4 · Confidence &amp; feedback loop</h2>
  <div class="grid-2">
    <div>
      <h3>Confidence-score distribution (all claims)</h3>
      <table class="mini">
        <tbody>
          ${confRows.map((c) => `<tr><td>${c.k}</td><td class="num">${c.n}</td><td>${bar(c.n, q.totalClaims, c.k === 'high' ? 'fill-green' : c.k === 'low' ? 'fill-red' : 'fill-amber')}</td></tr>`).join('\n')}
        </tbody>
      </table>
      <p class="muted small">Same source as panel 1's mix — surfaced here as its own read since it's the number the feedback loop below will eventually correct against. <span class="real-tag">REAL</span></p>
    </div>
    <div>
      <h3>Feedback loop (mark-wrong → evals)</h3>
      ${evalsBlock}
    </div>
  </div>
</section>

<section id="panel-thresholds" class="panel">
  <h2>5 · Thresholds</h2>
  <p class="muted small">Thresholds are data, not code (control-room.md). Bands marked illustrative are not yet fit to real volume; <code>actual</code> is computed live from the files on disk right now.</p>
  <div class="table-wrap">
  <table>
    <thead><tr><th>Metric</th><th class="num">Actual</th><th>Green</th><th>Amber</th><th>Red</th><th>Status</th><th>Named action on red</th></tr></thead>
    <tbody>${thresholdRows}</tbody>
  </table>
  </div>
  <h3>Scorecard cross-reference</h3>
  ${scorecardBlock}
</section>

<footer>
  <p class="muted small">Not built in v1, on purpose (control-room.md §Build cost &amp; phasing): full outcome-correlation with real CRM sync (needs volume), and the scheduled drift-watch fixture re-run. Both are v2/cron scope, not omissions.</p>
</footer>

</main>
</body>
</html>
`;
}

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f7f7f8;
  --panel: #ffffff;
  --text: #1a1a1e;
  --muted: #6b6f76;
  --border: #e2e3e6;
  --accent: #3454d1;
  --green: #1a8f4c;
  --green-bg: #e5f6ec;
  --amber: #a15c00;
  --amber-bg: #fdf1dc;
  --red: #b3261e;
  --red-bg: #fbe6e4;
  --code-bg: #f0f1f3;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16171a;
    --panel: #1f2024;
    --text: #e8e9ec;
    --muted: #9a9ea7;
    --border: #2c2d32;
    --accent: #7c96ff;
    --green: #4ade80;
    --green-bg: #123322;
    --amber: #f5b350;
    --amber-bg: #3a2c10;
    --red: #f2837c;
    --red-bg: #3a1614;
    --code-bg: #26272c;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}
main { max-width: 1080px; margin: 0 auto; padding: 0 24px 64px; }
.topbar {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
  padding: 28px 24px; border-bottom: 1px solid var(--border);
  max-width: 1080px; margin: 0 auto;
}
h1 { margin: 0 0 4px; font-size: 1.5rem; }
h2 { font-size: 1.15rem; margin: 0 0 12px; }
h3 { font-size: 0.95rem; margin: 20px 0 8px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
.iron-law {
  font-size: 0.72rem; font-weight: 600; text-align: right; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 8px; padding: 8px 12px; white-space: nowrap;
}
.panel {
  background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
  padding: 20px 24px; margin: 24px 0;
}
.muted { color: var(--muted); }
.small { font-size: 0.82rem; }
.big { font-size: 2.1rem; font-weight: 700; margin: 4px 0; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
@media (max-width: 720px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.88rem; }
table.mini { width: auto; min-width: 260px; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.02em; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
td.band { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
.bar-track { width: 100px; height: 8px; background: var(--code-bg); border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); }
.fill-green { background: var(--green); }
.fill-amber { background: var(--amber); }
.fill-red { background: var(--red); }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em; }
.badge-green { background: var(--green-bg); color: var(--green); }
.badge-amber { background: var(--amber-bg); color: var(--amber); }
.badge-red { background: var(--red-bg); color: var(--red); }
.badge-pending { background: var(--code-bg); color: var(--muted); }
.real, .real-tag { color: var(--green); }
.stub, .stub-tag { color: var(--amber); }
.alarm { color: var(--red); font-weight: 700; }
code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-size: 0.85em; }
footer { max-width: 1080px; margin: 8px auto 0; padding: 0 24px; }
`;

// ── build ────────────────────────────────────────────────────────────────

export function buildControlRoom(root = ROOT) {
  const bundles = loadBundles(root);
  const runRecords = loadRunRecords(root);
  const scorecard = loadScorecard(root);
  const labels = loadLabels(root);
  const evals = loadEvals(root);

  const quality = aggregateQuality(bundles);
  const performance = aggregatePerformance(runRecords);
  const reliability = aggregateReliability(runRecords);
  const thresholds = buildThresholds({ quality, performance, reliability });

  const html = renderHtml({
    quality,
    performance,
    reliability,
    thresholds,
    scorecard,
    labels,
    evals,
    bundles,
    runRecords,
    generatedAt: new Date().toISOString(),
  });

  return html;
}

// CLI: node scripts/control-room.mjs [out.html]
if (import.meta.url === `file://${process.argv[1]}`) {
  const html = buildControlRoom(ROOT);
  const outPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'control-room.html');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, html);
  console.log(`control room: ${outPath} (${(html.length / 1024).toFixed(0)} KB)`);
}
