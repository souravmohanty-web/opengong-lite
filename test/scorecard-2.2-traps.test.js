import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gateClaim } from '../src/gate.js';

// SCORECARD 2.2 — negation, hypothetical, and reported speech (master-plan.md
// §2.2). "We do NOT have budget issues" must never become a budget objection;
// "IF we bought this…" is not a commitment; "our old vendor said X" is not
// the buyer's view. This fixture assembles the full planted set (3 negation +
// 3 hypothetical + 3 reported-speech lines, per SCORECARD.md 2.2's "9
// negation/hypothetical/reported-speech trap lines") as ONE scored fixture,
// generalizing the single-case coverage in test/gate.test.js (G-29/G-31/G-32)
// to the target width. Each claim below is a WRONG reading — a model that
// took the trap line at face value — so the pass condition is that the real
// interpretation gate (src/gate.js contextCheck) catches every one of them:
// 0 traps may ship as a fully-asserted (interpretation_confidence:"high")
// claim.

const DIR = new URL('./fixtures/scorecard/pp-2.2-traps/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8'));

const TRANSCRIPT = load('transcript.json');
const CLAIMS = load('claims.json');
const EXPECTED = load('expected.json');
const byId = (id) => CLAIMS.find((c) => c.id === id);

test('SC-2.2-00 fixture shape: 3 negation + 3 hypothetical + 3 reported-speech traps', () => {
  assert.equal(EXPECTED.length, 9);
  const counts = EXPECTED.reduce((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
  assert.deepEqual(counts, { negation: 3, hypothetical: 3, reported: 3 });
});

for (const exp of EXPECTED) {
  test(`SC-2.2 ${exp.id} (${exp.kind}): the trap line is caught, 0 claims asserted from it`, () => {
    const claim = byId(exp.id);
    assert.ok(claim, `claims.json is missing ${exp.id}`);
    const gated = gateClaim(claim, TRANSCRIPT);
    // the line itself is real (this is a MEANING trap, not a fabrication trap)
    assert.equal(gated.status, 'verified', `${exp.id}: the trap line must be real, anchored text`);
    const flag = gated.context_flags.find((f) => f.flag === exp.expected_flag);
    assert.ok(flag, `${exp.id}: expected context_flag "${exp.expected_flag}", got [${gated.context_flags.map((f) => f.flag).join(', ')}]`);
    // this is the actual pass bar: it must never ship as a fully-confirmed fact
    assert.notEqual(gated.interpretation_confidence, 'high',
      `${exp.id}: a ${exp.kind} trap must never read interpretation_confidence:"high"`);
  });
}

test('SC-2.2-neg a genuinely clean, non-trap line is NOT flagged (negative control)', () => {
  const clean = {
    id: 'trap-control', extractor: 'summary', text: 'The rep opened the call.',
    stance: { polarity: 'positive', modality: 'commitment', attribution: 'first_party', attributed_to: null, certainty: 'high' },
    evidence: [{ utterance_id: 0, quote: 'before we get into pricing tell me a bit' }],
  };
  const gated = gateClaim(clean, TRANSCRIPT);
  assert.equal(gated.status, 'verified');
  assert.deepEqual(gated.context_flags, []);
  assert.equal(gated.interpretation_confidence, 'high');
});
