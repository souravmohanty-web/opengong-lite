import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gateClaim, gradeRun } from '../src/gate.js';
import { validateOutput } from '../src/extract.js';
import { DEFAULT_SCHEMAS_DIR } from '../src/registry.js';

// SCORECARD 2.5 — absence honesty (master-plan.md §2.5). "No next step
// agreed / pricing never discussed" are the highest-value manager signals,
// and they are unquotable by nature — team/plans/extractor-depth.md names the
// real mechanism: a `{value, basis, evidence}` COVERAGE RECORD ("searched,
// found nothing") that never invents a receipt it lacks. This fixture is a
// quiet call (no next step, no pricing) run through every extractor that
// carries that coverage-record shape (buying_stage, risk_flags,
// stakeholders.threading — the 7 real fields src/extractors already declare
// this way), asserting: (1) each hand-authored coverage record validates
// against its extractor's real output_schema, (2) >=3 coverage records exist,
// (3) next_steps / pricing / stakeholders honestly stay empty lists, and
// (4) zero fabricated claims (the one real per-line claim gates as verified).

const DIR = new URL('./fixtures/scorecard/pp-2.5-absence/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8'));

const TRANSCRIPT = load('transcript.json');
const CLAIMS = load('claims.json');
const EXTRACTION = load('extraction.json');
const EXPECTED = load('expected.json');

function extractorSchema(name) {
  const def = JSON.parse(readFileSync(new URL(`../extractors/${name}.json`, import.meta.url), 'utf8'));
  return def.output_schema;
}
function getAt(obj, path) {
  return path.reduce((v, k) => v?.[k], obj);
}

test('SC-2.5-01 every coverage record validates against its extractor\'s real output_schema', () => {
  for (const extractorName of Object.keys(EXTRACTION)) {
    const { valid, errors } = validateOutput(EXTRACTION[extractorName], extractorSchema(extractorName), { schemasDir: DEFAULT_SCHEMAS_DIR });
    assert.ok(valid, `${extractorName} extraction fixture does not validate: ${JSON.stringify(errors)}`);
  }
});

test('SC-2.5-02 the quiet call yields >=3 honest coverage records, all cited/inferred/absent — never a fake receipt', () => {
  assert.ok(EXPECTED.coverage_record_paths.length >= EXPECTED.min_coverage_records);
  for (const path of EXPECTED.coverage_record_paths) {
    const record = getAt(EXTRACTION, path);
    assert.ok(record, `missing coverage record at ${path.join('.')}`);
    assert.ok(['cited', 'inferred', 'absent'].includes(record.basis), `${path.join('.')}: basis must be honest, got "${record.basis}"`);
    if (record.basis !== 'cited') {
      assert.deepEqual(record.evidence, [], `${path.join('.')}: basis:"${record.basis}" must carry NO invented citation`);
    } else {
      assert.ok(record.evidence.length > 0, `${path.join('.')}: basis:"cited" needs an actual citation`);
    }
  }
});

test('SC-2.5-03 next_steps, pricing, and stakeholders honestly report empty — absence is not fabricated', () => {
  for (const { extractor, field } of EXPECTED.empty_list_extractors) {
    assert.deepEqual(EXTRACTION[extractor][field], [], `${extractor}.${field} must be an empty list on a quiet call, not invented content`);
  }
});

test('SC-2.5-04 the one real per-line claim (required "summary" section) gates as verified — zero fabricated claims', () => {
  for (const id of EXPECTED.required_claim_ids) {
    const claim = CLAIMS.find((c) => c.id === id);
    assert.ok(claim, `claims.json is missing ${id}`);
    const gated = gateClaim(claim, TRANSCRIPT);
    assert.equal(gated.status, 'verified', `${id}: every citation on the quiet call must be real, not fabricated`);
  }
});

test('SC-2.5-05 gradeRun on the quiet call ships clean — an honest absence never blocks or misreads as broken', () => {
  const gated = CLAIMS.map((c) => gateClaim(c, TRANSCRIPT));
  const run = gradeRun(gated); // next_steps: 0 attempted (empty list is correct — G-21), summary: verified
  assert.equal(run.band, EXPECTED.expected_run_band);
  assert.equal(run.stats.uncorroborated, 0, 'a quiet call must produce zero fabricated/uncorroborated claims');
});
