# OpenGong Lite

**Open-source call intelligence with receipts: upload a sales call, get deal notes where
every claim cites the exact transcript line it came from — verified in code, never just
asked for in a prompt.** A claim whose quote can't be re-anchored into the stored
transcript is visibly demoted, never silently shipped.

> *Gong asks you to trust its summary. We show you the line.*

## The goal

Built for the PyAI hackathon (SaaS Labs, Aug 13–14 2026, demo **Friday 6pm**). The prize
is real: the winning build gets a **Week-1 public Show HN launch** under the Atoms AI org.
So everything here is built to survive two audiences — hackathon judges on Friday, and
strangers cloning it from Hacker News the week after.

Why this wedge: no open-source tool does claim-level citations for call notes (three tried;
all shipped prompt-wishes — asked the LLM to cite, never verified). Neither does the
incumbent: Gong's own call briefs don't cite. Receipts verified in code are the moat.

## Current state — one line

**Research ✅ · Planning ✅ · Build: GATED** — waiting on the extraction-model bake-off
(lane 10) and Sourav's final go. Foundation code (key-mint skeleton + ingest/transcript
builder) is committed and green: `npm test` → 11/11 (fresh, Aug 13 evening).

The always-current truth lives in **`team/SYNC.md`** (top entry) — trust it over any
static file, including this one.

## New here? (human or LLM)

Read **`START-HERE.md`** — one page: what/why, live-state pointer, reading order, repo map.
Then claim a lane on `team/TASKBOARD.md`. If you use Claude Code, just open a session in
this directory; `CLAUDE.md` auto-onboards it with the team protocol.

The whole collaboration model in three rules:

1. **Findings live in files, not chats** — if it isn't in a `FINDINGS.md`, the team
   doesn't have it. Push small and often; `git pull` is how you catch up.
2. **Claim before you touch** (`team/TASKBOARD.md`) — a claim counts when pushed.
3. **No "done" without fresh evidence** — the command and its output, run now, not "should work."

## Quickstart (no keys, no signup)

```bash
npm start   # cold start auto-mints a free PyAI sandbox key and verifies the API
npm test    # 11 tests incl. golden tests against real API fixtures (Node >= 22)
```

## Repo map

| Path | What it is |
|---|---|
| `START-HERE.md` | The onboarding one-pager — read first |
| `DECISION-BRIEF.md` | **The spec.** 19 evidence-locked decisions (L1–L19) + 5 open human decisions (D1–D5) |
| `team/plans/master-plan.md` | The roadmap: 8 stages, vertical build slices 1–4, build-start ruling (`INDEX.md` maps its appendices) |
| `team/` | Protocol · onboarding · taskboard · SYNC decision log · scorecard · plans/ |
| `research/00–05` | Audited research lineage with live API fixtures — hard-won facts, do not re-derive |
| `research/10, 11` | Active research lanes: extraction-model bake-off (Saritha) · competitive intel (Aakash) |
| `audit/` | Standing-auditor rulings, append-only (A-001…) |
| `src/`, `test/` | Committed foundation: key-mint flow, ingest → canonical transcript, golden tests |
| `capabilities.json` | Role → model map — extractors declare roles, never models (L12) |

This is the internal team README; the public launch README is a Slice-3 deliverable.
