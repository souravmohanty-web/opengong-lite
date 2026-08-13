// Evidence gate — the mini version of opengong-lite's receipts gate (their
// locked decision L7), same chain, same ethos: demote visibly, never drop
// silently, never guess.
//   1. exact match of quote in the cited segment (or its +/-1 neighbors);
//   2. else normalized containment (lowercase, strip punctuation, collapse
//      whitespace — NO digit folding: a wrong number can't be laundered in);
//   3. else whole-transcript normalized search, unique hit only -> relabeled
//      segment_corrected;
//   4. else the evidence item is demoted (kept, marked unverified).
// A met/partial trait whose evidence ALL demoted is flagged unverified: true —
// the verdict stays visible but can never masquerade as proven.

function normalize(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function segmentText(transcript, id) {
  return transcript.segments.find((s) => s.id === id)?.text ?? null;
}

export function gateEvidence(transcript, evidence) {
  const quote = evidence.quote ?? '';
  const cited = evidence.segment;

  for (const id of [cited, cited - 1, cited + 1]) {
    const text = segmentText(transcript, id);
    if (text === null) continue;
    if (text.includes(quote)) {
      return { ...evidence, segment: id, status: id === cited ? 'verified' : 'segment_corrected' };
    }
  }

  const nq = normalize(quote);
  if (nq.length > 0) {
    for (const id of [cited, cited - 1, cited + 1]) {
      const text = segmentText(transcript, id);
      if (text !== null && normalize(text).includes(nq)) {
        return { ...evidence, segment: id, status: id === cited ? 'verified_normalized' : 'segment_corrected' };
      }
    }
    // Whole-transcript rescue: unique normalized hit only. Ties demote.
    const hits = transcript.segments.filter((s) => normalize(s.text).includes(nq));
    if (hits.length === 1) {
      return { ...evidence, segment: hits[0].id, status: 'segment_corrected' };
    }
  }

  return { ...evidence, status: 'demoted' };
}

const VERIFIED = new Set(['verified', 'verified_normalized', 'segment_corrected']);

export function gateVerdicts(transcript, verdictOutput) {
  const traits = verdictOutput.traits.map((t) => {
    const evidence = (t.evidence ?? []).map((e) => gateEvidence(transcript, e));
    const anyVerified = evidence.some((e) => VERIFIED.has(e.status));
    const needsEvidence = t.verdict === 'met' || t.verdict === 'partial';
    return {
      ...t,
      evidence,
      unverified: needsEvidence && !anyVerified,
    };
  });

  const counts = {
    evidence_total: traits.reduce((n, t) => n + t.evidence.length, 0),
    evidence_verified: traits.reduce((n, t) => n + t.evidence.filter((e) => VERIFIED.has(e.status)).length, 0),
    traits_unverified: traits.filter((t) => t.unverified).length,
  };

  return { ...verdictOutput, traits, gate: counts };
}
