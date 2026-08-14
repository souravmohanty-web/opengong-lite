// Deal-wide index + search — pure, browser-safe (no fs, no fetch, no DOM).
// Node-testable directly and imported unchanged by the deal workspace at
// public/index.html, so the matching logic that ships to judges is the exact
// logic covered by tests.
// Reads bundles the same shape src/viewer.js already trusts; never mutates
// them, never recomputes a status the gate already decided (same discipline
// as buildViewModel: closed statuses, blocked claims quarantined).

const CLAIM_STATUSES = new Set(['verified', 'segment_corrected', 'uncorroborated', 'blocked_injection']);

function stageOf(bundle) {
  const claim = bundle.claims.find((c) => c.id === 'buying_stage-stage');
  if (!claim) return null;
  return claim.text.replace(/^Buying stage:\s*/i, '').trim();
}

function oneLineSummary(bundle) {
  const section = bundle.notes?.sections?.find((s) => s.title.toLowerCase() === 'summary');
  return section?.blocks?.[0]?.text ?? '';
}

// One record per searchable line: a claim (the gate's own words) or a raw
// transcript utterance (so a term the claims layer paraphrased, e.g. "ringcak"
// for RingHawk, is still reachable by anyone who searches the raw audio text).
export function buildDealIndex(bundles) {
  if (!Array.isArray(bundles) || bundles.length === 0) {
    throw new Error('buildDealIndex needs at least one bundle');
  }

  const calls = [];
  const records = [];

  bundles.forEach((bundle, i) => {
    const callId = bundle.call?.id ?? String(i + 1);
    const title = bundle.call?.title ?? callId;
    const coverage = bundle.notes?.coverage ?? null;
    const verifiedCount = bundle.claims.filter(
      (c) => c.status === 'verified' || c.status === 'segment_corrected',
    ).length;

    calls.push({
      id: callId,
      seq: i + 1,
      title,
      band: coverage?.band ?? 'UNKNOWN',
      ratio: coverage?.ratio ?? null,
      verifiedCount,
      totalClaims: bundle.claims.length,
      stage: stageOf(bundle),
      summary: oneLineSummary(bundle),
      // Point at the notes page, not the tier-1 export under public/calls/.
      // Both render the same gated claims, but only the notes page carries the
      // staged audio (and the deal nav back out), so a judge clicking through
      // from the deal workspace lands on the surface the demo is given on.
      // public/calls/*.html stays built as the self-contained USB fallback.
      href: `notes/${callId}.html`,
    });

    for (const claim of bundle.claims) {
      if (!CLAIM_STATUSES.has(claim.status) || claim.status === 'blocked_injection') continue;
      const primary = claim.evidence?.[0] ?? null;
      records.push({
        callId,
        callSeq: i + 1,
        source: 'claim',
        claimId: claim.id,
        extractor: claim.extractor,
        status: claim.status,
        text: claim.text,
        quote: primary?.quote ?? null,
        utteranceId: primary?.utterance_id ?? null,
        tStart: primary?.t_start ?? null,
      });
    }

    // An utterance a blocked_injection claim stands on is quarantined too. The
    // claim layer refusing to index a planted line means nothing if the raw
    // utterance layer hands the same words back to the same search box — the
    // quote IS the payload. Derived from the gate's own verdicts (never a
    // second pattern match here), so this can only ever narrow what ships.
    const quarantined = new Set();
    for (const claim of bundle.claims) {
      if (claim.status !== 'blocked_injection') continue;
      for (const e of [...(claim.evidence ?? []), ...(claim.supporting_evidence ?? [])]) {
        if (Number.isInteger(e?.utterance_id)) quarantined.add(e.utterance_id);
      }
    }

    for (const u of bundle.transcript?.utterances ?? []) {
      if (quarantined.has(u.id)) continue;
      records.push({
        callId,
        callSeq: i + 1,
        source: 'utterance',
        claimId: null,
        extractor: null,
        status: null,
        text: u.text,
        quote: u.text,
        utteranceId: u.id,
        tStart: u.start,
      });
    }
  });

  calls.sort((a, b) => a.seq - b.seq);
  return { calls, records };
}

// Plain substring search, case-insensitive. Returns hits grouped by call, in
// call order (not hit-count order) so the deal's chronology stays legible.
export function searchDeal(index, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return { query: q, callIds: [], hitsByCall: {} };

  const hitsByCall = new Map();
  for (const r of index.records) {
    if (!r.text.toLowerCase().includes(q)) continue;
    if (!hitsByCall.has(r.callId)) hitsByCall.set(r.callId, []);
    hitsByCall.get(r.callId).push(r);
  }

  const callIds = index.calls.filter((c) => hitsByCall.has(c.id)).map((c) => c.id);
  return { query: q, callIds, hitsByCall: Object.fromEntries(hitsByCall) };
}

// Commitment ledger: every next_steps claim (a promise, owner-tagged) plus
// every trust-category objection (a promise called out) in call order. No
// kept/broken verdict is computed here — that would be a guess laid on top of
// the gate's own claims. We only surface what a verified claim already says.
export function buildCommitmentLedger(bundles) {
  const entries = [];
  bundles.forEach((bundle, i) => {
    const callId = bundle.call?.id ?? String(i + 1);
    const title = bundle.call?.title ?? callId;
    for (const claim of bundle.claims) {
      if (claim.status === 'blocked_injection') continue;
      if (claim.extractor === 'next_steps') {
        entries.push({
          callId, callSeq: i + 1, callTitle: title, kind: 'promise',
          owner: claim.owner ?? 'unknown', commitment: claim.commitment ?? 'unclear',
          due: claim.due ?? '', text: claim.text, status: claim.status, claimId: claim.id,
        });
      } else if (claim.extractor === 'objections' && claim.category === 'trust') {
        entries.push({
          callId, callSeq: i + 1, callTitle: title, kind: 'called_out',
          owner: null, commitment: null, due: '',
          text: claim.text, status: claim.status, claimId: claim.id,
        });
      }
    }
  });
  entries.sort((a, b) => a.callSeq - b.callSeq);
  return entries;
}
