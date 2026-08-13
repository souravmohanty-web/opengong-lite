# START HERE — OpenGong Lite

One page. Read this before anything else in the repo.

## What this is

OpenGong Lite is an open-source "Gong killer" built for a PyAI hackathon: upload a sales
call recording and get extracted deal notes — summary, objections, next steps — where
**every claim cites the exact transcript line it came from, verified in code, not just
asked for in a prompt.** That receipts gate (a claimed quote must re-anchor into the
stored transcript or it gets visibly demoted, never silently shipped) is the wedge, the
moat, and the demo moment. Positioning: self-hosted app + hosted inference (PyAI speech,
Anthropic extraction) — never "fully local/private." Demo is Friday 6pm.

## Current state (as of 2026-08-13 evening)

**Research and planning are complete. The build is IN FLIGHT — Slice 1 (walking
skeleton), gate opened by Sourav Aug 13 ~17:20.** 6 research artifacts + 8+ audit rounds
done, evidence-backed. `DECISION-BRIEF.md` is the single merged spec (19 locked decisions,
L1–L19); `team/plans/master-plan.md` + `build-orchestration.md` govern the build (vertical
slices, test-first, adversarial audit at slice boundaries). Landed: key-mint skeleton,
ingest → canonical transcript, minimal receipts viewer + app server (`npm run demo` —
cached, offline, zero keys). In flight: the gate/extraction stack. The extraction model
defaults to claude-sonnet-5; the lane-10 bake-off result is a one-line config change (L12).
Work is claimed on `team/TASKBOARD.md` — claim before you touch.

Do not trust this paragraph blindly — the live state lives in `team/SYNC.md`, always. This
file is oriented as of the date above; SYNC.md's top entry is oriented as of *now*.

## Reading order

1. **`team/SYNC.md`** (top entries) — the running decision log. Always read this first;
   it tells you whether the freeze is still on and who owns what right now.
2. **`DECISION-BRIEF.md`** — the spec. 19 evidence-locked decisions (L1–L19, do not
   relitigate without new evidence), the build order, and 5 open decisions (D1–D5) that
   are Sourav's alone to close.
3. **`team/plans/master-plan.md`** — the staged roadmap and the build-start ruling. The
   umbrella document; everything else in `team/plans/` is one of its appendices — see
   `team/plans/INDEX.md` for which section each file serves.
4. **`team/PROTOCOL.md`** — how the team works. The Iron Law: no edits to files another
   person/session has claimed on `team/TASKBOARD.md`; claim before you touch.
5. **Your lane** — `team/TASKBOARD.md` for open lanes, or your `research/*/FINDINGS.md`
   if you already have one.

Using Claude Code? Open a session in this directory — `CLAUDE.md` bootstraps it with all
of the above automatically.

## Repo map

| Path | Purpose |
|---|---|
| `DECISION-BRIEF.md` | The spec — 19 locked decisions (L1–L19), build order, 5 open decisions (D1–D5). |
| `README.md` | Internal team README (state banner + repo map) — **not** the public launch README, which doesn't exist yet. |
| `CLAUDE.md` | Session bootstrap — auto-onboards any Claude Code session opened here. |
| `capabilities.json` | Role → model map (transcription / extraction / tts); extractors declare roles, never models (L12). |
| `package.json` | Node ≥22, `npm start` / `npm test`. |
| `.env.example` | Env var template (PyAI / Anthropic keys) — never commit a real key. |
| `LICENSE`, `SECURITY.md` | MIT license; vulnerability disclosure + the "sandbox keys are low-severity to leak" note. |
| `.github/workflows/` | CI — gitleaks secret scanning. |
| `src/` | Build in flight: key mint (`pyai.js`, `keystore.js`, `index.js`), ingest (`ingest.js`), transcript builder (`transcript.js`), receipts viewer (`viewer.js`, `viewer.html`), app server (`server.js`). Claim on the taskboard before modifying. |
| `test/` | Tests for `src/` — golden fixtures + unit tests. |
| `research/` | Audited research lineage (`00`–`05`) + two open research lanes (`10`, `11`). Hard-won, verified facts — do not re-derive them. See `research/README.md`. |
| `research/00-api-probe/` | Lane Zero — live PyAI API probes, raw responses committed as fixtures. Ground truth behind L1–L4. |
| `research/10-reasoning-model/` | Saritha's lane — extraction-model bake-off (quote-fidelity eval); feeds `capabilities.json` `roles.extraction`. |
| `research/11-competitive-intel/` | Aakash's lane — competitive receipts, Gong/anarlog teardowns, the PM product-spec synthesis ruling. |
| `audit/` | Standing-auditor log — **append-only**, read but never edit: `audit-log.md` (verdicts A-001+), `framework.md`, `unlearn.md`. |
| `team/` | Team workspace — protocol, onboarding, taskboard, sync log, scorecard, `plans/`. |
| `team/plans/` | Operative design docs, each an appendix to `master-plan.md`. See `team/plans/INDEX.md` for status + which stage each serves. |

## Who's who

| Who | Role | How to reach |
|---|---|---|
| Sourav | Lead. Breaks ties, owns open decisions D1–D5, approves phase/slice gates | Slack `#electron` |
| Saritha | Reasoning-model lane (`research/10-reasoning-model/`) | Slack `#electron` |
| Aakash | Competitive-intel lane (`research/11-competitive-intel/`) | Slack `#electron` |
| `hackathon` | Claude session (Sourav's machine): spec/integration, standing auditor, API-probe lineage | via Sourav |
| `projects-2f` | Claude session (Sourav's machine): build lanes + repo hygiene | via Sourav |
| Your Claude session | Reads root `CLAUDE.md` on open and follows `team/PROTOCOL.md` automatically | — |

Full protocol (Iron Law, comment convention, commit rules, verification rule) is in
`team/PROTOCOL.md`. Full contribution loop (claim → find → share → promote → build) is in
`team/ONBOARDING.md`.
