// Notes-first single-call view (the primary demo surface). Pure + DOM-free:
// buildNotesModel(bundle) and renderNotesPage(model, ctx) return a model object
// and an HTML string, both node-testable with no browser. The renderer REUSES
// src/viewer.js's buildViewModel / escapeHtml / formatTime read-only, so the
// same gate discipline holds here: closed claim statuses, blocked claims never
// in the notes body, evidence quotes rendered verbatim.
//
// The experience: one call's notes as clean human cards, grouped by section.
// Each note ends in numbered citation chips, the pattern every reader already
// knows from Perplexity. Click a chip (or anywhere on the card) and the exact
// transcript line slides in with the matched quote highlighted, and it plays
// from that second. Every section closes with a compact source list: number,
// speaker, the quote, the timestamp. A note the call could not back renders in
// its own demoted block with the reason. Audio is a bonus layer: the
// click-to-reveal works with or without it.
//
// Display vocabulary is a render-time map and nothing more. The gate's enum
// names (verified, segment_corrected, uncorroborated, blocked_injection) stay
// exactly as they are in the bundles, the JSON, and the tests. Only the words
// on screen change: backed / backed, citation corrected / not found in the
// call / blocked.

import { buildViewModel, escapeHtml, formatTime } from './viewer.js';
import { composeEmail } from './email.js';
import { buildCommitmentLedger } from './deal-index.mjs';
import { EXTRACTION_MODES } from './fallback.js';

// Notes body (human prose, each claim a card), in reading order. The order is
// the one a manager scans in ten seconds and the one team/plans/representation.md
// locks: where it landed first, then what happens next, then the detail behind
// both. A section with nothing backing it is omitted, never rendered as "N/A".
const PRIMARY = [
  ['summary', 'Outcome'],
  ['next_steps', 'Next steps'],
  ['pain', 'Pain'],
  ['objections', 'Objections'],
  ['pricing', 'Pricing'],
  ['competitors', 'Competition'],
  ['stakeholders', 'Stakeholders'],
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

// The words a reader sees. One place, so a sweep is one file.
const NOT_FOUND = "We couldn't find this in the call.";
const BLOCKED_NOTE = 'Blocked. This line tried to give instructions to the AI. It never enters notes or email.';
const CORRECTED_TAG = 'citation corrected';

function humanReason(reason) {
  if (reason === 'not_found_in_transcript') return NOT_FOUND;
  return 'The call does not back this up.';
}

// A run with no LLM key gets the keyword tracker and nothing else (see
// src/fallback.js). That run covers less of the call, so every surface it
// reaches says so in the same words. Read off the bundle's own provenance
// stamp, never guessed from what the claims happen to look like.
export const TRACKER_ONLY_NOTE = 'Keyword tracker only. No AI model ran on this call, so these notes cover less of it.';

export function coverageNoteFor(provenance) {
  if (provenance?.extraction_mode === EXTRACTION_MODES.DETERMINISTIC_TRACKERS_ONLY) return TRACKER_ONLY_NOTE;
  return null;
}

// Source-list quotes are trimmed for width, never edited. The full quote still
// renders verbatim in the receipt the citation opens.
export function truncateQuote(quote, max = 80) {
  const q = String(quote ?? '').trim();
  if (q.length <= max) return q;
  const cut = q.slice(0, max);
  const atWord = cut.replace(/\s+\S*$/, '');
  return `${(atWord.length > max * 0.6 ? atWord : cut).trimEnd()}…`;
}

// Diarization labels are machine output (speaker_1). A caller who knows who was
// on the call can pass real names; otherwise we at least say "Speaker 1".
export function speakerName(raw, names = {}) {
  const key = String(raw ?? '').trim();
  if (!key) return '';
  if (names[key]) return names[key];
  const m = /^speaker[_\s-]?(\d+)$/i.exec(key);
  return m ? `Speaker ${m[1]}` : key;
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

  // Citations, Perplexity-style: every receipt in a section gets a number, the
  // numbering restarts per section, and the same transcript line cited twice
  // keeps one number. `domId` is per receipt (each card renders its own copy of
  // the line, so element ids have to stay unique); `target` is the copy the
  // section's source list opens.
  function numberSources(section) {
    const byLine = new Map();
    const sources = [];
    section.cards.forEach((card, ci) => {
      card.receipts.forEach((r, ri) => {
        const lineKey = `${r.utteranceId}|${r.quote}`;
        let src = byLine.get(lineKey);
        r.domId = `rc-${section.key}-${ci}-${ri}`;
        if (!src) {
          src = {
            n: sources.length + 1,
            target: r.domId,
            speaker: r.speaker,
            quote: r.quote,
            quoteShort: truncateQuote(r.quote),
            tStart: r.tStart,
            tLabel: r.tLabel,
            corrected: r.corrected,
          };
          byLine.set(lineKey, src);
          sources.push(src);
        }
        r.n = src.n;
      });
    });
    section.sources = sources;
    return section;
  }

  const primary = [];
  const emailClaimRefs = [];
  for (const [key, label] of PRIMARY) {
    const s = sectionByKey.get(key);
    if (!s || !s.blocks.length) continue;
    const cards = s.blocks.map(cardFromBlock);
    if (EMAIL_SECTIONS.has(key)) {
      for (const card of cards) for (const id of card.claimIds) emailClaimRefs.push({ id, section: key });
    }
    primary.push(numberSources({ key, label, cards }));
  }

  // Follow-up email, composed through the choke point (src/email.js, read-only):
  // only verified/segment_corrected claims survive it, so nothing un-cited can
  // reach an outbound draft. We feed it the deal-notes claims (the human notes,
  // in reading order) and render its structured bullets, each traced to a note.
  //
  // The section a claim was rendered under travels with it, so the composer can
  // put next steps in the next-steps block. Owner, due date and firmness come
  // off the raw claim, which is where the extractor wrote them; buildViewModel
  // does not carry those fields because the receipts UI has no use for them.
  const owners = opts.owners ?? {};
  const emailClaims = emailClaimRefs.map(({ id, section }) => {
    const c = claimById.get(id);
    if (!c) return null;
    const raw = rawById.get(id) ?? {};
    return {
      ...c,
      section,
      owner: raw.owner ?? null,
      due: raw.due ?? null,
      commitment: raw.commitment ?? null,
    };
  }).filter(Boolean);
  const draft = composeEmail(emailClaims, {
    title: `the ${shortLabel(vm.title).toLowerCase()} call`,
    recipient: owners.buyer ?? null,
    sender: owners.rep ?? null,
    owners,
  });
  const email = {
    subject: draft.subject,
    greeting: draft.greeting,
    opener: draft.opener,
    outcome: draft.outcome,
    recap: draft.recap,
    next_steps: draft.next_steps,
    assurance: draft.assurance,
    signoff: draft.signoff,
    bullets: draft.bullets,
  };

  // The routed template draft, read from the cached artifact the caller passes
  // in (samples/emails/NN.template-email.json). The page NEVER generates it:
  // the demo needs no key and no network, and a missing or half-written
  // artifact simply means no second panel, never a broken one.
  const routedEmail = normalizeRoutedEmail(opts.routedEmail);

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
    routedEmail, // null unless a cached routed draft was passed in
    provenance: vm.provenance ?? null,
  };
}

// A cached routed draft is data from disk, so it is checked before it renders.
// Anything missing the parts that make it trustworthy (which template picked
// it, which model wrote it, at least one line that carries a claim id) is
// dropped whole. Half a panel is worse than none: the second panel's entire
// claim is that the gate checked every line in it.
export function normalizeRoutedEmail(artifact) {
  if (!artifact || typeof artifact !== 'object') return null;
  const { template, draft, provenance } = artifact;
  if (!template?.id || !template?.short || !template?.explainer) return null;
  if (!draft || !Array.isArray(draft.bullets) || draft.bullets.length === 0) return null;
  if (!provenance?.model) return null;
  const bullets = draft.bullets.filter((b) => b && typeof b.text === 'string' && typeof b.claim_id === 'string');
  if (!bullets.length) return null;
  const group = (name) => bullets.filter((b) => b.group === name);
  const cut = Number.isFinite(provenance.cut) ? provenance.cut : 0;
  return {
    template: {
      id: String(template.id),
      title: String(template.title ?? template.id),
      short: String(template.short),
      explainer: String(template.explainer),
    },
    subject: String(draft.subject ?? ''),
    greeting: String(draft.greeting ?? ''),
    opener: String(draft.opener ?? ''),
    outcome: group('outcome')[0] ?? null,
    recap: group('recap'),
    next_steps: group('next_steps'),
    assurance: String(draft.assurance ?? ''),
    signoff: String(draft.signoff ?? 'Best,'),
    bullets,
    cut,
    provenanceLine: [
      `Template ${template.id}`,
      `model ${provenance.model}`,
      cut === 1 ? '1 line cut' : `${cut} lines cut`,
    ].join(' · '),
    note: provenance.note ? String(provenance.note) : null,
  };
}

// ── HTML render (string) ─────────────────────────────────────────────────────

// `hasAudio` is the audio-optional switch. With no audio staged for this call
// there is nothing to seek, so the timestamp renders as a plain label instead
// of a play button — a dead button that silently does nothing on a projector
// is worse than no button. The receipt itself (line + highlight) is unchanged:
// click-to-reveal never depended on audio.
function receiptRowHtml(r, hasAudio = true, names = {}) {
  const spk = r.speaker ? `<span class="rc-spk">${escapeHtml(speakerName(r.speaker, names))}</span>` : '';
  const corrected = r.corrected ? `<span class="rc-tag">${CORRECTED_TAG}</span>` : '';
  const num = r.n ? `<span class="rc-n">${escapeHtml(r.n)}</span>` : '';
  const id = r.domId ? ` id="${escapeHtml(r.domId)}"` : '';
  const stamp = hasAudio
    ? `<button class="play" type="button" data-t="${escapeHtml(r.tStart)}" aria-label="Play from ${escapeHtml(r.tLabel)}"><span class="tri" aria-hidden="true"></span>${escapeHtml(r.tLabel)}</button>`
    : `<span class="rc-time">${escapeHtml(r.tLabel)}</span>`;
  return `<div class="receipt"${id}>
    <div class="rc-meta">${num}${stamp}${spk}${corrected}</div>
    <p class="rc-line">${r.lineHtml}</p>
  </div>`;
}

// The citation chips themselves: one small superscript number per line the note
// stands on, at the end of the note text, exactly where a reader expects them.
function citesHtml(card, names = {}) {
  if (!card.receipts.length) return '';
  const chips = card.receipts.map((r) => {
    const who = speakerName(r.speaker, names);
    const label = `Source ${r.n}${who ? `, ${who}` : ''} at ${r.tLabel}`;
    return `<button class="cite" type="button" data-cite="${escapeHtml(r.domId)}" aria-label="${escapeHtml(label)}">${escapeHtml(r.n)}</button>`;
  }).join('');
  return `<sup class="cites">${chips}</sup>`;
}

function cardHtml(card, { hint = false, hasAudio = true, brief = false, names = {} } = {}) {
  const hasReceipt = card.receipts.length > 0;
  const receipts = card.receipts.map((r) => receiptRowHtml(r, hasAudio, names)).join('');
  const affordance = hint && hasReceipt
    ? `<span class="cue">Click a number to read the line it came from</span>`
    : '';
  const attrs = hasReceipt
    ? ` role="button" tabindex="0" aria-expanded="false"`
    : '';
  return `<article class="card${hasReceipt ? '' : ' card--flat'}${brief ? ' card--brief' : ''}"${attrs}>
    <p class="note">${escapeHtml(card.text)}${citesHtml(card, names)}</p>
    ${affordance}
    ${hasReceipt ? `<div class="receipts">${receipts}</div>` : ''}
  </article>`;
}

// The section's source list: the numbered lines the notes above stand on.
// Speaker, the quote, the timestamp. Click a row and it opens the same line the
// chip opens.
function sourceListHtml(section, names = {}) {
  if (!section.sources?.length) return '';
  const rows = section.sources.map((s) => `<li>
        <button class="source" type="button" data-cite="${escapeHtml(s.target)}">
          <span class="src-n">${escapeHtml(s.n)}</span>
          <span class="src-spk">${escapeHtml(speakerName(s.speaker, names))}</span>
          <span class="src-q">${escapeHtml(s.quoteShort)}</span>
          <span class="src-t">${escapeHtml(s.tLabel)}</span>
        </button>
      </li>`).join('');
  return `<div class="src-block">
      <span class="src-label">Sources</span>
      <ol class="sources">${rows}</ol>
    </div>`;
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
  if (p.transcription_model) parts.push(`Transcribed by ${p.transcription_model} on a real API run.`);
  // The mode outranks the model name. A keyless run still stamps the model it
  // would have used, and printing that name here would claim a model run that
  // never happened. The page says what did run, up in the header.
  if (coverageNoteFor(p)) {
    // nothing to add: the header already carries the disclosure
  } else if (p.extraction_model === 'offline-author') {
    parts.push('The notes on this sample were written offline, then checked line by line against the call. No live model run.');
  } else if (p.extraction_model) {
    parts.push(`Notes written by ${p.extraction_model}.`);
  }
  if (!parts.length) return '';
  return `<p class="no-audio">${escapeHtml(parts.join(' '))}</p>`;
}

// The tally, always as a fraction. "held back" stays as the short form because
// the sentence right after it says what it means.
export function tallyLine(m) {
  const { backed, attempted, notFound, blocked } = m.tallies;
  const parts = [`${backed} of ${attempted} notes backed.`];
  if (notFound > 0) {
    parts.push(`<strong>${notFound} held back.</strong> We couldn't find ${notFound === 1 ? 'it' : 'them'} in the call.`);
  }
  if (blocked > 0) {
    parts.push(`<strong>${blocked} blocked.</strong> ${blocked === 1 ? 'A line' : 'Lines'} in the audio tried to give the AI instructions.`);
  }
  return parts.join(' ');
}

export function renderNotesPage(model, ctx = {}) {
  const m = model;
  const hasAudio = Boolean(ctx.audioSrc);
  const names = ctx.speakers ?? {};
  let firstHintUsed = false;
  const useHint = (has) => {
    if (has && !firstHintUsed) { firstHintUsed = true; return true; }
    return false;
  };

  const primaryHtml = m.primary.map((sec) => {
    const brief = sec.key === 'summary';
    return `
    <section class="grp${brief ? ' grp--brief' : ''}">
      <h2 class="grp-label">${escapeHtml(sec.label)}</h2>
      <div class="cards">
        ${sec.cards.map((card) => cardHtml(card, { hint: useHint(card.receipts.length > 0), hasAudio, brief, names })).join('')}
      </div>
      ${sourceListHtml(sec, names)}
    </section>`;
  }).join('');

  const chipsHtml = m.secondary.length ? `
    <div class="context" aria-label="Call context">
      ${m.secondary.map((sec) => `
        <div class="chip-grp">
          <span class="chip-label">${escapeHtml(sec.label)}</span>
          ${sec.chips.map((c) => {
            const r = c.receipts[0] ?? null;
            const data = r ? ` role="button" tabindex="0" aria-expanded="false"` : '';
            return `<span class="chip${r ? '' : ' chip--flat'}"${data}>${escapeHtml(c.text)}${r ? `<span class="chip-receipt">${receiptRowHtml(r, hasAudio, names)}</span>` : ''}</span>`;
          }).join('')}
        </div>`).join('')}
    </div>` : '';

  const heldBackHtml = m.heldBack.length ? `
    <section class="held">
      <h2 class="held-label"><span class="held-mark" aria-hidden="true"></span>Not found in the call</h2>
      <p class="held-sub">${m.heldBack.length === 1 ? 'This note' : 'These notes'} stayed out of the notes above. Shown here so you can see what was dropped.</p>
      ${m.heldBack.map((h) => `
        <article class="held-card">
          <p class="held-note">${escapeHtml(h.text)}</p>
          <p class="held-reason">${escapeHtml(h.reason)}</p>
          ${h.claimedQuote ? `<p class="held-quote">It cited this line: <span>${escapeHtml(h.claimedQuote)}</span></p>` : ''}
        </article>`).join('')}
    </section>` : '';

  const quarantineHtml = m.quarantine.length ? `
    <section class="held held--blocked">
      <h2 class="held-label"><span class="held-mark" aria-hidden="true"></span>Blocked</h2>
      <p class="held-sub">Someone read an instruction out loud on this call. Here is what it said, and where it stopped.</p>
      ${m.quarantine.map((q) => `
        <article class="held-card">
          <p class="held-note"><s>${escapeHtml(q.text)}</s></p>
          <p class="held-reason">${escapeHtml(BLOCKED_NOTE)}</p>
          ${q.offending ? `<p class="held-quote">The line: <span>${escapeHtml(q.offending)}</span></p>` : ''}
        </article>`).join('')}
    </section>` : '';

  const keptOut = m.tallies.notFound + m.tallies.blocked;
  // The draft renders in the shape a rep sends: greeting, where the call landed,
  // the recap, then the steps with who owns each and when it is due, then a
  // close. A block with nothing backing it is left out, never shown empty.
  const emailBullet = (b) => `<li><span class="em-cite" aria-hidden="true"></span><span class="em-text">${escapeHtml(b.text)}</span>${b.meta ? `<span class="em-meta">${escapeHtml(b.meta)}</span>` : ''}</li>`;
  const emailBlock = (label, items) => (items.length ? `
        <p class="email-hdr">${escapeHtml(label)}</p>
        <ul class="email-list">${items.map(emailBullet).join('')}</ul>` : '');
  const emailHtml = m.email && m.email.bullets.length ? `
    <section class="email">
      <div class="email-head">
        <h2 class="email-label"><span class="email-mark" aria-hidden="true"></span>Follow-up email</h2>
        <span class="email-draft">draft</span>
      </div>
      <p class="email-trust">Only backed notes reach this draft.${keptOut > 0 ? ` ${keptOut} stayed out.` : ''} Every line below came from something said on the call.</p>
      <div class="email-body">
        <p class="email-subject"><span>Subject</span>${escapeHtml(m.email.subject)}</p>
        <p class="email-greeting">${escapeHtml(m.email.greeting)}</p>
        <p class="email-intro">${escapeHtml(m.email.opener)}</p>
        ${m.email.outcome ? `<p class="email-lead">${escapeHtml(m.email.outcome.text)}</p>` : ''}
        ${emailBlock('What we covered', m.email.recap)}
        ${emailBlock('Next steps', m.email.next_steps)}
        <p class="email-outro">${escapeHtml(m.email.assurance)}</p>
        <p class="email-sign">${m.email.signoff.split('\n').map((l) => escapeHtml(l)).join('<br>')}</p>
      </div>
    </section>` : '';

  // The second panel: the same claims, routed to a template file and written by
  // a model, then put through the same screen. It renders from the cached
  // artifact only. With no artifact staged (a fresh clone, a call nobody has
  // generated for yet) the page shows the verbatim panel above and nothing else,
  // which is the keyless story and still the whole product.
  const r = m.routedEmail;
  const routedBullet = (b) => `<li data-claim="${escapeHtml(b.claim_id)}"><span class="em-cite" aria-hidden="true"></span><span class="em-text">${escapeHtml(b.text)}</span><span class="em-claim">${escapeHtml(b.claim_id)}</span></li>`;
  const routedBlock = (label, items) => (items.length ? `
        <p class="email-hdr">${escapeHtml(label)}</p>
        <ul class="email-list">${items.map(routedBullet).join('')}</ul>` : '');
  const routedHtml = r ? `
    <section class="email email--routed">
      <div class="email-head">
        <h2 class="email-label"><span class="email-mark" aria-hidden="true"></span>Routed follow-up: ${escapeHtml(r.template.short)} template</h2>
        <span class="email-draft">routed</span>
      </div>
      <p class="email-trust">${escapeHtml(r.template.explainer)}</p>
      <div class="email-body">
        <p class="email-subject"><span>Subject</span>${escapeHtml(r.subject)}</p>
        <p class="email-greeting">${escapeHtml(r.greeting)}</p>
        ${r.opener ? `<p class="email-intro">${escapeHtml(r.opener)}</p>` : ''}
        ${r.outcome ? `<p class="email-lead" data-claim="${escapeHtml(r.outcome.claim_id)}">${escapeHtml(r.outcome.text)}<span class="em-claim">${escapeHtml(r.outcome.claim_id)}</span></p>` : ''}
        ${routedBlock('What we covered', r.recap)}
        ${routedBlock('Next steps', r.next_steps)}
        ${r.assurance ? `<p class="email-outro">${escapeHtml(r.assurance)}</p>` : ''}
        <p class="email-sign">${r.signoff.split('\n').map((l) => escapeHtml(l)).join('<br>')}</p>
      </div>
      <p class="email-prov">${escapeHtml(r.provenanceLine)}${r.note ? `. ${escapeHtml(r.note)}` : ''}. <a class="prov-link" href="${escapeHtml(ctx.templatesHref ?? '../templates.html')}">From the template library</a></p>
    </section>` : '';

  const audioSrc = ctx.audioSrc ?? null;
  const audioHtml = audioSrc
    ? `<audio id="call-audio" preload="none" src="${escapeHtml(audioSrc)}"></audio>`
    : '';

  const seqLine = (m.seq && m.total)
    ? `${escapeHtml(m.dealName ?? '')}${m.dealName ? '. ' : ''}Call ${m.seq} of ${m.total}.`
    : escapeHtml(m.dealName ?? '');

  // The promise in the header has to match the page under it. Notes carry
  // numbered citations; a run that produced only tracker chips carries the
  // moment each line came from, and says so instead.
  const magicLine = m.primary.length
    ? 'Every note carries a numbered citation. Click a number to read the line it came from and hear it said.'
    : 'Every line below carries the moment it came from. Click one to read it and hear it said.';
  // What the run could not cover, said once, where a reader lands.
  const coverageNote = coverageNoteFor(m.provenance);
  const coverageHtml = coverageNote ? `<p class="limited">${escapeHtml(coverageNote)}</p>` : '';

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
    <p class="eyebrow">OpenGong · notes that cite the call</p>
    <h1>${escapeHtml(m.title)}</h1>
    <p class="sub">${seqLine}</p>
    <p class="tagline">Gong records what happened. We do what was promised.</p>
    <p class="magic">${escapeHtml(magicLine)}</p>
    <p class="tally">${tallyLine(m)}</p>${coverageHtml}
  </header>
  ${chipsHtml}
  <div class="notes">
    ${primaryHtml}
    ${heldBackHtml}
    ${quarantineHtml}
    ${emailHtml}
    ${routedHtml}
  </div>
  ${audioSrc ? '' : '<p class="no-audio">No audio is staged for this call. The transcript line still opens on click.</p>'}
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
    seq: ctx.seq, total: ctx.total, dealName: ctx.dealName, stage: ctx.stage, owners: ctx.owners,
    routedEmail: ctx.routedEmail,
  });
  return renderNotesPage(model, ctx);
}

// One call record for the deal view: the short label, the human title, a
// one-line summary, where the deal stood, and the backed tally as a fraction.
// Pure, node-testable.
export function landingCard(bundle, seq) {
  const m = buildNotesModel(bundle, { seq });
  const summarySec = m.primary.find((s) => s.key === 'summary');
  const summary = summarySec?.cards?.[0]?.text ?? '';
  const stageChip = m.secondary.find((s) => s.key === 'buying_stage');
  return {
    id: bundle.call?.id ?? String(seq),
    seq,
    label: shortLabel(bundle.call?.title ?? ''),
    title: m.title,
    summary,
    stage: stageChip?.chips?.[0]?.text ?? null,
    note: coverageNoteFor(bundle.provenance), // null on a full run, so a card that has nothing to disclose says nothing
    backed: m.tallies.backed,
    attempted: m.tallies.attempted,
    notFound: m.tallies.notFound,
    blocked: m.tallies.blocked,
    href: `${bundle.call?.id ?? seq}.html`,
  };
}

// ── the deal workspace (the landing) ─────────────────────────────────────────
// The account view a rep opens on Monday: where the deal stands, the calls in
// order, what was promised on each, and one search box across all of them.
// A call is a chapter; you click into it for the receipts.

const OWNER_LABEL = { rep: 'Rep', buyer: 'Buyer', joint: 'Both', unknown: 'Unclear who' };
// A call-out reads as a slipped promise when the claim itself says so.
const SLIP_CUE = /dropped commitment|never showed up|overdue|asked twice|still waiting/i;
// A due date the claim could not pin down adds nothing to a ledger row.
const VAGUE_DUE = /^(none|unclear|unknown|)$/i;

export function buildDealModel(bundles, opts = {}) {
  const calls = bundles.map((b, i) => {
    const c = landingCard(b, i + 1);
    return { ...c, notesHref: `notes/${c.id}.html` };
  });

  const totals = calls.reduce((a, c) => ({
    backed: a.backed + c.backed,
    attempted: a.attempted + c.attempted,
    notFound: a.notFound + c.notFound,
    blocked: a.blocked + c.blocked,
  }), { backed: 0, attempted: 0, notFound: 0, blocked: 0 });

  const last = calls[calls.length - 1] ?? null;
  // The verbal commit: the first call where the buying-stage claim says the
  // deal is committed. Read off the gate's own claim, never inferred.
  const committed = calls.find((c) => /^committed/i.test(String(c.stage ?? '').trim())) ?? null;

  // Ledger rows carry no verdict of our own. A promise is what a next_steps
  // claim says; a call-out is what a trust objection says. The only judgement
  // here is which call-outs read as a promise that slipped, and that is taken
  // from the claim's own words, never from comparing calls ourselves.
  const ledger = buildCommitmentLedger(bundles).map((e) => ({
    callSeq: e.callSeq,
    callLabel: shortLabel(e.callTitle),
    notesHref: `notes/${e.callId}.html`,
    kind: e.kind,
    slipped: e.kind === 'called_out' && SLIP_CUE.test(e.text ?? ''),
    owner: e.owner,
    ownerLabel: OWNER_LABEL[e.owner] ?? (e.owner ? String(e.owner) : ''),
    due: VAGUE_DUE.test(String(e.due ?? '').trim()) ? '' : (e.due ?? ''),
    text: e.text,
  }));

  return {
    dealName: opts.dealName ?? 'the deal',
    dealMeta: opts.dealMeta ?? null,
    calls,
    totals,
    stage: last?.stage ?? null,
    stageSeq: last?.seq ?? null,
    commit: committed
      ? { text: committed.summary, seq: committed.seq, label: committed.label, notesHref: committed.notesHref }
      : null,
    ledger,
    // Deals other than the one this page is headed by: your own calls, added
    // by the pipeline. Empty by default, so a workspace with no calls of your
    // own renders exactly the page it renders today.
    groups: opts.groups ?? [],
  };
}

// A second deal on the landing. Same call cards as the deal above it, its own
// name, its own tally, its own pages. Built from bundles the same way, so a
// call registered by the pipeline is not a different kind of thing on screen.
export function buildCallGroup(bundles, opts = {}) {
  const prefix = opts.hrefPrefix ?? 'notes/';
  const calls = bundles.map((b, i) => {
    const c = landingCard(b, i + 1);
    return { ...c, notesHref: `${prefix}${c.id}.html` };
  });
  const totals = calls.reduce((a, c) => ({
    backed: a.backed + c.backed,
    attempted: a.attempted + c.attempted,
    notFound: a.notFound + c.notFound,
    blocked: a.blocked + c.blocked,
  }), { backed: 0, attempted: 0, notFound: 0, blocked: 0 });
  return {
    name: opts.name ?? 'Your calls',
    slug: opts.slug ?? 'your-calls',
    calls,
    totals,
  };
}

function dealTallyLine(t) {
  const parts = [`${t.backed} of ${t.attempted} notes backed.`];
  if (t.notFound > 0) parts.push(`${t.notFound} held back: we couldn't find ${t.notFound === 1 ? 'it' : 'them'} in a call.`);
  if (t.blocked > 0) parts.push(`${t.blocked} blocked.`);
  return parts.join(' ');
}

function callRowsHtml(calls, owners = {}) {
  return calls.map((c) => {
    const tally = c.notFound > 0
      ? `${c.backed} of ${c.attempted} backed. <strong>${c.notFound} held back.</strong>`
      : `${c.backed} of ${c.attempted} backed.`;
    const blocked = c.blocked > 0 ? ` <strong>${c.blocked} blocked.</strong>` : '';
    // The card says what the call is about, and what the run could not cover.
    // A full run has nothing to disclose, so the line is the summary alone.
    const summary = [c.summary, c.note].filter(Boolean).join(' ');
    return `<a class="call-row" href="${escapeHtml(c.notesHref)}">
      <span class="call-seq">${escapeHtml(String(c.seq).padStart(2, '0'))}</span>
      <span class="call-body">
        <span class="call-label">${escapeHtml(c.label)}</span>
        <span class="call-summary">${escapeHtml(summary)}</span>
        <span class="call-tally">${tally}${blocked}</span>
      </span>
      <span class="call-go" aria-hidden="true">Open the notes</span>
    </a>`;
  }).join('');
}

function ledgerHtml(entries, owners = {}) {
  if (!entries.length) return '<p class="empty">Nothing was promised on these calls yet.</p>';
  const rows = entries.map((e) => {
    const callOut = e.kind === 'called_out';
    const who = callOut ? (e.slipped ? 'Called out' : 'Raised') : (owners[e.owner] ?? e.ownerLabel);
    const cls = e.slipped ? ' led-row--flag' : (callOut ? ' led-row--raised' : '');
    return `<li class="led-row${cls}">
      <a class="led-call" href="${escapeHtml(e.notesHref)}">Call ${escapeHtml(e.callSeq)}</a>
      <span class="led-who">${escapeHtml(who)}</span>
      <span class="led-what">${escapeHtml(e.text)}</span>
      <span class="led-due">${escapeHtml(e.due)}</span>
    </li>`;
  }).join('');
  return `<ol class="ledger">${rows}</ol>`;
}

// The deals below the sample one. Nothing renders when there are none, so the
// landing byte-for-byte matches the demo it is today until you add a call.
function groupsHtml(groups, owners = {}) {
  return groups.map((g) => {
    const n = g.calls.length;
    const sub = `${n} ${n === 1 ? 'call' : 'calls'} you ran through the pipeline. ${dealTallyLine(g.totals)}`;
    return `
  <section class="deal-sec deal-group" data-deal="${escapeHtml(g.slug)}" aria-label="${escapeHtml(g.name)}">
    <h2 class="deal-h2">${escapeHtml(g.name)}</h2>
    <p class="deal-sub">${escapeHtml(sub)}</p>
    <div class="calls">
      ${callRowsHtml(g.calls, owners)}
    </div>
  </section>`;
  }).join('');
}

export function renderDealPage(model, ctx = {}) {
  const m = model;
  const owners = ctx.owners ?? {};
  const meta = [m.dealMeta, `${m.calls.length} calls so far`].filter(Boolean).join(' · ');

  const stageHtml = m.stage
    ? `<p class="deal-stage"><span class="deal-stage-k">Where it stands</span>${escapeHtml(m.stage)}</p>`
    : '';
  const commitHtml = m.commit
    ? `<p class="deal-commit"><span class="deal-commit-k">The commit</span>${escapeHtml(m.commit.text)} <a class="deal-commit-link" href="${escapeHtml(m.commit.notesHref)}">Call ${escapeHtml(m.commit.seq)}, ${escapeHtml(m.commit.label)}</a></p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(m.dealName)} · the deal</title>
<style>${STYLES}${DEAL_STYLES}</style>
</head>
<body>
<main class="wrap wrap--deal">
  <header class="deal-head">
    <p class="eyebrow">OpenGong · notes that cite the call</p>
    <h1 class="deal-h1">${escapeHtml(m.dealName)}</h1>
    <p class="deal-meta">${escapeHtml(meta)}</p>
    ${stageHtml}
    ${commitHtml}
    <p class="deal-tally">${escapeHtml(dealTallyLine(m.totals))}</p>
  </header>

  <section class="deal-sec" aria-label="The calls">
    <h2 class="deal-h2">The calls</h2>
    <p class="deal-sub">Open a call and click a citation number. You get the line it came from, and you can play it.</p>
    <div class="calls">
      ${callRowsHtml(m.calls, owners)}
    </div>
  </section>

  <section class="deal-sec" aria-label="Promises made on these calls">
    <h2 class="deal-h2">What was promised</h2>
    <p class="deal-sub">Every promise made out loud, in call order. Nothing here is a guess: if a later call says a promise slipped, that line shows in red.</p>
    ${ledgerHtml(m.ledger, owners)}
  </section>

  <section class="deal-sec" aria-label="Search across the deal">
    <h2 class="deal-h2">Search the whole deal</h2>
    <p class="deal-sub">One box across every call, the notes and the raw transcript both.</p>
    <input id="search-input" class="deal-search" type="text" placeholder="Try tcpa, ringhawk, or soc 2" autocomplete="off" aria-label="Search all calls">
    <div class="try-row">Quick tries:
      <button type="button" data-q="tcpa">tcpa</button>
      <button type="button" data-q="ringhawk">ringhawk</button>
      <button type="button" data-q="soc 2">soc 2</button>
    </div>
    <div id="results" class="results"></div>
  </section>
${groupsHtml(m.groups ?? [], owners)}
  <footer class="deal-foot">
    <p>Gong records what happened. We do what was promised.</p>
    <p>Anything we couldn't find in a call is shown held back on that call's page. The follow-up email only carries backed notes.</p>
    <p class="deal-foot-nav"><a class="foot-link" href="${escapeHtml(ctx.templatesHref ?? 'templates.html')}">Templates</a> <span class="foot-note">Every follow-up template a call can pick from, each one a file you can edit.</span></p>
  </footer>
</main>
<script type="module">${DEAL_SCRIPT}</script>
</body>
</html>`;
}

// Convenience: bundles → the deal workspace page.
export function renderDealWorkspace(bundles, ctx = {}) {
  return renderDealPage(buildDealModel(bundles, ctx), ctx);
}

// ── styles ───────────────────────────────────────────────────────────────────
const STYLES = `
:root{
  --paper:#f6f7f9; --surface:#ffffff; --ink:#14171c; --ink-soft:#565d68;
  --ink-faint:#5f6672; --line:#e3e6ea; --line-soft:#eceef1;
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
    --ink-faint:#98a0ac; --line:#282d35; --line-soft:#20242b;
    --accent:#7f94ff; --accent-soft:#1c2440; --accent-ink:#aab6ff;
    --backed:#39b483; --held:#e0a24a; --held-bg:#241d10; --held-line:#4a3c1e;
    --blocked:#ff7a6e; --mark:#5a4a00; --mark-ink:#ffe9a3;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35);
    color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --paper:#0f1115; --surface:#181b21; --ink:#e7e9ee; --ink-soft:#a2a9b4;
  --ink-faint:#98a0ac; --line:#282d35; --line-soft:#20242b;
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
.deal-name{font-size:16px;font-weight:600;letter-spacing:.01em;color:var(--ink);text-decoration:none}
.deal-name:hover{color:var(--accent-ink)}
.deal-name::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:8px;vertical-align:middle}
.arc{display:flex;align-items:center;gap:0;flex-wrap:wrap}
.step{display:inline-flex;align-items:center;gap:7px;text-decoration:none;color:var(--ink-faint);font-size:15px;padding:5px 4px;border-radius:8px}
.step .dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.5}
.step:hover{color:var(--ink)}
.step.is-current{color:var(--accent-ink);font-weight:600}
.step.is-current .dot{background:var(--accent);opacity:1;box-shadow:0 0 0 3px var(--accent-soft)}
.arc-sep{width:16px;height:1px;background:var(--line);margin:0 2px}

/* header */
.wrap{max-width:720px;margin:0 auto;padding:38px 22px 88px}
.call-head{margin-bottom:26px}
.eyebrow{margin:0 0 12px;font-size:14px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-faint);font-weight:600}
.call-head h1{margin:0;font-size:30px;line-height:1.15;letter-spacing:-.02em;font-weight:680;text-wrap:balance}
.sub{margin:10px 0 0;color:var(--ink-soft);font-size:16.5px}
.tagline{margin:16px 0 0;font-size:19px;line-height:1.4;font-weight:600;letter-spacing:-.01em;color:var(--ink);text-wrap:balance}
.tagline::before{content:"";display:block;width:34px;height:3px;border-radius:2px;background:var(--accent);margin-bottom:12px}
.magic{margin:16px 0 0;font-size:17px;color:var(--ink);padding:12px 15px;background:var(--accent-soft);border-radius:11px;line-height:1.5}
.tally{margin:14px 0 0;font-size:16px;color:var(--ink-soft)}
.limited{margin:10px 0 0;font-size:15.5px;line-height:1.5;color:var(--held);background:var(--held-bg);border:1px solid var(--held-line);border-radius:10px;padding:10px 13px}
.tally strong{color:var(--held);font-weight:650}

/* context chips */
.context{display:flex;flex-direction:column;gap:12px;margin:0 0 30px;padding:16px 0 4px;border-top:1px solid var(--line-soft)}
.chip-grp{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.chip-label{font-size:14px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-faint);font-weight:600;min-width:96px}
.chip{position:relative;font-size:16px;color:var(--ink-soft);background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:5px 12px;cursor:pointer;transition:border-color .15s,color .15s}
.chip.chip--flat{cursor:default}
.chip[role="button"]:hover{border-color:var(--accent);color:var(--ink)}
.chip[aria-expanded="true"]{border-color:var(--accent);color:var(--ink)}
.chip-receipt{display:none}
.chip[aria-expanded="true"] .chip-receipt{display:block;margin-top:10px}

/* notes */
.notes{display:flex;flex-direction:column;gap:30px}
.grp{display:flex;flex-direction:column;gap:12px}
.grp-label{margin:0;font-size:24px;letter-spacing:-.01em;color:var(--ink);font-weight:680}
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
.note{margin:0;font-size:17px;line-height:1.5;color:var(--ink)}

/* the summary brief: 2-3 lines of plain prose, still cited */
.grp--brief .cards{gap:6px}
.card--brief{background:transparent;border-color:transparent;box-shadow:none;padding:2px 0}
.card--brief .note{font-size:19px;line-height:1.5}
.card--brief[aria-expanded="true"]{border-color:transparent}
.card--brief[role="button"]:hover{border-color:transparent}
.card--brief[role="button"]:hover .note{color:var(--accent-ink)}

/* citation chips (the Perplexity pattern) */
.cites{display:inline;margin-left:3px;font-size:0;line-height:0;vertical-align:super}
.cite{
  font:inherit;font-size:11.5px;line-height:1;font-weight:650;font-variant-numeric:tabular-nums;
  color:var(--accent-ink);background:var(--accent-soft);border:1px solid transparent;border-radius:5px;
  min-width:17px;padding:2px 5px;margin-left:2px;cursor:pointer;
}
.cite:hover{border-color:var(--accent)}
.cite:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* the section's source list */
.src-block{margin-top:4px;padding-top:11px;border-top:1px solid var(--line-soft)}
.src-label{display:block;font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);font-weight:650;margin-bottom:5px}
.sources{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.source{
  display:flex;align-items:baseline;gap:9px;width:100%;text-align:left;font:inherit;font-size:14.5px;
  color:var(--ink-faint);background:none;border:0;border-radius:8px;padding:5px 7px;cursor:pointer;
}
.source:hover{background:var(--line-soft);color:var(--ink)}
.source:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.src-n,.rc-n{
  flex:0 0 auto;font-size:11.5px;font-weight:650;font-variant-numeric:tabular-nums;
  color:var(--accent-ink);background:var(--accent-soft);border-radius:5px;padding:2px 6px;
}
.src-spk{flex:0 0 auto;color:var(--ink-soft);font-weight:600;text-transform:capitalize}
.src-q{
  flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13.5px;
}
.src-t{flex:0 0 auto;font-variant-numeric:tabular-nums;font-size:13.5px}
.receipt.is-cited{background:var(--accent-soft);border-radius:9px;padding:11px 11px 9px;border-top-color:transparent}
.cue{
  display:inline-flex;align-items:center;gap:6px;margin-top:11px;font-size:15px;
  color:var(--ink-faint);font-weight:550;letter-spacing:.005em;
}
.cue::before{content:"";width:13px;height:13px;border:1.5px solid currentColor;border-radius:4px;opacity:.6;
  background:linear-gradient(currentColor,currentColor) center/7px 1.5px no-repeat,
             linear-gradient(currentColor,currentColor) center/1.5px 7px no-repeat}
.card[role="button"]:hover .cue{color:var(--accent)}
.card[aria-expanded="true"] .cue{color:var(--accent)}
.card[aria-expanded="true"] .cue::before{transform:rotate(45deg);background:linear-gradient(currentColor,currentColor) center/7px 1.5px no-repeat}

/* receipts (the reveal) */
.receipts{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .26s ease,opacity .2s ease;overflow:hidden}
.card[aria-expanded="true"] .receipts{grid-template-rows:1fr;opacity:1;margin-top:13px}
.receipts>*{min-height:0}
.receipt{border-top:1px dashed var(--line);padding-top:12px;margin-top:2px}
.receipt+.receipt{margin-top:10px}
.rc-meta{display:flex;align-items:center;gap:10px;margin-bottom:7px;flex-wrap:wrap}
.play{
  display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:15px;font-weight:600;
  font-variant-numeric:tabular-nums;color:var(--accent-ink);background:var(--accent-soft);
  border:1px solid transparent;border-radius:7px;padding:3px 9px 3px 8px;cursor:pointer;
}
.play:hover{border-color:var(--accent)}
.play:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.play .tri{width:0;height:0;border-style:solid;border-width:5px 0 5px 8px;border-color:transparent transparent transparent currentColor}
.play.is-playing .tri{border-width:0;width:8px;height:8px;background:currentColor}
.rc-time{display:inline-flex;align-items:center;font:inherit;font-size:15px;font-weight:600;
  font-variant-numeric:tabular-nums;color:var(--ink-soft);background:var(--line-soft);
  border-radius:7px;padding:3px 9px}
.rc-spk{font-size:14px;color:var(--ink-faint);text-transform:capitalize}
.rc-tag{font-size:13px;letter-spacing:.03em;text-transform:uppercase;color:var(--held);background:var(--held-bg);border-radius:5px;padding:2px 6px;font-weight:650}
.rc-line{margin:0;font-size:16px;line-height:1.6;color:var(--ink-soft)}
.rc-line mark{background:var(--mark);color:var(--mark-ink);padding:1px 3px;border-radius:3px;font-weight:600}

/* held back (the gate beat) */
.held{margin-top:6px;padding:18px 18px 8px;background:var(--held-bg);border:1px solid var(--held-line);border-radius:14px}
.held--blocked{--held-bg:color-mix(in srgb,var(--blocked) 8%,var(--surface));--held-line:color-mix(in srgb,var(--blocked) 35%,var(--line));--held:var(--blocked)}
.held-label{display:flex;align-items:center;gap:10px;margin:0;font-size:24px;letter-spacing:-.01em;color:var(--held);font-weight:680}
.held-mark{width:15px;height:15px;border-radius:50%;border:2px solid var(--held);position:relative}
.held-mark::after{content:"";position:absolute;left:5.5px;top:2.5px;width:2px;height:6px;background:var(--held)}
.held--blocked .held-mark::after{left:2.5px;top:6px;width:8px;height:2px}
.held-sub{margin:9px 0 15px;font-size:16px;color:var(--ink-soft);line-height:1.5}
.held-card{background:var(--surface);border:1px solid var(--held-line);border-radius:11px;padding:13px 15px;margin-bottom:10px}
.held-note{margin:0;font-size:17px;color:var(--ink-soft)}
.held-reason{margin:8px 0 0;font-size:16px;color:var(--held);font-weight:600}
.held-quote{margin:9px 0 0;font-size:16px;color:var(--ink-faint)}
.held-quote span{color:var(--ink-soft);background:color-mix(in srgb,var(--held) 10%,transparent);padding:2px 6px;border-radius:4px}

/* follow-up email (the end of the chain) */
.email{margin-top:6px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
.email-head{display:flex;align-items:center;justify-content:space-between;padding:15px 18px 0}
.email-label{display:flex;align-items:center;gap:10px;margin:0;font-size:24px;letter-spacing:-.01em;color:var(--accent-ink);font-weight:680}
.email-mark{width:15px;height:11px;border:1.5px solid var(--accent);border-radius:2px;position:relative}
.email-mark::after{content:"";position:absolute;left:-1.5px;top:-1.5px;width:15px;height:11px;background:linear-gradient(135deg,transparent 45%,var(--accent) 45%,var(--accent) 55%,transparent 55%)}
.email-draft{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);border:1px solid var(--line);border-radius:5px;padding:2px 7px;font-weight:650}
.email-trust{margin:10px 18px 0;font-size:16px;color:var(--ink-soft);line-height:1.5}
.email-body{margin:14px;padding:15px 16px;border:1px solid var(--line-soft);border-radius:10px;background:var(--paper)}
.email-subject{margin:0 0 12px;font-size:16px;color:var(--ink);font-weight:600}
.email-subject span{display:inline-block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);font-weight:600;margin-right:9px}
.email-greeting{margin:0 0 8px;font-size:16px;color:var(--ink)}
.email-intro{margin:0 0 10px;font-size:16px;color:var(--ink);line-height:1.5}
.email-lead{margin:0 0 14px;font-size:16px;color:var(--ink);line-height:1.5;font-weight:600}
.email-hdr{margin:14px 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);font-weight:650}
.email-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.email-list li{position:relative;padding-left:24px;font-size:16px;line-height:1.5;color:var(--ink)}
.em-cite{position:absolute;left:0;top:5px;width:15px;height:15px;border-radius:50%;background:color-mix(in srgb,var(--backed) 16%,transparent)}
.em-cite::after{content:"";position:absolute;left:5px;top:3px;width:3px;height:7px;border:solid var(--backed);border-width:0 2px 2px 0;transform:rotate(42deg)}
.em-meta{display:inline-block;margin-left:8px;font-size:13px;color:var(--accent-ink);background:var(--accent-soft);border-radius:5px;padding:1px 7px;white-space:nowrap}
.email-outro{margin:16px 0 0;font-size:16px;color:var(--ink-faint);line-height:1.5}
.email-sign{margin:14px 0 0;font-size:16px;color:var(--ink);line-height:1.5}

/* the routed template draft: same panel, one badge apart, so a reader can see
   they are the same email written two ways off the same backed lines */
.email--routed{margin-top:16px;border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.email--routed .email-draft{color:var(--accent-ink);border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}
.em-claim{display:inline-block;margin-left:8px;font-size:12px;color:var(--ink-faint);border:1px solid var(--line-soft);border-radius:5px;padding:1px 6px;white-space:nowrap;font-variant-numeric:tabular-nums}
.email-prov{margin:0 18px 15px;font-size:13.5px;color:var(--ink-faint);line-height:1.5}
.prov-link{color:var(--accent-ink);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--accent) 35%,transparent)}
.prov-link:hover{color:var(--accent)}

.no-audio{margin:26px 0 0;font-size:15px;color:var(--ink-faint);text-align:center}

@media (max-width:560px){
  .wrap{padding:26px 16px 70px}
  .call-head h1{font-size:25px}
  .chip-label{min-width:auto;width:100%}
}
@media (prefers-reduced-motion:reduce){
  *{transition:none!important}
}
`;

// ── deal-workspace styles (the account view a rep opens first) ───────────────
const DEAL_STYLES = `
.wrap--deal{max-width:860px;padding-top:52px}
.deal-head{margin-bottom:38px}
.deal-h1{margin:10px 0 0;font-size:38px;line-height:1.1;letter-spacing:-.025em;font-weight:700;text-wrap:balance}
.deal-meta{margin:10px 0 0;font-size:15.5px;letter-spacing:.01em;color:var(--ink-faint)}
.deal-meta::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:8px;vertical-align:middle}
.deal-stage,.deal-commit{
  margin:14px 0 0;font-size:17.5px;line-height:1.5;color:var(--ink);
  padding:12px 15px;background:var(--accent-soft);border-radius:11px;
}
.deal-commit{background:color-mix(in srgb,var(--backed) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--backed) 28%,var(--line))}
.deal-stage-k,.deal-commit-k{
  display:block;font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:650;
  color:var(--ink-faint);margin-bottom:4px;
}
.deal-commit-link{color:var(--accent-ink);font-weight:600;text-decoration:none;white-space:nowrap}
.deal-commit-link:hover{text-decoration:underline}
.deal-tally{margin:14px 0 0;font-size:16px;color:var(--ink-soft)}

.deal-sec{margin-bottom:40px}
.deal-h2{margin:0;font-size:24px;letter-spacing:-.01em;font-weight:680;color:var(--ink)}
.deal-sub{margin:7px 0 15px;font-size:16px;line-height:1.5;color:var(--ink-soft);max-width:66ch}

/* commitment ledger */
.ledger{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.led-row{
  display:grid;grid-template-columns:74px 96px 1fr 132px;gap:12px;align-items:baseline;
  background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:11px 14px;font-size:15.5px;
}
.led-row--flag{border-color:color-mix(in srgb,var(--blocked) 45%,var(--line));background:color-mix(in srgb,var(--blocked) 7%,var(--surface))}
.led-row--raised{background:var(--paper)}
.led-row--raised .led-who{color:var(--held)}
.led-call{color:var(--ink-faint);font-size:14px;text-decoration:none;font-variant-numeric:tabular-nums}
.led-call:hover{color:var(--accent-ink);text-decoration:underline}
.led-who{font-weight:650;color:var(--ink-soft)}
.led-row--flag .led-who{color:var(--blocked)}
.led-what{color:var(--ink);line-height:1.45}
.led-due{color:var(--ink-faint);font-size:14px;text-align:right}
.empty{color:var(--ink-faint);font-size:16px}

/* search */
.deal-search{
  width:100%;font:inherit;font-size:17px;padding:12px 14px;color:var(--ink);
  background:var(--surface);border:1px solid var(--line);border-radius:11px;
}
.deal-search:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
.try-row{margin-top:9px;font-size:14.5px;color:var(--ink-faint)}
.try-row button{
  font:inherit;font-size:14.5px;color:var(--ink-soft);background:var(--surface);
  border:1px solid var(--line);border-radius:14px;padding:3px 11px;margin-left:7px;cursor:pointer;
}
.try-row button:hover{border-color:var(--accent);color:var(--accent-ink)}
.results{margin-top:16px}
.results-summary{margin:0 0 10px;font-size:16px;color:var(--ink)}
.hit-call{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:11px 14px;margin-bottom:8px}
.hit-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.hit-head a{font-weight:650;color:var(--ink);text-decoration:none}
.hit-head a:hover{color:var(--accent-ink);text-decoration:underline}
.hit-count{font-size:13.5px;color:var(--ink-faint)}
.hit-list{margin:7px 0 0;padding:0 0 0 17px;color:var(--ink-soft)}
.hit-list li{margin:3px 0;font-size:14.5px;line-height:1.5}
.hit-list mark{background:var(--mark);color:var(--mark-ink);padding:1px 3px;border-radius:3px}

/* the calls, in order */
.calls{display:flex;flex-direction:column;gap:10px}
.call-row{
  display:flex;align-items:center;gap:16px;text-decoration:none;color:inherit;
  background:var(--surface);border:1px solid var(--line);border-radius:14px;
  padding:15px 17px;box-shadow:var(--shadow);
  transition:border-color .16s ease, transform .16s ease;
}
.call-row:hover{border-color:var(--accent);transform:translateY(-1px)}
.call-row:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.call-seq{
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:15px;font-weight:600;color:var(--accent-ink);background:var(--accent-soft);
  width:34px;height:34px;flex:0 0 34px;display:flex;align-items:center;justify-content:center;border-radius:9px;
}
.call-body{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.call-label{font-size:22px;font-weight:660;letter-spacing:-.015em;color:var(--ink)}
.call-summary{font-size:16px;line-height:1.45;color:var(--ink-soft)}
.call-tally{font-size:14px;color:var(--ink-faint);margin-top:2px}
.call-tally strong{color:var(--held);font-weight:650}
.call-go{
  flex:0 0 auto;font-size:15px;font-weight:600;color:var(--accent-ink);
  display:inline-flex;align-items:center;gap:6px;white-space:nowrap;
}
.call-go::after{content:"";width:0;height:0;border-style:solid;border-width:4px 0 4px 6px;border-color:transparent transparent transparent currentColor}
.call-row:hover .call-go{gap:9px}

/* your own calls, under the sample deal */
.deal-group{border-top:1px solid var(--line-soft);padding-top:26px}
.deal-group .deal-h2{color:var(--ink)}

.deal-foot{margin-top:6px;padding-top:20px;border-top:1px solid var(--line-soft);color:var(--ink-soft);font-size:15px;line-height:1.6}
.deal-foot p{margin:0 0 8px}
.deal-foot p:first-child{color:var(--ink);font-weight:600}
.deal-foot-nav{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline}
.foot-link{color:var(--accent-ink);font-weight:600;text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--accent) 35%,transparent)}
.foot-link:hover{color:var(--accent)}
.foot-note{font-size:13.5px;color:var(--ink-faint)}
@media (max-width:620px){
  .deal-h1{font-size:30px}
  .call-go{display:none}
  .led-row{grid-template-columns:66px 1fr;row-gap:4px}
  .led-what{grid-column:1 / -1}
  .led-due{text-align:left;grid-column:1 / -1}
}
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

  // A citation chip (or a row in a section's source list) opens the exact line
  // it points at: the card holding it expands, the line is marked, and it plays
  // from that second. Same reveal the whole card gives, aimed at one line.
  function openCitation(id){
    var target = id ? document.getElementById(id) : null;
    if (!target) return;
    var host = target.closest('.card, .chip');
    if (host) host.setAttribute('aria-expanded', 'true');
    target.classList.add('is-cited');
    window.setTimeout(function(){ target.classList.remove('is-cited'); }, 2000);
    if (target.scrollIntoView) target.scrollIntoView({ block:'center', behavior:'smooth' });
    var play = target.querySelector('.play');
    if (play) play.click();
  }
  Array.prototype.slice.call(document.querySelectorAll('.cite, .source')).forEach(function(b){
    b.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      openCitation(b.getAttribute('data-cite'));
    });
  });
})();
`;

// ── deal-workspace client script (module: search reuses deal-index.mjs) ──────
// The search box runs the SAME searchDeal() the tests cover, imported from the
// copy build-deal-index.mjs syncs into public/. Nothing about matching is
// reimplemented here.
const DEAL_SCRIPT = `
import { searchDeal } from './deal-index.mjs';

const input = document.getElementById('search-input');
const results = document.getElementById('results');
let index = null;

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
  });
}
function markQuery(text, q){
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return escapeHtml(text);
  return escapeHtml(text.slice(0, i)) + '<mark>' + escapeHtml(text.slice(i, i + q.length)) + '</mark>' + escapeHtml(text.slice(i + q.length));
}
function joinHuman(items){
  if (items.length === 1) return String(items[0]);
  if (items.length === 2) return items[0] + ' and ' + items[1];
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}
// Notes first, keyword-tracker matches next, raw transcript lines last.
function bestSnippets(records, q, limit){
  const rank = (r) => (r.source === 'claim' && r.extractor !== 'tracker') ? 0 : (r.source === 'claim' ? 1 : 2);
  const sorted = records.slice().sort((a, b) => rank(a) - rank(b));
  const seen = new Set();
  const out = [];
  for (const r of sorted){
    if (seen.has(r.text)) continue;
    seen.add(r.text);
    out.push(r);
    if (out.length >= (limit || 3)) break;
  }
  return out;
}

function run(q){
  if (!index){
    results.innerHTML = '<p class="empty">Search is still loading.</p>';
    return;
  }
  if (!q.trim()){ results.innerHTML = ''; return; }
  const found = searchDeal(index, q);
  if (!found.callIds.length){
    results.innerHTML = '<p class="empty">Nothing for "' + escapeHtml(q) + '" in these calls. Try tcpa or ringhawk.</p>';
    return;
  }
  const nums = found.callIds.map((id) => index.calls.find((c) => c.id === id).seq);
  const head = 'Said on call' + (nums.length > 1 ? 's ' : ' ') + joinHuman(nums) + '.';
  const cards = found.callIds.map((id) => {
    const call = index.calls.find((c) => c.id === id);
    const hits = found.hitsByCall[id];
    const snips = bestSnippets(hits, found.query, 3);
    return '<div class="hit-call">'
      + '<div class="hit-head"><a href="notes/' + escapeHtml(call.id) + '.html">Call ' + call.seq + ': ' + escapeHtml(String(call.title).split(/[:]/)[0].trim()) + '</a>'
      + '<span class="hit-count">' + hits.length + (hits.length > 1 ? ' mentions' : ' mention') + '</span></div>'
      + '<ul class="hit-list">' + snips.map((s) => '<li>' + markQuery(s.text, found.query) + '</li>').join('') + '</ul>'
      + '</div>';
  }).join('');
  results.innerHTML = '<p class="results-summary">' + escapeHtml(head) + '</p>' + cards;
}

document.querySelectorAll('.try-row button').forEach(function(b){
  b.addEventListener('click', function(){ input.value = b.dataset.q; run(b.dataset.q); });
});
input.addEventListener('input', function(){ run(input.value); });

fetch('deal-index.json')
  .then(function(r){ return r.json(); })
  .then(function(data){
    index = { calls: data.calls, records: data.records };
    if (input.value) run(input.value);
  })
  .catch(function(){
    results.innerHTML = '<p class="empty">Search needs the deal index. Run npm start to build it.</p>';
  });
`;
