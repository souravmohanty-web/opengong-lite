import { readFileSync } from 'node:fs';
import { buildTranscript } from '../../src/transcript.js';

// Lane 10 (Saritha) — implements the LOCKED L7 gate chain (audit A-007 "GATE
// RE-ADJUDICATION round 3", binding) so extraction-model candidates can be
// scored on quote fidelity against real committed fixtures instead of
// eyeballed. Zero deps, Node >=22, matches repo idiom.
//
// This builds the LOCKED ruling, not research/02 §4.6's earlier 3-pass
// anchor() ladder — A-007 explicitly demotes 02's fuzzy/LCS pass to
// "stretch-goal only" and L9 rules out any fuzzy-matching dependency. Verdict
// vocabulary is kept aligned with 02's alignment_status naming where the
// ruling kept the underlying pass (match_exact, match_normalized) and uses
// L7's own naming where the ruling changed the mechanism (segment_corrected
// replaces match_fuzzy; uncorroborated replaces unaligned).
//
// L7 (DECISION-BRIEF.md, binding):
//   1. Exact match of quote in the named segment ±1
//   2. else normalized containment (lowercase, strip punctuation, collapse
//      whitespace — NO digit folding; verification runs against the exact
//      prompt-rendered canonical text, per audit-log.md point 4 — extractor
//      quotes from the same raw utterance text that was rendered into the
//      prompt, never a repunctuated display transcript)
//   3. else whole-transcript rescue only for long/unique quotes -> segment_corrected
//   4. else uncorroborated (demoted, not dropped)
//
// L7 doesn't pin an exact "long/unique" threshold for stage 3 — RESCUE_MIN_WORDS
// below is a judgment call, not a locked number. Flagging it as STILL OPEN in
// FINDINGS.md rather than treating it as settled.
const RESCUE_MIN_WORDS = 6;

// Field name note: the model-facing evidence contract (research/02 §4.3,
// `opengong://evidence`) names this field `segment_id`. src/transcript.js's
// buildTranscript() currently names the same atomic citation unit
// `utterances[].id` (deliberately — mono utterances aren't API "segments").
// This script uses `segment_id` in candidate claim files to match the
// model-facing contract, and maps it onto `utterances[].id` here. Not a bug,
// just worth a one-line comment before Phase 2 wires this up for real.

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')   // strip punctuation — NOT digits (L7: no digit folding)
    .replace(/\s+/g, ' ')
    .trim();
}

function gateChain(claim, utterances) {
  const { quote, segment_id } = claim;
  const neighbors = utterances.filter((u) => Math.abs(u.id - segment_id) <= 1);

  // Stage 1: exact substring match in the named segment ±1.
  for (const u of neighbors) {
    if (u.text.includes(quote)) {
      return { stage: 1, verdict: 'match_exact', matched_segment: u.id };
    }
  }

  // Stage 2: normalized containment, same ±1 window, against the exact
  // prompt-rendered canonical text for those utterances.
  const normQuote = normalize(quote);
  for (const u of neighbors) {
    if (normalize(u.text).includes(normQuote)) {
      return { stage: 2, verdict: 'match_normalized', matched_segment: u.id };
    }
  }

  // Stage 3: whole-transcript rescue, only for long/unique quotes.
  const wordCount = normQuote.split(' ').filter(Boolean).length;
  if (wordCount >= RESCUE_MIN_WORDS) {
    const hits = utterances.filter((u) => normalize(u.text).includes(normQuote));
    if (hits.length === 1) {
      return { stage: 3, verdict: 'segment_corrected', matched_segment: hits[0].id, claimed_segment_id: segment_id };
    }
  }

  // Stage 4: uncorroborated — demoted, not dropped (L7).
  return { stage: 4, verdict: 'uncorroborated', matched_segment: null };
}

function scoreCandidate(candidateFile, fixtureFile) {
  const { result } = JSON.parse(readFileSync(fixtureFile, 'utf8'));
  const transcript = buildTranscript(result);
  const claims = JSON.parse(readFileSync(candidateFile, 'utf8'));

  const scored = claims.map((c) => ({ ...c, gate: gateChain(c, transcript.utterances) }));
  const n = scored.length;
  const counts = { match_exact: 0, match_normalized: 0, segment_corrected: 0, uncorroborated: 0 };
  for (const c of scored) counts[c.gate.verdict]++;

  return {
    candidate: candidateFile,
    fixture: fixtureFile,
    transcript_hash: transcript.transcript_hash,
    n_claims: n,
    verbatim_recoverable_rate: n ? (counts.match_exact + counts.match_normalized + counts.segment_corrected) / n : 0,
    exact_match_rate: n ? counts.match_exact / n : 0,
    uncorroborated_rate: n ? counts.uncorroborated / n : 0,
    counts,
    claims: scored,
  };
}

// CLI: node gate_chain_verify.mjs <candidate.json> <fixture.json>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [candidateFile, fixtureFile] = process.argv.slice(2);
  if (!candidateFile || !fixtureFile) {
    console.error('usage: node gate_chain_verify.mjs <candidate_claims.json> <api-probe fixture.json>');
    process.exit(1);
  }
  const report = scoreCandidate(candidateFile, fixtureFile);
  console.log(JSON.stringify(report, null, 2));
}

export { gateChain, normalize, scoreCandidate };
