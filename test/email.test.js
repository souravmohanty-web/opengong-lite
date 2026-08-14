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

// ── the baseline draft's SHAPE (research/13-sybill-deep/04-output-standard-match.md)
// The structure is the one a rep actually sends. The substance stays ours:
// every asserting line is one gate-passed claim, carrying its claim id.

const stepClaims = () => ([
  { id: 's1', extractor: 'summary', section: 'summary', status: 'verified', text: 'Demo landed and the pilot is scoped.' },
  { id: 's2', extractor: 'pain', section: 'pain', status: 'verified', text: 'Calls drop mid-transfer a few times a day.' },
  { id: 's3', extractor: 'next_steps', section: 'next_steps', status: 'verified', text: 'Rep to send the SOC 2 report.', owner: 'rep', due: 'Friday', commitment: 'firm' },
  { id: 's4', extractor: 'next_steps', section: 'next_steps', status: 'verified', text: 'Both sides to move to pricing.', owner: 'joint', due: 'after documents exchanged', commitment: 'tentative' },
  { id: 's5', extractor: 'summary', section: 'next_steps', status: 'verified', text: 'Rep sends SOC 2 by Friday, then pricing.' },
]);

test('the baseline draft opens with a greeting and closes with a signoff', () => {
  const email = composeEmail(stepClaims(), { title: 'the demo call', recipient: 'Rahul', sender: 'Maya' });
  assert.equal(email.greeting, 'Hi Rahul,');
  assert.equal(email.signoff, 'Best,\nMaya');
  assert.ok(email.body.startsWith('Hi Rahul,'), 'the draft opens on the greeting');
  assert.ok(email.body.endsWith('Best,\nMaya'), 'the draft closes on the signoff');
  assert.match(email.opener, /^Thanks for the time on the demo call\./);
  assert.match(email.body, /\nNext steps:\n/, 'next steps get their own labelled block');
  assert.match(email.body, /\nWhat we covered:\n/);
});

test('with no names known the chrome still stands and invents nobody', () => {
  const email = composeEmail(stepClaims(), { title: 'our call' });
  assert.equal(email.greeting, 'Hi there,');
  assert.equal(email.signoff, 'Best,');
  assert.ok(!/undefined|null/i.test(email.body), 'a missing name never renders as a placeholder');
});

test('the draft leads on the outcome, one line, lifted out of the recap', () => {
  const email = composeEmail(stepClaims(), { title: 'the demo call' });
  assert.equal(email.outcome.claim_id, 's1');
  assert.ok(!email.recap.some((b) => b.claim_id === 's1'), 'the outcome is not repeated in the recap');
  assert.ok(email.body.indexOf('Demo landed') < email.body.indexOf('What we covered:'));
});

test('next steps carry owner and due date when the claim carries them', () => {
  const email = composeEmail(stepClaims(), {
    title: 'the demo call', owners: { rep: 'Maya', buyer: 'Rahul', joint: 'Both', unknown: '' },
  });
  const firm = email.next_steps.find((b) => b.claim_id === 's3');
  assert.equal(firm.owner, 'Maya');
  assert.equal(firm.due, 'Friday');
  assert.equal(firm.meta, 'Maya · Friday');
  const soft = email.next_steps.find((b) => b.claim_id === 's4');
  assert.equal(soft.firmness, 'tentative', 'a soft commitment says so, from the claim own field');
  assert.match(email.body, /Rep to send the SOC 2 report\. \(Maya · Friday\)/);
});

test('an unclear commitment gets no owner chip: there is nobody to name', () => {
  const email = composeEmail([
    { id: 'n1', extractor: 'next_steps', section: 'next_steps', status: 'verified', text: 'No next step was agreed on this call.', owner: 'joint', due: 'none', commitment: 'unclear' },
  ], { title: 'the messy call', owners: { joint: 'Both' } });
  assert.equal(email.next_steps[0].meta, undefined);
  assert.ok(!email.body.includes('(Both'), 'nobody owns a step nobody committed to');
});

test('the roll-up line is dropped when the itemized steps are there', () => {
  const email = composeEmail(stepClaims(), { title: 'the demo call' });
  const ids = email.next_steps.map((b) => b.claim_id);
  assert.deepEqual(ids, ['s3', 's4'], 'the summary roll-up (s5) restates the items, so it stays off the draft');
  assert.ok(!email.bullets.some((b) => b.claim_id === 's5'));
});

test('the roll-up survives when it is the only next-step line there is', () => {
  const only = stepClaims().filter((c) => c.id !== 's3' && c.id !== 's4');
  const email = composeEmail(only, { title: 'the demo call' });
  assert.deepEqual(email.next_steps.map((b) => b.claim_id), ['s5'], 'dropping it would lose the only next step');
});

test('the same line twice collapses to one bullet', () => {
  const twice = [
    { id: 'd1', extractor: 'pain', status: 'verified', text: 'Calls drop mid-transfer.' },
    { id: 'd2', extractor: 'pain', status: 'verified', text: 'Calls drop mid-transfer.' },
  ];
  const email = composeEmail(twice, { title: 'the demo call' });
  assert.equal(email.bullets.length, 1);
});

test('every bullet in the new shape still maps to an emailable claim id', () => {
  const cs = stepClaims();
  const emailable = new Set(cs.filter((c) => c.status === 'verified' || c.status === 'segment_corrected').map((c) => c.id));
  const email = composeEmail(cs, { title: 'the demo call', recipient: 'Rahul', sender: 'Maya' });
  const grouped = [...(email.outcome ? [email.outcome] : []), ...email.recap, ...email.next_steps];
  assert.deepEqual(grouped.map((b) => b.claim_id), email.bullets.map((b) => b.claim_id));
  for (const b of email.bullets) {
    assert.ok(b.claim_id && emailable.has(b.claim_id), `bullet cites ${b.claim_id}, which is not an emailable claim`);
  }
  assert.equal(screenDraft(email, cs).cut, 0, 'the richer shape still passes its own screen');
});

test('the chrome we author carries no em-dash and no bare percentage', () => {
  const email = composeEmail(stepClaims(), { title: 'the demo call', recipient: 'Rahul', sender: 'Maya' });
  for (const line of [email.greeting, email.opener, email.assurance, email.signoff, email.subject]) {
    assert.ok(!line.includes('—') && !line.includes('–'), `em-dash in authored chrome: ${line}`);
    assert.equal(/\d\s*%/.exec(line), null, `bare percentage in authored chrome: ${line}`);
  }
});

test('screenDraft prunes the render groups too, never leaves a cut bullet showing', () => {
  const cs = stepClaims();
  const email = composeEmail(cs, { title: 'the demo call' });
  email.recap.push({ text: 'glue with no receipt', claim_id: null });
  email.bullets.push(email.recap[email.recap.length - 1]);
  const screened = screenDraft(email, cs);
  assert.equal(screened.cut, 1);
  assert.ok(!screened.recap.some((b) => b.claim_id == null), 'a cut bullet cannot survive inside a group');
});
