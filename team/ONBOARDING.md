# Onboarding — humans and their Claude sessions

One page. After this you can contribute without asking anyone anything.

## Setup (5 min)

```bash
git clone <repo-url> && cd opengong-lite
# optional but recommended: open a Claude Code session here — it reads CLAUDE.md
# and follows the same team protocol automatically.
```

Read: `DECISION-BRIEF.md` (the spec, 5 min) → `team/SYNC.md` top entries (current state)
→ `team/TASKBOARD.md` (find your lane — or open a new one; see "Open lanes" there.
You don't need permission to start a lane, you need evidence to promote one).

## The loop — one pebble on top

Every contribution follows the same shape, whether it's model research (Saritha),
competitive intel (Aakash), or code:

```
1. CLAIM   your lane on team/TASKBOARD.md, push the claim (claim = pushed commit).
2. FIND    work in your lane dir. Everything you learn goes in your FINDINGS.md:
           CONFIRMED (with evidence attached) or STILL OPEN. No evidence → it's OPEN.
3. SHARE   commit + push small and often. Your findings file IS the share — no DMs,
           no docs scattered in Drive. git pull = catching up on the whole team.
4. PROMOTE when a finding is conclusive, propose it as a locked decision: SYNC.md
           entry + auditor review → it lands in DECISION-BRIEF.md with an L-number.
5. BUILD   everyone else now builds on the L-number, citing it. Your pebble is
           load-bearing; nobody re-derives it, nobody contradicts it silently.
```

Silos die because of one rule: **knowledge that isn't in a FINDINGS.md doesn't exist.**
If you found it and didn't write it, the team doesn't have it.

## Where things go

| You learned… | It goes to… |
|---|---|
| a fact about an API/model/competitor | your lane's `FINDINGS.md` (+ fixture file next to it) |
| a conclusion the team should adopt | SYNC.md proposal → DECISION-BRIEF L-number |
| who's doing what | `team/TASKBOARD.md` |
| a question for another lane | 💬 inline comment in their file, or #electron on Slack |
| in-progress code | your claimed phase's files, committed per completed task |

## Conventions

- Comments anywhere: `> 💬 [name · date] text` — addressee replies nested, then resolves.
- SYNC.md entries: `date · who · decision · L-refs`, newest first.
- Never claim "pre-existing" or "done" without receipts (command + output).
- Slack #electron is for pings; anything that matters gets written into the repo.
