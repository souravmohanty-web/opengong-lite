# Control Room — internal ops & optimization console (NOT end-user; operative design, 2026-08-13)

Purpose: one internal surface where the TEAM watches quality, cost, latency, and outcome-correlation — and knows, by threshold, when the system needs optimization vs when it's holding. End users never see this; it's `npm run control-room` (a local static page reading `runs/`, `evals/`, and the outcomes file — zero new infra, zero deps, same viewer idiom). It stays in the open repo (ops tooling is a Harness/Craft credibility bonus) but out of every end-user flow.

## Panels & metrics (all sourced from data we already log)

### 1. Quality
- **Gate pass-rate** per run + 7-day trend: % exact / normalized / segment_corrected / uncorroborated. The single most important internal number (it IS the on-stage stat).
- **Interpretation-confidence mix** (high/medium/low) + top firing context_flags (negation, hedges, unit_unresolved…). A spike in one flag = a prompt or lexicon problem, localized.
- **Precision vs golden labels** (from the labeled real call(s)) — re-scored on every prompt/model change.
- **Feedback score** (from the background evals loop): mark-wrong rate per extractor; new wrong-marks since last review.
- **Triage health**: mismatch rate (flagged-but-empty, claim-outside-spans) + shadow-sample false-negative rate.

### 2. Outcome correlation (Sourav's "score a call → last deal stage" threshold)
- Join per-call signals (momentum direction, qualification signals, objection-resolution rate, next-step concreteness) to the outcomes file (`deal_stage`, `deal_amount` — real data available from the SDR CSV, local only).
- **Threshold contract, explicit:** e.g. "calls scoring ≥T should reach stage ≥S within N days at rate ≥R%." Each contract is a row: `{signal, threshold, expected, actual, window, status: HOLDING | DRIFTING | BROKEN}`.
- **On breach: propose, never auto-change** — DiscoveryClaude v5.3's reconciliation pattern, inherited: ≥5 same-direction mismatches in the rolling window → the control room emits a written optimization proposal (which extractor/prompt/threshold, what evidence), a human accepts. Segmentable by industry/persona/deal-size once volume exists.

### 3. Performance & cost
- **Latency per stage** (upload→job, STT, extraction fan-out, gate, render; p50/p90) — the user-facing "spinner honesty" number.
- **Cost per call** (stamped, never estimated) + trend; token mix; **cache economics**: hit rate + `cache_misses_unexpected` (any nonzero = silent 2× bill, alarm).
- **Budget events**: degrade-ladder rungs fired, cost avoided by triage (the counterfactual ledger).

### 4. Reliability
- **Exit-reason distribution** (SHIPPED / PARTIAL / FAILED rates; any CRASHED = alarm) · repair + transport-retry counts per vendor · API error classes with request_ids · sandbox-key age (alarm at day 6 of 7).

### 5. Drift watch (cheap, high value)
- Same committed fixture re-run on schedule → claim diff vs last run. Any diff = model/prompt drift made visible BEFORE a customer or judge sees it. (Answers the guaranteed "same call tomorrow?" question with data, not a shrug.)
- Extractor health: per-extractor claim yield, schema-failure rate, avg evidence length — a dying extractor shows up here first.

## Threshold config (`control-room.json` — thresholds are data, not code)
Each metric row: `{metric, green, amber, red, named_action_on_red}`. Named actions are pre-authorized (same discipline as the scorecard): e.g. gate pass-rate red → "run traps suite; check canonical-text invariant; review last prompt change" · precision red → "flip gate to exact-only via config" · cache-miss alarm → "diff prefix hashes; find the invalidator" · correlation BROKEN → "emit reconciliation proposal."

## Build cost & phasing
- **v1 (hackathon, ~1.5h, background):** `npm run control-room` renders panels 1, 3, 4 from existing `runs/*.json` + evals file — it's an aggregation over data that already exists, one static page. Panel 5 fixture-rerun = one script + cron note. NOT on the demo's main path; a 10-second flash of it feeds the Harness trophy ("we watch our own system").
- **v2 (post-hackathon):** panel 2 outcome-correlation with real CRM sync (needs volume + the crm_map integration), auto-segmentation by industry/persona, scheduled reports.

## Iron law of the control room
```
THE CONTROL ROOM OBSERVES AND PROPOSES; IT NEVER SILENTLY CHANGES THE PIPELINE
```
Every optimization it suggests is a written proposal a human accepts — the same human-in-the-loop rule as the evals feedback cycle, at system level.
