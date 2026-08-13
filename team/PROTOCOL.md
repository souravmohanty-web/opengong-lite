# Team Protocol — OpenGong Lite (v0.1, RFC)

Two Claude Code sessions + Sourav working as one team on the PyAI hackathon build
(Aug 13–14, demo Fri 6pm). Modeled on PostHog's async handbook culture (written-first,
RFCs over meetings, document so others unblock themselves) and Anthropic's
Claude-Code-native equivalent: shared artifacts on disk + cross-session messages.

**Status: PROPOSED by projects-f9. hackathon session + Sourav: comment inline or ack in SYNC.md.**

## Who's who

| Handle | What it is | Address for pings |
|---|---|---|
| `hackathon` | Original session; owns research lineage + DECISION-BRIEF.md + auditor relay | SendMessage → `hackathon` |
| `projects-2f` | Fresh build session (Sourav, Aug 13 ~13:00) — the hackathon partner | SendMessage → `projects-2f` |
| `sourav` | Human lead; breaks ties, owns open human decisions (D1–D5) | either terminal |

> Roster correction (Sourav, Aug 13 ~13:05): today's only focus is the hackathon; the
> JustCall-marketing session is NOT part of this project and its claims are void. The
> partner session is the fresh `projects-2f`, not the stale `projects-f9` handle.

## The Iron Law

```
NO EDITS TO A FILE ANOTHER SESSION HAS CLAIMED ON THE TASKBOARD
```

There is no git yet — a collision is silent data loss. Claim before you touch.

## The three channels

1. **`team/SYNC.md`** — the running log. Append a timestamped entry when you: start a task,
   finish a task, learn something the other session needs, or change a plan. FYI-grade,
   no reply expected. Newest entries at the TOP.
2. **`team/TASKBOARD.md`** — ownership. Claim a task (set Owner + In progress) BEFORE
   editing its files. One owner per file/area at a time.
3. **SendMessage** — the interrupt channel. Use ONLY for: you're blocked, you need a decision
   in <10 min, or you shipped something the other session must rebase on. Everything else
   goes in SYNC.md. (Interrupts are expensive; logs are cheap.)

## Comment convention (drop comments anywhere, any file)

```markdown
> 💬 [projects-f9 · Aug 13 12:40] Is the stereo cap (L7) still true after the probe rerun?
>> [hackathon · Aug 13 12:55] Yes — see research/00-api-probe fixture 3. Resolving.
```

- Reply by nesting one more `>`.
- The comment's AUTHOR does not resolve it — the addressee does, by replying then deleting
  the thread (or moving it to SYNC.md if it produced a decision).
- Comments in DECISION-BRIEF.md that challenge a locked decision (L1–L19) must cite evidence.

## Decision hygiene

- DECISION-BRIEF.md stays the single source of truth for locked decisions. Neither session
  edits a locked decision unilaterally — propose via comment, other session + Sourav ack,
  then edit and log in SYNC.md.
- Open decisions D1–D5 are Sourav's. Sessions may attach evidence under them but not close them.

## Verification rule (from global CLAUDE.md, binding on both sessions)

No "done" in SYNC.md or TASKBOARD.md without the command/check that proves it, run fresh,
pasted or referenced inline.

## Open proposals (need hackathon-session ack)

- [x] P-1: DONE by hackathon session — `git init -b main` + baseline commit `5d24bd6`
      (all research/audit/team artifacts + `.gitignore` covering `.env*` and key files).
      The build lives in THIS dir (`opengong-lite/`). Local only; nothing pushed.
- [x] P-2: ADOPTED by hackathon session with two amendments:
      (A1) **Auditor relay**: any challenge to a locked decision (L1–L19), any new spec,
      and any pre-merge review request routes through the hackathon session's standing
      auditor (in-session subagent; A-001–A-008 lineage in `audit/`). Verdicts land in
      `audit/audit-log.md` and get a SYNC.md pointer.
      (A2) **Commit rule**: with git live, the Iron Law gains teeth — commit after each
      completed taskboard item (small, labeled commits = the change feed); never commit
      another session's in-progress files.
