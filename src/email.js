// Follow-up email choke point (L8, spec-core ruling): the email role NEVER
// sees the transcript — input is verified claims only. Uncited bullets are cut
// in code; a bullet citing an unknown (or non-verified) claim id poisons the
// WHOLE draft. This is where a prompt injection that survived everything else
// still dies: nothing un-verified can be laundered into an outbound email.
//
// The SHAPE of the baseline draft (greeting, an outcome line, a grouped recap,
// next steps carrying owner and due date, a close) is modelled on the follow-up
// email a rep actually sends — see research/13-sybill-deep/02-email-infra.md for
// the market-standard template this matches, and 04-output-standard-match.md for
// the item-by-item verdict. The shape is theirs; the substance is ours: every
// line still comes from one gate-passed claim and carries its claim id. Chrome
// (greeting, labels, close) asserts nothing about the call, so it cites nothing.
//
// Not in this file: the per-next-step template system and its DSL (issue #2).
// This is the deterministic keyless baseline every path falls back to.

const EMAILABLE = new Set(['verified', 'segment_corrected']);

// Owner labels when the caller passes no name map. 'unknown' stays blank on
// purpose: naming an owner we do not have is exactly the invention we refuse.
const DEFAULT_OWNERS = { rep: 'Rep', buyer: 'Buyer', joint: 'Both', unknown: '' };

// A due date the claim could not pin down adds nothing to a next step.
const VAGUE_DUE = /^(none|unclear|unknown|tbd|n\/a)?$/i;

export class EmailError extends Error {
  constructor(name, message) {
    super(message);
    this.name = name;
  }
}

function assertClaimsOnly(claims) {
  if (!Array.isArray(claims)) {
    throw new EmailError('EMAIL_INPUT_INVALID',
      'email composer accepts an array of claims only — never a bundle or transcript (choke point)');
  }
}

function emailableIds(claims) {
  return new Set(claims.filter((c) => EMAILABLE.has(c.status)).map((c) => c.id));
}

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '_');

// A claim belongs to the next-steps block when the notes put it there, or when
// the extractor that wrote it is the next-steps one. Everything else recaps.
function isNextStep(claim) {
  return norm(claim.section) === 'next_steps' || norm(claim.extractor) === 'next_steps';
}

// Owner and due date on a next step, read off the claim's own fields, never
// inferred. An unclear commitment gets no meta at all: there is no owner to
// name for something nobody committed to, and the claim text already says so.
export function stepMeta(claim, owners = {}) {
  const commitment = norm(claim.commitment);
  if (commitment === 'unclear') return null;
  const names = { ...DEFAULT_OWNERS, ...owners };
  const owner = claim.owner ? (names[norm(claim.owner)] ?? String(claim.owner)) : '';
  const rawDue = String(claim.due ?? '').trim();
  const due = VAGUE_DUE.test(rawDue) ? '' : rawDue;
  // Only 'tentative' is worth a word on screen. It tells the reader the step is
  // soft. 'firm' is the default a reader already assumes.
  const firmness = commitment === 'tentative' ? 'tentative' : '';
  const parts = [owner, due, firmness].filter(Boolean);
  return parts.length ? { owner, due, firmness, label: parts.join(' · ') } : null;
}

function bullet(claim, group, owners) {
  const b = { text: claim.text, claim_id: claim.id, group };
  if (group === 'next_steps') {
    const meta = stepMeta(claim, owners);
    if (meta) { b.owner = meta.owner; b.due = meta.due; b.firmness = meta.firmness; b.meta = meta.label; }
  }
  return b;
}

// Deterministic baseline draft (keyless path). An LLM-polished draft (Slice 2+,
// D4-gated) goes through screenDraft() with the same claims — same guarantees.
//
// `recipient` / `sender` / `owners` are caller-owned deal facts (who was on the
// call), never anything this module infers. Missing names simply do not render.
export function composeEmail(claims, { title = 'our call', recipient = null, sender = null, owners = {} } = {}) {
  assertClaimsOnly(claims);

  const passed = claims.filter((c) => EMAILABLE.has(c.status));

  // Same line twice reads like a bot. Keep the first, drop the exact repeat.
  const seen = new Set();
  const unique = passed.filter((c) => {
    const key = norm(c.text);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const steps = unique.filter(isNextStep);
  const rest = unique.filter((c) => !isNextStep(c));

  // A summary claim sitting in the next-steps block is a roll-up of the itemized
  // steps beside it. Both in one email reads like the draft forgot what it said.
  // The itemized ones win: they carry owner and due date. The roll-up still
  // renders on the notes page, so nothing is hidden, only not repeated here.
  const itemized = steps.filter((c) => norm(c.extractor) === 'next_steps');
  const nextStepClaims = itemized.length ? itemized : steps;

  // The outcome line: where the call landed, first, in one sentence. It is the
  // first summary claim, lifted out of the recap so the email opens on the point
  // instead of on a list. Backed like everything else, so it carries a claim id.
  const outcomeIdx = rest.findIndex((c) => norm(c.extractor) === 'summary');
  const outcomeClaim = outcomeIdx >= 0 ? rest[outcomeIdx] : null;
  const recapClaims = outcomeIdx >= 0 ? rest.filter((_, i) => i !== outcomeIdx) : rest;

  const outcome = outcomeClaim ? bullet(outcomeClaim, 'outcome', owners) : null;
  const recap = recapClaims.map((c) => bullet(c, 'recap', owners));
  const next_steps = nextStepClaims.map((c) => bullet(c, 'next_steps', owners));

  // Every bullet, in reading order. This is the list screenDraft screens: a
  // bullet that is not here is not in the email.
  const bullets = [...(outcome ? [outcome] : []), ...recap, ...next_steps];

  const greeting = recipient ? `Hi ${recipient},` : 'Hi there,';
  const opener = next_steps.length
    ? `Thanks for the time on ${title}. Here is what I took away, and what we said we would do next.`
    : `Thanks for the time on ${title}. Here is what I took away.`;
  const assurance = "Every line above came from something said on the call. If I got any of it wrong, tell me and I'll fix it.";
  const signoff = sender ? `Best,\n${sender}` : 'Best,';

  const lines = [greeting, '', opener, ''];
  if (outcome) lines.push(outcome.text, '');
  if (recap.length) {
    lines.push('What we covered:');
    for (const b of recap) lines.push(`- ${b.text}`);
    lines.push('');
  }
  if (next_steps.length) {
    lines.push('Next steps:');
    for (const b of next_steps) lines.push(`- ${b.text}${b.meta ? ` (${b.meta})` : ''}`);
    lines.push('');
  }
  lines.push(assurance, '', signoff);

  return {
    subject: `Follow-up: ${title}`,
    greeting,
    opener,
    outcome,
    recap,
    next_steps,
    assurance,
    signoff,
    body: lines.join('\n'),
    bullets,
  };
}

// Screen ANY draft (deterministic or LLM) against the claims it may cite.
// - bullet without a claim_id → cut (prose glue may exist, but asserts nothing)
// - bullet citing an id that is unknown OR not verified → WHOLE draft rejected
//   (an ungrounded citation means the generator fabricated; nothing it wrote
//   can be trusted — spec-core's whole-answer-rejection rule)
export function screenDraft(draft, claims) {
  assertClaimsOnly(claims);
  const allowed = emailableIds(claims);
  const kept = [];
  let cut = 0;
  for (const bullet of draft.bullets ?? []) {
    if (bullet.claim_id == null) {
      cut += 1;
      continue;
    }
    if (!allowed.has(bullet.claim_id)) {
      throw new EmailError('EMAIL_DRAFT_REJECTED',
        `draft cites claim ${JSON.stringify(bullet.claim_id)} which is not a verified claim — whole draft rejected`);
    }
    kept.push(bullet);
  }
  // The render groups are views on the same bullets, so a bullet the screen cut
  // must not survive inside one of them.
  const keptIds = new Set(kept.map((b) => b.claim_id));
  const screened = { ...draft, bullets: kept, cut };
  for (const group of ['recap', 'next_steps']) {
    if (Array.isArray(draft[group])) screened[group] = draft[group].filter((b) => keptIds.has(b.claim_id));
  }
  if (draft.outcome && !keptIds.has(draft.outcome.claim_id)) screened.outcome = null;
  return screened;
}
