# OpenGong Lite — team workspace (internal)

> **Internal repo for the PyAI hackathon build (Aug 13–14, demo Fri 6pm).**
> This README is for the team, not the public launch — the public README is a
> Phase-4/slice deliverable and doesn't exist yet.

**Current state (Aug 13 evening): BUILD FREEZE.** Planning only until Sourav approves
the master plan. The build order is being restructured from horizontal phases into
vertical slices. Check the top entries of `team/SYNC.md` — the decision log is always
the live source for "what's happening right now."

## What this project is

An open-source "Gong killer": upload a sales call → transcript → extracted deal notes
where **every claim cites the exact transcript line**, verified in code (not prompt-wished).
The citation gate is the wedge and the demo moment.

## Read in this order

1. `team/SYNC.md` (top entries) — current state, always.
2. `DECISION-BRIEF.md` — the spec: 19 evidence-locked decisions, build order, open decisions.
3. `team/PROTOCOL.md` — how we work (Iron Law: claim before you touch).
4. `team/ONBOARDING.md` — the contribution loop, one page.
5. `team/TASKBOARD.md` — lanes: claimed, open, and up for grabs.

Using Claude Code? Just open a session in this directory — `CLAUDE.md` bootstraps it
with all of the above automatically.

## What's in here

```
DECISION-BRIEF.md        the spec (locked decisions L1–L19, open decisions D1–D5)
research/00–05           audited research lineage (API probes w/ live fixtures, data
                         model, harness, repo craft) — hard-won facts, do not re-derive
research/10, 11          open research lanes (reasoning model; competitive intel)
audit/                   standing-auditor log (A-001…)
team/                    protocol, onboarding, taskboard, sync log, plans/
src/, test/              Phase-0 skeleton (key mint + CI); further code frozen pending
                         master-plan approval — some built work exists only on Sourav's
                         machine awaiting review (see team/plans/phase-1-ingest.md)
capabilities.json        role → model map (extractors declare roles, never models)
```

## Quickstart (works today, no keys needed)

```bash
npm start   # cold start auto-mints a free PyAI sandbox key, verifies the API is reachable
npm test    # smoke tests (Node >= 22)
```
