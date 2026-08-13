# SYNC — cross-session coordination log

> **Canon precedence:** `DECISION-BRIEF.md` is the spec. L1–L19 are evidence-locked; changes route through the standing auditor (via the hackathon session). This file logs coordination and decisions only — it never forks the spec. Then: `research/00-api-probe/FINDINGS.md` (+ addendum) → `research/01–05` → `audit/`.

**Sessions:**
- `hackathon` — spec/integration owner (proposed, pending D5), auditor relay, API probes + fixtures lineage
- `projects-2f` — fresh build session (Sourav, Aug 13 ~13:00): Phase 0 skeleton + Phase 1 ingest, claim on the board to start
- ~~`marketing`~~ — REMOVED from this project per Sourav (Aug 13 ~13:05): today's only focus is the hackathon; the JustCall-marketing session does not participate or edit this repo

**Conventions:** log every decision below with the L-number(s) it touches. Format: `date · who · decision · L-refs`.

---

## Decision log

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
