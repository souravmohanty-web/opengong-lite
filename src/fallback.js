// Keyless extraction fallback (the D4 merge-graft). ONE job: decide, honestly,
// what src/run.js's runPipeline is allowed to attempt given what's actually in
// the environment — never fabricate coverage the run didn't earn.
//
// Chain (per the brief):
//   1. ANTHROPIC_API_KEY set  -> real LLM extraction, full extractor registry
//      (runPipeline's existing path, untouched).
//   2. No key                -> DETERMINISTIC extraction: only the tracker
//      family runs (role:"tracker" — src/extract.js's scanTrackerClaims /
//      runTrackerExtractor, keyword string-matching, zero AI, zero spend).
//      Every LLM extractor is named as skipped, never silently dropped.
//   3. Recap (a third tier in the colleague build's chain) is NOT implemented
//      here — this sandbox has no recap scope and probing one bills. TODO
//      seam: a 'recap' role would slot in here as a second-priority fallback
//      between (1) and (2), tried when the key is present but the LLM budget/
//      call fails. Nothing calls it; nothing pretends it exists.
//
// This module never calls the network and never calls an LLM — it only
// classifies extractorDefs into "what we may attempt" and stamps the
// human-readable reason, so a live ingest with no paid key still produces
// something real (tracker claims), honestly labeled, instead of nothing.

export const EXTRACTION_MODES = {
  LLM: 'llm-extraction',
  DETERMINISTIC_TRACKERS_ONLY: 'deterministic-trackers-only',
};

export const DETERMINISTIC_NOTE = 'limited coverage: no LLM key, keyword trackers only';

export function hasAnthropicKey(env = process.env) {
  return typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.length > 0;
}

// selectExtractionPlan(extractorDefs, opts?) -> {
//   mode, note, extractorDefs (the subset runPipeline should actually run),
//   extractorsSkipped (LLM extractor names named but never attempted),
// }
//
// Honesty invariant: extractorsSkipped is exactly the LLM extractors that are
// NOT in the returned extractorDefs — never a partial list, never silently
// empty when extractors were in fact skipped.
export function selectExtractionPlan(extractorDefs, { env = process.env } = {}) {
  const trackerDefs = extractorDefs.filter((d) => d.role === 'tracker');
  const llmDefs = extractorDefs.filter((d) => d.role !== 'tracker');

  if (hasAnthropicKey(env)) {
    return {
      mode: EXTRACTION_MODES.LLM,
      note: null,
      extractorDefs,
      extractorsSkipped: [],
    };
  }

  return {
    mode: EXTRACTION_MODES.DETERMINISTIC_TRACKERS_ONLY,
    note: DETERMINISTIC_NOTE,
    extractorDefs: trackerDefs,
    extractorsSkipped: llmDefs.map((d) => d.name),
  };
}
