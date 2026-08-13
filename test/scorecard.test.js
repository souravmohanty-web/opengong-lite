// Tests for scripts/scorecard.mjs — the self-grading scorecard runner.
//
// NOTE ON RECURSION: scripts/scorecard.mjs's craft/"tests pass offline" check runs
// `node --test` over test/*.test.js EXCLUDING this file, specifically so that this
// file can safely spawn scripts/scorecard.mjs as a child process without an infinite
// loop. Do not remove that exclusion in scripts/scorecard.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readJson(p) {
  return JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
}

test('SC-01 team/scorecard.json category weights sum to the judge weights (30/25/20/15/10)', () => {
  const def = readJson('team/scorecard.json');
  const expected = { product_pull: 30, demo_magnetism: 25, api_gravity: 20, loop_depth: 15, craft: 10 };
  for (const [dim, weight] of Object.entries(expected)) {
    assert.equal(def.categories[dim]?.weight, weight, `category ${dim} declared weight should be ${weight}`);
  }
  const catTotal = Object.values(def.categories).reduce((sum, c) => sum + c.weight, 0);
  assert.equal(catTotal, 100, 'category weights must sum to 100');

  // per-metric weights within each category must sum to that category's declared weight
  const byDim = {};
  for (const m of def.metrics) byDim[m.dimension] = (byDim[m.dimension] || 0) + m.weight;
  for (const [dim, weight] of Object.entries(expected)) {
    assert.equal(byDim[dim], weight, `sum of metric weights in ${dim} should equal category weight ${weight}`);
  }
});

test('SC-02 every metric declares a valid grader and every metric with a gate references a real gate id', () => {
  const def = readJson('team/scorecard.json');
  const validGraders = new Set(['auto', 'human', 'pending-samples']);
  const gateIds = new Set(def.gates.map((g) => g.id));
  for (const m of def.metrics) {
    assert.ok(validGraders.has(m.grader), `${m.id} has an invalid grader "${m.grader}"`);
    if (m.gate !== null) assert.ok(gateIds.has(m.gate), `${m.id} references unknown gate "${m.gate}"`);
    assert.ok(m.id && m.dimension && typeof m.weight === 'number' && m.target, `${m.id} is missing a required field`);
  }
});

// The runner itself takes a few seconds (it nests a full offline test run for one of
// its own craft checks) — give it real headroom under the mandated <90s budget.
let runResult;
test('SC-03 the runner executes cleanly and finishes well under the 90s budget', () => {
  const started = Date.now();
  runResult = spawnSync(process.execPath, [path.join(ROOT, 'scripts/scorecard.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 85_000,
  });
  const elapsed = Date.now() - started;
  assert.equal(runResult.error, undefined, `runner spawn errored: ${runResult.error}`);
  assert.equal(runResult.status, 0, `runner exited ${runResult.status}\nstderr:\n${runResult.stderr}`);
  assert.ok(elapsed < 90_000, `runner took ${elapsed}ms, over the 90s budget`);
  assert.match(runResult.stdout, /Weighted total: \d+(\.\d+)? \/ 100/, 'stdout should print the weighted total');
  assert.match(runResult.stdout, /## Gates/, 'stdout should print the gates section');
});

test('SC-04 produces a valid team/score-run.json with the expected shape', () => {
  assert.ok(existsSync(path.join(ROOT, 'team/score-run.json')), 'team/score-run.json was not written');
  const scoreRun = readJson('team/score-run.json');
  assert.ok(Array.isArray(scoreRun.metrics) && scoreRun.metrics.length > 0, 'metrics[] should be non-empty');
  assert.ok(scoreRun.gates && scoreRun.gates.A && scoreRun.gates.B && scoreRun.gates.C, 'gates A/B/C should all be present');
  assert.ok(typeof scoreRun.total === 'number' && scoreRun.total >= 0 && scoreRun.total <= 100, 'total should be a number in [0,100]');
  assert.ok(scoreRun.rollup && scoreRun.rollup.raw && scoreRun.rollup.capped, 'rollup.raw and rollup.capped should be present');

  // every metric result carries a real, closed-vocabulary band
  const validBands = new Set(['green', 'yellow', 'red', 'pending']);
  for (const m of scoreRun.metrics) {
    assert.ok(validBands.has(m.band), `${m.id} has an invalid band "${m.band}"`);
  }

  // recompute the weighted total from the capped category rollup and cross-check
  const recomputed = Object.values(scoreRun.rollup.capped).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(recomputed - scoreRun.total) < 0.01 || scoreRun.total === 65,
    `top-line total (${scoreRun.total}) should equal the sum of capped category rollups (${recomputed}), unless the 65-cap fired`);
});

test('SC-05 a known-green metric (0 prod deps) reports green, not pending or red', () => {
  const scoreRun = readJson('team/score-run.json');
  const m = scoreRun.metrics.find((x) => x.id === 'cr-6.4a-zero-prod-deps');
  assert.ok(m, 'cr-6.4a-zero-prod-deps should be present in the metrics list');
  assert.equal(m.band, 'green', `expected 0 prod deps to grade green, got ${m.band}: ${m.reason}`);
});

test('SC-06 a known-green loop-depth test suite (gate.test.js) reports green', () => {
  const scoreRun = readJson('team/score-run.json');
  const m = scoreRun.metrics.find((x) => x.id === 'ld-5.1-quote-gate-fabrication');
  assert.ok(m, 'ld-5.1-quote-gate-fabrication should be present in the metrics list');
  assert.equal(m.band, 'green', `expected the gate.test.js suite to grade green, got ${m.band}: ${m.reason}`);
});

test('SC-07 a known-absent sample-dependent metric reports pending — never a faked green or a faked red', () => {
  const scoreRun = readJson('team/score-run.json');
  const m = scoreRun.metrics.find((x) => x.id === 'dm-3.4-cross-call-search');
  assert.ok(m, 'dm-3.4-cross-call-search should be present in the metrics list');
  assert.equal(m.band, 'pending', `expected the no-samples-yet metric to report pending, got ${m.band}`);
  assert.notEqual(m.band, 'red', 'a metric with no data should never be faked as red');
  assert.notEqual(m.band, 'green', 'a metric with no data should never be faked as green');
});

test('SC-08 human-graded metrics (e.g. click-audio latency) always report pending, never a fabricated pass', () => {
  const scoreRun = readJson('team/score-run.json');
  const m = scoreRun.metrics.find((x) => x.id === 'dm-3.1-click-audio-latency');
  assert.ok(m, 'dm-3.1-click-audio-latency should be present in the metrics list');
  assert.equal(m.band, 'pending');
});

test('SC-09 Gate C fires red right now because no labels.json exists yet, capping product_pull at <=15', () => {
  const scoreRun = readJson('team/score-run.json');
  const labelsExist = ['team/labels.json', 'labels.json', 'samples/labels.json'].some((p) => existsSync(path.join(ROOT, p)));
  if (!labelsExist) {
    assert.equal(scoreRun.gates.C.state, 'RED');
    assert.ok(scoreRun.rollup.capped.product_pull <= 15 + 1e-9, 'product_pull rollup should be capped at <=15 when Gate C is red');
  } else {
    // if a teammate has since added labels.json, this scorecard run correctly moves on
    assert.notEqual(scoreRun.gates.C.state, 'RED');
  }
});

test('SC-10 the printed markdown table names every metric id from team/scorecard.json', () => {
  const def = readJson('team/scorecard.json');
  assert.ok(runResult, 'SC-03 must run first to populate runResult');
  for (const m of def.metrics) {
    assert.ok(runResult.stdout.includes(m.id), `stdout table is missing metric ${m.id}`);
  }
});
