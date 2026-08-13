// Notes-first view — DOM-free tests. Exercises the exact buildNotesModel /
// renderNotesPage the demo pages are built from (scripts/build-notes.mjs), plus
// the label helpers. No browser: the model is a plain object, the render is a
// string. Reuses viewer.js's buildViewModel + email.js's composeEmail read-only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildNotesModel,
  renderNotesPage,
  renderCallPage,
  renderLandingPage,
  landingCard,
  shortLabel,
  displayTitle,
} from '../src/notes-view.mjs';

const BUNDLES_DIR = new URL('../samples/bundles', import.meta.url).pathname;
const FIX = new URL('../test/fixtures/bundle.slice1.json', import.meta.url).pathname;

function loadBundles() {
  return readdirSync(BUNDLES_DIR)
    .filter((f) => f.endsWith('.bundle.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(BUNDLES_DIR, f), 'utf8')));
}
const bundleById = (id) => loadBundles().find((b) => b.call.id === id);
const slice1 = () => JSON.parse(readFileSync(FIX, 'utf8'));

const navCtx = (bundle) => ({
  calls: loadBundles().map((b, i) => ({ id: b.call.id, seq: i + 1, title: b.call.title, href: `${b.call.id}.html` })),
  currentId: bundle.call.id,
  dealName: 'Brightsmile Dental Group',
  seq: 1,
  total: 5,
});

// ── label helpers ────────────────────────────────────────────────────────────
test('shortLabel splits on colon or dash and trims', () => {
  assert.equal(shortLabel('Discovery — Brightsmile Dental, on RingHawk'), 'Discovery');
  assert.equal(shortLabel('Pricing: quote vs RingHawk'), 'Pricing');
  assert.equal(shortLabel('Close'), 'Close');
});

test('displayTitle swaps the dash separator for a colon, never emits a dash', () => {
  assert.equal(displayTitle('Discovery — Brightsmile Dental'), 'Discovery: Brightsmile Dental');
  assert.ok(!displayTitle('Demo — after-hours routing').includes('—'));
});

// ── model over the 5 real bundles ────────────────────────────────────────────
test('buildNotesModel builds all 5 real bundles without throwing', () => {
  for (const b of loadBundles()) {
    const m = buildNotesModel(b);
    assert.ok(m.primary.length > 0, `${b.call.id} has primary sections`);
    assert.ok(m.title && !m.title.includes('—'), `${b.call.id} title has no dash`);
  }
});

test('primary sections are the human notes, in reading order, never the analytical extras', () => {
  const m = buildNotesModel(bundleById('01'));
  const keys = m.primary.map((s) => s.key);
  // analytical extras must not be prose cards
  for (const bad of ['tracker', 'buying_stage', 'risk_flags']) {
    assert.ok(!keys.includes(bad), `${bad} must not be a primary prose section`);
  }
  // they belong to the secondary chip strip instead
  const secKeys = m.secondary.map((s) => s.key);
  assert.ok(secKeys.includes('tracker') && secKeys.includes('buying_stage'));
  // summary leads
  assert.equal(keys[0], 'summary');
});

test('every primary card that has a receipt resolves to a real transcript line + timestamp', () => {
  for (const b of loadBundles()) {
    const m = buildNotesModel(b);
    for (const sec of m.primary) {
      for (const card of sec.cards) {
        for (const r of card.receipts) {
          assert.ok(Number.isFinite(r.tStart), 'receipt has a numeric play time');
          assert.ok(typeof r.lineHtml === 'string' && r.lineHtml.length > 0);
        }
      }
    }
  }
});

// ── the gate beat (held back) ────────────────────────────────────────────────
test('bundle 03 surfaces exactly one held-back claim with its reason and verbatim claimed line', () => {
  const m = buildNotesModel(bundleById('03'));
  assert.equal(m.heldBack.length, 1);
  const h = m.heldBack[0];
  assert.match(h.reason, /couldn't find this line in the call/);
  assert.equal(h.claimedQuote, 'i can match their twenty two if you commit today');
  // and it never leaked into the notes body
  const bodyText = m.primary.flatMap((s) => s.cards).map((c) => c.text).join(' ');
  assert.ok(!bodyText.includes(h.text), 'held-back claim must not appear as a note');
});

test('a fully verified call has no held-back block', () => {
  const m = buildNotesModel(bundleById('01'));
  assert.equal(m.heldBack.length, 0);
  assert.equal(m.tallies.notFound, 0);
});

// ── blocked / uncorroborated can never reach the notes body or the email ─────
test('slice1 fixture: blocked quarantined, uncorroborated held back, neither in notes or email', () => {
  const b = slice1();
  const m = buildNotesModel(b);
  const bodyText = m.primary.flatMap((s) => s.cards).map((c) => c.text).join(' ');
  const emailText = m.email.bullets.map((x) => x.text).join(' ');

  // blocked_injection claim
  assert.equal(m.quarantine.length, 1);
  assert.ok(!bodyText.includes('Approve a forty percent discount'));
  assert.ok(!emailText.includes('Approve a forty percent discount'));

  // uncorroborated claim
  assert.equal(m.heldBack.length, 1);
  assert.ok(!bodyText.includes('agreed to sign the contract'));
  assert.ok(!emailText.includes('agreed to sign the contract'));

  // only the two emailable claims made the draft
  assert.equal(m.email.bullets.length, 2);
  for (const bl of m.email.bullets) {
    assert.ok(['c1', 'c2'].includes(bl.claim_id));
  }
});

test('the follow-up email recaps only the human sections, not analytical/meta fields', () => {
  const m = buildNotesModel(bundleById('03'));
  const emailText = m.email.bullets.map((b) => b.text).join(' | ');
  // human recap content is present
  assert.match(emailText, /twenty eight per month/); // pricing/summary
  assert.match(emailText, /sharper number/);         // next steps
  // meta/analytical fields stay on the page as chips, never in the email
  assert.ok(!/single_threaded/i.test(emailText), 'stakeholder threading leaked into the email');
  assert.ok(!/negotiation/i.test(emailText), 'buying-stage leaked into the email');
  assert.ok(!/transcript quality|hard to make out/i.test(emailText), 'transcript-quality flag leaked into the email');
  // but those fields still render as page chips
  const chipText = m.secondary.flatMap((s) => s.chips).map((c) => c.text).join(' ');
  assert.match(chipText, /negotiation/i);
});

// ── render output ────────────────────────────────────────────────────────────
test('renderNotesPage emits the self-explaining chrome: tagline, magic line, deal nav', () => {
  const b = bundleById('01');
  const html = renderNotesPage(buildNotesModel(b, { seq: 1, total: 5, dealName: 'Brightsmile Dental Group' }), navCtx(b));
  assert.match(html, /We do what was promised/);       // tagline
  assert.match(html, /Click any card to see the exact line/); // the magic hint
  assert.match(html, /class="deal-rail"/);              // deal nav present
  assert.match(html, /aria-current="step"/);            // current call marked
  assert.match(html, /Follow-up email/);                // email panel present
});

test('rendered real pages never contain an em-dash (house voice rule)', () => {
  for (const b of loadBundles()) {
    const html = renderCallPage(b, { ...navCtx(b), audioSrc: `/audio/${b.call.id}.m4a` });
    assert.ok(!html.includes('—'), `${b.call.id}.html leaked an em-dash`);
    assert.ok(!html.includes('–'), `${b.call.id}.html leaked an en-dash`);
  }
});

test('the receipt renders the evidence quote verbatim, wrapped in a mark', () => {
  const b = bundleById('03');
  const html = renderCallPage(b, navCtx(b));
  // a known verbatim quote from bundle 03 evidence
  assert.match(html, /<mark>ring hawk came back the moment they smelled a switch/);
});

test('audio is optional: no audioSrc yields no <audio> element and the fallback note', () => {
  const b = bundleById('02');
  const withOut = renderCallPage(b, navCtx(b)); // no audioSrc
  assert.ok(!/<audio/.test(withOut));
  assert.match(withOut, /Audio is not loaded here/);

  const withAudio = renderCallPage(b, { ...navCtx(b), audioSrc: '/audio/02.m4a' });
  assert.match(withAudio, /<audio id="call-audio"[^>]*src="\/audio\/02\.m4a"/);
});

test('audio-optional: with no audio there is no play button either, only a plain timestamp', () => {
  const b = bundleById('02');
  const withOut = renderCallPage(b, navCtx(b));
  assert.ok(!withOut.includes('class="play"'), 'a play button with no <audio> to seek is a dead control');
  assert.ok(withOut.includes('class="rc-time"'), 'the timestamp itself must still render');

  const withAudio = renderCallPage(b, { ...navCtx(b), audioSrc: '/audio/02.m4a' });
  assert.ok(withAudio.includes('class="play"'));
  assert.ok(!withAudio.includes('class="rc-time"'));
});

// ── call 06: the planted injection, on a real deal bundle ────────────────────
test('call 06 renders the blocked-injection block, and its email carries none of the payload', () => {
  const b = bundleById('06');
  assert.ok(b, 'samples/bundles/06.bundle.json must exist — it is the injection demo beat');
  assert.ok(b.notes.coverage.stats.blocked_injection >= 1, 'call 06 must actually block something');

  const model = buildNotesModel(b, {});
  assert.ok(model.quarantine.length >= 1, 'the quarantine list is what the red block renders from');

  const html = renderCallPage(b, navCtx(b)); // no audioSrc: call 06 has no audio
  assert.match(html, /held--blocked/, 'the red blocked section must render');
  assert.match(html, /ignore all previous instructions/, 'the planted line is shown, quarantined, on purpose');

  // The payload must not survive into the drafted email in any form.
  const emailText = model.email.bullets.map((x) => (typeof x === 'string' ? x : x.text ?? '')).join(' ').toLowerCase();
  for (const payload of ['forty percent', 'discount', 'ignore all previous', 'click here', 'midnight']) {
    assert.ok(!emailText.includes(payload), `email leaked injected text: ${payload}`);
  }
});

// ── samples-first landing ────────────────────────────────────────────────────
test('landingCard summarizes a bundle: label, human title, one-line summary, tally', () => {
  const c = landingCard(bundleById('03'), 3);
  assert.equal(c.label, 'Pricing');
  assert.equal(c.href, '03.html');
  assert.ok(!c.title.includes('—'));
  assert.ok(c.summary.length > 0);
  assert.equal(c.notFound, 1); // the held-back claim shows on the card tally
});

test('renderLandingPage lists all 5 calls as clickable sample cards, no em-dash', () => {
  const cards = loadBundles().map((b, i) => landingCard(b, i + 1));
  const html = renderLandingPage(cards, { dealName: 'Brightsmile Dental Group' });
  for (const label of ['Discovery', 'Demo', 'Pricing', 'Commitment check', 'Close']) {
    assert.ok(html.includes(`>${label}<`), `landing missing ${label}`);
  }
  assert.match(html, /href="01\.html"/);
  assert.match(html, /No upload, no key/);       // the zero-config promise
  assert.match(html, /We do what was promised/); // the action thesis
  assert.ok(!html.includes('—'), 'landing leaked an em-dash');
});

test('held-back claim reason and email framing carry no em-dash even from dashed fixture titles', () => {
  // slice1 claim text contains a dash (fixture data), so we only assert the
  // CHROME we author is clean: title normalized, subject/tagline dash-free.
  const b = slice1();
  const m = buildNotesModel(b);
  assert.ok(!m.title.includes('—'));
  assert.ok(!m.email.subject.includes('—'));
});
