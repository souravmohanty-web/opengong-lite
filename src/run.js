import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildSystem, buildUser } from './prompt.js';
import { runExtraction, flattenExtraction } from './extract.js';
import { gateClaim, gradeRun } from './gate.js';
import { screenTranscript, screenClaim } from './injection.js';
import { buildBundle } from './bundle.js';
import { writeAtomic, readJson, makeQueue } from './store.js';
import { costUsd, DEFAULT_MAX_TOKENS } from './llm.js';

// Run records (technical-spec-core.md §run-records, research/03-harness.md
// Parts 1/4/7). One named loop: openRun -> pipeline -> closeRun, every path
// through `runPipeline` ends by calling `finalize` exactly once with a named
// exit; `finalize` itself refuses to overwrite an already-set exit_reason
// ("first reason wins" — the root cause, not the last symptom).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RUNS_ROOT = path.join(__dirname, '..', 'runs');

// Minimal governor projection (token-optimization.md §Rung 0 + §Calibration):
// tokens ≈ chars / CHARS_PER_TOKEN. This is the literal divisor named in the
// spec text, not a measured constant — the real calibration step is a free
// `POST /v1/messages/count_tokens` call against the rendered stereo fixture
// (`node -e "..."` against a live key), which this offline slice has no key
// to run. Swap this constant for the measured one the moment that command has
// been run once, per token-optimization.md §Calibration.
export const CHARS_PER_TOKEN = 3.6;

function projectExtractorCostUsd({ systemBlocks, extractorDef, maxTokens = DEFAULT_MAX_TOKENS }) {
  const systemChars = systemBlocks.reduce((n, b) => n + (b.text?.length ?? 0), 0);
  const userChars = buildUser(extractorDef).content[0].text.length;
  // Worst case, never under-projects: full input rate (no cache credit assumed
  // at plan time — mid-run prefix trimming would invalidate the paid cache
  // anyway, so plan-time is the only place a governor decision is safe to make)
  // plus our own max_tokens as the output ceiling (output cannot be counted in
  // advance; research/03-harness.md §Part 7).
  const inTokens = Math.ceil((systemChars + userChars) / CHARS_PER_TOKEN);
  return inTokens * (2 / 1_000_000) + maxTokens * (10 / 1_000_000);
}

// ── exit taxonomy ────────────────────────────────────────────────────────────
// gate.js's coverage BANDS double as run-level exit_reasons on the happy/
// degraded path (their names ARE the CLI's final-line vocabulary — see the
// worked example in technical-spec-core.md §run-records). Infra-level exits
// (budget/config/crash/cancel) are named separately and never collide with a
// band name.

const BAND_EXIT = {
  SHIPPED: { exitClass: 'SHIPPED', exitCode: 0 },
  SHIPPED_WITH_CORRECTIONS: { exitClass: 'SHIPPED', exitCode: 0 },
  PARTIAL_EXTRACTORS_FAILED: { exitClass: 'PARTIAL', exitCode: 70 },
  PARTIAL_LOW_COVERAGE: { exitClass: 'PARTIAL', exitCode: 70 },
  PARTIAL_CLAIMS_DROPPED: { exitClass: 'PARTIAL', exitCode: 70 },
  GATE_BLOCKED_UNPROVEN_CLAIMS: { exitClass: 'FAILED', exitCode: 65 },
};

export const EXIT_TAXONOMY = {
  ...BAND_EXIT,
  BUDGET_EXCEEDED: { exitClass: 'FAILED', exitCode: 75 },
  CONFIG_INVALID: { exitClass: 'FAILED', exitCode: 64 },
  ANTHROPIC_KEY_MISSING: { exitClass: 'FAILED', exitCode: 64 },
  CANCELED: { exitClass: 'FAILED', exitCode: 130 },
  CRASHED: { exitClass: 'FAILED', exitCode: 70 },
  INTERNAL_ERROR: { exitClass: 'FAILED', exitCode: 70 },
};

function classifyBand(band) {
  const e = BAND_EXIT[band] ?? { exitClass: 'FAILED', exitCode: 70 };
  return { exitReason: band, ...e };
}

// ── run-record lifecycle ─────────────────────────────────────────────────────

function makeRunId(now) {
  return `r_${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomBytes(3).toString('hex')}`;
}

function initRecord({ runId, callId, budgetUsd, extractorDefs, startedAt }) {
  return {
    schema_version: '1',
    run_id: runId,
    call_id: callId,
    status: 'RUNNING',
    exit_reason: null,
    exit_class: null,
    exit_code: null,
    started_at: startedAt,
    completed_at: null,
    heartbeat_at: startedAt,
    current_stage: 'init',
    extractors_planned: extractorDefs.map((d) => d.name),
    budget: { limit_usd: budgetUsd, spent_usd: 0, decisions: [] },
    context_ledger: [],
    cache_misses_unexpected: 0,
  };
}

function persist(ctx) {
  writeAtomic(path.join(ctx.dir, 'run.json'), ctx.record);
}

// openRun — write-ahead: the record lands on disk (fsync'd, atomic rename)
// BEFORE runPipeline makes its first LLM call. This function does no async
// I/O of its own kind that could race a caller's next `await`, so by the time
// its caller proceeds to `await runExtraction(...)`, run.json already exists
// with status RUNNING.
export function openRun({ runsRoot = DEFAULT_RUNS_ROOT, callId = 'call', budgetUsd = 1.0, extractorDefs = [], now = () => new Date() } = {}) {
  const startedAt = now().toISOString();
  const runId = makeRunId(now());
  const dir = path.join(runsRoot, runId);
  const record = initRecord({ runId, callId, budgetUsd, extractorDefs, startedAt });
  const ctx = { runId, dir, record, enqueue: makeQueue(), firstCallSeen: false, prefixHash: null };
  persist(ctx);
  return ctx;
}

export function setStage(ctx, stage) {
  return ctx.enqueue(() => {
    ctx.record.current_stage = stage;
    persist(ctx);
  });
}

export function heartbeatOnce(ctx, now = new Date()) {
  return ctx.enqueue(() => {
    ctx.record.heartbeat_at = now.toISOString();
    persist(ctx);
  });
}

export function startHeartbeat(ctx, intervalMs = 10_000) {
  const timer = setInterval(() => heartbeatOnce(ctx), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

// One context_ledger entry per LLM call (token-optimization.md §5.1): prefix
// composition + cache action + usage + cost + decided_by + why. The very
// first call of the whole run is cache-WRITE-expected (it's what lands the
// breakpoint); every call after it is READ-expected, and a zero-credit
// response on a read-expected call is logged as CACHE_MISS_UNEXPECTED with the
// prefix hash attached, so a silent 2x bill shows up in the record instead of
// only in the invoice.
export function journalCall(ctx, { extractor, attempt, repair, resp }) {
  return ctx.enqueue(() => {
    const isFirstOfRun = !ctx.firstCallSeen;
    ctx.firstCallSeen = true;
    const cost = costUsd(resp.usage);
    const cacheAction = isFirstOfRun
      ? 'write'
      : resp.usage.cache_read_input_tokens > 0 ? 'read' : 'miss_unexpected';

    const entry = {
      extractor, attempt, repair: !!repair, model: resp.model,
      usage: resp.usage, cost_usd: cost, cache_action: cacheAction,
      decided_by: 'plan',
      why: repair
        ? 'aimed repair — validator text + echoed output appended to the message list'
        : (isFirstOfRun ? 'serialized first call of the run — lands the cache write' : 'fan-out call — expects a cache read'),
    };
    if (cacheAction === 'miss_unexpected') {
      entry.cache_miss_unexpected = true;
      entry.prefix_hash = ctx.prefixHash;
      ctx.record.cache_misses_unexpected += 1;
    }
    ctx.record.context_ledger.push(entry);
    ctx.record.budget.spent_usd += cost;
    persist(ctx);
  });
}

// closeRun / finalize — idempotent, first reason wins.
export function closeRun(ctx, { exitReason, exitClass, exitCode, extra } = {}) {
  return ctx.enqueue(() => {
    if (!ctx.record.exit_reason) {
      ctx.record.status = 'COMPLETED';
      ctx.record.exit_reason = exitReason;
      ctx.record.exit_class = exitClass;
      ctx.record.exit_code = exitCode;
      ctx.record.completed_at = new Date().toISOString();
      Object.assign(ctx.record, extra ?? {});
      persist(ctx);
    }
    return ctx.record;
  });
}

// sweep — the crash guarantee: no run may stay RUNNING forever. Run at CLI
// start (and by anything else that reads runs/) to rewrite any stale RUNNING
// record to CRASHED, naming the stage it was in when its heartbeat stopped.
export function sweep(runsRoot = DEFAULT_RUNS_ROOT, { now = Date.now(), staleMs = 5 * 60 * 1000 } = {}) {
  const swept = [];
  if (!existsSync(runsRoot)) return swept;
  for (const entry of readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runJsonPath = path.join(runsRoot, entry.name, 'run.json');
    if (!existsSync(runJsonPath)) continue;
    const record = readJson(runJsonPath);
    if (record.status !== 'RUNNING') continue;
    const hbAt = Date.parse(record.heartbeat_at ?? record.started_at);
    if (!Number.isFinite(hbAt) || now - hbAt <= staleMs) continue;
    record.status = 'COMPLETED';
    if (!record.exit_reason) {
      record.exit_reason = 'CRASHED';
      record.exit_class = 'FAILED';
      record.exit_code = 70;
      record.crashed_stage = record.current_stage ?? null;
    }
    record.completed_at = new Date(now).toISOString();
    writeAtomic(runJsonPath, record);
    swept.push(record.run_id);
  }
  return swept;
}

export function formatFinalLine(record, elapsedS = '0.0') {
  const cost = (record.budget?.spent_usd ?? 0).toFixed(3);
  const code = record.exit_code ?? 1;
  if (record.coverage_stats) {
    const s = record.coverage_stats;
    const extras = [];
    if (s.segment_corrected) extras.push(`${s.segment_corrected} corrected`);
    if (s.blocked_injection) extras.push(`${s.blocked_injection} neutralized`);
    const extraStr = extras.length ? `, ${extras.join(', ')}` : '';
    return `run ${record.run_id} → ${record.exit_reason} (${s.verified}/${s.attempted} verified${extraStr}) in ${elapsedS}s, $${cost}, exit ${code}`;
  }
  return `run ${record.run_id} → ${record.exit_reason} in ${elapsedS}s, $${cost}, exit ${code}`;
}

// ── the pipeline ──────────────────────────────────────────────────────────────
// openRun (write-ahead) -> Rung-0 budget projection (zero fetches if it fails)
// -> runExtraction (extract.js) -> injection screen + gate (gate.js/
// injection.js, pure, offline) -> gradeRun -> buildBundle -> artifacts ->
// closeRun. Every path out of this function calls closeRun exactly once.

export async function runPipeline({
  transcript, extractorDefs, glossaryEntries = [], callId = 'call',
  budgetUsd = 1.0, model = 'claude-sonnet-5', callLlm, concurrency = 3,
  runsRoot = DEFAULT_RUNS_ROOT, now = () => new Date(),
  // Keyless-fallback honesty seam (src/fallback.js decides the mode; this
  // function only stamps whatever it's told — no key-sniffing here). Callers
  // that never pass these get the pre-existing behavior unchanged: a bundle/
  // record stamped 'llm-extraction', no note. When extractorDefs has been
  // pre-filtered down to trackers only (no ANTHROPIC_API_KEY), the caller
  // passes 'deterministic-trackers-only' + a human note + the LLM extractor
  // names it chose not to run, so the record names its own limited coverage
  // instead of silently looking like a full run.
  extractionMode = 'llm-extraction', extractionNote = null, extractorsSkipped = [],
} = {}) {
  const ctx = openRun({ runsRoot, callId, budgetUsd, extractorDefs, now }); // write-ahead, before any spend

  const { blocks: systemBlocks } = buildSystem(transcript, glossaryEntries);
  ctx.prefixHash = 'sha256:' + createHash('sha256').update(systemBlocks.map((b) => b.text).join('\n')).digest('hex');

  // Rung 0 (plan-time governor): project every planned call's worst case
  // BEFORE the first fetch. If it can't afford the plan, it spends nothing.
  const projected = extractorDefs.reduce((sum, def) => sum + projectExtractorCostUsd({ systemBlocks, extractorDef: def }), 0);
  if (projected > budgetUsd) {
    ctx.record.budget.decisions.push({
      at: now().toISOString(), action: 'STOP',
      why: `projected $${projected.toFixed(4)} > budget $${budgetUsd.toFixed(4)} — stopping before any call`,
    });
    for (const def of extractorDefs) {
      const avoided = projectExtractorCostUsd({ systemBlocks, extractorDef: def });
      ctx.record.context_ledger.push({
        extractor: def.name, skipped: true, decided_by: 'budget_degrade',
        cost_avoided_usd: avoided, why: 'projected total exceeds budget before any call (Rung 4: BUDGET_EXCEEDED)',
      });
    }
    return closeRun(ctx, { exitReason: 'BUDGET_EXCEEDED', exitClass: 'FAILED', exitCode: 75 });
  }

  await setStage(ctx, 'extract');

  let extraction;
  try {
    extraction = await runExtraction({
      transcript, extractors: extractorDefs, glossaryEntries, model, concurrency, callLlm,
      onCall: (info) => journalCall(ctx, info),
    });
  } catch (err) {
    return closeRun(ctx, {
      exitReason: err?.name ?? 'INTERNAL_ERROR', exitClass: 'FAILED', exitCode: 70,
      extra: { error: String(err?.message ?? err) },
    });
  }

  await setStage(ctx, 'gate');

  const claims = [];
  const extractorFailures = [];
  for (const result of extraction.results) {
    if (result.status === 'ok') claims.push(...flattenExtraction(result.extractor, result.data));
    else extractorFailures.push(result.extractor);
  }

  const injectionScreen = screenTranscript(transcript);
  const gated = claims.map((claim) => {
    const verdict = screenClaim(claim, injectionScreen, transcript);
    return gateClaim(claim, transcript, { injection: verdict });
  });
  const coverage = gradeRun(gated, { extractorFailures });

  await setStage(ctx, 'bundle');

  const { exitReason, exitClass, exitCode } = classifyBand(coverage.band);
  const rejected = gated.filter((c) => c.status === 'uncorroborated' || c.status === 'blocked_injection');

  if (coverage.band !== 'GATE_BLOCKED_UNPROVEN_CLAIMS') {
    const bundle = buildBundle({
      transcript, claims: gated, coverage, callId,
      provenance: {
        extraction_model: model,
        extraction_mode: extractionMode,
        ...(extractionNote ? { extraction_note: extractionNote } : {}),
      },
    });
    writeAtomic(path.join(ctx.dir, 'bundle.json'), bundle);
  }
  if (rejected.length) {
    writeAtomic(path.join(ctx.dir, 'rejected.json'), { claims: rejected });
  }

  return closeRun(ctx, {
    exitReason, exitClass, exitCode,
    extra: {
      coverage_band: coverage.band, coverage_ratio: coverage.ratio, coverage_stats: coverage.stats,
      extractor_failures: extractorFailures,
      extraction_mode: extractionMode,
      ...(extractionNote ? { extraction_note: extractionNote } : {}),
      ...(extractorsSkipped.length ? { extractors_skipped_no_key: extractorsSkipped } : {}),
    },
  });
}
