import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTranscript } from '../src/methodology/transcript.js';
import { gateEvidence, gateVerdicts } from '../src/methodology/gate.js';

const transcript = parseTranscript(readFileSync(new URL('../samples/methodology/call-discovery.txt', import.meta.url), 'utf8'));

test('exact quote in cited segment verifies', () => {
  const e = gateEvidence(transcript, { quote: 'Dr. Rao, our owner.', segment: 5 });
  assert.equal(e.status, 'verified');
});

test('exact quote cited one segment off is corrected, not dropped', () => {
  const e = gateEvidence(transcript, { quote: 'We think each booked patient is worth about 300 dollars', segment: 2 });
  assert.equal(e.status, 'segment_corrected');
  assert.equal(e.segment, 3);
});

test('punctuation drift verifies via normalization, never digit drift', () => {
  const ok = gateEvidence(transcript, { quote: 'Dr Rao our owner', segment: 5 });
  assert.notEqual(ok.status, 'demoted');
  const bad = gateEvidence(transcript, { quote: 'we missed 240 calls across three clinics', segment: 1 });
  assert.equal(bad.status, 'demoted', 'a wrong number must never be laundered in');
});

test('unique whole-transcript rescue relabels segment_corrected', () => {
  const e = gateEvidence(transcript, { quote: 'Training time killed the last tool we tried.', segment: 0 });
  assert.equal(e.status, 'segment_corrected');
  assert.equal(e.segment, 9);
});

test('fabricated quote demotes', () => {
  const e = gateEvidence(transcript, { quote: 'I will fight for this internally no matter what', segment: 11 });
  assert.equal(e.status, 'demoted');
});

test('met verdict with only demoted evidence is flagged unverified', () => {
  const gated = gateVerdicts(transcript, {
    call_type: 'discovery',
    overall_note: 'x',
    traits: [
      { id: 'a', verdict: 'met', confidence: 0.9, evidence: [{ quote: 'never said this', segment: 2 }], gap: '' },
      { id: 'b', verdict: 'missed', confidence: 0.9, evidence: [], gap: 'g' },
    ],
  });
  assert.equal(gated.traits[0].unverified, true);
  assert.equal(gated.traits[1].unverified, false, 'missed verdicts need no evidence');
});
