# TASKBOARD — who owns what, right now

Rules: pull first · claim before you touch (a claim counts when PUSHED) · one owner per
area · `done` requires fresh evidence. History lives in `team/SYNC.md`, not here — rows
state **current truth only**.

> **Gate status: BUILD GATE OPEN (Sourav "go", ~17:20 Aug 13 — SYNC e8928df). Slice 1 in
> flight.** `team/plans/master-plan.md` governs scope; `team/plans/build-orchestration.md`
> governs how (builders deliver evidence, auditor breaks it, orchestrator merges).
> Bake-off does not block: extraction defaults to claude-sonnet-5; Saritha's result is a
> one-line config change later (L12).

## Done — foundation (evidence in SYNC)

| Work | Evidence | Owner |
|---|---|---|
| Repo skeleton: key-mint w/ 401 re-mint (L14), capabilities.json, MIT/SECURITY, gitleaks CI | cold `npm start` minted live key, `/voices` → 144; approved | projects-2f |
| Ingest → canonical transcript (L1–L4): stereo + mono utterance layer, golden tests | `npm test` 11/11 fresh Aug 13 evening; live e2e on call.wav; **approved by Sourav ~15:05 ("keep as-is, no audit")**, committed `36e8ce2` | projects-2f |
| Research 00–05 + audit lineage + master plan + operative design docs | see `team/plans/INDEX.md` | hackathon |

## Slice 1 — ACTIVE claims

| Task | Owner | Status |
|---|---|---|
| Gate/extraction stack: gate.js, injection.js, registry, prompt, llm, extract, run records | hackathon (builder subagents) | in-progress |
| Hour-zero probes (long-audio, dual-mono, numerals, 3-voice) | hackathon | in-progress |
| 4 defect fixes in kept code: stereo max-utterance split + time-sort (transcript.js), AbortSignals + scaled poll timeout (pyai.js), 429 Retry-After discrimination | **projects-2f** | **done** — test-first, 4 new tests in test/defects.test.js, `npm test` 22/22 |
| Minimal S1 viewer + local server (127.0.0.1:4317, Range/206): ONE click-claim→highlight→audio interaction, 4-state claim.status rendering | **projects-2f** | **done** — src/{viewer.js,viewer.html,server.js} + fixture bundle; 7 viewer tests (escaping first) 22/22; live server verified: `/` 200, `/bundle.json` 200, Range → `206 bytes 100-199/677600`; planted fake quote renders demoted, blocked_injection quarantined |
| Cached demo path: `npm run demo` replays committed fixtures, zero keys, offline (L17) | **projects-2f** | **done** — verified: boots cold, `/` 200, 4 claims served, Range 206; no network calls in the path |
| Slice-2: tier-1 self-contained HTML export (`node src/export.js <bundle>`) + A-007 mono residual fix | **projects-2f** | **done** — src/export.js + viewer inline-mode boot; escaped-inline-JSON breakout tested; invalid bundle fails at export time; 12KB real file generated; scoped suites 42/42 (full-suite run deferred: gate remediation mid-flight) |

## Build slices — roadmap

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
