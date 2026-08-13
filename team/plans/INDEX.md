# team/plans/ — INDEX

`master-plan.md` is the umbrella document (the staged roadmap + the build-start ruling).
Every other file here is one of its appendices — a deep design for a slice of the roadmap,
written in a planning session and folded in once the master plan approved pushing them.
None of these override `DECISION-BRIEF.md`'s locked L1–L19 decisions; where a plan cites
an L-number, that decision is binding, the surrounding design is the current best plan for
implementing it.

**Status key:** `operative` = current design, build from it · `draft` = has an open
decision blocking it (named below) · `superseded` = structurally replaced, content still
useful as reference.

| File | One-line description | Serves | Status |
|---|---|---|---|
| `master-plan.md` | The staged roadmap (8 stages) + the "BUILD-START DECISION": ~28h-to-demo call, vertical-slice execution order (Slice 1 walking skeleton → Slice 4 demo hardening), Sourav's three mechanisms, real-call calibration directive, and the immediate-actions list this cleanup pass executes. | The umbrella — all other files below are its appendices. | **operative** |
| `control-room.md` | Internal-only ops console design (never end-user): gate pass-rate trends, precision-vs-golden-labels, cost/cache economics, exit-reason distribution, drift watch, and outcome-correlation thresholds that propose but never auto-change the pipeline. | Master-plan "Mechanism #4" (added alongside Sourav's three mechanisms, Stage 5/6 addenda). | **operative** |
| `contextual-analysis.md` | The two-gate design (evidence gate, locked, vs. a new never-blocking interpretation gate), the 16-class ambiguity taxonomy, entity registry, and claim-schema additions for stance/quantities/context windows. | Master-plan Stage 5/6 addenda ("Contextual layer"); Stage 2 v2 sub-parameters 2.1–2.4. | **operative** |
| `demo-run-of-show.md` | The condensed Friday 6pm demo script: beat-by-beat timing, the 3 never-cut beats, 3 competitive kill-lines, fallback ladder, and the pre-demo checklist. | Master-plan Stage 8 (launch surface) + Slice 4 (demo hardening). | **operative** |
| `phase-1-ingest.md` | Review brief for Sourav on the pre-freeze Phase-1 ingest build (`src/transcript.js`, `src/ingest.js` + their tests) — what was built, evidence it passed, and an explicit APPROVE/REJECT decision block. | The original horizontal "Phase 1" from `DECISION-BRIEF.md` §3, now folded into Slice 1 (walking skeleton) under the master plan's vertical-slice restructuring. | **draft** — decision checkbox in the file itself was never checked; see the correction note in `team/TASKBOARD.md` (the code is in fact already committed — verify current status in `team/SYNC.md` before treating this as still pending). |
| `phase-3-ui.md` | Notes-UI blueprint: the "one viewer, three fuel lines" architecture (app / tier-1 share / tier-2 fragment), the 7-state claim→line→audio interaction machine, export writers, and the HTML-escaping strategy. | The original horizontal "Phase 3" from `DECISION-BRIEF.md` §3, now folded into Slice 1 (minimal viewer) and Slice 3 (full share tiers) under the master plan's vertical-slice restructuring. | **draft** (self-labeled "PLANNING ARTIFACT, build freeze in effect"; 3 open questions for the auditor/Sourav listed at the bottom of the file). |
| `representation.md` | Sybill-informed summary design: the 5-section default note (Outcome/Next steps/Key takeaways/Pain points/Interests), per-field extractor pattern, and persona renderings (AE / team channel / manager rollup). | Master-plan Stage 5/6 addenda ("Representation layer"). | **operative** |
| `risk-register-summary.md` | Condensed top-8 risks (schedule, cached-demo-path sequencing, known code defects, unverified extraction model, untested long audio, physical demo failure modes, SECURITY.md overclaim, unowned golden-call labels), accepted risks, and cheapest mitigations. | Master-plan Stage 7 (corner cases + stress testing). | **operative** |
| `technical-spec-core.md` | Binding core rulings: app-mode server design, coverage-band computation, claim/evidence status enums, the gate chain implementation, extraction runner rules, model-call constraints, run-record write-ahead rules, and the S1/S2/S3 build-slice split. | Appendix to master-plan Stages 5–7; phase-1/phase-3 docs defer to this file where they conflict. | **operative** |
| `token-optimization.md` | Six token/context findings that change the build (timestamps-in-prompt waste, the cache-fan-out trap, triage ROI by call length, cross-call caching doesn't work), the triage design, cache mechanics, and the degrade ladder. | Master-plan Stage 6 (analysis architecture + token optimization). | **operative** |

## Not in this directory but load-bearing for these plans

- `DECISION-BRIEF.md` — the locked L1–L19 decisions every plan above builds on.
- `audit/audit-log.md`, `audit/framework.md`, `audit/unlearn.md` — the standing-auditor
  lineage (append-only) that produced several of the rulings cited above (e.g. F-33/A-009
  in `master-plan.md`).
- `research/00`–`05`, `research/10`, `research/11` — the underlying research each plan
  cites measured numbers or teardown evidence from.
