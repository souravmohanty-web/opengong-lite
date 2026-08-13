# TASKBOARD — seeded from DECISION-BRIEF.md §3 (the build order IS the task taxonomy)

> ⚠️ **BUILD FREEZE (Aug 13): do NOT start code work from these rows.** Sourav requires
> master-plan approval first, and the phase rows below are being restructured into
> vertical slices. Research lanes (R-10, R-11, open lanes) are EXEMPT and active.
> Check `team/SYNC.md` top entries for the current gate.

Status values: `blocked` / `ready` / `claimed:<session>` / `in-progress:<session>` / `done (exit test passed)`

> **CORRECTION (cleanup pass, 2026-08-13 evening):** the "Ingest" row below says the
> Phase-1 code is "UNCOMMITTED per freeze order." That is no longer true — `git log --
> src/ingest.js src/transcript.js test/ingest.test.js test/transcript.golden.test.js`
> shows all four files landed in commit `36e8ce2` ("Fold Aakash findings...; commit master
> plan"), part of the master plan's "PUSH EVERYTHING NOW" step. The row text is left as-is
> below (history, not rewritten) — treat the commit as the current fact and `team/SYNC.md`
> top entries as the live status; the formal APPROVE/REJECT decision in
> `team/plans/phase-1-ingest.md` was never explicitly checked off even though the files
> are now in the repo.

| Phase | Hours | Deliverable | Exit test | Status | Owner |
|---|---|---|---|---|---|
| 0. Skeleton | 1 | Repo, LICENSE, key-mint flow, committed fixtures, `capabilities.json`, gitleaks CI | `npm start` mints a key cold | **done (exit test passed)** — cold `npm start` minted `pyai_test_…FDCw` live, `/voices` → 144, warm restart reuses key; `npm test` 3/3 | projects-2f |
| 1. Ingest | 3 | Upload → job → poll → canonical transcript (stereo happy path + mono fallback layer) | Golden tests against fixtures pass | **paused: build freeze** (~14:05). State: code COMPLETE in working tree, UNCOMMITTED per freeze order. Exit test had already passed pre-freeze (`npm test` 11/11 incl. 5 golden tests; live e2e: call.wav → job_a8k3kaat9eKU8ljSHWpsaMc4 → mono, 2 utterances). Awaiting Sourav's call. | projects-2f |
| 2. Extraction + gate | 5 | Extractor registry, LLM calls, full gate chain, run records, named exits, budgets | Planted-fake-quote test lands in uncorroborated bucket | **blocked: gate-chain owner unnamed (guardrail)** | unassigned |
| 3. Notes UI + receipts | 5 | Notes page: click claim → highlight segment → play timestamp; exports; share tiers 1–2 | The "oh damn" interaction works | blocked: Phase 2 | unassigned |
| 4. Content + trust | 4 | DEAL-STATE.md + 5 scripted calls + stereo TTS, DATA-FLOW.md, README | Cross-call search finds planted facts | blocked: D2 (deal arc) | unassigned (content owner = D5) |
| 5. Hardening + demo | 4 | Injection demo beat, cached demo path, screenshot/clip, stranger runs setup cold | 5-min setup verified by a stranger | blocked: Phases 2–4 | unassigned (demo owner = D5) |
| Buffer | ~6 | Absorbs whatever the plan got wrong | — | — | — |
| R-10. Reasoning-model lane | — | Extraction model bake-off → `capabilities.json` roles.extraction + L-decision | Quote-fidelity eval run against fixtures, results as fixtures in lane dir | ready (research lanes exempt from build freeze) | Saritha (`research/10-reasoning-model/`) |
| R-11. Competitive-intel lane | — | Wedge receipts, README "hate this if" boundaries, demo beats | Claims sourced w/ evidence files; OSS prompt-wish receipts found | ready (research lanes exempt from build freeze) | Aakash (`research/11-competitive-intel/`) |

## Open lanes — unclaimed, grab one (or invent your own)

Anyone can open a lane: take the next free number, create `research/NN-name/FINDINGS.md`
(copy the structure of lane 10/11), claim it here with a pushed commit. You do NOT need
permission — you need evidence. Seeds worth grabbing (from brief §5 + audit orphans + D-items):

| Lane seed | Why it matters |
|---|---|
| Long-audio segmentation probe | Is 1-segment-per-file a short-file artifact? Ingest utterance layer depends on it (brief §5) |
| Sandbox daily-cap + key-mint throttling | Demo-day budget governor + HN-load survival need the real numbers (brief §5) |
| Hinglish / accent WER on pyai-hear | Our own sales calls are the demo; if WER tanks, demo scripts must dodge it (brief §5) |
| Prompt-injection threat model | Orphan finding F-4 — needs a named owner; feeds the L17 demo beat |
| Real dual-channel recording hunt | D3 — a genuine JustCall stereo export proves the happy path before we claim it on stage |
| Demo-day run-of-show | Script the 6pm Friday demo: beats, timings, fallback if wifi dies (L17 cached path) |
| Voice catalog curation | Which /v1/voices personas make the 5 sample calls sound real; flaky-voice fallback list |

**Standing auditor orphan findings (route via hackathon session):**
- F-4: prompt-injection threat model needs a named owner (→ D5)
- Uncorroborated-bucket coverage thresholds need a decision

**Build-facts reminders (from research/00, do not relearn the hard way):** batch jobs API only · diarization is channel-based (stereo one-speaker-per-channel; mono never splits) · canonical text from `segments[]`, never `result.text` · extraction LLM is external Anthropic (pyai-nova is a stub) · sandbox keys ~7-day expiry, mint your own (`POST /v1/sandbox/keys`, empty body).
