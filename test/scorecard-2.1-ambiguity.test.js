import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gateClaim } from '../src/gate.js';

// SCORECARD 2.1 — contextual disambiguation (master-plan.md §2.1). A word is
// not a meaning: this fixture plants 12 ambiguous mentions across three
// classes (competitor-name-vs-common-word, feature-name-vs-generic-phrase,
// number-vs-unit) and requires each to either RESOLVE CORRECTLY or DEMOTE to
// low confidence. A confident-wrong label is the one thing that must never
// happen (SCORECARD.md 2.1 target). The numeric class is graded by the real
// interpretation gate (src/gate.js numberFlags / number_without_unit_anchor);
// the entity class is graded against a hand-authored expected-label file,
// since entity-sense resolution has no offline model to call in this suite.

const DIR = new URL('./fixtures/scorecard/pp-2.1-ambiguity/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8'));

const TRANSCRIPT = load('transcript.json');
const CLAIMS = load('claims.json');
const EXPECTED = load('expected.json');
const byId = (id) => CLAIMS.find((c) => c.id === id);
const expById = (id) => EXPECTED.find((e) => e.id === id);

// The grading rule itself (SCORECARD 2.1): PASS iff the term resolved to the
// correct sense, OR the extractor honestly demoted to confidence:low / an
// unresolved unit. A confident-but-wrong resolution is the only failure mode.
function gradeEntityAmbiguity(claim, expected) {
  const ref = claim.entity_refs?.[0];
  if (!ref) return { pass: false, reason: 'no entity_refs on claim' };
  const resolvedCorrectly = ref.type === expected.expected_type && ref.registry_id === expected.expected_registry_id;
  if (resolvedCorrectly) return { pass: true, reason: 'resolved correctly' };
  if (ref.confidence === 'low') return { pass: true, reason: 'honestly demoted to low confidence' };
  return { pass: false, reason: `confident-wrong: type=${ref.type} registry_id=${ref.registry_id} confidence=${ref.confidence}` };
}

function gradeNumberAmbiguity(claim, expected, gated) {
  const q = claim.quantities?.[0];
  if (!q) return { pass: false, reason: 'no quantities on claim' };
  const resolvedCorrectly = q.unit === expected.expected_unit && q.unit_source !== 'unknown';
  const flagged = gated.context_flags.some((f) => f.flag === 'number_without_unit_anchor');
  if (resolvedCorrectly) {
    // resolved AND the real interpretation gate must agree there's no disagreement
    return { pass: !flagged, reason: flagged ? 'claimed resolved but the gate still flagged it unanchored' : 'resolved and anchored' };
  }
  const honestlyUnknown = q.unit === 'unknown' && q.unit_source === 'unknown';
  return { pass: honestlyUnknown, reason: honestlyUnknown ? 'honestly demoted (unit unknown)' : `confident-wrong: unit=${q.unit}` };
}

test('SC-2.1-00 fixture shape: 12 planted ambiguous terms, transcript is canonical', () => {
  assert.equal(EXPECTED.length, 12);
  assert.equal(CLAIMS.length, 12);
  assert.doesNotThrow(() => gateClaim(byId('amb-ring-1'), TRANSCRIPT));
});

for (const exp of EXPECTED) {
  test(`SC-2.1 ${exp.id} (${exp.category}:"${exp.term}") resolves correctly or demotes — never confident-wrong`, () => {
    const claim = byId(exp.id);
    assert.ok(claim, `claims.json is missing ${exp.id}`);
    const gated = gateClaim(claim, TRANSCRIPT);
    // every planted quote must be a REAL line — an ambiguity fixture that
    // fabricates its own receipts would be worthless as a trust check.
    assert.equal(gated.status, 'verified', `${exp.id}: evidence must anchor for real (status was ${gated.status})`);

    const verdict = exp.category === 'entity'
      ? gradeEntityAmbiguity(claim, exp)
      : gradeNumberAmbiguity(claim, exp, gated);
    assert.ok(verdict.pass, `${exp.id}: ${verdict.reason}`);
  });
}

// Defensive test of the grader itself: a confidently-wrong entity resolution
// must be caught, not waved through — otherwise this whole fixture is vacuous.
test('SC-2.1-neg the ambiguity grader itself catches a confident-wrong resolution', () => {
  const confidentWrong = { entity_refs: [{ term: 'ring', type: 'competitor', registry_id: 'ring', confidence: 'high' }] };
  const expected = { expected_type: 'common_word', expected_registry_id: null };
  const verdict = gradeEntityAmbiguity(confidentWrong, expected);
  assert.equal(verdict.pass, false, 'a confident-wrong label must fail the grader');
});
