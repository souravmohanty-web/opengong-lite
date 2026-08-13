// The three stage numbers, each computed from a real artifact at call time —
// never hardcoded (same discipline as ag-4.1: if it isn't measured, it isn't
// shown). A missing/invalid source yields null for that number; the renderer
// decides how to degrade. Owned by the viewer lane; rendered by the notes UI.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

// Trust: precision on hand-labeled golden calls. Recomputed from the raw
// counts; the stored pct is cross-checked, not trusted.
export function precisionFromLabels(root = ROOT) {
  const labels = readJson(join(root, 'team/labels.json'));
  const s = labels?.summary;
  if (!Number.isFinite(s?.shipped_correct) || !Number.isFinite(s?.shipped_total) || s.shipped_total === 0) return null;
  const pct = (s.shipped_correct / s.shipped_total) * 100;
  return {
    pct: Math.round(pct * 10) / 10,
    correct: s.shipped_correct,
    total: s.shipped_total,
    source: 'team/labels.json',
  };
}

// Fuller picture: share of shipped claims with a found receipt, computed live
// across every sample bundle. blocked_injection is excluded from the
// denominator (it was never a candidate to ship — coverage-band rule).
export function verifiedFromBundles(root = ROOT) {
  let dir;
  try { dir = readdirSync(join(root, 'samples/bundles')).filter((f) => f.endsWith('.bundle.json')); } catch { return null; }
  if (!dir.length) return null;
  let receipts = 0;
  let candidates = 0;
  for (const f of dir) {
    const bundle = readJson(join(root, 'samples/bundles', f));
    for (const claim of bundle?.claims ?? []) {
      if (claim.status === 'blocked_injection') continue;
      candidates += 1;
      if (claim.status === 'verified' || claim.status === 'segment_corrected') receipts += 1;
    }
  }
  if (candidates === 0) return null;
  return {
    pct: Math.round((receipts / candidates) * 1000) / 10,
    receipts,
    candidates,
    calls: dir.length,
    source: 'samples/bundles/*.bundle.json',
  };
}

// Cost: the most recent run record that actually logged spend. A run with
// spent_usd is a receipt; a price-table estimate is not.
export function costFromRunRecords(root = ROOT) {
  let runs;
  try { runs = readdirSync(join(root, 'runs')); } catch { return null; }
  const spends = [];
  for (const id of runs) {
    const run = readJson(join(root, 'runs', id, 'run.json'));
    const usd = run?.budget?.spent_usd;
    if (Number.isFinite(usd) && usd > 0) {
      spends.push({ usd, runId: run.run_id ?? id, at: run.completed_at ?? '' });
    }
  }
  if (!spends.length) return null;
  spends.sort((a, b) => (a.at < b.at ? 1 : -1));
  const latest = spends[0];
  return { usd: latest.usd, runId: latest.runId, source: `runs/${latest.runId}/run.json` };
}

// Cold start is not stopwatch-verified yet, so it stays qualitative — a fake
// seconds number would be the exact sin the gate exists to catch.
export function coldStart() {
  return {
    qualitative: 'No signup. A free key self-mints on your first call.',
    measuredSeconds: null,
  };
}

export function stageNumbers(root = ROOT) {
  return {
    precision: precisionFromLabels(root),
    verified: verifiedFromBundles(root),
    costPerCall: costFromRunRecords(root),
    coldStart: coldStart(),
  };
}
