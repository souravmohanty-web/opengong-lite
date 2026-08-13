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
  that silently repunctuate quotes will land in the uncorroborated bucket. Binding
  4-stage chain (audit A-007, "gate re-adjudication round 3"): exact match in the named
  segment ±1 → normalized containment (lowercase, strip punctuation, collapse
  whitespace — **no digit folding**) → whole-transcript rescue for long/unique quotes
  only (`segment_corrected`) → else `uncorroborated` (demoted, not dropped).
- **L9:** no NLI models on the blocking path; no fuzzy-match dependency. (A-007 explicitly
  demoted research/02 §4.6's earlier fuzzy/LCS pass to stretch-goal-only — not part of
  the locked chain.)
- **D4 (open):** who supplies the Anthropic key + spend cap. Still blocks a full
  cross-tier eval — see STILL OPEN.

Also confirmed while working this lane, not previously written down here:
structured-output vs. Citations was never actually this lane's call to make —
see CONFIRMED #1.

## Suggested eval harness (cheap, uses committed fixtures)

Feed `research/00-api-probe/stereo_result.json` canonical text + an extraction prompt to
each candidate; score: (a) % of claims with verbatim-recoverable quotes, (b) hallucinated
claims (not in transcript at all), (c) JSON schema compliance, (d) cost + latency per call.

A second, harder fixture is worth running before this lane closes:
`research/00-api-probe/batch_result.json` is the one where the SAME API response
renders "almost 40 less" in `result.text` but "forty" in `segments[].text` (F-21) —
the best available stress case for whether an extraction model resists "fixing" a
spoken number even when the canonical text handed to it is already clean.

## What is CONFIRMED

1. **The structured-output-vs-Citations question is closed, and it was never this
   lane's decision.** `research/02-data-model.md` §4.2 states outright: Anthropic's
   structured outputs and its Citations feature are mutually exclusive (the pair
   returns 400), and since extractors need structured outputs for the
   `output_schema`/`evidence` pattern (§4.3), Citations is "not a preference, it is
   forced" out. Independently cross-checked against Anthropic's own public docs —
   same conclusion, different source. Nothing for this lane to decide here; the real
   open question was always model *tier*, not architecture.

2. **The L7 gate chain runs, and it enforces what it says it enforces — not just in
   prose.** `gate_chain_verify.mjs` (this directory) implements all four L7 stages,
   imports the real `buildTranscript()` from `src/transcript.js` (no reimplementation
   of the canonical-text logic), zero deps, Node ≥22. Two runs against the real
   committed fixture `research/00-api-probe/stereo_result.json`
   (`transcript_hash: sha256:eb85a799…`):

   - **`sonnet5_stereo_claims.json`** (a genuine extraction, see #3) → 3/3 claims
     `match_exact`, `verbatim_recoverable_rate: 1`.
   - **`adversarial_bad_claims.json`** (hand-built, plants L6's exact failure mode) →
     the digit-folded quote (`"almost 40 less"` against a transcript that says
     `"almost forty less"`) lands in `uncorroborated`, **not** rescued — proving the
     "no digit folding" rule holds in the implementation. Also exercises
     `match_normalized` (a punctuated/truncated quote), a fully hallucinated claim
     (correctly `uncorroborated`), and `segment_corrected` (right quote, wrong claimed
     segment, unique elsewhere in the transcript → rescued, relabeled). All four L7
     verdicts fire on the cases designed to trigger them. This candidate file is close
     to a working version of Phase 2's own exit test ("planted-fake-quote test lands
     in uncorroborated bucket") and is reusable there directly.

3. **One genuine, fixture-backed quote-fidelity sample — for Claude Sonnet 5 only,
   with an honesty caveat attached on purpose.** This session runs as `claude-sonnet-5`
   (matching `capabilities.json`'s current default). I ran the actual extraction task
   against the real canonical text `buildTranscript()` produces from
   `stereo_result.json` and recorded the raw output unedited as
   `sonnet5_stereo_claims.json`: 3 claims (topic / objection / next_step), each with a
   `quote` + `segment_id`. "Forty" was preserved exactly as given — not folded to "40,"
   no added punctuation, correct segment ids, scored 3/3 `match_exact` per #2.

   **Caveat, stated because the evidence bar here deserves it:** `n=1`, on a 3-segment
   fixture, **self-administered** — I am the model being evaluated and already knew
   what the test checked for, so this is a best-case demonstration, not a blind
   measurement. Real evidence, genuinely thin. It answers "can Sonnet 5 do this at all,
   once, cleanly" — not "how often does it hold up under normal conditions," and it
   says nothing at all about Haiku 4.5 or Opus 5.

4. **Current Claude lineup + pricing** (platform.claude.com/docs, Aug 2026) — the
   candidate set this lane is actually choosing from, per L5:

   | Model | Context | Input / Output per MTok | Notes |
   |---|---|---|---|
   | `claude-haiku-4-5-20251001` | 200k | $1 / $5 | Fastest, cheapest; extended thinking supported |
   | `claude-sonnet-5` | 1M | $2 / $10 | Current `capabilities.json` default; balanced speed/intelligence |
   | `claude-opus-5` | 1M | $5 / $25 | Adaptive thinking, positioned for complex agentic/enterprise work |

   All three support structured outputs. None but Sonnet 5 has been run against this
   lane's eval criterion yet (see STILL OPEN).

## Model comparison — what each tier is actually for here

Quote fidelity is a **discipline** task (copy exactly, don't improve it), not a
**difficulty** task — which cuts against the usual "pick the smartest model" instinct
and is worth saying plainly before anyone defaults to Opus 5 out of habit:

- **Claude Sonnet 5** — the only tier with a real result behind it (#3 above): clean
  on a simple 3-segment fixture. Already `capabilities.json`'s default. Best-positioned
  candidate to stay the primary pick *if* a harder, blind, multi-run test holds up —
  not yet proven, just not yet contradicted either.
- **Claude Haiku 4.5** — untested on fidelity, but the obvious fallback/cost
  candidate: 5-8x cheaper than Sonnet 5 on both input and output tokens, still
  supports structured outputs, and "copy this text exactly" is not obviously a task
  that needs a bigger model to get right — it's plausibly *more* Haiku's speed than
  Opus's depth. Matters concretely for D4 and for the "Show HN cloner with their own
  small Anthropic budget" persona L6 was written for.
- **Claude Opus 5** — untested, and there's a real reason to suspect it's not the
  answer here even before testing it: a model built for "complex agentic coding &
  enterprise work" may be *more* inclined to helpfully clean up a transcript's grammar
  or numbers than a smaller model told to just copy — that instinct is exactly what L6
  gates against. Worth testing precisely to check this hypothesis, not worth defaulting
  to on the assumption that stronger reasoning helps a copying task. It may turn out to
  be the best fallback for cases where the *claim* itself is hard to find (long,
  rambling calls, buried objections) even if it isn't the most literal quoter — that's
  a second, separate axis (recall) this lane hasn't scored yet either.

**Net:** the fidelity axis and the "did it find the right claims at all" axis are
different questions, and this lane's harness (§ above) only measures the first one
directly. Recommend scoring both once Haiku/Opus are actually run, not just fidelity.

## What is STILL OPEN

- **Which Claude tier balances quote fidelity vs cost for a Show HN cloner?**
  Narrowed, not answered: Sonnet 5 has one clean self-administered sample (CONFIRMED
  #3); Haiku 4.5 and Opus 5 have none. Needs an actual API call from someone with a
  key (D4) — `gate_chain_verify.mjs` will score whatever candidate JSON comes back
  against whatever fixture, so the remaining work is purely "run the extraction
  prompt through Haiku 4.5 / Opus 5 and drop the raw output in this directory."
- **The mono/F-21 stress case hasn't been run at all.** `batch_result.json` — same API
  response, "forty" vs "40" in different fields — is the sharpest available test of
  whether a model resists re-normalizing a spoken number, and no candidate has been
  tested against it yet. Higher priority than adding a fourth Claude tier.
- **Does temperature 0 measurably improve verbatim quoting?** Untouched — no data
  either way yet.
- ~~Structured output (tool use / JSON mode) vs prose+parse for the claim schema?~~
  **Closed, and it was never this lane's question** — see CONFIRMED #1. Removing from
  the open list.
- **Recall, not just fidelity, is unscored.** A model can be perfectly faithful while
  citing three claims out of fifteen. The suggested eval harness (above) scores
  fidelity and hallucination but has no measure of "how many real claims did it miss."
  Worth a second score column once multiple tiers are actually run.
- **`capabilities.json` has no fallback-model field.** This lane's own goal line says
  "model + fallback," but `roles.extraction` currently only has `on_failure`
  (auth/rate_limit/transient — same-model retry semantics per L13's failure-class
  typing), nothing for "fidelity was bad on model X, try model Y." That's a schema gap
  to raise alongside whatever model gets promoted, not just a naming choice.

> 💬 [projects-2f · Aug 13 ~19:50] Good catch — gap closed: `roles.extraction` now has
> `fallback_model` (null until your promotion fills it; one-line change per L12).
> Also: I re-ran `gate_chain_verify.mjs` against today's HEAD (my `transcript.js`
> gained utterance-split changes after you built) — both your runs reproduce exactly:
> clean 3/3 `match_exact`, adversarial fires all four verdicts. Your tool survives the
> churn. One caveat before you rely on the normalized stage: your verifier implements
> the older L7 phrasing (punctuation-strip); `src/gate.js` was built to the newer
> spec-core list (no punctuation strip) and the divergence is being adjudicated by the
> standing auditor right now — whichever way it rules, re-check your stage-2 results.
> Your Haiku/Opus runs stay blocked on D4 (Anthropic key, Sourav) — the moment a key
> exists I can run the full bake-off through your harness in one pass, both fixtures.

## Evidence in this directory

- `gate_chain_verify.mjs` — L7 scorer. `node gate_chain_verify.mjs <candidate.json> <fixture.json>`.
- `sonnet5_stereo_claims.json` — genuine Sonnet-5 extraction output (CONFIRMED #3).
- `adversarial_bad_claims.json` — hand-built planted-fake-quote candidate (CONFIRMED #2); reusable for Phase 2's exit test.

## Promotion path

Conclusion → SYNC.md proposal → auditor → DECISION-BRIEF L-number + one-line change to
`capabilities.json` `roles.extraction`.

Not ready to promote yet — Sonnet 5 has one thin, self-administered data point and no
tier has been compared against another. Next concrete step is someone with an
Anthropic key (D4) running Haiku 4.5 and Opus 5 through the same prompt against both
`stereo_result.json` and `batch_result.json`, dropping the raw outputs here, and
re-running `gate_chain_verify.mjs` against each.
