import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gateClaim } from '../src/gate.js';

// SCORECARD 2.3 — coreference resolution (master-plan.md §2.3). "It's too
// expensive" — what is *it*? A claim must name the resolved referent in its
// own text AND cite the establishing utterance as supporting_evidence, or it
// must demote. This fixture plants the 6 pronoun-heavy cases SCORECARD.md 2.3
// calls for, graded against the real mechanism already in src/gate.js:
// a claim whose quoted span opens on a bare pronoun sets requires_context, and
// ships clean only when supporting_evidence anchors a real antecedent line —
// otherwise it demotes via requires_context_missing_support /
// supporting_evidence_unanchored (the exact machinery test/gate.test.js
// G-35/G-36 exercise on a single case each).

const DIR = new URL('./fixtures/scorecard/pp-2.3-coreference/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8'));

const TRANSCRIPT = load('transcript.json');
const CLAIMS = load('claims.json');
const EXPECTED = load('expected.json');
const byId = (id) => CLAIMS.find((c) => c.id === id);

test('SC-2.3-00 fixture shape: 6 coreference cases (4 resolved + 2 demoted)', () => {
  assert.equal(EXPECTED.length, 6);
  assert.equal(EXPECTED.filter((e) => e.should_resolve).length, 4);
  assert.equal(EXPECTED.filter((e) => !e.should_resolve).length, 2);
});

for (const exp of EXPECTED) {
  test(`SC-2.3 ${exp.id} ("${exp.pronoun}") ${exp.should_resolve ? 'resolves to a named referent + citation' : 'demotes honestly'}`, () => {
    const claim = byId(exp.id);
    assert.ok(claim, `claims.json is missing ${exp.id}`);

    if (exp.should_resolve) {
      // the claim text must actually NAME the resolved referent, not just gesture at it
      assert.ok(
        claim.text.toLowerCase().includes(exp.referent.toLowerCase())
        || (exp.referent === 'RingCentral' && /ringcentral/i.test(claim.text)),
        `${exp.id}: claim.text must name the resolved referent "${exp.referent}" — got "${claim.text}"`,
      );
      assert.equal(claim.supporting_evidence?.[0]?.utterance_id, exp.establishing_utterance_id,
        `${exp.id}: must cite the establishing utterance as supporting_evidence`);
    }

    const gated = gateClaim(claim, TRANSCRIPT);
    assert.equal(gated.status, 'verified', `${exp.id}: the quoted pronoun line itself must be real`);

    if (exp.should_resolve) {
      // a correctly-supported antecedent must ship clean: no unresolved-coreference flags
      assert.ok(!gated.context_flags.some((f) => f.flag === 'requires_context_missing_support'),
        `${exp.id}: a supported referent must not read requires_context_missing_support`);
      assert.ok(!gated.context_flags.some((f) => f.flag === 'supporting_evidence_unanchored'),
        `${exp.id}: a real antecedent citation must anchor`);
    } else {
      for (const flag of exp.expect_flags) {
        assert.ok(gated.context_flags.some((f) => f.flag === flag),
          `${exp.id}: expected demotion flag "${flag}", got [${gated.context_flags.map((f) => f.flag).join(', ')}]`);
      }
      assert.equal(gated.interpretation_confidence, 'low',
        `${exp.id}: an unresolved pronoun claim must never ship as a confident, named claim`);
    }
  });
}
