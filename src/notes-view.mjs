// Notes-first single-call view (the primary demo surface). Pure + DOM-free:
// buildNotesModel(bundle) and renderNotesPage(model, ctx) return a model object
// and an HTML string, both node-testable with no browser. The renderer REUSES
// src/viewer.js's buildViewModel / escapeHtml / formatTime read-only, so the
// same gate discipline holds here: closed claim statuses, blocked claims never
// in the notes body, evidence quotes rendered verbatim.
//
// The experience: one call's notes as clean human cards, grouped by section.
// Click a card and the exact transcript line it came from slides in, the
// matched quote highlighted, with a play button for that audio moment. A claim
// the gate could not find in the call renders in its own demoted "Held back"
// block with the reason. Audio is a bonus layer: the click-to-reveal works with
// or without it.

import { buildViewModel, escapeHtml, formatTime } from './viewer.js';
import { composeEmail } from './email.js';

// Notes body (human prose, each claim a card), in reading order.
const PRIMARY = [
  ['summary', 'Summary'],
  ['pain', 'Pain'],
  ['objections', 'Objections'],
  ['competitors', 'Competition'],
  ['pricing', 'Pricing'],
  ['stakeholders', 'Stakeholders'],
  ['next_steps', 'Next steps'],
];

// Analytical extras: small secondary chips, never prose cards.
const SECONDARY = [
  ['buying_stage', 'Buying stage'],
  ['risk_flags', 'Flags'],
  ['tracker', 'Also mentioned'],
];

// Sections a rep actually recaps in a follow-up email. Meta/analytical fields
// (stakeholder threading, buying stage, transcript quality) stay as page chips
// but never enter the email, so the draft reads human, not like debug output.
const EMAIL_SECTIONS = new Set(['summary', 'pain', 'objections', 'pricing', 'next_steps']);

const normKey = (title) => String(title ?? '').trim().toLowerCase().replace(/\s+/g, '_');

function humanReason(reason) {
  if (reason === 'not_found_in_transcript') return "We couldn't find this line in the call.";
  return 'The call did not back this up.';
}

// Short arc label for the deal nav: the part before the first separator
// (colon or dash). Fixture titles use a dash separator; we never render that
// dash (house voice rule), so labels come back clean: "Discovery", "Pricing".
export function shortLabel(title) {
  const t = String(title ?? '').trim();
  const i = t.search(/[:—–]/);
  return (i > 0 ? t.slice(0, i) : t).trim();
}

// Display form of a call title: the dash separator is swapped for a colon so
// no dash reaches the screen. This normalizes a label, never an evidence quote
// (quotes are rendered verbatim, always).
export function displayTitle(title) {
  return String(title ?? '').replace(/\s*[—–]\s*/g, ': ').trim();
}

// The verbatim transcript line with the matched quote wrapped in <mark>. The
// quote is never altered. It is the evidence. If the exact substring is not
// found (segment-corrected or partial), the whole line renders, unmarked.
function highlightLine(rawText, quote) {
  const raw = String(rawText ?? '');
  const q = String(quote ?? '');
  const idx = q ? raw.indexOf(q) : -1;
  if (idx < 0) return escapeHtml(raw);
  return `${escapeHtml(raw.slice(0, idx))}<mark>${escapeHtml(q)}</mark>${escapeHtml(raw.slice(idx + q.length))}`;
}

// Build the DOM-free model for one call. `opts` carries deal position.
export function buildNotesModel(bundle, opts = {}) {
  const vm = buildViewModel(bundle);
  const claimById = new Map(vm.claims.map((c) => [c.id, c]));
  const rawById = new Map((bundle.claims ?? []).map((c) => [c.id, c]));
  const sectionByKey = new Map(vm.sections.map((s) => [normKey(s.title), s]));
  const used = new Set();

  function receiptFor(claim) {
    if (!claim || !claim.anchor) return null;
    const utt = vm.uttById.get(claim.anchor.utterance_id);
    if (!utt) return null;
    const t = Number.isFinite(claim.anchor.t_start) ? claim.anchor.t_start : utt.start;
    return {
      utteranceId: claim.anchor.utterance_id,
      speaker: utt.speaker ?? null,
      tStart: t,
      tLabel: formatTime(t),
      quote: claim.anchor.quote,
      lineHtml: highlightLine(utt.text, claim.anchor.quote),
      corrected: claim.status === 'segment_corrected',
    };
  }

  function cardFromBlock(block) {
    const receipts = [];
    const claimIds = [];
    let corrected = false;
    for (const cid of block.claim_ids ?? []) {
      used.add(cid);
      claimIds.push(cid);
      const c = claimById.get(cid);
      const r = receiptFor(c);
      if (r) receipts.push(r);
      if (c?.status === 'segment_corrected') corrected = true;
    }
    return { text: block.text, receipts, corrected, claimIds };
  }

  const primary = [];
  const emailClaimIds = [];
  for (const [key, label] of PRIMARY) {
    const s = sectionByKey.get(key);
    if (!s || !s.blocks.length) continue;
    const cards = s.blocks.map(cardFromBlock);
    if (EMAIL_SECTIONS.has(key)) {
      for (const card of cards) for (const id of card.claimIds) emailClaimIds.push(id);
    }
    primary.push({ key, label, cards });
  }

  // Follow-up email, composed through the choke point (src/email.js, read-only):
  // only verified/segment_corrected claims survive it, so nothing un-cited can
  // reach an outbound draft. We feed it the deal-notes claims (the human notes,
  // in reading order) and render its structured bullets, each traced to a note.
  const emailClaims = emailClaimIds.map((id) => claimById.get(id)).filter(Boolean);
  const draft = composeEmail(emailClaims, { title: `the ${shortLabel(vm.title).toLowerCase()} call` });
  const email = { subject: draft.subject, bullets: draft.bullets };

  const secondary = [];
  for (const [key, label] of SECONDARY) {
    const s = sectionByKey.get(key);
    if (!s || !s.blocks.length) continue;
    secondary.push({ key, label, chips: s.blocks.map(cardFromBlock) });
  }

  // The gate beat: claims the call could not back. They never entered the notes
  // body; here they are shown on purpose, demoted, with the reason.
  const heldBack = vm.claims
    .filter((c) => c.status === 'uncorroborated' && !used.has(c.id))
    .map((c) => {
      const ev = rawById.get(c.id)?.evidence?.[0] ?? null;
      return {
        text: c.text,
        claimedQuote: ev?.quote ?? null,
        reason: humanReason(ev?.reason),
        extractor: c.extractor,
      };
    });

  const backed = vm.counts.verified + vm.counts.segment_corrected;
  const notFound = vm.counts.uncorroborated;
  const blocked = vm.counts.blocked_injection;

  return {
    title: displayTitle(vm.title),
    seq: opts.seq ?? null,
    total: opts.total ?? null,
    dealName: opts.dealName ?? null,
    stage: opts.stage ?? null,
    counts: vm.counts,
    tallies: { backed, notFound, blocked, attempted: backed + notFound },
    coverage: vm.coverage,
    primary,
    secondary,
    heldBack,
    quarantine: vm.quarantine, // blocked_injection, shown only if present
    email,
    provenance: vm.provenance ?? null,
  };
}

// ── HTML render (string) ─────────────────────────────────────────────────────

function receiptRowHtml(r) {
  const spk = r.speaker ? `<span class="rc-spk">${escapeHtml(r.speaker)}</span>` : '';
  const corrected = r.corrected ? `<span class="rc-tag">segment corrected</span>` : '';
  return `<div class="receipt">
    <div class="rc-meta"><button class="play" type="button" data-t="${escapeHtml(r.tStart)}" aria-label="Play from ${escapeHtml(r.tLabel)}"><span class="tri" aria-hidden="true"></span>${escapeHtml(r.tLabel)}</button>${spk}${corrected}</div>
    <p class="rc-line">${r.lineHtml}</p>
  </div>`;
}

function cardHtml(card, { hint = false } = {}) {
  const hasReceipt = card.receipts.length > 0;
  const receipts = card.receipts.map(receiptRowHtml).join('');
  const affordance = hasReceipt
    ? `<span class="cue">${hint ? 'Click to see the line it came from' : 'See the line'}</span>`
    : '';
  const attrs = hasReceipt
    ? ` role="button" tabindex="0" aria-expanded="false"`
    : '';
  return `<article class="card${hasReceipt ? '' : ' card--flat'}${hint ? ' card--hint' : ''}"${attrs}>
    <p class="note">${escapeHtml(card.text)}</p>
    ${affordance}
    ${hasReceipt ? `<div class="receipts">${receipts}</div>` : ''}
  </article>`;
}

function navHtml(ctx) {
  const steps = (ctx.calls ?? []).map((c) => {
    const current = c.id === ctx.currentId;
    const label = escapeHtml(shortLabel(c.title));
    const inner = `<span class="dot" aria-hidden="true"></span><span class="lbl">${label}</span>`;
    return current
      ? `<span class="step is-current" aria-current="step">${inner}</span>`
      : `<a class="step" href="${escapeHtml(c.href)}">${inner}</a>`;
  }).join('<span class="arc-sep" aria-hidden="true"></span>');
  const home = ctx.homeHref ?? 'index.html';
  return `<nav class="deal-rail" aria-label="Deal calls">
    <a class="deal-name" href="${escapeHtml(home)}">${escapeHtml(ctx.dealName ?? 'Deal')}</a>
    <div class="arc">${steps}</div>
  </nav>`;
}

// Provenance disclosure: sample notes are honest about how they were made.
function provenanceFootHtml(m) {
  const p = m.provenance;
  if (!p) return '';
  const parts = [];
  if (p.transcription_model) parts.push(`Transcribed by ${p.transcription_model} (real API run).`);
  if (p.extraction_model === 'offline-author') {
    parts.push('Extraction for these sample notes was authored offline and gate-verified, not a live LLM run.');
  } else if (p.extraction_model) {
    parts.push(`Extraction: ${p.extraction_model}.`);
  }
  if (!parts.length) return '';
  return `<p class="no-audio">${escapeHtml(parts.join(' '))}</p>`;
}

function summaryChip(m) {
  const { backed, attempted, notFound } = m.tallies;
  if (notFound > 0) {
    return `${backed} of ${attempted} notes trace to the call. <strong>${notFound} held back.</strong>`;
  }
  return `All ${backed} notes trace to the call.`;
}

export function renderNotesPage(model, ctx = {}) {
  const m = model;
  let firstHintUsed = false;
  const useHint = (has) => {
    if (has && !firstHintUsed) { firstHintUsed = true; return true; }
    return false;
  };

  const primaryHtml = m.primary.map((sec) => `
    <section class="grp">
      <h2 class="grp-label">${escapeHtml(sec.label)}</h2>
      <div class="cards">
        ${sec.cards.map((card) => cardHtml(card, { hint: useHint(card.receipts.length > 0) })).join('')}
      </div>
    </section>`).join('');

  const chipsHtml = m.secondary.length ? `
    <div class="context" aria-label="Call context">
      ${m.secondary.map((sec) => `
        <div class="chip-grp">
          <span class="chip-label">${escapeHtml(sec.label)}</span>
          ${sec.chips.map((c) => {
            const r = c.receipts[0] ?? null;
            const data = r ? ` role="button" tabindex="0" aria-expanded="false"` : '';
            return `<span class="chip${r ? '' : ' chip--flat'}"${data}>${escapeHtml(c.text)}${r ? `<span class="chip-receipt">${receiptRowHtml(r)}</span>` : ''}</span>`;
          }).join('')}
        </div>`).join('')}
    </div>` : '';

  const heldBackHtml = m.heldBack.length ? `
    <section class="held">
      <h2 class="held-label"><span class="held-mark" aria-hidden="true"></span>Held back</h2>
      <p class="held-sub">The call did not back these, so they stay out of your notes. This is the check doing its job.</p>
      ${m.heldBack.map((h) => `
        <article class="held-card">
          <p class="held-note">${escapeHtml(h.text)}</p>
          <p class="held-reason">${escapeHtml(h.reason)}</p>
          ${h.claimedQuote ? `<p class="held-quote">Claimed line: <span>${escapeHtml(h.claimedQuote)}</span></p>` : ''}
        </article>`).join('')}
    </section>` : '';

  const quarantineHtml = m.quarantine.length ? `
    <section class="held held--blocked">
      <h2 class="held-label"><span class="held-mark" aria-hidden="true"></span>Blocked</h2>
      <p class="held-sub">A planted instruction was caught in the audio and kept out of the notes and any email.</p>
      ${m.quarantine.map((q) => `
        <article class="held-card">
          <p class="held-note"><s>${escapeHtml(q.text)}</s></p>
          ${q.offending ? `<p class="held-quote">Planted line: <span>${escapeHtml(q.offending)}</span></p>` : ''}
        </article>`).join('')}
    </section>` : '';

  const keptOut = m.tallies.notFound + m.tallies.blocked;
  const emailHtml = m.email && m.email.bullets.length ? `
    <section class="email">
      <div class="email-head">
        <h2 class="email-label"><span class="email-mark" aria-hidden="true"></span>Follow-up email</h2>
        <span class="email-draft">draft</span>
      </div>
      <p class="email-trust">This is the follow-up that does what we promised. Every line is cited to the call, and nothing un-verified can reach it.${keptOut > 0 ? ` ${keptOut} claim${keptOut === 1 ? '' : 's'} stayed out.` : ''}</p>
      <div class="email-body">
        <p class="email-subject"><span>Subject</span>${escapeHtml(m.email.subject)}</p>
        <p class="email-intro">Recapping what we covered and what happens next:</p>
        <ul class="email-list">
          ${m.email.bullets.map((b) => `<li><span class="em-cite" aria-hidden="true"></span>${escapeHtml(b.text)}</li>`).join('')}
        </ul>
        <p class="email-outro">Each point above links to its exact line in the call.</p>
      </div>
    </section>` : '';

  const audioSrc = ctx.audioSrc ?? null;
  const audioHtml = audioSrc
    ? `<audio id="call-audio" preload="none" src="${escapeHtml(audioSrc)}"></audio>`
    : '';

  const seqLine = (m.seq && m.total)
    ? `${escapeHtml(m.dealName ?? '')}${m.dealName ? '. ' : ''}Call ${m.seq} of ${m.total}.`
    : escapeHtml(m.dealName ?? '');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(shortLabel(m.title))} · call notes</title>
<style>${STYLES}</style>
</head>
<body>
${navHtml(ctx)}
<main class="wrap">
  <header class="call-head">
    <p class="eyebrow">OpenGong · call notes with receipts</p>
    <h1>${escapeHtml(m.title)}</h1>
    <p class="sub">${seqLine}</p>
    <p class="tagline">Gong records what happened. We do what was promised.</p>
    <p class="magic">Every note links back to the moment it came from. Click any card to see the exact line and play it.</p>
    <p class="tally">${summaryChip(m)}</p>
  </header>
  ${chipsHtml}
  <div class="notes">
    ${primaryHtml}
    ${heldBackHtml}
    ${quarantineHtml}
    ${emailHtml}
  </div>
  ${audioSrc ? '' : '<p class="no-audio">Audio is not loaded here. The transcript line still shows on click.</p>'}
  ${provenanceFootHtml(m)}
</main>
${audioHtml}
<script>${SCRIPT}</script>
</body>
</html>`;
}

// Convenience: bundle → full page in one call (used by the build script).
export function renderCallPage(bundle, ctx = {}) {
  const model = buildNotesModel(bundle, {
    seq: ctx.seq, total: ctx.total, dealName: ctx.dealName, stage: ctx.stage,
  });
  return renderNotesPage(model, ctx);
}

// One landing-card record from a bundle: the short label, the human title, a
// one-line summary, and the backed / held-back tally. Pure, node-testable.
export function landingCard(bundle, seq) {
  const m = buildNotesModel(bundle, { seq });
  const summarySec = m.primary.find((s) => s.key === 'summary');
  const summary = summarySec?.cards?.[0]?.text ?? '';
  return {
    id: bundle.call?.id ?? String(seq),
    seq,
    label: shortLabel(bundle.call?.title ?? ''),
    title: m.title,
    summary,
    backed: m.tallies.backed,
    notFound: m.tallies.notFound,
    href: `${bundle.call?.id ?? seq}.html`,
  };
}

// Samples-first landing: a stranger lands, sees the 5 real calls, clicks one,
// and reads its cited notes in seconds. No upload, no key, no config.
export function renderLandingPage(cards, ctx = {}) {
  const dealName = ctx.dealName ?? 'the deal';
  const searchHref = ctx.searchHref ?? '../deal.html';
  const cardsHtml = cards.map((c) => {
    const tally = c.notFound > 0
      ? `${c.backed} notes backed. <strong>${c.notFound} held back.</strong>`
      : `${c.backed} notes, all backed`;
    return `<a class="sample" href="${escapeHtml(c.href)}">
      <span class="sample-seq">${escapeHtml(String(c.seq).padStart(2, '0'))}</span>
      <span class="sample-body">
        <span class="sample-label">${escapeHtml(c.label)}</span>
        <span class="sample-summary">${escapeHtml(c.summary)}</span>
        <span class="sample-tally">${tally}</span>
      </span>
      <span class="sample-go" aria-hidden="true">See the notes</span>
    </a>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenGong · call notes with receipts</title>
<style>${STYLES}${LANDING_STYLES}</style>
</head>
<body>
<main class="wrap wrap--landing">
  <header class="landing-head">
    <p class="eyebrow">OpenGong</p>
    <h1 class="landing-h1">Gong records what happened.<br>We do what was promised.</h1>
    <p class="landing-lede">Call notes where every line links back to the moment it came from. Pick a call below and see it work. No upload, no key, no setup.</p>
    <p class="landing-deal">${escapeHtml(dealName)}. Five calls, Discovery to Close.</p>
  </header>
  <section class="samples" aria-label="Sample calls">
    ${cardsHtml}
  </section>
  <footer class="landing-foot">
    <p>Open any call, then click a note to see the exact transcript line and play it. A claim the call cannot back is held back on the page. The follow-up email only carries lines the call proved.</p>
    <p><a class="foot-link" href="${escapeHtml(searchHref)}">Search across all five calls</a></p>
  </footer>
</main>
</body>
</html>`;
}

// ── styles ───────────────────────────────────────────────────────────────────
const STYLES = `
:root{
  --paper:#f6f7f9; --surface:#ffffff; --ink:#14171c; --ink-soft:#565d68;
  --ink-faint:#868d98; --line:#e3e6ea; --line-soft:#eceef1;
  --accent:#2947d8; --accent-soft:#e7ebfc; --accent-ink:#1c34ad;
  --backed:#0f7a52; --held:#b26a00; --held-bg:#fbf3e3; --held-line:#eccf9c;
  --blocked:#c0362c; --mark:#fff2ab; --mark-ink:#3a2f00;
  --shadow:0 1px 2px rgba(20,23,28,.05),0 6px 20px rgba(20,23,28,.05);
  color-scheme:light;
}
:root:not([data-theme="light"]){}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --paper:#0f1115; --surface:#181b21; --ink:#e7e9ee; --ink-soft:#a2a9b4;
    --ink-faint:#727a86; --line:#282d35; --line-soft:#20242b;
    --accent:#7f94ff; --accent-soft:#1c2440; --accent-ink:#aab6ff;
    --backed:#39b483; --held:#e0a24a; --held-bg:#241d10; --held-line:#4a3c1e;
    --blocked:#ff7a6e; --mark:#5a4a00; --mark-ink:#ffe9a3;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35);
    color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --paper:#0f1115; --surface:#181b21; --ink:#e7e9ee; --ink-soft:#a2a9b4;
  --ink-faint:#727a86; --line:#282d35; --line-soft:#20242b;
  --accent:#7f94ff; --accent-soft:#1c2440; --accent-ink:#aab6ff;
  --backed:#39b483; --held:#e0a24a; --held-bg:#241d10; --held-line:#4a3c1e;
  --blocked:#ff7a6e; --mark:#5a4a00; --mark-ink:#ffe9a3;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35);
  color-scheme:dark;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
::selection{background:var(--mark);color:var(--mark-ink)}
.mono,.rc-line,.held-quote span,.chip-receipt .rc-line{
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}

/* deal rail */
.deal-rail{
  position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:18px;
  padding:11px 22px; background:color-mix(in srgb,var(--surface) 88%,transparent);
  backdrop-filter:saturate(1.4) blur(8px); border-bottom:1px solid var(--line);
  flex-wrap:wrap;
}
.deal-name{font-size:13px;font-weight:600;letter-spacing:.01em;color:var(--ink);text-decoration:none}
.deal-name:hover{color:var(--accent-ink)}
.deal-name::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:8px;vertical-align:middle}
.arc{display:flex;align-items:center;gap:0;flex-wrap:wrap}
.step{display:inline-flex;align-items:center;gap:7px;text-decoration:none;color:var(--ink-faint);font-size:12.5px;padding:5px 4px;border-radius:8px}
.step .dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.5}
.step:hover{color:var(--ink)}
.step.is-current{color:var(--accent-ink);font-weight:600}
.step.is-current .dot{background:var(--accent);opacity:1;box-shadow:0 0 0 3px var(--accent-soft)}
.arc-sep{width:16px;height:1px;background:var(--line);margin:0 2px}

/* header */
.wrap{max-width:720px;margin:0 auto;padding:38px 22px 88px}
.call-head{margin-bottom:26px}
.eyebrow{margin:0 0 12px;font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-faint);font-weight:600}
.call-head h1{margin:0;font-size:30px;line-height:1.15;letter-spacing:-.02em;font-weight:680;text-wrap:balance}
.sub{margin:10px 0 0;color:var(--ink-soft);font-size:14.5px}
.tagline{margin:16px 0 0;font-size:16.5px;line-height:1.4;font-weight:600;letter-spacing:-.01em;color:var(--ink);text-wrap:balance}
.tagline::before{content:"";display:block;width:34px;height:3px;border-radius:2px;background:var(--accent);margin-bottom:12px}
.magic{margin:16px 0 0;font-size:15px;color:var(--ink);padding:12px 15px;background:var(--accent-soft);border-radius:11px;line-height:1.5}
.tally{margin:14px 0 0;font-size:13px;color:var(--ink-soft)}
.tally strong{color:var(--held);font-weight:650}

/* context chips */
.context{display:flex;flex-direction:column;gap:12px;margin:0 0 30px;padding:16px 0 4px;border-top:1px solid var(--line-soft)}
.chip-grp{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.chip-label{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-faint);font-weight:600;min-width:96px}
.chip{position:relative;font-size:12.5px;color:var(--ink-soft);background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:5px 12px;cursor:pointer;transition:border-color .15s,color .15s}
.chip.chip--flat{cursor:default}
.chip[role="button"]:hover{border-color:var(--accent);color:var(--ink)}
.chip[aria-expanded="true"]{border-color:var(--accent);color:var(--ink)}
.chip-receipt{display:none}
.chip[aria-expanded="true"] .chip-receipt{display:block;margin-top:10px}

/* notes */
.notes{display:flex;flex-direction:column;gap:30px}
.grp{display:flex;flex-direction:column;gap:12px}
.grp-label{margin:0;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);font-weight:700}
.cards{display:flex;flex-direction:column;gap:10px}
.card{
  position:relative; background:var(--surface); border:1px solid var(--line);
  border-radius:13px; padding:15px 17px; box-shadow:var(--shadow);
  transition:border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}
.card[role="button"]{cursor:pointer}
.card[role="button"]:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
.card[role="button"]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.card[aria-expanded="true"]{border-color:var(--accent)}
.card--flat{cursor:default}
.note{margin:0;font-size:15.5px;line-height:1.5;color:var(--ink)}
.cue{
  display:inline-flex;align-items:center;gap:6px;margin-top:11px;font-size:12px;
  color:var(--ink-faint);font-weight:550;letter-spacing:.005em;
}
.cue::before{content:"";width:13px;height:13px;border:1.5px solid currentColor;border-radius:4px;opacity:.6;
  background:linear-gradient(currentColor,currentColor) center/7px 1.5px no-repeat,
             linear-gradient(currentColor,currentColor) center/1.5px 7px no-repeat}
.card[role="button"]:hover .cue{color:var(--accent)}
.card[aria-expanded="true"] .cue{color:var(--accent)}
.card[aria-expanded="true"] .cue::before{transform:rotate(45deg);background:linear-gradient(currentColor,currentColor) center/7px 1.5px no-repeat}
.card--hint .cue{color:var(--accent);font-weight:600}
.card--hint .cue::after{content:"";position:absolute}

/* receipts (the reveal) */
.receipts{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .26s ease,opacity .2s ease;overflow:hidden}
.card[aria-expanded="true"] .receipts{grid-template-rows:1fr;opacity:1;margin-top:13px}
.receipts>*{min-height:0}
.receipt{border-top:1px dashed var(--line);padding-top:12px;margin-top:2px}
.receipt+.receipt{margin-top:10px}
.rc-meta{display:flex;align-items:center;gap:10px;margin-bottom:7px;flex-wrap:wrap}
.play{
  display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:12px;font-weight:600;
  font-variant-numeric:tabular-nums;color:var(--accent-ink);background:var(--accent-soft);
  border:1px solid transparent;border-radius:7px;padding:3px 9px 3px 8px;cursor:pointer;
}
.play:hover{border-color:var(--accent)}
.play:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.play .tri{width:0;height:0;border-style:solid;border-width:5px 0 5px 8px;border-color:transparent transparent transparent currentColor}
.play.is-playing .tri{border-width:0;width:8px;height:8px;background:currentColor}
.rc-spk{font-size:11.5px;color:var(--ink-faint);text-transform:capitalize}
.rc-tag{font-size:10.5px;letter-spacing:.03em;text-transform:uppercase;color:var(--held);background:var(--held-bg);border-radius:5px;padding:2px 6px;font-weight:650}
.rc-line{margin:0;font-size:13.5px;line-height:1.6;color:var(--ink-soft)}
.rc-line mark{background:var(--mark);color:var(--mark-ink);padding:1px 3px;border-radius:3px;font-weight:600}

/* held back (the gate beat) */
.held{margin-top:6px;padding:18px 18px 8px;background:var(--held-bg);border:1px solid var(--held-line);border-radius:14px}
.held--blocked{--held-bg:color-mix(in srgb,var(--blocked) 8%,var(--surface));--held-line:color-mix(in srgb,var(--blocked) 35%,var(--line));--held:var(--blocked)}
.held-label{display:flex;align-items:center;gap:9px;margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--held);font-weight:700}
.held-mark{width:15px;height:15px;border-radius:50%;border:2px solid var(--held);position:relative}
.held-mark::after{content:"";position:absolute;left:5.5px;top:2.5px;width:2px;height:6px;background:var(--held)}
.held--blocked .held-mark::after{left:2.5px;top:6px;width:8px;height:2px}
.held-sub{margin:9px 0 15px;font-size:13px;color:var(--ink-soft);line-height:1.5}
.held-card{background:var(--surface);border:1px solid var(--held-line);border-radius:11px;padding:13px 15px;margin-bottom:10px}
.held-note{margin:0;font-size:15px;color:var(--ink-soft)}
.held-reason{margin:8px 0 0;font-size:13px;color:var(--held);font-weight:600}
.held-quote{margin:9px 0 0;font-size:12.5px;color:var(--ink-faint)}
.held-quote span{color:var(--ink-soft);background:color-mix(in srgb,var(--held) 10%,transparent);padding:2px 6px;border-radius:4px}

/* follow-up email (the end of the chain) */
.email{margin-top:6px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
.email-head{display:flex;align-items:center;justify-content:space-between;padding:15px 18px 0}
.email-label{display:flex;align-items:center;gap:9px;margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink);font-weight:700}
.email-mark{width:15px;height:11px;border:1.5px solid var(--accent);border-radius:2px;position:relative}
.email-mark::after{content:"";position:absolute;left:-1.5px;top:-1.5px;width:15px;height:11px;background:linear-gradient(135deg,transparent 45%,var(--accent) 45%,var(--accent) 55%,transparent 55%)}
.email-draft{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);border:1px solid var(--line);border-radius:5px;padding:2px 7px;font-weight:650}
.email-trust{margin:10px 18px 0;font-size:12.5px;color:var(--ink-soft);line-height:1.5}
.email-body{margin:14px;padding:15px 16px;border:1px solid var(--line-soft);border-radius:10px;background:var(--paper)}
.email-subject{margin:0 0 12px;font-size:14px;color:var(--ink);font-weight:600}
.email-subject span{display:inline-block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);font-weight:600;margin-right:9px}
.email-intro{margin:0 0 10px;font-size:14px;color:var(--ink)}
.email-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.email-list li{position:relative;padding-left:24px;font-size:14px;line-height:1.5;color:var(--ink)}
.em-cite{position:absolute;left:0;top:5px;width:15px;height:15px;border-radius:50%;background:color-mix(in srgb,var(--backed) 16%,transparent)}
.em-cite::after{content:"";position:absolute;left:5px;top:3px;width:3px;height:7px;border:solid var(--backed);border-width:0 2px 2px 0;transform:rotate(42deg)}
.email-outro{margin:12px 0 0;font-size:12.5px;color:var(--ink-faint)}

.no-audio{margin:26px 0 0;font-size:12.5px;color:var(--ink-faint);text-align:center}

@media (max-width:560px){
  .wrap{padding:26px 16px 70px}
  .call-head h1{font-size:25px}
  .chip-label{min-width:auto;width:100%}
}
@media (prefers-reduced-motion:reduce){
  *{transition:none!important}
}
`;

// ── landing styles (samples-first first impression) ──────────────────────────
const LANDING_STYLES = `
.wrap--landing{max-width:760px;padding-top:56px}
.landing-head{margin-bottom:34px}
.landing-h1{margin:12px 0 0;font-size:38px;line-height:1.1;letter-spacing:-.025em;font-weight:700;text-wrap:balance}
.landing-h1 br{display:none}
@media (min-width:520px){.landing-h1 br{display:inline}}
.landing-lede{margin:18px 0 0;font-size:16.5px;line-height:1.5;color:var(--ink-soft);max-width:56ch}
.landing-deal{margin:16px 0 0;font-size:13px;letter-spacing:.02em;color:var(--ink-faint)}
.landing-deal::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:8px;vertical-align:middle}
.samples{display:flex;flex-direction:column;gap:11px}
.sample{
  display:flex;align-items:center;gap:16px;text-decoration:none;color:inherit;
  background:var(--surface);border:1px solid var(--line);border-radius:14px;
  padding:16px 18px;box-shadow:var(--shadow);
  transition:border-color .16s ease, transform .16s ease, box-shadow .16s ease;
}
.sample:hover{border-color:var(--accent);transform:translateY(-1px)}
.sample:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sample-seq{
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:13px;font-weight:600;color:var(--accent-ink);background:var(--accent-soft);
  width:34px;height:34px;flex:0 0 34px;display:flex;align-items:center;justify-content:center;border-radius:9px;
}
.sample-body{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.sample-label{font-size:16px;font-weight:650;letter-spacing:-.01em;color:var(--ink)}
.sample-summary{font-size:13.5px;line-height:1.45;color:var(--ink-soft);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sample-tally{font-size:11.5px;color:var(--ink-faint);margin-top:2px}
.sample-tally strong{color:var(--held);font-weight:650}
.sample-go{
  flex:0 0 auto;font-size:12.5px;font-weight:600;color:var(--accent-ink);
  display:inline-flex;align-items:center;gap:6px;white-space:nowrap;
}
.sample-go::after{content:"";width:0;height:0;border-style:solid;border-width:4px 0 4px 6px;border-color:transparent transparent transparent currentColor}
.sample:hover .sample-go{gap:9px}
@media (max-width:520px){.sample-go{display:none}.landing-h1{font-size:30px}}
.landing-foot{margin-top:34px;padding-top:20px;border-top:1px solid var(--line-soft);color:var(--ink-soft);font-size:13px;line-height:1.6}
.landing-foot p{margin:0 0 10px}
.foot-link{color:var(--accent-ink);font-weight:600;text-decoration:none}
.foot-link:hover{text-decoration:underline}
`;

// ── client script (vanilla, zero deps) ──────────────────────────────────────
const SCRIPT = `
(function(){
  var audio = document.getElementById('call-audio');
  var current = null;

  function toggle(el){
    var open = el.getAttribute('aria-expanded') === 'true';
    el.setAttribute('aria-expanded', open ? 'false' : 'true');
  }
  document.querySelectorAll('.card[role="button"], .chip[role="button"]').forEach(function(el){
    el.addEventListener('click', function(e){
      if (e.target.closest('.play')) return;
      toggle(el);
    });
    el.addEventListener('keydown', function(e){
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(el); }
    });
  });

  var plays = Array.prototype.slice.call(document.querySelectorAll('.play'));
  function disablePlay(){
    plays.forEach(function(b){ b.style.display='none'; });
  }
  if (!audio){ disablePlay(); }
  else {
    audio.addEventListener('error', disablePlay, { once:true });
    audio.addEventListener('pause', function(){ if (current){ current.classList.remove('is-playing'); current=null; } });
    audio.addEventListener('ended', function(){ if (current){ current.classList.remove('is-playing'); current=null; } });
    plays.forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        var t = parseFloat(b.getAttribute('data-t'));
        if (current && current !== b){ current.classList.remove('is-playing'); }
        try {
          if (isFinite(t)) audio.currentTime = t;
          var p = audio.play();
          if (p && p.catch) p.catch(function(){ b.classList.remove('is-playing'); });
          b.classList.add('is-playing'); current = b;
        } catch(err){ /* audio not ready: the highlighted line is already visible */ }
      });
    });
  }
})();
`;
