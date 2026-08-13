# Team Protocol — OpenGong Lite (v1.0, adopted Aug 13)

Humans + their Claude Code sessions working as one team on the PyAI hackathon build
(Aug 13–14, demo Fri 6pm). Written-first, PostHog-style: decisions live in files,
not in chats; anyone can catch up by pulling and reading.

## Who's who

| Who | Role | How to reach |
|---|---|---|
| Sourav | Lead. Breaks ties, owns open decisions D1–D5, approves phase/slice gates | Slack `#electron` |
| Saritha | Reasoning-model lane (`research/10-reasoning-model/`) | Slack `#electron` |
| Aakash | Competitive-intel lane (`research/11-competitive-intel/`) | Slack `#electron` |
| `hackathon` | Claude session (Sourav's machine): spec/integration, standing auditor, API-probe lineage | via Sourav |
| `projects-2f` | Claude session (Sourav's machine): build lanes + repo hygiene | via Sourav |
| Your Claude session | Reads root `CLAUDE.md` on open and follows this protocol automatically | — |

## The Iron Law

```
NO EDITS TO FILES ANOTHER PERSON OR SESSION HAS CLAIMED ON THE TASKBOARD
```

A claim counts when it is PUSHED. Pull before you claim; claim before you touch.

## The channels

1. **`team/SYNC.md`** — the running log. Append a dated entry (newest first) when you
   start/finish a task, learn something others need, or make a decision. Format:
   `date · who · decision · L-refs`.
2. **`team/TASKBOARD.md`** — ownership. Claim before editing; one owner per file/area.
3. **git push/pull** — the change feed. Commit per completed task, push immediately,
   pull before starting anything.
4. **Slack `#electron`** — interrupts only: you're blocked, or you need a decision in
   <10 minutes. Anything that matters gets written into the repo afterwards.

## Comment convention (any file)

```markdown
> 💬 [saritha · Aug 13 16:40] Is the stereo 2-speaker cap why the deal arc is 1:1 calls?
>> [hackathon · Aug 13 16:55] Yes — L15/D2, see stereo_result.json. Resolving.
```

Reply by nesting one more `>`. The addressee resolves (reply, then delete the thread, or
move it to SYNC.md if it produced a decision).

## Decision hygiene

- `DECISION-BRIEF.md` is the single source of truth. Locked decisions (L1–L19) are
  evidence-backed: challenge only WITH new evidence, via an inline comment + SYNC entry;
  the standing auditor rules (verdicts land in `audit/audit-log.md`). Never edit a locked
  decision unilaterally.
- Open decisions D1–D5 belong to Sourav. Attach evidence under them; don't close them.
- New conclusive findings get promoted: SYNC proposal → auditor → new L-number in the
  brief. Only locked decisions are load-bearing; cite L-numbers when you build on them.

## Verification rule (binding on everyone, human or LLM)

No "done" on the board or in SYNC without fresh evidence: the command/check that proves
it, run this session, pasted or referenced inline. "Should work" is not a status.

## Commit rules

- Small, labeled commits per completed task — the commit feed is the team's change log.
- Never commit someone else's in-progress files.
- Secrets never enter git: `.env*` and `*.pyai_key` are gitignored; CI runs gitleaks.
