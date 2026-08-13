import { createHash } from 'node:crypto';

// The receipts gate (L6/L7). Pure, offline, zero deps: claims + transcript in,
// graded claims out. Two orthogonal gates live here:
//
//   evidence gate       — does this quote exist in THIS transcript? deterministic,
//                         decides claim.status and the coverage band.
//   interpretation gate — does the quote MEAN what the claim says? cue lexicons
//                         cross-check the stance the model declared. NEVER blocks;
//                         it only demotes interpretation_confidence.
//
// The injection screen is deliberately NOT imported here: it is a second,
// independent screen (src/injection.js) whose verdict is passed in as
// opts.injection, so a bug in one screen cannot silently disable the other.

export const MIN_NORMALIZED_QUOTE = 15; // chars, stage 2 floor
export const RESCUE_MIN_CHARS = 60;
export const RESCUE_MIN_TOKENS = 10;

export const MATCH_TYPES = ['exact', 'exact_pm1', 'normalized', 'segment_corrected', 'none'];
export const STATUSES = ['blocked_injection', 'verified', 'segment_corrected', 'uncorroborated'];
export const REASONS = [
  'not_found_in_transcript', 'quote_too_short_for_rescue', 'ambiguous_rescue_tie', 'empty_quote',
];
export const BANDS = [
  'GATE_BLOCKED_UNPROVEN_CLAIMS', 'PARTIAL_EXTRACTORS_FAILED', 'PARTIAL_LOW_COVERAGE',
  'PARTIAL_CLAIMS_DROPPED', 'SHIPPED_WITH_CORRECTIONS', 'SHIPPED',
];
const REQUIRED_SECTIONS = ['summary', 'next_steps'];

// ── normalization ────────────────────────────────────────────────────────────
// NFKC + typographic-variant folding + whitespace collapse + casefold, and
// NOTHING else. Digits are never folded to number words: the same API response
// renders "40" and "forty" for the same audio (F-21), so folding them would let
// a hallucinated number pass as a receipt.

const COMBINING = /\p{M}/u;
const TYPOGRAPHIC = new Map(Object.entries({
  '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'", '´': "'", '`': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-',
  '−': '-', '⁃': '-',
  '⁄': '/', '∕': '/',
  '​': '', '‌': '', '‍': '', '﻿': '', '­': '',
}));

// Grapheme-ish clusters (base code point + its combining marks) so that NFKC is
// applied to a composed character, not to a lone base that would never compose.
function clusters(raw) {
  const out = [];
  for (let i = 0; i < raw.length;) {
    let j = i + (raw.codePointAt(i) > 0xffff ? 2 : 1);
    while (j < raw.length) {
      const cp = raw.codePointAt(j);
      if (!COMBINING.test(String.fromCodePoint(cp))) break;
      j += cp > 0xffff ? 2 : 1;
    }
    out.push({ start: i, end: j, text: raw.slice(i, j) });
    i = j;
  }
  return out;
}

function foldCluster(text) {
  let folded = '';
  for (const ch of text.normalize('NFKC')) folded += TYPOGRAPHIC.has(ch) ? TYPOGRAPHIC.get(ch) : ch;
  return folded.toLowerCase();
}

// Returns the normalized text plus, for every normalized CODE UNIT, the raw
// [start,end) span it came from — so a normalized hit can be reported as an
// offset into the untouched utterance text (one ligature -> two chars, etc).
export function normalizeWithMap(raw) {
  const text = [];
  const starts = [];
  const ends = [];
  let space = null;
  for (const cluster of clusters(String(raw ?? ''))) {
    const folded = foldCluster(cluster.text);
    if (folded === '') continue;
    if (!folded.trim()) {
      space = space ? { start: space.start, end: cluster.end } : { start: cluster.start, end: cluster.end };
      continue;
    }
    if (space) {
      if (text.length) { text.push(' '); starts.push(space.start); ends.push(space.end); }
      space = null; // leading whitespace is dropped, never mapped
    }
    for (let k = 0; k < folded.length; k++) {
      text.push(folded[k]);
      starts.push(cluster.start);
      ends.push(cluster.end);
    }
  }
  return { text: text.join(''), starts, ends };
}

export function normalize(raw) {
  return normalizeWithMap(raw).text;
}

// F-2 (L7): used at STAGE 2 ONLY. Canonical STT text is unpunctuated, so removing
// model-added marks from BOTH sides before comparison cannot manufacture a false
// positive — it only recovers punctuation the model added that would otherwise be
// fatal to normalized containment. A '.' or ',' sitting BETWEEN two digits is kept,
// so "4.0" can never collapse into "40" (no number fabrication). Offsets fold onto
// the surviving characters exactly as the zero-width entries already do, and gaps
// left by a removed mark collapse so " - " never becomes a double space.
function stripPunctMap(n) {
  const text = [];
  const starts = [];
  const ends = [];
  for (let i = 0; i < n.text.length; i++) {
    const ch = n.text[i];
    if (/[^\p{L}\p{N}\s%$]/u.test(ch)) {
      const decimal = (ch === '.' || ch === ',')
        && /\d/.test(n.text[i - 1] ?? '') && /\d/.test(n.text[i + 1] ?? '');
      if (!decimal) continue;
    }
    if (ch === ' ' && text[text.length - 1] === ' ') continue;
    text.push(ch);
    starts.push(n.starts[i]);
    ends.push(n.ends[i]);
  }
  return { text: text.join(''), starts, ends };
}

function tokenize(normalized) {
  const tokens = [];
  const re = /[^ ]+/g;
  for (let m = re.exec(normalized); m; m = re.exec(normalized)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

// ── transcript invariants ────────────────────────────────────────────────────
// Exactly ONE rendering of the transcript is prompted and verified against
// (F-24). If the object handed to the gate is not that rendering, every receipt
// below it is meaningless, so this throws instead of demoting.

export function assertCanonical(transcript) {
  const utterances = transcript?.utterances;
  if (!Array.isArray(utterances)) throw new Error('gate: transcript.utterances must be an array');
  utterances.forEach((u, i) => {
    if (u.id !== i) throw new Error(`gate: utterance ids must be dense and ordered (id ${u.id} at index ${i})`);
  });
  const joined = utterances.map((u) => u.text).join('\n');
  if (transcript.canonical_text !== joined) {
    throw new Error('gate: canonical_text is not the utterance rendering — refusing to verify against a second rendering');
  }
  if (transcript.transcript_hash) {
    const digest = 'sha256:' + createHash('sha256').update(joined).digest('hex');
    if (digest !== transcript.transcript_hash) {
      throw new Error('gate: transcript_hash mismatch — the transcript changed under the claims');
    }
  }
}

// ── the anchor ladder ────────────────────────────────────────────────────────

function miss(quote, citedId, reason) {
  return {
    utterance_id: Number.isInteger(citedId) ? citedId : null,
    quote,
    match_type: 'none',
    reason,
  };
}

function hit(transcript, id, citedId, quote, charStart, charEnd, matchType) {
  const u = transcript.utterances[id];
  const evidence = { utterance_id: id };
  if (matchType === 'segment_corrected') {
    evidence.claimed_utterance_id = Number.isInteger(citedId) ? citedId : null;
  }
  evidence.quote = quote;
  evidence.match_type = matchType;
  evidence.t_start = u.start ?? null;
  evidence.t_end = u.end ?? null;
  evidence.char_start = charStart;
  evidence.char_end = charEnd;
  return evidence;
}

// The cited id first, then its neighbours: a hit inside the +/-1 tolerance is a
// hit, and preferring the cited line is a rule, not a coin toss.
function windowIds(citedId, count) {
  if (!Number.isInteger(citedId)) return [];
  return [citedId, citedId - 1, citedId + 1].filter((id) => id >= 0 && id < count);
}

function utteranceRanges(transcript) {
  const ranges = [];
  let offset = 0;
  for (const u of transcript.utterances) {
    ranges.push({ start: offset, end: offset + u.text.length });
    offset += u.text.length + 1; // the '\n' join
  }
  return ranges;
}

function ownerOf(ranges, rawIndex) {
  return ranges.findIndex((r) => rawIndex >= r.start && rawIndex < r.end);
}

// F-10: the whole-transcript rescue normalizes canonical_text and recomputes the
// utterance ranges on every item. On a 4000-utterance × 2000-claim run that is
// thousands of redundant passes over the same immutable transcript. Memoize by
// object identity — assertCanonical() guarantees the transcript did not change
// under the claims, and a structuredClone (a distinct object) simply misses the
// cache, so purity is preserved.
const canonCache = new WeakMap();
function canonicalData(transcript) {
  let data = canonCache.get(transcript);
  if (!data) {
    data = { canon: normalizeWithMap(transcript.canonical_text), ranges: utteranceRanges(transcript) };
    canonCache.set(transcript, data);
  }
  return data;
}

// F-8: in a 1:1 stereo call, the ±1 neighbour is always the OTHER speaker, so a
// hit one line off the cited id can be a silent cross-speaker attribution. Compare
// role first (speaker as fallback); a genuine divergence is recorded and demoted.
function crossesSpeaker(transcript, citedId, id) {
  if (!Number.isInteger(citedId)) return false;
  const cited = transcript.utterances[citedId];
  const found = transcript.utterances[id];
  if (!cited || !found) return false;
  const keyCited = cited.role ?? cited.speaker ?? null;
  const keyFound = found.role ?? found.speaker ?? null;
  return keyCited != null && keyFound != null && keyCited !== keyFound;
}

export function anchor(quote, citedId, transcript, opts = {}) {
  const supplied = typeof quote === 'string' ? quote : '';
  const trimmed = supplied.trim();
  if (!trimmed) return miss(supplied, citedId, 'empty_quote');
  const nq = normalize(trimmed);
  if (!nq) return miss(supplied, citedId, 'empty_quote');

  const ids = windowIds(citedId, transcript.utterances.length);

  // 1. exact indexOf inside the cited utterance +/-1 (case-sensitive, strict).
  //    Floor (F-3): a quote shorter than the normalized floor may anchor here ONLY
  //    when it is the WHOLE utterance (a real short line like "sure"), never a lone
  //    fragment such as "i" lifted from the middle of a longer turn.
  for (const id of ids) {
    const utext = transcript.utterances[id].text;
    const at = utext.indexOf(trimmed);
    if (at === -1) continue;
    if (nq.length < MIN_NORMALIZED_QUOTE && trimmed !== utext.trim()) continue;
    const matchType = id === citedId ? 'exact' : 'exact_pm1';
    const evidence = hit(transcript, id, citedId, supplied, at, at + trimmed.length, matchType);
    // F-8: a ±1 hit on a different speaker/role is a real cross-speaker risk in
    // stereo — record the correction so the interpretation gate can demote it.
    if (matchType === 'exact_pm1' && crossesSpeaker(transcript, citedId, id)) {
      evidence.claimed_utterance_id = Number.isInteger(citedId) ? citedId : null;
    }
    return evidence;
  }

  // 2. normalized containment, same window, with offsets mapped back to raw.
  //    Punctuation is stripped from BOTH sides here only (F-2/L7); stage 1 stays strict.
  if (nq.length >= MIN_NORMALIZED_QUOTE) {
    const nqStripped = stripPunctMap(normalizeWithMap(trimmed)).text;
    for (const id of ids) {
      const n = stripPunctMap(normalizeWithMap(transcript.utterances[id].text));
      const at = nqStripped ? n.text.indexOf(nqStripped) : -1;
      if (at !== -1) {
        return hit(transcript, id, citedId, supplied,
          n.starts[at], n.ends[at + nqStripped.length - 1], 'normalized');
      }
    }
  }

  // 3. whole-transcript rescue, long/unique quotes only
  if (nq.length < RESCUE_MIN_CHARS && tokenize(nq).length < RESCUE_MIN_TOKENS) {
    return miss(supplied, citedId, 'quote_too_short_for_rescue');
  }
  const { canon, ranges } = canonicalData(transcript);
  const occurrences = [];
  for (let at = canon.text.indexOf(nq); at !== -1; at = canon.text.indexOf(nq, at + 1)) {
    const rawStart = canon.starts[at];
    const rawEnd = canon.ends[at + nq.length - 1];
    const owner = ownerOf(ranges, rawStart);
    // whitespace collapse turns the '\n' join into a space, so a quote can look
    // contiguous across two turns: never stitch one.
    if (owner === -1 || owner !== ownerOf(ranges, rawEnd - 1)) continue;
    occurrences.push({ at, rawStart, rawEnd, owner });
  }
  if (!occurrences.length) return miss(supplied, citedId, 'not_found_in_transcript');

  let candidates = occurrences;
  if (candidates.length > 1 && (opts.prefix || opts.suffix)) {
    candidates = candidates.filter((o) => matchesAffix(canon.text, o, nq, opts));
  }
  if (candidates.length !== 1) return miss(supplied, citedId, 'ambiguous_rescue_tie');

  const [only] = candidates;
  const base = ranges[only.owner].start;
  return hit(transcript, only.owner, citedId, supplied,
    only.rawStart - base, only.rawEnd - base, 'segment_corrected');
}

function matchesAffix(canonText, occ, nq, opts) {
  if (opts.prefix) {
    const p = normalize(opts.prefix);
    if (p && !canonText.slice(0, occ.at).trimEnd().endsWith(p)) return false;
  }
  if (opts.suffix) {
    const s = normalize(opts.suffix);
    if (s && !canonText.slice(occ.at + nq.length).trimStart().startsWith(s)) return false;
  }
  return true;
}

// ── the interpretation gate ──────────────────────────────────────────────────
// Cue lexicons are bad classifiers but excellent DISAGREEMENT detectors: they
// only ever fire against a stance the model itself declared. Scope is the quoted
// span plus the six tokens immediately before it inside the same utterance —
// that is where quote-mining hides the negation it stripped.

const NEGATION = ['no', 'not', 'never', 'none', 'nor', 'neither', 'nothing', 'nobody', 'without',
  "don't", "doesn't", "didn't", "won't", "wouldn't", "can't", 'cannot', "couldn't", "shouldn't",
  "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't", 'nahi'];
const HYPOTHETICAL = ['if', 'would', 'suppose', 'supposing', 'assuming', 'hypothetically',
  'in case', 'were we to', 'imagine', 'what if', 'once we', 'whenever'];
const REPORTED = ['said', 'says', 'told', 'telling', 'mentioned', 'according to', 'quoted',
  'quotes', 'heard', 'claimed', 'claims', 'reported', 'apparently'];
const HEDGE = ['probably', 'maybe', 'might', 'perhaps', 'possibly', 'likely', 'usually',
  'generally', 'about', 'around', 'roughly', 'approximately', 'i think', 'i guess',
  'kind of', 'sort of', 'not sure', 'or so', 'more or less'];
const NUMBER_WORDS = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty',
  'ninety', 'hundred', 'thousand', 'million', 'billion']); // not half/quarter: on a sales
                                                           // call those are units, not counts

const UNITS = new Set(['%', 'percent', 'percentage', 'points', 'bps', 'dollar', 'dollars', 'usd',
  'eur', 'euros', 'inr', 'rupees', 'k', 'seat', 'seats', 'user', 'users', 'license', 'licenses',
  'agent', 'agents', 'rep', 'reps', 'line', 'lines', 'call', 'calls', 'text', 'texts', 'message',
  'messages', 'minute', 'minutes', 'hour', 'hours', 'day', 'days', 'week', 'weeks', 'month',
  'months', 'quarter', 'quarters', 'year', 'years', 'per', 'each', 'times', 'x']);
// "last week" / "next quarter" is a date, not the unit of the number beside it.
const TIME_UNITS = new Set(['minute', 'minutes', 'hour', 'hours', 'day', 'days', 'week', 'weeks',
  'month', 'months', 'quarter', 'quarters', 'year', 'years']);
const TEMPORAL_DETERMINERS = new Set(['last', 'this', 'next', 'past', 'coming', 'following']);
const ACKS = new Set(['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'right', 'correct',
  'exactly', 'agreed', 'absolutely', 'no', 'nope', 'maybe']);
const PRONOUNS = new Set(['it', 'they', 'them', 'that', 'this', 'those', 'these', 'he', 'she',
  'him', 'her', 'its', 'their', 'theirs']);

// These are the stance values the model actually declares — the exact enums in
// schemas/claim-context.json (F-14). A mismatch fires only against the asserted
// stance, never invents one.
const AFFIRMATIVE = new Set(['positive']);
const COMMITTED = new Set(['commitment']);
const FIRST_PARTY = new Set(['first_party']);
const CERTAIN = new Set(['high']);

const HARD_FLAGS = new Set([
  'negation_polarity_mismatch', 'double_negation', 'requires_context_missing_support',
]);
const CONTEXT_TOKENS_BEFORE = 6;
const SHORT_ANSWER_TOKENS = 6;
const ROLE_CONFIDENCE_FLOOR = 0.75;

const strip = (token) => token.replace(/^[^\p{L}\p{N}%$']+|[^\p{L}\p{N}%$']+$/gu, '');

// The quoted span, in normalized token space, plus its lead-in.
function cueScope(transcript, evidence) {
  const u = transcript.utterances[evidence.utterance_id];
  const n = normalizeWithMap(u.text);
  const inside = [];
  for (let i = 0; i < n.text.length; i++) {
    if (n.starts[i] >= evidence.char_start && n.ends[i] <= evidence.char_end) inside.push(i);
  }
  const tokens = tokenize(n.text);
  if (!inside.length) return { utterance: u, tokens, quoted: tokens, lead: [] };
  const from = inside[0];
  const to = inside[inside.length - 1] + 1;
  const quoted = tokens.filter((t) => t.end > from && t.start < to);
  const before = tokens.filter((t) => t.end <= from);
  let lead = before.slice(-CONTEXT_TOKENS_BEFORE);
  // F-7: when the quote begins within the first few tokens of its utterance, the
  // negation/hedge that scopes it can sit at the END of the PREVIOUS turn (a
  // stripped cross-turn negation). Borrow just enough tail tokens to fill the lead
  // window. Residual gap (README limitation): a cue more than CONTEXT_TOKENS_BEFORE
  // tokens back, or two turns away, is still not seen — the cue lexicons are a
  // disagreement detector, not a parser.
  if (before.length < CONTEXT_TOKENS_BEFORE && evidence.utterance_id > 0) {
    const prev = transcript.utterances[evidence.utterance_id - 1];
    const prevTokens = tokenize(normalizeWithMap(prev.text).text);
    lead = [...prevTokens.slice(-(CONTEXT_TOKENS_BEFORE - before.length)), ...lead];
  }
  return { utterance: u, tokens, quoted, lead };
}

function cueHits(scope, cues) {
  const line = (list) => ' ' + list.map((t) => strip(t.text)).filter(Boolean).join(' ') + ' ';
  const quoted = line(scope.quoted);
  const lead = line(scope.lead);
  const hits = [];
  for (const cue of cues) {
    if (quoted.includes(` ${cue} `)) hits.push({ cue, where: 'in_quote' });
    else if (lead.includes(` ${cue} `)) hits.push({ cue, where: 'preceding' });
  }
  return hits;
}

function numberFlags(scope, claim) {
  const declared = new Map((claim.quantities ?? [])
    .map((q) => [String(q?.surface ?? '').toLowerCase(), q?.unit ?? null]));
  const out = [];
  for (const token of scope.quoted) {
    const word = strip(token.text);
    const isNumber = /^\d+([.,]\d+)?$/.test(word) || NUMBER_WORDS.has(word);
    if (!isNumber) continue;
    const declaredUnit = declared.get(word);
    // "unclear is safer than a guess": an admitted unknown unit is agreement.
    if (declared.has(word) && (declaredUnit === null || declaredUnit === 'unknown' || declaredUnit === 'absent')) continue;
    const at = scope.tokens.findIndex((t) => t.start === token.start);
    const lo = Math.max(0, at - 4);
    const hi = Math.min(scope.tokens.length, at + 5);
    let anchored = /[%$]/.test(word); // "40%" carries its own unit
    for (let i = lo; !anchored && i < hi; i++) {
      if (i === at) continue;
      const near = strip(scope.tokens[i].text);
      const prev = i > 0 ? strip(scope.tokens[i - 1].text) : '';
      if (TIME_UNITS.has(near) && TEMPORAL_DETERMINERS.has(prev)) continue;
      anchored = UNITS.has(near) || /[%$]/.test(near);
    }
    if (!anchored) out.push({ flag: 'number_without_unit_anchor', where: 'in_quote', cue: word });
  }
  return out;
}

export function contextCheck(claim, transcript, evidence, supporting = [], rejectedSupporting = []) {
  const flags = [];
  const stance = claim?.stance ?? {};
  const seen = new Set();
  const add = (flag, hit, utterance_id) => {
    if (seen.has(flag)) return;
    seen.add(flag);
    flags.push({ flag, where: hit?.where ?? null, cue: hit?.cue ?? null, utterance_id });
  };

  let requiresContext = false;
  for (const item of evidence) {
    const scope = cueScope(transcript, item);
    const id = item.utterance_id;

    const negations = cueHits(scope, NEGATION);
    if (negations.length && AFFIRMATIVE.has(stance.polarity)) {
      add('negation_polarity_mismatch', negations[0], id);
    }
    if (negations.length >= 2) add('double_negation', negations[1], id);

    const hypothetical = cueHits(scope, HYPOTHETICAL);
    if (hypothetical.length && COMMITTED.has(stance.modality)) {
      add('hypothetical_modality_mismatch', hypothetical[0], id);
    }
    const reported = cueHits(scope, REPORTED);
    if (reported.length && FIRST_PARTY.has(stance.attribution)) {
      add('reported_speech_attribution_mismatch', reported[0], id);
    }
    const hedges = cueHits(scope, HEDGE);
    if (hedges.length && CERTAIN.has(stance.certainty)) {
      add('hedge_certainty_mismatch', hedges[0], id);
    }
    for (const f of numberFlags(scope, claim ?? {})) add(f.flag, f, id);

    // F-8: a cross-speaker ±1 correction (recorded by the anchor ladder as an
    // exact_pm1 that carries a claimed_utterance_id) demotes interpretation.
    if (item.match_type === 'exact_pm1' && Number.isInteger(item.claimed_utterance_id)) {
      add('speaker_mismatch', { where: 'in_quote', cue: null }, id);
    }

    const words = scope.quoted.map((t) => strip(t.text)).filter(Boolean);
    if (words.length <= SHORT_ANSWER_TOKENS || ACKS.has(words[0]) || PRONOUNS.has(words[0])) {
      requiresContext = true;
    }
    const rc = scope.utterance.role_confidence;
    if (typeof rc === 'number' && rc < ROLE_CONFIDENCE_FLOOR) add('low_role_confidence', null, id);
  }

  if (rejectedSupporting.length) add('supporting_evidence_unanchored', null, null);
  if (requiresContext && !supporting.length) add('requires_context_missing_support', null, null);

  const score = flags.reduce((sum, f) => sum + (HARD_FLAGS.has(f.flag) ? 2 : 1), 0);
  return {
    requires_context: requiresContext,
    context_flags: flags,
    interpretation_confidence: score === 0 ? 'high' : score === 1 ? 'medium' : 'low',
  };
}

// ── claim grading ────────────────────────────────────────────────────────────

function anchorAll(items, transcript) {
  const passed = [];
  const rejected = [];
  for (const item of items) {
    const found = anchor(item?.quote, item?.utterance_id, transcript,
      { prefix: item?.prefix, suffix: item?.suffix });
    (found.match_type === 'none' ? rejected : passed).push(found);
  }
  return { passed, rejected };
}

export function gateClaim(claim, transcript, opts = {}) {
  assertCanonical(transcript);
  const { evidence = [], supporting_evidence = [], status: _ignored, ...rest } = claim ?? {};
  const injection = opts.injection ?? null;
  const blocked = injection?.blocked === true;

  const main = anchorAll(evidence, transcript);
  const support = anchorAll(supporting_evidence, transcript);

  let status;
  if (blocked) status = 'blocked_injection';                       // evaluated FIRST: the
  else if (!main.passed.length) status = 'uncorroborated';         // planted line IS in the
  else if (main.passed.some((e) => e.match_type === 'segment_corrected')) status = 'segment_corrected';
  else status = 'verified';                                        // transcript, so anchoring
                                                                   // alone can never catch it.
  const context = blocked || !main.passed.length
    ? { requires_context: false, context_flags: [], interpretation_confidence: null }
    : contextCheck(claim, transcript, main.passed, support.passed, support.rejected);

  const graded = { ...structuredClone(rest), status };
  if (blocked) graded.blocked_reasons = [...(injection.reasons ?? [])];
  graded.evidence = main.passed;
  graded.rejected_evidence = main.rejected;
  graded.supporting_evidence = support.passed;
  graded.rejected_supporting_evidence = support.rejected;
  graded.requires_context = context.requires_context;
  graded.context_flags = context.context_flags;
  graded.interpretation_confidence = context.interpretation_confidence;
  return graded;
}

// ── coverage bands ───────────────────────────────────────────────────────────
// Computed once, here. The UI renders notes.coverage.band and never recomputes.

const sectionOf = (claim) => claim?.section ?? claim?.extractor ?? null;
const isCorroborated = (claim) => claim.status === 'verified' || claim.status === 'segment_corrected';

export function gradeRun(claims = [], opts = {}) {
  const requiredSections = opts.requiredSections ?? REQUIRED_SECTIONS;
  const extractorFailures = opts.extractorFailures ?? [];

  // Injection-blocked claims are quarantined, not dropped receipts: they leave
  // the denominator so a planted call cannot read PARTIAL for the wrong reason.
  const attempted = claims.filter((c) => c.status !== 'blocked_injection');
  const stats = {
    total: claims.length,
    attempted: attempted.length,
    verified: claims.filter((c) => c.status === 'verified').length,
    segment_corrected: claims.filter((c) => c.status === 'segment_corrected').length,
    uncorroborated: claims.filter((c) => c.status === 'uncorroborated').length,
    blocked_injection: claims.filter((c) => c.status === 'blocked_injection').length,
    corroborated: attempted.filter(isCorroborated).length,
  };
  const ratio = stats.attempted === 0 ? 1 : stats.corroborated / stats.attempted;

  const sections = requiredSections.map((section) => {
    const inSection = attempted.filter((c) => sectionOf(c) === section);
    return {
      section,
      attempted: inSection.length,
      corroborated: inSection.filter(isCorroborated).length,
    };
  });
  const unproven = sections.some((s) => s.attempted >= 1 && s.corroborated === 0);

  // F-1b: a required section whose ONLY claims were injection-blocked was not quietly
  // absent — it was emptied by a poisoned call, and must never read SHIPPED. (A
  // section with any surviving uncorroborated attempt is already caught by `unproven`.)
  const emptiedByBlocking = requiredSections.some((section) => {
    const all = claims.filter((c) => sectionOf(c) === section);
    if (!all.length) return false;
    const survived = all.filter((c) => c.status !== 'blocked_injection');
    return survived.length === 0; // every claim in a required section was blocked
  });
  // F-9: a whole run with nothing attempted but something blocked is a poisoned call,
  // not a quiet call — SHIPPED-with-ratio-1 would launder the poisoning.
  const poisonedQuietCall = stats.attempted === 0 && stats.blocked_injection > 0;

  let band;
  if (unproven) band = 'GATE_BLOCKED_UNPROVEN_CLAIMS';
  else if (emptiedByBlocking || poisonedQuietCall) band = 'PARTIAL_CLAIMS_DROPPED';
  else if (extractorFailures.length) band = 'PARTIAL_EXTRACTORS_FAILED';
  else if (ratio < 0.50) band = 'PARTIAL_LOW_COVERAGE';
  else if (ratio < 0.80) band = 'PARTIAL_CLAIMS_DROPPED';
  else band = stats.segment_corrected > 0 ? 'SHIPPED_WITH_CORRECTIONS' : 'SHIPPED';

  return { band, ratio, stats, required_sections: sections, extractor_failures: [...extractorFailures] };
}
