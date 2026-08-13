import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  anchor, gateClaim, gradeRun, normalize, normalizeWithMap, assertCanonical,
  REASONS, MATCH_TYPES, STATUSES, BANDS,
} from '../src/gate.js';
import { buildTranscript } from '../src/transcript.js';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/gate/${name}`, import.meta.url), 'utf8'));
const probe = (name) =>
  JSON.parse(readFileSync(new URL(`../research/00-api-probe/${name}`, import.meta.url), 'utf8'));

const T = load('transcript.pricing.json');
const ADV = load('claims.adversarial.json');
const CLEAN = load('claims.clean.json');
const byId = (list, id) => list.find((c) => c.id === id);
const gate = (claim, transcript = T, opts) => gateClaim(claim, transcript, opts);

// ── stage 1: exact ───────────────────────────────────────────────────────────

test('G-01 exact hit inside the cited utterance', () => {
  const e = anchor('my main concern is pricing', 2, T);
  assert.equal(e.match_type, 'exact');
  assert.equal(e.utterance_id, 2);
  assert.equal(e.t_start, T.utterances[2].start);
  assert.equal(e.t_end, T.utterances[2].end);
  assert.equal(T.utterances[2].text.slice(e.char_start, e.char_end), 'my main concern is pricing');
});

test('G-02 exact hit one utterance off the cited id is exact_pm1, not a correction', () => {
  const e = anchor('my main concern is pricing', 1, T);
  assert.equal(e.match_type, 'exact_pm1');
  assert.equal(e.utterance_id, 2);
  assert.equal(e.claimed_utterance_id, undefined, 'pm1 is inside tolerance: nothing to correct');
});

test('G-03 outside the +/-1 window the exact stage does not fire', () => {
  const e = anchor('my main concern is pricing', 6, T);
  assert.notEqual(e.match_type, 'exact');
  assert.notEqual(e.match_type, 'exact_pm1');
});

// ── stage 2: normalized containment ──────────────────────────────────────────

test('G-04 typographic variants + casefold match by normalization', () => {
  const c = gate(byId(ADV, 'a11'));
  assert.equal(c.evidence[0].match_type, 'normalized');
  assert.equal(c.evidence[0].utterance_id, 7);
  assert.equal(c.status, 'verified');
});

test('G-05 NFKC folding matches and offsets map back to the RAW text', () => {
  const c = gate(byId(ADV, 'a20'));
  const e = c.evidence[0];
  assert.equal(e.match_type, 'normalized');
  assert.equal(e.utterance_id, 8);
  // ligature (1 raw char -> 2 normalized) and fullwidth digits must not shift the map
  assert.equal(T.utterances[8].text.slice(e.char_start, e.char_end), 'the ﬁnal number is ４０ seats');
});

test('G-06 normalization NEVER folds digits to number words (F-21)', () => {
  assert.equal(normalize('almost 40 less'), 'almost 40 less');
  assert.equal(normalize('ALMOST  Forty   less'), 'almost forty less');
  const c = gate(byId(ADV, 'a2'));
  assert.equal(c.status, 'uncorroborated');
  assert.equal(c.evidence.length, 0);
  assert.equal(c.rejected_evidence[0].match_type, 'none');
  assert.equal(c.rejected_evidence[0].reason, 'not_found_in_transcript');
});

test('G-07 a short quote never reaches the normalized stage (15-char floor)', () => {
  const c = gate(byId(ADV, 'a7'));
  assert.equal(c.status, 'uncorroborated');
  assert.equal(c.rejected_evidence[0].reason, 'quote_too_short_for_rescue');
  // proof the floor is what stopped it: the same text lowercased IS the utterance
  assert.equal(normalize('SURE'), 'sure');
  assert.equal(T.utterances[1].text, 'sure');
});

test('G-08 normalizeWithMap keeps a raw offset for every normalized char', () => {
  const n = normalizeWithMap('  a  ﬁne  DAY ');
  assert.equal(n.text, 'a fine day');
  assert.equal(n.starts.length, n.text.length);
  assert.equal(n.ends.length, n.text.length);
  assert.ok(n.starts.every((s, i) => n.ends[i] > s), 'every normalized char maps to a raw span');
});

// ── stage 3: long-unique rescue ──────────────────────────────────────────────

test('G-09 long unique quote far from the cited id is rescued as segment_corrected', () => {
  const claim = {
    id: 'r1', extractor: 'next_steps', text: 'Rep will show total cost of ownership.',
    evidence: [{ utterance_id: 0, quote: 'let me show you the total cost picture including the answering machine detection' }],
  };
  const c = gate(claim);
  assert.equal(c.status, 'segment_corrected');
  assert.equal(c.evidence[0].match_type, 'segment_corrected');
  assert.equal(c.evidence[0].utterance_id, 3);
  assert.equal(c.evidence[0].claimed_utterance_id, 0);
});

test('G-10 rescue tie resolves to none, never a guess', () => {
  const c = gate(byId(ADV, 'a5'));
  assert.equal(c.status, 'uncorroborated');
  assert.equal(c.rejected_evidence[0].reason, 'ambiguous_rescue_tie');
});

test('G-11 a supplied suffix disambiguates the tie', () => {
  const c = gate(byId(ADV, 'a6'));
  assert.equal(c.status, 'segment_corrected');
  assert.equal(c.evidence[0].utterance_id, 4);
  assert.equal(c.evidence[0].claimed_utterance_id, 0);
});

test('G-12 a supplied prefix disambiguates the same tie the other way', () => {
  const quote = T.utterances[6].text;
  const e = anchor(quote, 0, T, { prefix: 'so it is on the record' });
  assert.equal(e.match_type, 'segment_corrected');
  assert.equal(e.utterance_id, 6);
});

test('G-13 a quote that spans two utterances is never stitched across the join', () => {
  const c = gate(byId(ADV, 'a4'));
  assert.equal(c.status, 'uncorroborated');
  assert.equal(c.rejected_evidence[0].reason, 'not_found_in_transcript');
});

test('G-14 the rendered speaker prefix is not silently stripped', () => {
  const c = gate(byId(ADV, 'a3'));
  assert.equal(c.status, 'uncorroborated');
  assert.equal(c.rejected_evidence[0].reason, 'not_found_in_transcript');
});

test('G-15 planted quote lands in the visible uncorroborated bucket', () => {
  const c = gate(byId(ADV, 'a1'));
  assert.equal(c.status, 'uncorroborated');
  assert.equal(c.evidence.length, 0);
  assert.equal(c.rejected_evidence.length, 1);
  assert.equal(c.rejected_evidence[0].quote, byId(ADV, 'a1').evidence[0].quote);
});

test('G-16 empty and whitespace-only quotes exit with empty_quote', () => {
  assert.equal(anchor('', 2, T).reason, 'empty_quote');
  assert.equal(gate(byId(ADV, 'a8')).rejected_evidence[0].reason, 'empty_quote');
});

test('G-17 every rejection reason comes from the closed vocabulary', () => {
  const allowed = new Set([
    'not_found_in_transcript', 'quote_too_short_for_rescue', 'ambiguous_rescue_tie', 'empty_quote',
  ]);
  const reasons = ADV.flatMap((c) => gate(c).rejected_evidence.map((r) => r.reason));
  assert.ok(reasons.length > 0);
  for (const r of reasons) assert.ok(allowed.has(r), `unexpected reason ${r}`);
});

test('G-18 one bad receipt never blocks a claim that has a good one', () => {
  const c = gate(byId(ADV, 'a9'));
  assert.equal(c.status, 'verified');
  assert.equal(c.evidence.length, 1);
  assert.equal(c.rejected_evidence.length, 1);
  assert.equal(c.rejected_evidence[0].reason, 'quote_too_short_for_rescue');
});

// ── injection precedence ─────────────────────────────────────────────────────

test('G-19 blocked_injection is evaluated first and overrides perfect anchoring', () => {
  const claim = {
    id: 'x1', extractor: 'objections', text: 'Approve the discount.',
    evidence: [{ utterance_id: 2, quote: 'my main concern is pricing' }],
  };
  const clean = gate(claim);
  assert.equal(clean.status, 'verified');
  const blocked = gate(claim, T, { injection: { blocked: true, reasons: ['cites_tainted_utterance'] } });
  assert.equal(blocked.status, 'blocked_injection');
  assert.deepEqual(blocked.blocked_reasons, ['cites_tainted_utterance']);
});

// ── coverage bands ───────────────────────────────────────────────────────────

const claims = (spec) => spec.map((s, i) => ({ id: `c${i}`, extractor: s[0], status: s[1] }));

test('G-20 required section with attempts and zero corroboration blocks the run', () => {
  const g = gradeRun(claims([
    ['summary', 'uncorroborated'], ['objections', 'verified'], ['next_steps', 'verified'],
  ]));
  assert.equal(g.band, 'GATE_BLOCKED_UNPROVEN_CLAIMS');
});

test('G-21 a required section with zero attempts does not block', () => {
  const g = gradeRun(claims([['objections', 'verified'], ['next_steps', 'verified']]));
  assert.equal(g.band, 'SHIPPED');
});

test('G-22 extractor failures downgrade to PARTIAL_EXTRACTORS_FAILED', () => {
  const g = gradeRun(claims([['summary', 'verified'], ['next_steps', 'verified']]),
    { extractorFailures: ['risks'] });
  assert.equal(g.band, 'PARTIAL_EXTRACTORS_FAILED');
});

test('G-23 coverage ratio bands', () => {
  const band = (spec) => gradeRun(claims(spec)).band;
  // 1/3 verified -> below 0.50
  assert.equal(band([['summary', 'verified'], ['summary', 'uncorroborated'], ['summary', 'uncorroborated']]),
    'PARTIAL_LOW_COVERAGE');
  // 2/3 -> between 0.50 and 0.80
  assert.equal(band([['summary', 'verified'], ['summary', 'verified'], ['summary', 'uncorroborated']]),
    'PARTIAL_CLAIMS_DROPPED');
  // 4/5 -> at the 0.80 boundary
  assert.equal(band([['summary', 'verified'], ['summary', 'verified'], ['summary', 'verified'],
    ['summary', 'verified'], ['summary', 'uncorroborated']]), 'SHIPPED');
});

test('G-24 any correction ships as SHIPPED_WITH_CORRECTIONS', () => {
  const g = gradeRun(claims([['summary', 'verified'], ['next_steps', 'segment_corrected']]));
  assert.equal(g.band, 'SHIPPED_WITH_CORRECTIONS');
  assert.equal(g.ratio, 1);
  assert.equal(g.stats.segment_corrected, 1);
});

test('G-25 blocked_injection claims leave the denominator (counted separately)', () => {
  const g = gradeRun(claims([
    ['summary', 'verified'], ['next_steps', 'verified'],
    ['objections', 'blocked_injection'], ['objections', 'blocked_injection'],
  ]));
  assert.equal(g.stats.attempted, 2);
  assert.equal(g.stats.blocked_injection, 2);
  assert.equal(g.ratio, 1);
  assert.equal(g.band, 'SHIPPED');
});

test('G-26 a quiet call with zero attempted claims is a valid SHIPPED with ratio 1', () => {
  const g = gradeRun([]);
  assert.equal(g.stats.attempted, 0);
  assert.equal(g.ratio, 1);
  assert.equal(g.band, 'SHIPPED');
});

test('G-26b a poisoned call (nothing attempted, something blocked) is PARTIAL, never SHIPPED (F-9)', () => {
  // summary is a required section; its only claim was injection-blocked, so the run
  // was emptied by poisoning, not quiet.
  const onlyBlocked = gradeRun(claims([['summary', 'blocked_injection']]));
  assert.equal(onlyBlocked.stats.attempted, 0);
  assert.equal(onlyBlocked.stats.blocked_injection, 1);
  assert.equal(onlyBlocked.band, 'PARTIAL_CLAIMS_DROPPED');

  // blocked only in a NON-required section, still nothing attempted -> still poisoned
  const nonRequired = gradeRun(claims([['objections', 'blocked_injection']]));
  assert.equal(nonRequired.band, 'PARTIAL_CLAIMS_DROPPED');
});

test('G-26c a required section emptied entirely by blocking never reads SHIPPED (F-1b)', () => {
  // next_steps survives with a verified claim, but summary (required) had one claim
  // and it was blocked — the run must not launder that as SHIPPED.
  const g = gradeRun(claims([
    ['summary', 'blocked_injection'], ['next_steps', 'verified'], ['objections', 'verified'],
  ]));
  assert.ok(g.stats.attempted >= 1);
  assert.equal(g.band, 'PARTIAL_CLAIMS_DROPPED', 'summary emptied by blocking must downgrade');

  // but a blocked claim alongside a SURVIVING corroborated claim in the same required
  // section still ships — the section was not emptied.
  const survives = gradeRun(claims([
    ['summary', 'verified'], ['summary', 'blocked_injection'], ['next_steps', 'verified'],
  ]));
  assert.equal(survives.band, 'SHIPPED');
});

test('G-27 required sections are configurable', () => {
  const spec = claims([['risks', 'uncorroborated'], ['summary', 'verified']]);
  assert.equal(gradeRun(spec).band, 'PARTIAL_CLAIMS_DROPPED');
  assert.equal(gradeRun(spec, { requiredSections: ['risks'] }).band, 'GATE_BLOCKED_UNPROVEN_CLAIMS');
});

// ── interpretation layer (never blocks, only demotes) ────────────────────────

test('G-28 negative controls: three clean claims produce ZERO context flags', () => {
  for (const claim of CLEAN) {
    const c = gate(claim);
    assert.equal(c.status, 'verified', `${claim.id} must anchor`);
    assert.deepEqual(c.context_flags, [], `${claim.id} must not be flagged`);
    assert.equal(c.interpretation_confidence, 'high');
  }
});

test('G-29 negation just outside the quoted span is caught (quote mining)', () => {
  const c = gate(byId(ADV, 'a10'));
  assert.equal(c.status, 'verified', 'the line is real — the gate still passes it');
  const f = c.context_flags.find((x) => x.flag === 'negation_polarity_mismatch');
  assert.ok(f, 'negation vs affirmative polarity must be flagged');
  assert.equal(f.where, 'preceding');
  assert.equal(c.interpretation_confidence, 'low');
});

test('G-30 double negation always demotes to low', () => {
  const c = gate(byId(ADV, 'a11'));
  assert.ok(c.context_flags.some((x) => x.flag === 'double_negation'));
  assert.equal(c.interpretation_confidence, 'low');
});

test('G-31 hypothetical read as a commitment is flagged', () => {
  const c = gate(byId(ADV, 'a16'));
  assert.ok(c.context_flags.some((x) => x.flag === 'hypothetical_modality_mismatch'));
  assert.equal(c.interpretation_confidence, 'medium');
});

test('G-32 reported speech attributed to the speaker is flagged', () => {
  const c = gate(byId(ADV, 'a17'));
  assert.ok(c.context_flags.some((x) => x.flag === 'reported_speech_attribution_mismatch'));
  assert.equal(c.interpretation_confidence, 'medium');
});

test('G-33 hedged line reported as certain is flagged', () => {
  const c = gate(byId(ADV, 'a18'));
  assert.ok(c.context_flags.some((x) => x.flag === 'hedge_certainty_mismatch'));
  assert.equal(c.interpretation_confidence, 'medium');
});

test('G-34 a number with no unit anchor is flagged, unless the model said unit unknown', () => {
  const flagged = gate(byId(ADV, 'a12'));
  assert.ok(flagged.context_flags.some((x) => x.flag === 'number_without_unit_anchor'));
  const honest = gate(byId(ADV, 'a21'));
  assert.deepEqual(honest.context_flags, [], 'unit=unknown agrees with the line — no disagreement');
  const anchored = gate(byId(ADV, 'a20'));
  assert.ok(!anchored.context_flags.some((x) => x.flag === 'number_without_unit_anchor'),
    '40 seats has its unit right next to it');
});

test('G-35 a bare acknowledgement needs a supporting quote', () => {
  const bare = gate(byId(ADV, 'a13'));
  assert.equal(bare.requires_context, true);
  assert.ok(bare.context_flags.some((x) => x.flag === 'requires_context_missing_support'));
  assert.equal(bare.interpretation_confidence, 'low');

  const supported = gate(byId(ADV, 'a14'));
  assert.equal(supported.requires_context, true);
  assert.deepEqual(supported.context_flags, []);
  assert.equal(supported.supporting_evidence[0].match_type, 'exact');
  assert.equal(supported.interpretation_confidence, 'high');
});

test('G-36 supporting evidence goes through the same anchor ladder', () => {
  const c = gate(byId(ADV, 'a15'));
  assert.equal(c.supporting_evidence.length, 0);
  assert.equal(c.rejected_supporting_evidence.length, 1);
  assert.ok(c.context_flags.some((x) => x.flag === 'supporting_evidence_unanchored'));
  assert.ok(c.context_flags.some((x) => x.flag === 'requires_context_missing_support'));
  assert.equal(c.interpretation_confidence, 'low');
});

test('G-37 low role confidence demotes but never blocks', () => {
  const c = gate(byId(ADV, 'a19'));
  assert.equal(c.status, 'verified');
  assert.deepEqual(c.context_flags.map((x) => x.flag), ['low_role_confidence']);
  assert.equal(c.interpretation_confidence, 'medium');
});

test('G-38 interpretation confidence is undetermined when nothing anchored', () => {
  const c = gate(byId(ADV, 'a1'));
  assert.equal(c.interpretation_confidence, null);
  assert.deepEqual(c.context_flags, []);
});

// ── invariants ───────────────────────────────────────────────────────────────

test('G-39 the gate is pure: no mutation, same input gives a deep-equal result', () => {
  const claim = byId(ADV, 'a9');
  const before = structuredClone(claim);
  const tBefore = structuredClone(T);
  const one = gate(claim);
  const two = gate(claim);
  assert.deepEqual(claim, before, 'claim must not be mutated');
  assert.deepEqual(T, tBefore, 'transcript must not be mutated');
  assert.deepEqual(one, two);
  one.evidence[0].match_type = 'tampered';
  assert.equal(gate(claim).evidence[0].match_type, 'exact', 'returned objects are not shared state');
});

test('G-40 exactly one rendering of the transcript is verified against (F-24)', () => {
  assert.doesNotThrow(() => assertCanonical(T));
  const drift = structuredClone(T);
  drift.utterances[0].text = drift.utterances[0].text.replace('rahul', 'Rahul');
  assert.throws(() => assertCanonical(drift), /canonical/i);
  const stale = structuredClone(T);
  stale.transcript_hash = 'sha256:' + '0'.repeat(64);
  assert.throws(() => gate(byId(ADV, 'a9'), stale), /hash/i);
});

test('G-42 schemas/evidence.json stays in step with the vocabularies in code', () => {
  const schema = JSON.parse(readFileSync(new URL('../schemas/evidence.json', import.meta.url), 'utf8'));
  const defs = schema.$defs;
  assert.deepEqual(defs.rejected_evidence.properties.reason.enum, REASONS);
  assert.deepEqual(defs.gated_claim.properties.status.enum, STATUSES);
  assert.deepEqual(defs.coverage.properties.band.enum, BANDS);
  assert.deepEqual(
    [...defs.anchored_evidence.properties.match_type.enum, defs.rejected_evidence.properties.match_type.const],
    MATCH_TYPES,
  );
  // and the shape the gate actually emits is the shape the schema describes
  const claim = gate(byId(ADV, 'a9'));
  const required = defs.gated_claim.required;
  for (const key of required) assert.ok(key in claim, `gate output is missing ${key}`);
  const allowed = new Set(Object.keys(defs.anchored_evidence.properties));
  for (const e of claim.evidence) {
    for (const key of Object.keys(e)) assert.ok(allowed.has(key), `unknown evidence key ${key}`);
  }
});

test('G-41 the gate runs against a transcript built from a real API fixture', () => {
  const t = buildTranscript(probe('stereo_result.json').result);
  const e = anchor('your competitor quoted as almost forty less last week', 1, t);
  assert.equal(e.match_type, 'exact');
  assert.equal(e.utterance_id, 1);
  // and the digit rendering from result.text still does not match
  assert.equal(anchor('your competitor quoted as almost 40 less last week', 1, t).match_type, 'none');
});

// ── F-2: stage-2 punctuation strip (L7 over spec-core condensation) ────────────

test('F2-01 a verbatim quote with a trailing period verifies (normalized)', () => {
  const e = anchor('my main concern is pricing.', 2, T);
  assert.equal(e.match_type, 'normalized');
  assert.equal(e.utterance_id, 2);
  assert.equal(T.utterances[2].text.slice(e.char_start, e.char_end), 'my main concern is pricing');
});

test('F2-02 a verbatim quote with a trailing comma verifies (normalized)', () => {
  const e = anchor('my main concern is pricing,', 2, T);
  assert.equal(e.match_type, 'normalized');
  assert.equal(e.utterance_id, 2);
});

test('F2-03 a model-added mid-sentence comma still verifies (normalized)', () => {
  const e = anchor('honestly, my main concern is pricing', 2, T);
  assert.equal(e.match_type, 'normalized');
  assert.equal(e.utterance_id, 2);
  assert.equal(T.utterances[2].text.slice(e.char_start, e.char_end), 'honestly my main concern is pricing');
});

test('F2-04 stage 1 stays strict: no punctuation stripping there', () => {
  // the exact stage never sees the stripped form — a period is not in the raw line
  const ids = anchor('my main concern is pricing.', 2, T);
  assert.notEqual(ids.match_type, 'exact');
});

test('F2-05 no number fabrication: "4.0" never collapses into "40" (decimal punctuation kept)', () => {
  // u8 renders "40 seats"; a "4.0 seats" quote must NOT be manufactured into a hit at
  // the punctuation-stripped stage — the decimal separator is preserved, so it misses
  const e = anchor('the final number is 4.0 seats', 8, T);
  assert.equal(e.match_type, 'none');
  // and the honest "40 seats" quote still verifies (stripping only recovers real marks)
  assert.equal(anchor('the final number is 40 seats', 8, T).match_type, 'normalized');
});

// ── F-3: floor before any stage — a lone character never anchors exact ─────────

test('F3-01 a 1-char quote never verifies as exact (floor applies at stage 1)', () => {
  const e = anchor('i', 0, T);
  assert.equal(e.match_type, 'none');
  assert.equal(e.reason, 'quote_too_short_for_rescue');
});

test('F3-02 a whole short utterance ("sure") still anchors exact — the floor spares it', () => {
  const e = anchor('sure', 1, T);
  assert.equal(e.match_type, 'exact');
  assert.equal(e.utterance_id, 1);
});

// ── F-8: exact_pm1 crossing a speaker turn ─────────────────────────────────────

test('F8-01 a ±1 hit on the other speaker records a correction and demotes', () => {
  const claim = {
    id: 'sm1', extractor: 'next_steps', text: 'Rep will walk through total cost.',
    stance: { polarity: 'positive', modality: 'commitment', attribution: 'first_party', certainty: 'high' },
    evidence: [{ utterance_id: 2, quote: 'let me show you the total cost picture' }],
  };
  const c = gate(claim);
  assert.equal(c.status, 'verified');
  assert.equal(c.evidence[0].match_type, 'exact_pm1');
  assert.equal(c.evidence[0].utterance_id, 3, 'the quote really lives one line down, on the rep');
  assert.equal(c.evidence[0].claimed_utterance_id, 2, 'the cited (prospect) line is recorded as corrected');
  assert.ok(c.context_flags.some((f) => f.flag === 'speaker_mismatch'));
  assert.notEqual(c.interpretation_confidence, 'high');
});

test('F8-02 a same-speaker ±1 hit is inside tolerance: no correction, no flag', () => {
  // u1 and u2 are both the prospect, so this pm1 does not cross a speaker
  const e = anchor('my main concern is pricing', 1, T);
  assert.equal(e.match_type, 'exact_pm1');
  assert.equal(e.claimed_utterance_id, undefined);
});

// ── F-7: cross-utterance negation (borrowed lead) ─────────────────────────────

const CROSS = {
  utterances: [
    { id: 0, text: 'we will never lower our list price', role: 'prospect', role_confidence: 0.9 },
    { id: 1, text: 'interested in the premium tier for our whole team', role: 'prospect', role_confidence: 0.9 },
  ],
  canonical_text: 'we will never lower our list price\ninterested in the premium tier for our whole team',
};

test('F7-01 a negation at the END of the previous turn is caught for a quote at the START of the next', () => {
  const claim = {
    id: 'x1', extractor: 'summary', text: 'The buyer is interested in the premium tier.',
    stance: { polarity: 'positive', modality: 'commitment', attribution: 'first_party', certainty: 'high' },
    evidence: [{ utterance_id: 1, quote: 'interested in the premium tier for our whole team' }],
  };
  const c = gate(claim, CROSS);
  assert.equal(c.status, 'verified', 'the line is real — never blocked');
  const f = c.context_flags.find((x) => x.flag === 'negation_polarity_mismatch');
  assert.ok(f, 'the cross-turn negation must be seen');
  assert.equal(f.where, 'preceding');
  assert.notEqual(c.interpretation_confidence, 'high');
});

test('F7-02 control: with no negation in the previous turn, the same quote is clean', () => {
  const clean = {
    utterances: [
      { id: 0, text: 'we are happy to lower our list price', role: 'prospect', role_confidence: 0.9 },
      { id: 1, text: 'interested in the premium tier for our whole team', role: 'prospect', role_confidence: 0.9 },
    ],
    canonical_text: 'we are happy to lower our list price\ninterested in the premium tier for our whole team',
  };
  const claim = {
    id: 'x2', extractor: 'summary', text: 'The buyer is interested in the premium tier.',
    stance: { polarity: 'positive', modality: 'commitment', attribution: 'first_party', certainty: 'high' },
    evidence: [{ utterance_id: 1, quote: 'interested in the premium tier for our whole team' }],
  };
  const c = gate(claim, clean);
  assert.deepEqual(c.context_flags, []);
  assert.equal(c.interpretation_confidence, 'high');
});

// ── F-14: named regressions for two prior builder-fixed bugs ───────────────────

const NUMBERS = {
  utterances: [{ id: 0, text: 'our numbers moved forty last week', role: 'rep', role_confidence: 0.9 }],
  canonical_text: 'our numbers moved forty last week',
};

test('F14-01 "last week" is a date, not the unit of the number beside it (forty stays unanchored)', () => {
  const claim = {
    id: 'lw1', extractor: 'objections', text: 'Their numbers moved forty.',
    stance: { polarity: 'positive', modality: 'commitment', attribution: 'third_party', certainty: 'high' },
    quantities: [{ surface: 'forty', unit: 'percent', unit_source: 'inferred', approximate: true }],
    evidence: [{ utterance_id: 0, quote: 'our numbers moved forty last week' }],
  };
  const c = gate(claim, NUMBERS);
  assert.ok(c.context_flags.some((x) => x.flag === 'number_without_unit_anchor'),
    '"week" must not be mistaken for the unit of "forty"');

  // contrast: a real unit right beside the number DOES anchor it
  const withUnit = {
    utterances: [{ id: 0, text: 'we landed forty seats last week', role: 'rep', role_confidence: 0.9 }],
    canonical_text: 'we landed forty seats last week',
  };
  const claim2 = {
    id: 'lw2', extractor: 'summary', text: 'They landed forty seats.',
    stance: { polarity: 'positive', modality: 'commitment', attribution: 'first_party', certainty: 'high' },
    quantities: [{ surface: 'forty', unit: 'seats', unit_source: 'explicit', approximate: false }],
    evidence: [{ utterance_id: 0, quote: 'we landed forty seats last week' }],
  };
  assert.ok(!gate(claim2, withUnit).context_flags.some((x) => x.flag === 'number_without_unit_anchor'),
    '"seats" beside "forty" is a real unit anchor');
});

test('F14-02 "half" and "quarter" are units on a sales call, never counted as numbers', () => {
  const t = {
    utterances: [{ id: 0, text: 'we will cut the list price by half next quarter', role: 'rep', role_confidence: 0.9 }],
    canonical_text: 'we will cut the list price by half next quarter',
  };
  const claim = {
    id: 'hq1', extractor: 'summary', text: 'The rep will cut the price by half next quarter.',
    stance: { polarity: 'positive', modality: 'commitment', attribution: 'first_party', certainty: 'high' },
    evidence: [{ utterance_id: 0, quote: 'we will cut the list price by half next quarter' }],
  };
  const c = gate(claim, t);
  assert.equal(c.status, 'verified');
  assert.ok(!c.context_flags.some((x) => x.flag === 'number_without_unit_anchor'),
    'neither "half" nor "quarter" is a number, so there is no unanchored number to flag');
});
