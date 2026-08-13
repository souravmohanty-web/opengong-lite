// Tests for scripts/control-room.mjs — the internal ops dashboard generator
// (team/plans/control-room.md). Covers: the generator runs end-to-end and
// produces valid, self-contained HTML with all 5 panel sections; the pure
// aggregation functions compute correct numbers from real fixture-shaped data;
// and the iron law ("observes and proposes, never silently changes") is
// visibly stated on the page, since this script's only side effect must ever
// be writing control-room.html.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildControlRoom,
  aggregateQuality,
  aggregatePerformance,
  aggregateReliability,
  buildThresholds,
} from '../scripts/control-room.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PANEL_IDS = [
  'panel-quality',
  'panel-performance',
  'panel-reliability',
  'panel-confidence',
  'panel-thresholds',
];

test('CR-01 the generator runs cleanly against the real repo and writes control-room.html', () => {
  const tmpOut = path.join(mkdtempSync(path.join(tmpdir(), 'control-room-')), 'out.html');
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts/control-room.mjs'), tmpOut], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(res.status, 0, `generator should exit 0; stderr: ${res.stderr}`);
  assert.ok(existsSync(tmpOut), 'output file must exist');
  const html = readFileSync(tmpOut, 'utf8');
  assert.ok(html.length > 1000, 'output should be a real page, not a stub');
  rmSync(path.dirname(tmpOut), { recursive: true, force: true });
});

test('CR-02 produced HTML is well-formed and contains all 5 panel sections', () => {
  const html = buildControlRoom(ROOT);

  // basic document shape
  assert.ok(html.trimStart().startsWith('<!doctype html>'), 'must start with a doctype');
  assert.ok(/<html[ >]/.test(html));
  assert.ok(html.includes('<head>') && html.includes('</head>'));
  assert.ok(html.includes('<body>') && html.includes('</body>'));
  assert.ok(html.includes('</html>'));
  assert.ok(/<title>[^<]+<\/title>/.test(html), 'must declare a title');

  // all 5 panels present, each as its own <section id="panel-...">
  for (const id of PANEL_IDS) {
    assert.ok(html.includes(`id="${id}"`), `missing panel section: ${id}`);
  }

  // roughly balanced tags for the structural elements we emit (a real parity
  // check, not just substring presence) — catches an unclosed <section>/<div>/<table>
  for (const tag of ['section', 'div', 'table', 'tbody', 'thead', 'tr']) {
    const opens = (html.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length;
    const closes = (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
    assert.equal(opens, closes, `<${tag}> open/close count must match (${opens} vs ${closes})`);
  }

  // it is a static reader of data, never a writer: no fetch/XHR/websocket/eval,
  // and it states its own iron law on the page
  assert.ok(!/<script/i.test(html), 'the dashboard is static HTML/CSS only — no embedded script');
  assert.ok(html.includes('NEVER SILENTLY CHANGES THE PIPELINE'), 'iron law must be visible on the page');
});

test('CR-03 the page is theme-neutral: defines both light and dark palettes', () => {
  const html = buildControlRoom(ROOT);
  assert.ok(html.includes(':root'), 'must define a root token palette');
  assert.ok(html.includes('prefers-color-scheme: dark'), 'must define a dark override');
});

test('CR-04 aggregateQuality computes gate pass-rate and confidence mix correctly on a small fixture', () => {
  const bundles = [
    {
      file: 'f1.json',
      data: {
        call: { id: 'x1', title: 'fixture one' },
        claims: [
          { status: 'verified', interpretation_confidence: 'high', evidence: [{ match_type: 'exact' }], context_flags: [] },
          { status: 'verified', interpretation_confidence: 'low', evidence: [{ match_type: 'exact' }], context_flags: [{ flag: 'double_negation' }] },
          { status: 'uncorroborated', interpretation_confidence: 'medium', evidence: [], context_flags: [{ flag: 'double_negation' }] },
          { status: 'blocked_injection', interpretation_confidence: null, evidence: [], context_flags: [] },
        ],
      },
    },
  ];
  const q = aggregateQuality(bundles);
  assert.equal(q.totalClaims, 4);
  assert.equal(q.statusTotals.verified, 2);
  assert.equal(q.statusTotals.uncorroborated, 1);
  assert.equal(q.statusTotals.blocked_injection, 1);
  assert.equal(q.passRate, 0.5, '2 of 4 claims verified/segment_corrected');
  assert.equal(q.confTotals.high, 1);
  assert.equal(q.confTotals.unset, 1, 'null confidence must bucket into unset, not vanish');
  assert.deepEqual(q.topFlags[0], { flag: 'double_negation', count: 2 });
  assert.equal(q.perCall[0].call, 'x1');
  assert.equal(q.perCall[0].total, 4);
});

test('CR-05 aggregatePerformance sums cost/tokens and reports offline runs as honest $0, not missing', () => {
  const runRecords = [
    {
      data: {
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:00:01.000Z',
        cache_misses_unexpected: 0,
        context_ledger: [
          { cost_usd: 0.01, usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, cache_action: 'write' },
        ],
        budget: { decisions: [] },
      },
    },
    {
      data: {
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:00:00.000Z',
        cache_misses_unexpected: 0,
        context_ledger: [
          { cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, cache_action: 'offline' },
        ],
        budget: { decisions: [] },
      },
    },
  ];
  const p = aggregatePerformance(runRecords);
  assert.equal(p.costUsd, 0.01);
  assert.equal(p.liveRuns, 1);
  assert.equal(p.offlineRuns, 1, 'a $0 run is counted as offline, never dropped from the total');
  assert.equal(p.tokens.input, 100);
  assert.equal(p.durationsMs.length, 2);
  assert.equal(p.cacheActions.offline, 1);
});

test('CR-06 aggregateReliability tallies exit reasons and flags a CRASHED run', () => {
  const runRecords = [
    { data: { exit_reason: 'SHIPPED', extractor_failures: [], context_ledger: [] } },
    { data: { exit_reason: 'CRASHED', extractor_failures: ['pain'], context_ledger: [{ repair: true }] } },
  ];
  const r = aggregateReliability(runRecords);
  assert.equal(r.exitReasons.SHIPPED, 1);
  assert.equal(r.exitReasons.CRASHED, 1);
  assert.equal(r.crashedCount, 1);
  assert.equal(r.extractorFailures, 1);
  assert.equal(r.repairCount, 1);
});

test('CR-07 buildThresholds never silently turns a real red into green (cache-miss alarm fires)', () => {
  const quality = { passRate: 0.99, statusTotals: {} };
  const performance = { cacheMissesUnexpected: 3 };
  const reliability = { crashedCount: 0, exitReasons: {} };
  const rows = buildThresholds({ quality, performance, reliability });
  const cacheRow = rows.find((r) => r.metric.startsWith('cache_misses_unexpected'));
  assert.equal(cacheRow.status, 'red');
  assert.ok(cacheRow.named_action_on_red.length > 0, 'every threshold row must carry a named action');
});

test('CR-08 buildThresholds marks precision-vs-golden and outcome-correlation pending, not fabricated', () => {
  const rows = buildThresholds({
    quality: { passRate: 1, statusTotals: {} },
    performance: { cacheMissesUnexpected: 0 },
    reliability: { crashedCount: 0, exitReasons: {} },
  });
  const precision = rows.find((r) => r.metric.includes('golden labels'));
  const correlation = rows.find((r) => r.metric.includes('Outcome-correlation'));
  assert.equal(precision.status, 'pending');
  assert.equal(correlation.status, 'pending');
});

test('CR-09 running the generator twice in a row is idempotent on the same inputs', () => {
  const html1 = buildControlRoom(ROOT);
  const html2 = buildControlRoom(ROOT);
  // strip the generated-at timestamp before comparing — everything else must match byte-for-byte
  const strip = (h) => h.replace(/Generated [^ ]+ from/, 'Generated <ts> from');
  assert.equal(strip(html1), strip(html2));
});
