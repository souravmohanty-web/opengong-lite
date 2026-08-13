# Token & Context Optimization — operative design (condensed, 2026-08-13)

## Six findings that change the build
1. **Timestamps in the prompt are waste**: `(mm:ss)` = 13.9% of the transcript block; model cites ids, code resolves times. Render `[U123] Prospect: text`. (5 min fix)
2. **Capacity is a non-issue**: 3h call = 22% of even Haiku's window. Chunking is never needed for capacity — only (maybe) for recall, gated on an eval. Correct research/03 corner case #17.
3. **THE CACHE TRAP**: N parallel extractors with identical prefixes ALL miss the cache and ALL pay the 1.25× write premium. Fix: fire extractor #1, await FIRST STREAM EVENT, then fan out the rest. **−44%/call.**
4. **Output dominates once caching works** (cached input = 0.1×). Span-slicing the transcript is a cost REGRESSION unless spans <10% of call. **Never slice; transcript block is always whole-call.** Span hints go in the uncached suffix, phrased permissively, zero gate authority.
5. **Triage ROI degrades with call length** (opposite of intuition). Rules: <4 min skip triage (too little signal); 4–30 min run it; >30 min run it for accuracy, stop claiming cost savings. Honest headline: "triage is cost-neutral and accuracy-positive."
6. **Cross-call system-prompt caching doesn't work** (800 tok < Sonnet 5's 1,024 minimum — silently no-ops) and would save $0.09/50 calls. Kill it. **Batch API's 50% saves $1.87/50 calls** — build that instead for ≥20 calls.

## Triage (Haiku, one whole-call read, ~$0.005-0.017)
Output: per-extractor `{present, spans[]}` (global utterance-id ranges) + call_type + roles + **entity candidates (feeds the glossary — its highest-value output: raises gate pass-rate)** + **coverage booleans (the ONLY whole-call absence testimony)** + notes. Guards: `summary`+`next_steps` ALWAYS run (never flag-gated); confidence <0.6 → run everything; triage failure → all flags true + `TRIAGE_DEGRADED`, never fatal. Asymmetry line in the prompt: false positive ≈ $0.008; false negative silently deletes a section.

## Cache mechanics (MUST)
Manual `cache_control` on the transcript block — NEVER top-level auto (auto caches per-extractor instructions = 6 separate writes = 2× bill). TTL 5m. Prefix must be byte-identical: no Date.now(), no run ids above the breakpoint. **Silent-miss assertion**: if `cache_read_input_tokens == 0` on a read-expected call, log CACHE_MISS_UNEXPECTED with prefix-hash diff (~15 lines; catches a silent 2× bill).

## Context ledger (in run.json)
One entry per LLM call: prefix composition + cache action + usage + cost + `decided_by (plan|triage_flag|budget_degrade|user_flag|fallback)` + why. Skipped calls log `cost_avoided_usd` — the counterfactual makes tiering demonstrable. Totals include `cache_misses_unexpected`.

## Degrade ladder (corrected — prefix contents are NOT a mid-run lever)
Mid-run prefix trimming invalidates the paid cache = ~100× cost increase. So: **Rung 0 (plan-time)**: project with count_tokens (free); if over budget compose smaller prefix from the start (drop deal-state, then glossary). **Rung 1**: skip optional extractors (risks→pricing→competitors→objections). **Rung 2**: cap output tokens (≥60% of nominal; truncation is never repairable). **Rung 3**: Haiku downgrade ONLY if ≥3 extractors AND transcript >3,300 tok (Haiku's cache minimum is 4,096 — below that the downgrade costs MORE). **Rung 4**: BUDGET_EXCEEDED, artifacts kept.

## Numbers (Sonnet 5 intro $2/$10; ×1.5 for list — README quotes list)
Per 20-min call, 6 extractors: uncached $0.111 → serialize-first cached **$0.062** → +triage pruning 2 $0.054. 50-call week: interactive-cached $3.19; **Batch API uncached $2.92; batch+cache $1.63.** Merged-single-call option ($0.032) REJECTED on the record: breaks L12 plugin surface, per-extractor repair, and failure granularity.

## Calibration (MUST, 20 min, hour zero): render the stereo fixture through the real renderer → `count_tokens` (free) → commit true TPW/prefix constants with the measurement command in a comment. Never tiktoken.
