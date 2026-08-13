# TASKBOARD — who owns what, right now

Rules: pull first · claim before you touch (a claim counts when PUSHED) · one owner per
area · `done` requires fresh evidence. History lives in `team/SYNC.md`, not here — rows
state **current truth only**.

> **Gate status (Aug 13 evening): product-code build is GATED.** Two things open it:
> the lane-10 model bake-off result, and Sourav's explicit go. Research lanes and planning
> docs are active. When the gate opens, work runs as the vertical slices below
> (`team/plans/master-plan.md` governs; `team/plans/build-orchestration.md` = who does what).

## Done — foundation (evidence in SYNC)

| Work | Evidence | Owner |
|---|---|---|
| Repo skeleton: key-mint w/ 401 re-mint (L14), capabilities.json, MIT/SECURITY, gitleaks CI | cold `npm start` minted live key, `/voices` → 144; approved | projects-2f |
| Ingest → canonical transcript (L1–L4): stereo + mono utterance layer, golden tests | `npm test` 11/11 fresh Aug 13 evening; live e2e on call.wav; **approved by Sourav ~15:05 ("keep as-is, no audit")**, committed `36e8ce2` | projects-2f |
| Research 00–05 + audit lineage + master plan + operative design docs | see `team/plans/INDEX.md` | hackathon |

## Build slices — GATED, unclaimed until the gate opens

| Slice | Scope (master-plan §build-start) | Est | Exit gate |
|---|---|---|---|
| Hour-zero probes | numerals param, explicit `channel:true`, long-audio segmentation, 3-voice mono | 30m | last API unknowns closed, fixtures committed |
| 1. Walking skeleton | one fixture call → one extractor → FULL receipts gate + injection screen (test-first) → minimal notes page w/ ONE click-claim→highlight→audio interaction → run manifest | ~3h | planted fake quote visibly demoted on screen; `npm test` green offline |
| 2. Width | remaining P1 extractors + trackers + email-from-verified-claims-only + budget governor + exports + score-critical fixtures (negation, coverage, dual-mono, digit-fold) | ~2.5h | fixture suite green |
| 3. Content + trust | DEAL-STATE.md + 5 scripted 1:1 calls + stereo TTS + planted injection call + golden-call labels + DATA-FLOW.md + public README | ~3h | cross-call search finds planted facts |
| 4. Demo hardening | cached demo path FIRST, 90s backup recording, 3 stage numbers, ≥10 logged rehearsals, room-audio + projector checks | ~3h | full run in airplane mode |

## Research lanes — ACTIVE now

| Lane | Owner | Status |
|---|---|---|
| R-10 `research/10-reasoning-model/` — quote-fidelity model bake-off | **Saritha** | **CRITICAL PATH — the last planning dependency; empty so far.** Her result picks the extraction model and opens the build gate (with Sourav's go) |
| R-11 `research/11-competitive-intel/` — wedge receipts, kill-lines | **Aakash** | anarlog teardown filed + synthesis ruled; Gong-screenshot capture + remaining findings pending |

## Open lanes — unclaimed, grab one (or invent your own)

Take the next free number, create `research/NN-name/FINDINGS.md` (copy lane 10/11's
structure), claim here with a pushed commit. You need evidence, not permission.

| Lane seed | Why it matters |
|---|---|
| Sandbox daily-cap + key-mint throttling numbers | budget governor + HN-load survival (brief §5) |
| Real dual-channel recording hunt (D3) | a genuine JustCall stereo export proves the happy path before we claim it on stage |
| Voice catalog curation | which `/v1/voices` personas make the 5 sample calls sound real + flaky-voice fallback list |
| Stranger recruit for the cold-clone test | Slice-4 exit needs a human who didn't build it, timed |

## Open human decisions (Sourav only — don't block Slice 1)

D1 name/trademark escalation · D2 deal arc as 1:1 calls · D3 real dual-channel recording ·
D4 Anthropic key + spend cap · D5 owner assignments.

---
**Build-facts reminders (research/00 — do not relearn the hard way):** batch jobs API only ·
diarization is channel-based (stereo one-speaker-per-channel; mono never splits) · canonical
text from `segments[]`, never `result.text` · extraction LLM is external Anthropic
(pyai-nova is a stub) · sandbox keys ~7-day expiry, self-mint (`POST /v1/sandbox/keys`).
