# OpenGong Lite — session bootstrap

You are one of several Claude Code sessions (and humans) working on this repo as a team.
Before doing ANYTHING, read in this order:

1. `team/SYNC.md` — top entry of the decision log tells you the CURRENT state
   (build freeze vs green light, who owns what). Never assume; the log is live.
2. `DECISION-BRIEF.md` — the spec. L1–L19 are evidence-locked decisions: build on them,
   never relitigate without new evidence. Challenges = inline 💬 comment + SYNC.md entry;
   the standing auditor (runs on Sourav's machine) rules and logs in `audit/audit-log.md`.
3. `team/plans/master-plan.md` — the roadmap (stages + build slices) and build-start
   ruling; `team/plans/INDEX.md` maps its appendix docs.
4. `team/PROTOCOL.md` — working agreement. Iron Law: no edits to files another
   session/person has claimed on `team/TASKBOARD.md`. Claim before you touch.
5. Your lane's `research/*/FINDINGS.md` or the taskboard row you own.

Rules that bind every session here:

- **Pebble rule:** new knowledge goes in your lane's `FINDINGS.md` as CONFIRMED (with
  evidence: fixture, transcript, link, command output) or OPEN. Conclusions get promoted
  to the DECISION-BRIEF as locked L-decisions via SYNC + auditor — only locked decisions
  are load-bearing. Build only on locked decisions, cite L-numbers.
- Log every decision in `team/SYNC.md` (newest first, `date · who · decision · L-refs`).
- Pull before claiming; a claim counts when pushed. Commit per completed task, push
  immediately; never commit another person's in-progress files.
- No "done" without fresh verification evidence (the command and its output, this session).
- Hard-won API facts live in `research/00-api-probe/FINDINGS.md` — do not re-derive them.
- Idiom: Node >= 22, ESM, native fetch, zero/minimal deps, no TypeScript.
