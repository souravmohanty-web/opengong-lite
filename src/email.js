// Follow-up email choke point (L8, spec-core ruling): the email role NEVER
// sees the transcript — input is verified claims only. Uncited bullets are cut
// in code; a bullet citing an unknown (or non-verified) claim id poisons the
// WHOLE draft. This is where a prompt injection that survived everything else
// still dies: nothing un-verified can be laundered into an outbound email.

const EMAILABLE = new Set(['verified', 'segment_corrected']);

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

// Deterministic baseline draft (keyless path). An LLM-polished draft (Slice 2+,
// D4-gated) goes through screenDraft() with the same claims — same guarantees.
export function composeEmail(claims, { title = 'our call' } = {}) {
  assertClaimsOnly(claims);
  const bullets = claims
    .filter((c) => EMAILABLE.has(c.status))
    .map((c) => ({ text: c.text, claim_id: c.id }));
  const body = [
    `Thanks for ${title} — recapping what we actually discussed:`,
    '',
    ...bullets.map((b) => `- ${b.text}`),
    '',
    'Every point above links to the exact line in the call notes.',
  ].join('\n');
  return { subject: `Follow-up: ${title}`, body, bullets };
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
  return { ...draft, bullets: kept, cut };
}
