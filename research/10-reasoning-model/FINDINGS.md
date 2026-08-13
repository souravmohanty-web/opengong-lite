# Lane 10: Extraction/reasoning model selection — Saritha

**Goal:** pick the extraction LLM (and fallback) that goes into `capabilities.json` →
`roles.extraction`. Output of this lane = one promoted L-decision naming model + fallback.

## Constraints already locked (build on these, don't re-derive)

- **L5:** extraction LLM is EXTERNAL (Anthropic-class) — `pyai-nova` is a sandbox stub.
- **L6:** the model must return a **verbatim quote + segment ordinal** per claim; code
  locates the quote. So the eval criterion is NOT reasoning eloquence — it's
  **quote fidelity**: does the model copy transcript lines exactly, or does it
  paraphrase/"fix" them? A model that normalizes "forty" → "40" fails our gate.
- **L7:** quotes are verified against canonical text (lowercase, unpunctuated). Models
  that silently repunctuate quotes will land in the uncorroborated bucket.
- **L9:** no NLI models on the blocking path; no fuzzy-match dependency.
- **D4 (open):** who supplies the Anthropic key + spend cap.

## Suggested eval harness (cheap, uses committed fixtures)

Feed `research/00-api-probe/stereo_result.json` canonical text + an extraction prompt to
each candidate; score: (a) % of claims with verbatim-recoverable quotes, (b) hallucinated
claims (not in transcript at all), (c) JSON schema compliance, (d) cost + latency per call.

## What is CONFIRMED

_(add findings here — every entry needs evidence: the raw model output as a fixture file
in this directory)_

## What is STILL OPEN

- Which Claude tier balances quote fidelity vs cost for a Show HN cloner?
- Does temperature 0 measurably improve verbatim quoting?
- Structured output (tool use / JSON mode) vs prose+parse for the claim schema?

## Promotion path

Conclusion → SYNC.md proposal → auditor → DECISION-BRIEF L-number + one-line change to
`capabilities.json` `roles.extraction`.
