// Prompt-injection screen (L8). Deliberately independent of src/gate.js: a
// planted line IS in the transcript, so it anchors perfectly — anchoring can
// never catch it, and a second screen that shared the gate's code could be
// disabled by a single bug. Pure, offline, zero deps, zero imports.
//
// Two halves:
//   screenTranscript — which utterances are tainted (deterministic patterns)
//   screenClaim      — is THIS claim standing on tainted ground, or carrying
//                      something that was never said on the call
//
// False positives are the real risk: "our pricing page" is normal sales talk and
// must never be tainted. Every pattern below requires an instruction SHAPE aimed at
// the reader, not a topic.
//
// LIMITATION (best-effort, by design — F-4/F-6): this taint screen is ONE layer of
// defense-in-depth. It deliberately misses obfuscated attacks (homoglyphs, spaced
// letters, split-across-utterances, STT-realistic "dot com") rather than widen the
// patterns and start blocking legitimate call talk. The load-bearing injection
// defenses live elsewhere: the follow-up email is built ONLY from verified,
// anchored claims, and all transcript-derived text is HTML-escaped in the viewer.
// Patterns are tuned to catch the demo's planted lines while leaving benign talk
// ("our pricing page", "www.acme.com", "add a link to the deck", "nine out of ten
// of our customers", "system prompt playbook") untainted.

export const CLAIM_REASONS = ['cites_tainted_utterance', 'smuggled_link', 'imperative_smuggling'];

const PATTERNS = [
  {
    name: 'ignore_previous_instructions',
    re: /\b(ignore|disregard|forget|override|bypass)\b[^.!?]{0,40}?\b(previous|prior|above|earlier|all|any|these|those|your|the)\b[^.!?]{0,40}?\b(instructions?|prompts?|rules?|directions?|guidelines?|context)\b/,
  },
  // A "system/developer/assistant prompt" only reads as injection when it is being
  // invoked as an authority ("the system prompt SAYS you must…"); a bare noun phrase
  // ("system prompt playbook") is benign.
  { name: 'system_prompt_mention', re: /\b(system|developer|assistant)\s+(prompt|message|instructions?)\b[^.!?]{0,20}?\b(say|says|said|state|states|instruct|instructs|require|requires|demand|demands|tell|tells|you (?:must|should|need to|have to))\b/ },
  // A rating instruction targets THIS call/note ("rate this call ten out of ten"),
  // not a spoken statistic ("nine out of ten of our customers renew").
  {
    name: 'rate_n_out_of_n',
    re: /\b(rate|score|grade|mark|give)\b[^.!?]{0,20}?\b(this|it|the call|the note|this call|your notes?)\b[^.!?]{0,20}?\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:out of|\/)\s*(\d+|five|ten|100)\b/,
  },
  // "add a link" is only actionable when an actual URL rides along; "add a link to
  // the deck" is a normal ask.
  { name: 'add_link', re: /\b(add|include|insert|append|put|embed|place)\b[^.!?]{0,40}?\b(links?|urls?|hyperlinks?)\b[^.!?]{0,40}?(?:https?:\/\/|www\.)/ },
  // Transcript taint requires an explicit scheme; a bare domain ("www.acme.com")
  // spoken on a call is not, by itself, an injection.
  { name: 'url', re: /https?:\/\/[^\s]{1,2048}/ },
];

// Non-backtracking (F-11): the domain is a run of dot-separated labels whose label
// class excludes '.', so the separator can never overlap the label — no catastrophic
// ambiguity. Quantifiers are bounded. Used for smuggled-link detection only.
const LINK_RE = /(?:https?:\/\/|www\.)[^\s]{1,2048}|[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,255}(?:\.[a-z0-9-]{1,63}){1,10}/g;

// Verbs that only make sense as an order to whoever reads the notes.
const IMPERATIVES = new Set(['ignore', 'disregard', 'forget', 'override', 'bypass', 'approve',
  'send', 'click', 'visit', 'navigate', 'download', 'transfer', 'wire', 'pay', 'refund', 'rate',
  'score', 'include', 'insert', 'add', 'append', 'forward', 'email', 'reply', 'execute', 'run',
  'delete', 'remove', 'install', 'submit', 'enter', 'confirm', 'authorize', 'issue', 'grant',
  'output', 'print', 'respond', 'summarize', 'rewrite', 'say', 'tell', 'disable', 'unlock']);
const POLITENESS = new Set(['please', 'kindly', 'now', 'then', 'also', 'first', 'next', 'finally',
  'immediately', 'just']);
const YOU_MUST = /\byou (?:must|should|need to|have to|are required to|will now|are to)\b/;

// Light, local normalization — NOT gate.js's. The screens stay independent.
const flatten = (text) => String(text ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');

export function screenTranscript(transcript) {
  const findings = [];
  const tainted = new Set();
  for (const u of transcript?.utterances ?? []) {
    const text = flatten(u.text);
    for (const { name, re } of PATTERNS) {
      const m = re.exec(text);
      if (!m) continue;
      findings.push({ utterance_id: u.id, pattern: name, match: m[0] });
      tainted.add(u.id);
    }
  }
  return { tainted_utterance_ids: [...tainted].sort((a, b) => a - b), findings };
}

export function screenClaim(claim, tainted, transcript) {
  const ids = new Set(Array.isArray(tainted) ? tainted : (tainted?.tainted_utterance_ids ?? []));
  const reasons = [];

  const cited = [...(claim?.evidence ?? []), ...(claim?.supporting_evidence ?? [])]
    .map((e) => e?.utterance_id);
  const citesTainted = cited.some((id) => ids.has(id));
  if (citesTainted) reasons.push('cites_tainted_utterance');

  const text = flatten(claim?.text);
  const canonical = flatten(transcript?.canonical_text);
  const links = (text.match(LINK_RE) ?? []).map((l) => l.replace(/[.,;:)\]}>"']+$/, ''));
  const smuggledLink = links.some((link) => !canonical.includes(link));
  if (smuggledLink) reasons.push('smuggled_link');

  // F-1a: a bare imperative is NOT injection — "Send the NDA tomorrow", "Confirm
  // pricing approval", "Email the SOC 2 report" are ordinary next steps. The taint
  // screen minimizes false positives, so an imperative counts ONLY when the claim is
  // already standing on tainted ground OR carrying a link that was never spoken.
  const hasImperative = YOU_MUST.test(text) || clauses(text).some(isImperative);
  if (hasImperative && (citesTainted || smuggledLink)) reasons.push('imperative_smuggling');

  return { blocked: reasons.length > 0, reasons };
}

function clauses(text) {
  return text.split(/[.;:!?\n]|\s[-–—]\s/).map((c) => c.trim()).filter(Boolean);
}

function isImperative(clause) {
  const words = clause.replace(/^[^a-z0-9]+/, '').split(' ');
  let i = 0;
  while (i < words.length && POLITENESS.has(words[i])) i++;
  const head = (words[i] ?? '').replace(/[^a-z]/g, '');
  return IMPERATIVES.has(head);
}
