# SCORECARD — pre-judging self-grade (predicts the judges' /100; condensed operative version)

Rules: bands 🟢 full / 🟡 half / 🔴 zero weight. 24 items auto-graded by `npm run scorecard` (to build, ≤90s offline); 6 human. Category totals mirror judge weights exactly. Grade twice: **C1 mid-build (exists to CUT)** and **C2 Fri 15:00 (exists to FREEZE; hard stop 15:45, after which only pre-listed recoveries)**.

## Product pull /30
| Item | Target | Grader |
|---|---|---|
| Ambiguity traps (12 planted terms) | typed correctly or confidence:low; ANY confident-wrong = red | auto |
| Negation/hypothetical/reported traps (9) | 0 claims asserted from trap lines | auto |
| Coreference (6) | referent named + establishing line cited, else demoted | auto |
| Context windows | 100% of claims render prev/next; sarcasm fixture reads right | auto+Aakash |
| Absence honesty | quiet call → ≥3 coverage records, 0 fake claims | auto |
| **Precision on golden call ≥90%** (n≥8) | needs `labels.json` — UNOWNED, red-by-default until assigned | auto |
| Degradation (mono/noisy/non-English) | labeled inferred / warned / named refusal | auto |
| **Cold clone → cited claim ≤5:00, zero keys** | stranger, stopwatch, README only | stranger |
| No-bot line above fold; banned phrases = 0 | grep | auto |

## Demo magnetism /25
| Item | Target | Grader |
|---|---|---|
| **Click→audio ≤300ms median (10 clicks), ≥10 logged rehearsals** | perf log + REHEARSALS.md | Sourav |
| Both refusal states IN COMMITTED demo bundle by Fri 15:00 | demoted fake claim + labeled quarantined injection | auto+SM |
| Airplane-mode full run = clean pass | every beat, wifi off | Sourav |
| 3 planted cross-call searches hit in ≤2s | auto | auto |
| Dry-run checklist 5/5 (silence over audio, never-cut beats, ≤slot−60s) | 17:00 dry run | Aakash |

## API gravity /20
minutes both directions ≥3600s each in run records (auto) · 0 manual steps to first authed 200 (stranger) · new-extractor → 5-call re-run ≤120s one command (auto) · cost/call ≤$0.10 READ FROM run record, 100% stamped (auto).

## Loop depth /15
6 adversarial quotes each land correctly, 0 digit-folds accepted (auto) · fabricated-ID → whole response rejected (auto) · injection: in transcript=1, in email=0, in exports=0, raw script tags=0 (auto) · README names 3 limits + dropped-count in footer (auto) · kill-9 sweeper + $0.001-budget refusal with 0 fetches (auto).

## Craft /10
8 self-describing fields on 100% of claims (auto) · stable IDs, no vendor GUIDs, crm_map present (auto) · re-run appends never overwrites (auto) · 0 prod deps + tests pass offline (auto) · F-21 fixture + `result.text` grep in src = 0 (auto) · gitleaks 0 + upload-validation 3/3 + CI green (auto) · DATA-FLOW rows == fetch sites, every file:line resolves, "you'll hate this if" present (auto).

## Gates (override arithmetic — how judges actually behave)
- **A (demo spine):** click→audio red OR airplane red → Demo capped 12/25, total capped 65.
- **B (honesty kill switch):** any banned phrase or undocumented network call → **Craft = 0**.
- **C (trust floor):** precision <80% or no labels → Product capped 15/30.

## Calibration: at C2, Aakash writes a BLIND guess of the judges' score before seeing ours. |delta| > 10 → the scorecard is miscalibrated; fix the bands, log both numbers.

## Most-likely reds + pre-authorized recoveries: labels.json missing (label ONE real call, 30 min, Sourav) · click latency (preload+decode; fallback pre-cut 6s WAVs) · cost not stamped (usage + price table, 20 min) · re-run loop (15-line registry loop on 2 calls; if dead, DELETE the compounding claim from the pitch) · cold-clone key wall (cached demo = default npm start; live = --live).
**Unowned tasks that make 15 points red by default: golden-call labels (Sourav) + stranger recruit (by Fri 14:00).**
