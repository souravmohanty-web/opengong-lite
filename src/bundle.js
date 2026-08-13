// Bundle writer: gated claims + graded coverage -> the viewer-ready contract
// src/viewer.js's buildViewModel expects (test/fixtures/bundle.slice1.json is
// that contract, hand-authored; this module is what produces it for real).
//
// One deliberate remap: src/gate.js splits a claim's citations into `evidence`
// (anchored, passed) vs `rejected_evidence` (failed, match_type:'none') — but
// the viewer only ever looks at claim.evidence[0] (it never reads
// rejected_evidence at all). An uncorroborated claim therefore has an EMPTY
// `evidence` array from the gate, which would leave the viewer nothing to show
// even when there IS a citation worth displaying (just a failed one). We copy
// the failed citation into the display `evidence` slot instead, adding the
// utterance t_start/t_end the gate never attaches to a miss() (rejected
// citations don't carry timing — they're not anchored to any utterance's
// bounds — so this backfills it from the CITED utterance when that id exists).
// Blocked-injection claims need no remap: the planted line anchors perfectly,
// so gate.js's real `evidence` is already populated.

const SECTION_TITLES = { objections: 'Objections', summary: 'Summary', next_steps: 'Next steps' };
const CORROBORATED = new Set(['verified', 'segment_corrected']);

// call.source (Sourav's CRM-plumbing recommendation): every bundle carries the
// full set of CRM source-identity slots, even on today's upload/URL ingest
// path where none of them are known. This makes "the schema carries CRM
// source IDs, populated when you connect a CRM" a literally true statement
// about the shape shipped today, not a roadmap promise — a future CRM adapter
// fills these in (buildBundle's `source` param), it never adds new keys.
const EMPTY_SOURCE = {
  system: null,
  external_call_id: null,
  external_contact_id: null,
  external_account_id: null,
  external_deal_id: null,
  occurred_at: null,
  direction: null,
};

function displayEvidence(claim, transcript) {
  if (claim.evidence?.length) return claim.evidence;
  if (!claim.rejected_evidence?.length) return [];
  return claim.rejected_evidence.map((ev) => {
    const u = Number.isInteger(ev.utterance_id) ? transcript.utterances[ev.utterance_id] : null;
    return {
      utterance_id: ev.utterance_id,
      quote: ev.quote,
      match_type: ev.match_type,
      reason: ev.reason,
      t_start: u?.start ?? null,
      t_end: u?.end ?? null,
    };
  });
}

function buildSections(claims) {
  const bySection = new Map();
  for (const claim of claims) {
    if (!CORROBORATED.has(claim.status)) continue;
    const key = claim.section ?? claim.extractor;
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(claim);
  }
  return [...bySection.entries()].map(([key, list]) => ({
    title: SECTION_TITLES[key] ?? key,
    blocks: list.map((c) => ({ text: c.text, claim_ids: [c.id] })),
  }));
}

// buildBundle({ transcript, claims, coverage, callId, title, audio, provenance })
// -> "opengong.bundle.v1". `claims` are already-gated (src/gate.js output);
// `coverage` is already-graded (gate.gradeRun output) — this module composes,
// it never re-derives either.
export function buildBundle({
  transcript, claims, coverage, callId = 'call', title, audio = null, provenance = null, source = null,
}) {
  const viewerClaims = claims.map((c) => ({ ...c, evidence: displayEvidence(c, transcript) }));

  return {
    format: 'opengong.bundle.v1',
    call: { id: callId, title: title ?? callId, source: { ...EMPTY_SOURCE, ...(source ?? {}) } },
    audio,
    transcript: {
      mode: transcript.mode,
      speakers: transcript.speakers,
      utterances: transcript.utterances,
    },
    claims: viewerClaims,
    notes: {
      coverage,
      sections: buildSections(claims),
    },
    provenance,
  };
}
