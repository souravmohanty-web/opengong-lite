# Build Orchestration — multi-agent workflow, context hygiene, separate overseer (2026-08-13)

Governs HOW the build executes across sessions/agents when the gate opens. Frameworks in force: GSD (named-artifact handoffs, source-of-truth precedence), Superpowers (subagent isolation, one job per agent, verification-before-completion), gstack (vertical slices, investigate-before-fix).

## The Iron Law
```
EVERY AGENT GETS ONE GOAL, CONSTRUCTED CONTEXT, AND A NAMED ARTIFACT TO DELIVER — NEVER THE WHOLE CONVERSATION
```
| Excuse | Reality |
|---|---|
| "it needs the full history to understand" | it needs the spec section + fixtures + its goal; history is bloat |
| "I'll just do this small task inline" | inline work in the orchestrator eats the context that coordinates everyone |
| "the auditor can share the builder's context" | a shared-context auditor inherits the builder's blind spots — fresh context or it isn't an audit |

## Roles (goal per agent — one job, one failure mode)
| Role | Who | Goal | Reads | Delivers |
|---|---|---|---|---|
| **Orchestrator** | `hackathon` session | sequencing, gates, integration rulings, Sourav interface | SYNC top, taskboard, slice reports | slice-boundary reports to Sourav |
| **Builder: gate/extraction** | subagent(s) of hackathon (Sonnet for mechanical, Opus for the gate core) | one module per spawn, test-first | technical-spec-core.md §for-that-module + fixtures + repo CLAUDE.md | code + green `npm test` output |
| **Builder: UI/ingest/infra** | `projects-2f` session + its subagents | its claimed taskboard lanes | phase-1/phase-3 plans + INDEX | code + evidence in SYNC |
| **Content** | human (Sourav/Saritha/Aakash) + drafting agent | DEAL-STATE, call scripts, labels | representation.md + L15 rules | samples/ + labels.json |
| **AUDITOR (overseer)** | standing auditor — SEPARATE agent, fresh-context spawns, NEVER writes code | break what builders claim works | the diff + the spec + fixtures ONLY (never builder transcripts) | verdicts in audit/audit-log.md |
| **Control room** | background script, no LLM | metrics aggregation | runs/, evals/ | thresholds page |

## Workflow per slice (the loop)
```
1. Orchestrator posts slice goal → taskboard rows claimed (pull-before-claim)
2. Builders spawn with CONSTRUCTED context (spec section + fixtures + goal; ≤ ~2k tokens of instruction)
3. Builder delivers: code + fresh test output (no "should work" — evidence or it didn't happen)
4. AUDITOR audits the DIFF against spec + tries to break it (fresh context, adversarial)
   — verdict PASS → merge + push + SYNC entry with evidence
   — verdict FAIL → back to builder with the named defect; 3 failed fixes = stop, reassess (Iron Law of Investigation)
5. Orchestrator reports slice exit-test to Sourav; next slice only on his go
```

## Context-bloat rules (binding)
1. **Named artifacts, never chat-history handoffs**: every handoff is a file on disk (spec → code → test output → audit verdict). A new agent can join from files alone (START-HERE proves it).
2. **Subagents are constructed, not inherited**: the spawner writes the minimal brief; pointing at file paths beats pasting content.
3. **Sessions stay lean**: orchestrator never builds inline; builders never orchestrate; long outputs go to files, one-line summaries to SYNC.
4. **Model economy** (Sourav's directive): Haiku/scripts for mechanical checks, Sonnet for build/organization, Opus for gate-core design + audits, orchestrator judgment only where it changes decisions.
5. **Session reset protocol**: everything needed to resume is in the repo (SYNC top entry = current state). Memory files carry only pointers.

## Auditor separation (absolute)
- Fresh context per audit round; receives diff + spec + fixtures, never builder reasoning.
- May not write product code, ever. Verdicts + findings only, logged append-only.
- Audits at: slice boundaries (mandatory), any L-decision challenge, pre-push of anything public-facing, and C1/C2 scorecard checkpoints.
- The auditor's standing instruction: every audit surfaces concrete risk or states what it tried to break and couldn't.

## External references evaluated (Sourav, 2026-08-13)
- **kunchenguid/no-mistakes** (git proxy: disposable worktree runs AI validation pipeline before push reaches remote; auto-fix mechanical, escalate intent-level): the PATTERN = our step-4 audit gate, already in the loop above. The TOOL itself = post-hackathon candidate for the repo's contribution workflow ("clean PRs by default" would suit the Show HN influx). Roadmap line.
- **mattpocock/skills** (216k★, agent skills) + **sandcastle** (sandboxed agent orchestration in TS): sandcastle's orchestrate-sandboxed-agents model matches our subagent/worktree isolation; his skills repo is a pattern library worth mining post-hackathon for our extractor-authoring skill. Neither is a build-time dependency (zero-deps rule holds).
- X article (BrainsAndTennis): not fetchable programmatically; if it matters, paste the content into a research lane.

## Anti-patterns (from our own history, so they stay dead)
- Two sessions holding different instructions from the same human → **all state-changing instructions get a SYNC entry before execution**; newest dated entry wins.
- Marking work "ready" without the human gate → slice boundaries stop and wait, every time.
- Planning as displacement of building → the auditor's F-33 rule stands: once specs exist, further refinement folds into the build, it doesn't gate it.
