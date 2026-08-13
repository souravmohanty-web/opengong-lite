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
// must never be tainted. Every pattern below requires an instruction shape, not
// a topic.

export const CLAIM_REASONS = ['cites_tainted_utterance', 'smuggled_link', 'imperative_smuggling'];

const PATTERNS = [
  {
    name: 'ignore_previous_instructions',
    re: /\b(ignore|disregard|forget|override|bypass)\b[^.!?]{0,40}?\b(previous|prior|above|earlier|all|any|these|those|your|the)\b[^.!?]{0,40}?\b(instructions?|prompts?|rules?|directions?|guidelines?|context)\b/,
  },
  { name: 'system_prompt_mention', re: /\b(system|developer|assistant)\s+(prompt|message|instructions?)\b/ },
  {
    name: 'rate_n_out_of_n',
    re: /\b(rate|score|grade|mark|give)\b[^.!?]{0,40}?\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:out of|\/)\s*(\d+|five|ten|100)\b/,
  },
  { name: 'add_link', re: /\b(add|include|insert|append|put|embed|place)\b[^.!?]{0,40}?\b(links?|urls?|hyperlinks?)\b/ },
  { name: 'url', re: /(?:https?:\/\/|www\.)[^\s]+/ },
];

const LINK_RE = /(?:https?:\/\/|www\.)[^\s]+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g;

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
  if (cited.some((id) => ids.has(id))) reasons.push('cites_tainted_utterance');

  const text = flatten(claim?.text);
  const canonical = flatten(transcript?.canonical_text);
  const links = (text.match(LINK_RE) ?? []).map((l) => l.replace(/[.,;:)\]}>"']+$/, ''));
  if (links.some((link) => !canonical.includes(link))) reasons.push('smuggled_link');

  if (YOU_MUST.test(text) || clauses(text).some(isImperative)) reasons.push('imperative_smuggling');

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
