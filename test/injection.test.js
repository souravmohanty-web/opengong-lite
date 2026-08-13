import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { screenTranscript, screenClaim } from '../src/injection.js';
import { gateClaim, gradeRun } from '../src/gate.js';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/gate/${name}`, import.meta.url), 'utf8'));

const T = load('transcript.injected.json');
const CLAIMS = load('claims.injection.json');
const CLEAN_T = load('transcript.pricing.json');
const byId = (id) => CLAIMS.find((c) => c.id === id);
const screen = (claim) => screenClaim(claim, screenTranscript(T), T);

test('I-01 the deterministic patterns taint exactly the planted lines', () => {
  const s = screenTranscript(T);
  assert.deepEqual(s.tainted_utterance_ids, [2, 3, 4, 5]);
  const patterns = new Set(s.findings.map((f) => f.pattern));
  assert.ok(patterns.has('ignore_previous_instructions'));
  assert.ok(patterns.has('add_link'));
  assert.ok(patterns.has('url'));
  assert.ok(patterns.has('rate_n_out_of_n'));
  assert.ok(patterns.has('system_prompt_mention'));
  for (const f of s.findings) assert.equal(typeof f.match, 'string');
});

test('I-02 false-positive guard: benign business talk is never tainted', () => {
  const s = screenTranscript(T);
  // "our pricing page" with no URL, and a statistic shaped like a rating
  assert.ok(!s.tainted_utterance_ids.includes(1));
  assert.ok(!s.tainted_utterance_ids.includes(7));
  // a whole clean transcript produces nothing at all
  const clean = screenTranscript(CLEAN_T);
  assert.deepEqual(clean.tainted_utterance_ids, []);
  assert.deepEqual(clean.findings, []);
});

test('I-03 citing a tainted utterance blocks the claim even with a perfect quote', () => {
  const v = screen(byId('i1'));
  assert.equal(v.blocked, true);
  assert.deepEqual(v.reasons, ['cites_tainted_utterance']);
  // the quote really is in the transcript — that is exactly why a second screen exists
  const anchored = gateClaim(byId('i1'), T);
  assert.equal(anchored.evidence[0].match_type, 'exact');
});

test('I-04 a URL in the claim text that was never spoken is a smuggled link', () => {
  const v = screen(byId('i2'));
  assert.equal(v.blocked, true);
  assert.deepEqual(v.reasons, ['smuggled_link']);
});

test('I-05 a URL that WAS spoken is not smuggled, but the taint screen still blocks', () => {
  const v = screen(byId('i6'));
  assert.deepEqual(v.reasons, ['cites_tainted_utterance']);
});

test('I-06 an imperative aimed at the reader is blocked even from a clean line', () => {
  const v = screen(byId('i3'));
  assert.equal(v.blocked, true);
  assert.deepEqual(v.reasons, ['imperative_smuggling']);
});

test('I-07 false-positive guard: benign claims pass both screens', () => {
  for (const id of ['i4', 'i5']) {
    const v = screen(byId(id));
    assert.equal(v.blocked, false, `${id} must not be blocked`);
    assert.deepEqual(v.reasons, []);
  }
  // and an email address that was actually spoken is not a smuggled link
  assert.ok(T.canonical_text.includes('rahul@acme.com'));
});

test('I-08 reasons come from the closed vocabulary and are deterministically ordered', () => {
  const allowed = ['cites_tainted_utterance', 'smuggled_link', 'imperative_smuggling'];
  const both = screen(byId('i7'));
  assert.deepEqual(both.reasons, ['cites_tainted_utterance', 'imperative_smuggling']);
  for (const c of CLAIMS) {
    for (const r of screen(c).reasons) assert.ok(allowed.includes(r), `unexpected reason ${r}`);
  }
});

test('I-09 the screens are pure', () => {
  const before = structuredClone(T);
  const claimBefore = structuredClone(byId('i1'));
  assert.deepEqual(screenTranscript(T), screenTranscript(T));
  assert.deepEqual(screen(byId('i1')), screen(byId('i1')));
  assert.deepEqual(T, before);
  assert.deepEqual(byId('i1'), claimBefore);
});

test('I-10 end to end: blocked claims are quarantined and leave the denominator', () => {
  const tainted = screenTranscript(T);
  const graded = CLAIMS.map((c) => gateClaim(c, T, { injection: screenClaim(c, tainted, T) }));
  const blocked = graded.filter((c) => c.status === 'blocked_injection').map((c) => c.id);
  assert.deepEqual(blocked, ['i1', 'i2', 'i3', 'i6', 'i7']);
  assert.ok(graded.filter((c) => c.status === 'verified').length >= 2);

  const run = gradeRun(graded);
  assert.equal(run.stats.blocked_injection, 5);
  assert.equal(run.stats.attempted, 2);
  assert.equal(run.ratio, 1);
  assert.equal(run.band, 'SHIPPED', 'a planted-injection call must not read PARTIAL for the wrong reason');
});
