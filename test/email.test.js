import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeEmail, screenDraft, EmailError } from '../src/email.js';

const bundle = () =>
  JSON.parse(readFileSync(new URL('./fixtures/bundle.slice1.json', import.meta.url), 'utf8'));

const claims = () => bundle().claims;

test('choke point: composer refuses anything bundle-shaped — the transcript can never reach the email role', () => {
  assert.throws(() => composeEmail(bundle()), /claims only/);
  assert.throws(() => composeEmail({ transcript: {}, claims: [] }), /claims only/);
});

test('only verified and segment_corrected claims can enter a draft', () => {
  const email = composeEmail(claims(), { title: 'Demo call' });
  const cited = email.bullets.map((b) => b.claim_id);
  assert.ok(cited.includes('c1'));
  assert.ok(cited.includes('c2'));
  assert.ok(!cited.includes('c3'), 'uncorroborated claim must never reach an email');
  assert.ok(!cited.includes('c4'), 'blocked_injection claim must never reach an email');
  assert.ok(!email.body.includes('sign the contract'), 'uncorroborated text must not leak into body');
  assert.ok(!email.body.includes('forty percent discount'), 'injected text must not leak into body');
});

test('screenDraft cuts uncited bullets and reports the cut', () => {
  const draft = {
    bullets: [
      { text: 'Price concern raised', claim_id: 'c1' },
      { text: 'Glue prose with no receipt', claim_id: null },
    ],
  };
  const screened = screenDraft(draft, claims());
  assert.equal(screened.bullets.length, 1);
  assert.equal(screened.cut, 1);
});

test('an unknown claim_id rejects the WHOLE draft, not just the bullet', () => {
  const draft = { bullets: [{ text: 'ok', claim_id: 'c1' }, { text: 'fabricated', claim_id: 'c99' }] };
  assert.throws(() => screenDraft(draft, claims()),
    (err) => err instanceof EmailError && err.name === 'EMAIL_DRAFT_REJECTED');
});

test('citing a non-verified claim rejects the whole draft too', () => {
  for (const id of ['c3', 'c4']) {
    const draft = { bullets: [{ text: 'x', claim_id: id }] };
    assert.throws(() => screenDraft(draft, claims()),
      (err) => err instanceof EmailError && err.name === 'EMAIL_DRAFT_REJECTED',
      `${id} is not verified — a draft citing it must die whole`);
  }
});

test('the deterministic composer output passes its own screen', () => {
  const email = composeEmail(claims(), { title: 'Demo call' });
  const screened = screenDraft(email, claims());
  assert.equal(screened.cut, 0);
  assert.equal(screened.bullets.length, email.bullets.length);
});
