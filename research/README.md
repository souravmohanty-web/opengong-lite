# research/ — lane index

Hard-won, evidence-backed facts. Every lane's `FINDINGS.md` distinguishes CONFIRMED
(evidence attached) from STILL OPEN — do not re-derive a CONFIRMED finding, and never
treat an OPEN one as settled. Conclusions get promoted into `DECISION-BRIEF.md` as locked
L-decisions via a `team/SYNC.md` proposal + standing-auditor review; only locked decisions
are load-bearing. Research lanes are exempt from the build freeze (see `team/TASKBOARD.md`).

| Lane | One-line description |
|---|---|
| `00-api-probe/` | Lane Zero — live probes against the real PyAI API with a self-minted sandbox key; raw responses committed as fixtures. Ground truth behind locked decisions L1–L4 (batch-jobs-only, channel-based diarization, canonical-text construction). |
| `01-adjacent-products.md` | Teardown of OSS call/meeting-intelligence competitors (gtm-superintelligence, playcall, SurfSense, speakr, Scriberr, whishper, meetily, amurex) — confirms the claim-level-citation wedge is open in OSS. |
| `02-data-model.md` | Transcript/citation/evidence schema design: the Segment/Word/Speaker/ExtractionRun/Claim/Evidence types, storage decision (JSON files as source of truth, SQLite as a disposable index), and share-link tiers with measured payload sizes. |
| `03-harness.md` | The reliability harness spec: structured-output enforcement strategies, the citation grounding gate (segment-id bounds check → normalized containment → guarded fuzzy fallback), budget governors, run records, safe parallelism, and the named-exit taxonomy. |
| `04-repo-craft.md` | README anatomy of winning OSS repos, five-minute-setup engineering, security hygiene for a public AI repo, sample-data legal precedent, and Show HN objection pre-emption — includes a full README skeleton. |
| `05-posthog-craft.md` | What transfers from PostHog's engineering/brand practices to a 33-hour 4-person MIT repo (fictional sample-data company, taxonomy-as-data, extractors as declarative plugins, DATA-FLOW.md) — with an explicit DO-NOT-COPY list of what doesn't. |
| `10-reasoning-model/` | Saritha's lane — extraction-model bake-off. Eval criterion is quote fidelity (does the model copy transcript lines exactly?), not reasoning eloquence. Feeds `capabilities.json` `roles.extraction`. Findings file currently empty — lane is open, not yet claimed with evidence. |
| `11-competitive-intel/` | Aakash's lane — competitive receipts arming the README/demo (anarlog/Hyprnote teardown showing citation is architecturally absent from their enhance path; Gong pricing/lock-in research; the PM product-spec synthesis ruling that folds an action-layer proposal on top of the locked receipts foundation). |

## Open lanes

Anyone can open a new numbered lane — see `team/TASKBOARD.md` → "Open lanes" for the
current seed list (long-audio segmentation, sandbox daily-cap probing, Hinglish/accent WER,
prompt-injection threat model, real dual-channel recording hunt, demo-day run-of-show,
voice-catalog curation) and the claim process.
