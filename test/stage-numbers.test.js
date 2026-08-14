import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stageNumbers, precisionFromLabels, verifiedFromBundles, costFromRunRecords } from '../src/stage-numbers.mjs';

test('precision is recomputed from raw counts, matches the labeled ground truth', () => {
  const p = precisionFromLabels();
  assert.ok(p, 'labels.json exists in this repo');
  assert.equal(p.pct, Math.round((p.correct / p.total) * 1000) / 10);
  assert.ok(p.total >= 8, 'scorecard 2.6 requires n >= 8');
  assert.equal(p.source, 'team/labels.json');
});

test('verified% is computed live across all sample bundles, blocked excluded from denominator', () => {
  const v = verifiedFromBundles();
  assert.ok(v, 'sample bundles exist in this repo');
  assert.ok(v.calls >= 5);
  assert.equal(v.pct, Math.round((v.receipts / v.candidates) * 1000) / 10);
  assert.ok(v.pct > 0 && v.pct <= 100);
});

test('cost comes from a run record that actually logged spend', (t) => {
  const c = costFromRunRecords();
  // runs/ is gitignored, so a fresh clone (and CI) has no spend record until a
  // real transcription runs. The anti-fabrication check enforces wherever one exists.
  if (!c) {
    t.skip('no spend-logging run record on this machine; run a real transcription to enable this check');
    return;
  }
  assert.ok(c.usd > 0 && c.usd < 1, `spent_usd ${c.usd} should be a real small number`);
  assert.match(c.source, /^runs\/.+\/run\.json$/);
});

test('missing artifacts yield null, never a fabricated number', () => {
  const empty = mkdtempSync(join(tmpdir(), 'og-stage-'));
  const n = stageNumbers(empty);
  assert.equal(n.precision, null);
  assert.equal(n.verified, null);
  assert.equal(n.costPerCall, null);
  assert.equal(n.coldStart.measuredSeconds, null, 'cold start stays qualitative until stopwatch-verified');
  assert.ok(n.coldStart.qualitative.length > 0);
});
