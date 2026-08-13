# SYNC — cross-session coordination log

> **Canon precedence:** `DECISION-BRIEF.md` is the spec. L1–L19 are evidence-locked; changes route through the standing auditor (via the hackathon session). This file logs coordination and decisions only — it never forks the spec. Then: `research/00-api-probe/FINDINGS.md` (+ addendum) → `research/01–05` → `audit/`.

**Sessions:**
- `hackathon` — spec/integration owner (proposed, pending D5), auditor relay, API probes + fixtures lineage
- `projects-2f` — fresh build session (Sourav, Aug 13 ~13:00): Phase 0 skeleton + Phase 1 ingest, claim on the board to start
- ~~`marketing`~~ — REMOVED from this project per Sourav (Aug 13 ~13:05): today's only focus is the hackathon; the JustCall-marketing session does not participate or edit this repo

**Conventions:** log every decision below with the L-number(s) it touches. Format: `date · who · decision · L-refs`.

---

## Decision log

- 2026-08-13 evening · cleanup/coherence agent · **CORRECTION, not a decision:** the
  ~14:10 entry below states Phase-1 (`src/{ingest,transcript}.js` + tests) was "left
  UNCOMMITTED per freeze order." That is stale — `git log` shows all four files were
  swept into commit `36e8ce2` ("Fold Aakash findings...; commit master plan") when the
  master plan's "PUSH EVERYTHING NOW" step ran. The code is now in the repo on `main`.
  The formal APPROVE/REJECT checkbox in `team/plans/phase-1-ingest.md` was never
  explicitly marked — Sourav should confirm whether the commit itself counts as approval.
  History below is left unedited; this entry is the correction. Added START-HERE.md,
  `team/plans/INDEX.md`, `research/README.md` and fixed the stale digit-folding note in
  `research/00-api-probe/FINDINGS.md` (L7 correction) in the same pass — see the agent's
  final report for the full file list. · L-refs: none (process/hygiene)

- 2026-08-13 ~16:30 · hackathon (per Sourav) · Aakash's preliminary findings folded in (research/11: two inbox files + SYNTHESIS.md with the PM-spec ruling — receipts foundation kept, action layer adopted on top, pasted-transcript ingestion rejected for API-gravity reasons). Master plan committed at team/plans/master-plan.md (8-stage roadmap, Stage-2 v2 sub-parameters, Stages 5/6 designs, 3 mechanisms deep in v1, real-call calibration directive, privacy rule for the SDR CSV). Pushing all planning artifacts to origin per Sourav; isolated cleanup/coherence agent runs next; BUILD REMAINS GATED (Saritha bake-off + Sourav final gate). · L-refs: L5, L8, L12, L15, L18

- 2026-08-13 ~16:00 · projects-2f (filing for hackathon teardown agent) · anarlog/Hyprnote teardown receipts FILED as CONFIRMED in research/11 (Aakash's lane — he hadn't claimed yet, so filed directly per relay; he inherits and promotes). Headline: citation is architecturally impossible in their enhance path (only {text, speaker} reaches the prompt), yet they built a working evidence-ID citation engine and pointed it at speaker labeling — "provenance as a diarization problem, not a trust problem." Also: demo-plan constraint noted in phase-3-ui.md (never cut click→highlight→audio / uncorroborated bucket / injection line; tier-1 export is the de-risk). · L-refs: supports the §1 wedge; L17

- 2026-08-13 ~15:45 · projects-2f (per Sourav) · REPO HYGIENE PASS for incoming teammates + their LLMs: PROTOCOL.md rewritten v1.0 (adopted; humans in roster; session-genealogy noise removed; pull-before-claim; A1/A2 folded in), internal README.md added (state banner + reading order + repo map; clearly NOT the public launch README), TASKBOARD gains a freeze banner so no fresh LLM builds from stale phase rows (research lanes marked exempt), CLAUDE.md auditor-routing made repo-native (comments+SYNC, not cross-session messaging), phase-1-ingest.md now states its files are invisible to cloners until approved. Historical log entries left untouched — history is history. · L-refs: none (process)

- 2026-08-13 ~15:20 · projects-2f (per Sourav) · REMOTE IS LIVE: https://github.com/souravmohanty-web/opengong-lite (private). From now on a claim counts when PUSHED; pull before claiming. Teammates get invited by GitHub handle, then follow team/ONBOARDING.md. Heads-up from hackathon session logged: master plan will replace horizontal phases with VERTICAL SLICES (Slice 1 = walking skeleton incl. minimal one-interaction viewer); phase-1/phase-3 doc reconciliation HELD until the master plan lands; failing-test-first Iron Law will apply (escaping tests before escaper). · L-refs: none (process)

- 2026-08-13 ~15:00 · projects-2f · Phase-3 blueprint written (planning artifact, freeze respected): team/plans/phase-3-ui.md — one-viewer/three-fuel-lines architecture, 7-state claim→line→audio interaction machine, export writers, tier-2 fragment codec w/ 1,500-char threshold, 5-layer escaping strategy incl. the </script> inline-JSON trap, 10 fixture-driven tests, 5.5h estimate w/ named cut order. 3 open questions flagged for auditor/Sourav (server-vs-file app mode, coverage thresholds, injection demo badge). Grounded in research/02 measured numbers. · L-refs: L4, L6, L7, L10, L11, L17, L19

- 2026-08-13 ~14:30 · projects-2f (per Sourav) · REMOTE COLLAB SCAFFOLDING: root CLAUDE.md (auto-onboards any teammate's Claude session), team/ONBOARDING.md (the pebble loop: claim → find → share → promote → build), research lanes 10 (Saritha, reasoning model — eval criterion is QUOTE FIDELITY per L6, not eloquence) and 11 (Aakash, competitive intel) seeded with the locked constraints they build on. Board gains R-10/R-11 rows; research lanes are exempt from the build freeze (freeze covers code only). Next: push to a private GitHub remote (Sourav choosing account) + invite teammates. · L-refs: L5, L6, L9 (lane 10 constraints); L11, L17, L18 (lane 11 constraints)

- 2026-08-13 ~14:10 · projects-2f · FREEZE ACKED, all code work halted. State at freeze: Phase 1 was already functionally complete — src/{ingest,transcript}.js + test/{transcript.golden,ingest}.test.js in working tree, UNCOMMITTED (left per freeze order); `npm test` 11/11 before the freeze arrived; live e2e verified (call.wav → mono, 2 utterances). ⚠️ CONFLICT FLAGGED: Sourav told projects-2f directly at ~13:45 "Lets do it. whatever is required for next steps" — that green light predates the ~14:05 freeze relay, so the freeze wins on recency, but Sourav is being asked in the projects-2f terminal to confirm which instruction stands. Phase-1 review doc (plan-mode artifact) at team/plans/phase-1-ingest.md for his approve/reject. · L-refs: none (process)

- 2026-08-13 ~14:05 · Sourav (via hackathon) · **BUILD FREEZE — plan mode only, both sessions.** Sourav has not approved the build; hackathon session's "Phase 0 ready" call was premature and is retracted. No code work until explicit green light. Built code stays as-is (no reverts); projects-2f to pause Phase 1 and mark its own board rows. Planning artifacts are allowed. · L-refs: none (process)

- 2026-08-13 ~13:50 · projects-2f · Phase 0 DONE (evidence on board; fresh run this session: `npm test` 3/3, cold `npm start` minted live key + authed `/voices` 144 voices, warm reuse verified). Phase 1 ingest now in progress. Notes: minted key persists to `sandbox.pyai_key` (already gitignored via `*.pyai_key`, verified with `git check-ignore`); 401→re-mint only for `pyai_test_*` keys and only when PYAI_API_KEY is unset; 429 mapped to named exit PYAI_DAILY_CAP. · L-refs: L12, L13, L14, L19
- 2026-08-13 ~13:45 · Sourav (via projects-2f) · Slack connector added; hackathon team talks in the `electron` group — projects-2f will monitor it (read-only MCP) and relay relevant decisions here. · L-refs: none (process)

- 2026-08-13 ~13:30 · projects-2f · CLAIMED Phase 0 (in-progress) + Phase 1 (queued). Onboarding read in order (brief → protocol → board → findings+addendum). Phase-0 file surface: package.json, LICENSE, SECURITY.md, .env.example, capabilities.json, src/{index,pyai,keystore}.js, .github/workflows/ci.yml — no other files will be touched. · L-refs: L12 (capabilities.json), L14 (key-mint + 401 re-mint), L19 (MIT/SECURITY/gitleaks)

- 2026-08-13 ~13:15 · hackathon · PROTOCOL.md ADOPTED w/ amendments A1 (auditor relay for L-changes + pre-merge review) and A2 (commit-per-completed-task). P-1 executed: `git init -b main`, baseline commit `5d24bd6` (evidence: `git log --oneline`, run fresh). · L-refs: none (process)
- 2026-08-13 ~13:15 · hackathon (relaying Sourav) · ROSTER: partner session is fresh `projects-2f`; marketing session removed from project; Phases 0–1 reassigned to projects-2f; Phase 0 marked ready (git done, D1 gates only the public name). · L-refs: L14 (key-mint flow now Phase-0 scope)
- 2026-08-13 · marketing session · Created team/ scaffolding (SYNC.md + TASKBOARD.md seeded verbatim from the brief §3 build-order table). No build started; Phase 0 gated on D1–D5. · L-refs: none (process only)
- 2026-08-13 · hackathon session (relayed) · Guardrail adopted: nobody starts Phase 2+ until the gate-chain owner is named (D5). · touches L-gate chain ownership
- OPEN · Sourav · D1 name/trademark (raise with organizers) · D2 deal-arc → 1:1 calls (2-speaker stereo cap) · D3 real dual-channel recording · D4 Anthropic key + spend cap · D5 owner assignments incl. split confirmation
