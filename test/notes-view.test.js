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
  buildDealModel,
  renderDealWorkspace,
  landingCard,
  shortLabel,
  displayTitle,
  truncateQuote,
  speakerName,
  tallyLine,
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

// Everything a reader sees, with the style/script blocks stripped. The copy
// rules below are about words on screen, never about CSS or client code.
function visibleText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

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
  assert.equal(h.reason, "We couldn't find this in the call.");
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
  assert.match(html, /Click a number to read the line it came from and hear it said/); // the magic hint
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
  assert.match(withOut, /No audio is staged for this call/);

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

// ── numbered citations (the Perplexity pattern) ──────────────────────────────
test('a note with one evidence line gets exactly one numbered chip and one source row', () => {
  const m = buildNotesModel(bundleById('01'));
  const sec = m.primary.find((s) => s.key === 'summary');
  const card = sec.cards[0];
  assert.equal(card.receipts.length, 1, 'this fixture note stands on one line');
  assert.equal(card.receipts[0].n, 1);
  assert.ok(card.receipts[0].domId, 'the receipt is addressable, so a chip can open it');
  assert.equal(sec.sources.length, sec.cards.reduce((n, c) => n + c.receipts.length, 0));

  const html = renderCallPage(bundleById('01'), navCtx(bundleById('01')));
  assert.match(html, /<sup class="cites"><button class="cite" type="button" data-cite="rc-summary-0-0"[^>]*>1<\/button><\/sup>/);
  assert.match(html, /<button class="source" type="button" data-cite="rc-summary-0-0">/);
  assert.match(html, /<span class="src-label">Sources<\/span>/);
});

test('citation numbers restart per section and every chip points at a real receipt id', () => {
  for (const b of loadBundles()) {
    const m = buildNotesModel(b);
    const html = renderCallPage(b, navCtx(b));
    for (const sec of m.primary) {
      const numbers = sec.sources.map((s) => s.n);
      assert.deepEqual(numbers, numbers.map((_, i) => i + 1), `${b.call.id}/${sec.key} numbering`);
      for (const card of sec.cards) {
        for (const r of card.receipts) {
          assert.ok(r.n >= 1 && r.n <= sec.sources.length);
          assert.ok(html.includes(`id="${r.domId}"`), `${r.domId} must exist in the page`);
          assert.ok(html.includes(`data-cite="${r.domId}"`), `${r.domId} must have a chip`);
        }
      }
      for (const s of sec.sources) {
        assert.ok(html.includes(`data-cite="${s.target}"`), 'source row opens a receipt');
        assert.ok(s.quoteShort.length <= 81, `source quote is trimmed: ${s.quoteShort.length}`);
      }
    }
  }
});

test('a note with no line found shows no chip, and says so in plain words', () => {
  const b = bundleById('03');
  const html = renderCallPage(b, navCtx(b));
  const m = buildNotesModel(b);
  assert.equal(m.heldBack.length, 1);
  const heldBlock = /<section class="held">[\s\S]*?<\/section>/.exec(html)[0];
  assert.ok(!heldBlock.includes('class="cite"'), 'a held-back note has nothing to cite');
  assert.match(heldBlock, /We couldn&#39;t find this in the call\./);
  assert.match(heldBlock, /Not found in the call/);
});

test('a blocked note reads as a plain warning, not as an enum', () => {
  const b = bundleById('06');
  const html = renderCallPage(b, navCtx(b));
  assert.match(html, /Blocked\. This line tried to give instructions to the AI\. It never enters notes or email\./);
  assert.ok(!html.includes('blocked_injection'), 'the enum name never reaches the page');
});

test('truncateQuote trims long quotes at a word and leaves short ones alone', () => {
  assert.equal(truncateQuote('short quote'), 'short quote');
  const long = 'a'.repeat(40) + ' ' + 'b'.repeat(60);
  const cut = truncateQuote(long);
  assert.ok(cut.length <= 81 && cut.endsWith('…'));
});

test('speakerName prefers real names, falls back to a readable label', () => {
  assert.equal(speakerName('speaker_1', { speaker_1: 'Maya' }), 'Maya');
  assert.equal(speakerName('speaker_2'), 'Speaker 2');
  assert.equal(speakerName(null), '');
});

// ── the shared vocabulary, on the built pages ────────────────────────────────
// The words the product used to say to itself. Evidence quotes are rendered
// verbatim and can contain anything a person said, so this list stays to the
// gate's own vocabulary: those words only ever appear if WE wrote them.
const INSIDER = /\buncorroborated\b|\bverified\b|segment[_ ]corrected|blocked[_ ]injection|\bcorroborat/i;

test('rendered call pages speak the shared vocabulary, never the enum names', () => {
  for (const b of loadBundles()) {
    const html = renderCallPage(b, { ...navCtx(b), speakers: { speaker_1: 'Maya', speaker_2: 'Rahul' } });
    const text = visibleText(html);
    assert.match(text, /backed/, `${b.call.id} never says backed`);
    const hit = INSIDER.exec(text);
    assert.equal(hit, null, `${b.call.id} leaked insider vocabulary: ${hit && hit[0]}`);
  }
});

test('the tally is always a fraction, and no page states a bare percentage', () => {
  for (const b of loadBundles()) {
    const html = renderCallPage(b, navCtx(b));
    const text = visibleText(html);
    assert.match(text, /\d+ of \d+ notes backed\./, `${b.call.id} has no fraction tally`);
    const pct = /\d\s*%/.exec(text);
    assert.equal(pct, null, `${b.call.id} shows a bare percentage: ${pct && pct[0]}`);
  }
});

test('tallyLine names both what was held back and what was blocked', () => {
  const one = tallyLine({ tallies: { backed: 20, attempted: 21, notFound: 1, blocked: 0 } });
  assert.match(one, /^20 of 21 notes backed\./);
  assert.match(one, /1 held back/);
  assert.match(one, /We couldn't find it in the call\./);
  const clean = tallyLine({ tallies: { backed: 24, attempted: 24, notFound: 0, blocked: 0 } });
  assert.equal(clean, '24 of 24 notes backed.');
  const blocked = tallyLine({ tallies: { backed: 10, attempted: 10, notFound: 0, blocked: 3 } });
  assert.match(blocked, /3 blocked/);
});

// ── the deal workspace (the landing) ─────────────────────────────────────────
test('landingCard summarizes a bundle: label, human title, one-line summary, tally', () => {
  const c = landingCard(bundleById('03'), 3);
  assert.equal(c.label, 'Pricing');
  assert.equal(c.href, '03.html');
  assert.ok(!c.title.includes('—'));
  assert.ok(c.summary.length > 0);
  assert.equal(c.notFound, 1); // the held-back note shows on the card tally
  assert.equal(c.attempted, 21);
  assert.match(c.stage ?? '', /negotiation/i);
});

test('buildDealModel is the account view: stage, the verbal commit, totals, ledger', () => {
  const m = buildDealModel(loadBundles(), { dealName: 'Brightsmile Dental Group', dealMeta: '5 locations' });
  assert.equal(m.calls.length, 6);
  assert.equal(m.calls[0].notesHref, 'notes/01.html');
  assert.equal(m.totals.attempted, m.calls.reduce((n, c) => n + c.attempted, 0));
  assert.equal(m.totals.backed + m.totals.notFound, m.totals.attempted);
  assert.match(m.stage ?? '', /committed/i);
  assert.ok(m.commit, 'the verbal commit is read off the buying-stage claim');
  assert.equal(m.commit.notesHref, 'notes/05.html');
  assert.match(m.commit.text, /pilot/i);
  assert.ok(m.ledger.length >= 10);
  const tcpa = m.ledger.find((e) => /TCPA one-pager promised by Friday never showed up/.test(e.text));
  assert.ok(tcpa, 'the dropped-commitment call-out is in the ledger');
  assert.equal(tcpa.slipped, true, 'the TCPA drop is flagged, from the claim its own words');
  const trustOnly = m.ledger.find((e) => /Trust is the blocker/.test(e.text));
  assert.equal(trustOnly.slipped, false, 'a trust objection is not a slipped promise');
});

test('renderDealWorkspace lands on the deal: header, calls, ledger, one search box', () => {
  const html = renderDealWorkspace(loadBundles(), {
    dealName: 'Brightsmile Dental Group',
    dealMeta: '5 locations, on RingHawk today',
    owners: { rep: 'Maya', buyer: 'Rahul', joint: 'Both', unknown: 'Unclear who' },
  });
  const text = visibleText(html);

  assert.match(html, /<h1 class="deal-h1">Brightsmile Dental Group<\/h1>/);
  assert.match(text, /Where it stands/);
  assert.match(text, /The commit/);
  assert.match(text, /What was promised/);
  assert.match(text, /Search the whole deal/);
  // the arc is the navigation: every call links to its notes page
  for (const id of ['01', '02', '03', '04', '05', '06']) {
    assert.ok(html.includes(`href="notes/${id}.html"`), `deal page missing call ${id}`);
  }
  for (const label of ['Discovery', 'Demo', 'Pricing', 'Commitment check', 'Close']) {
    assert.ok(html.includes(`>${label}<`), `deal page missing ${label}`);
  }
  // the ledger names people, and the dropped promise is flagged
  assert.match(html, /led-row--flag/);
  assert.match(text, /Maya/);
  assert.match(text, /TCPA one-pager promised by Friday never showed up/);
  // search runs the same module the tests cover, never a second matcher
  assert.match(html, /import \{ searchDeal \} from '\.\/deal-index\.mjs'/);
  assert.match(html, /fetch\('deal-index\.json'\)/);
});

test('the deal page speaks the shared vocabulary, in fractions, with no em-dash', () => {
  const html = renderDealWorkspace(loadBundles(), { dealName: 'Brightsmile Dental Group' });
  const text = visibleText(html);
  assert.match(text, /\d+ of \d+ notes backed\./);
  assert.match(text, /\d+ of \d+ backed\./);           // per-call chips
  const hit = INSIDER.exec(text);
  assert.equal(hit, null, `deal page leaked insider vocabulary: ${hit && hit[0]}`);
  assert.equal(/\d\s*%/.exec(text), null, 'deal page shows a bare percentage');
  assert.ok(!html.includes('—') && !html.includes('–'), 'deal page leaked a dash');
  assert.ok(!/pick a call/i.test(text), 'the old samples-first framing is gone');
});

test('held-back claim reason and email framing carry no em-dash even from dashed fixture titles', () => {
  // slice1 claim text contains a dash (fixture data), so we only assert the
  // CHROME we author is clean: title normalized, subject/tagline dash-free.
  const b = slice1();
  const m = buildNotesModel(b);
  assert.ok(!m.title.includes('—'));
  assert.ok(!m.email.subject.includes('—'));
});
