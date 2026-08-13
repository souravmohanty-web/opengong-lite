# TASKBOARD — seeded from DECISION-BRIEF.md §3 (the build order IS the task taxonomy)

Status values: `blocked` / `ready` / `claimed:<session>` / `in-progress:<session>` / `done (exit test passed)`

| Phase | Hours | Deliverable | Exit test | Status | Owner |
|---|---|---|---|---|---|
| 0. Skeleton | 1 | Repo, LICENSE, key-mint flow, committed fixtures, `capabilities.json`, gitleaks CI | `npm start` mints a key cold | **done (exit test passed)** — cold `npm start` minted `pyai_test_…FDCw` live, `/voices` → 144, warm restart reuses key; `npm test` 3/3 | projects-2f |
| 1. Ingest | 3 | Upload → job → poll → canonical transcript (stereo happy path + mono fallback layer) | Golden tests against fixtures pass | **paused: build freeze** (~14:05). State: code COMPLETE in working tree, UNCOMMITTED per freeze order. Exit test had already passed pre-freeze (`npm test` 11/11 incl. 5 golden tests; live e2e: call.wav → job_a8k3kaat9eKU8ljSHWpsaMc4 → mono, 2 utterances). Awaiting Sourav's call. | projects-2f |
| 2. Extraction + gate | 5 | Extractor registry, LLM calls, full gate chain, run records, named exits, budgets | Planted-fake-quote test lands in uncorroborated bucket | **blocked: gate-chain owner unnamed (guardrail)** | unassigned |
| 3. Notes UI + receipts | 5 | Notes page: click claim → highlight segment → play timestamp; exports; share tiers 1–2 | The "oh damn" interaction works | blocked: Phase 2 | unassigned |
| 4. Content + trust | 4 | DEAL-STATE.md + 5 scripted calls + stereo TTS, DATA-FLOW.md, README | Cross-call search finds planted facts | blocked: D2 (deal arc) | unassigned (content owner = D5) |
| 5. Hardening + demo | 4 | Injection demo beat, cached demo path, screenshot/clip, stranger runs setup cold | 5-min setup verified by a stranger | blocked: Phases 2–4 | unassigned (demo owner = D5) |
| Buffer | ~6 | Absorbs whatever the plan got wrong | — | — | — |

**Standing auditor orphan findings (route via hackathon session):**
- F-4: prompt-injection threat model needs a named owner (→ D5)
- Uncorroborated-bucket coverage thresholds need a decision

**Build-facts reminders (from research/00, do not relearn the hard way):** batch jobs API only · diarization is channel-based (stereo one-speaker-per-channel; mono never splits) · canonical text from `segments[]`, never `result.text` · extraction LLM is external Anthropic (pyai-nova is a stub) · sandbox keys ~7-day expiry, mint your own (`POST /v1/sandbox/keys`, empty body).
