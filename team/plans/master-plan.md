# OpenGong Lite — Staged Master Plan (Sourav's roadmap, v3) + BUILD-START DECISION

## The call to make now (auditor finding F-33, A-009)

~28h to demo. Zero product code. 65% of the score needs a working, REHEARSED pipeline (the scorecard's biggest single item requires ≥10 logged rehearsals of the click-to-audio moment — it must exist Thursday night). Auditor's formal ruling: further planning is negative-EV; the three still-running research tracks (contextual analysis, token optimization, Sybill representation) fold INTO the build as they land — they don't gate it.

**On approval of this plan, the build starts immediately, in this order:**
1. **Hour-zero probes (30 min, hackathon session):** numerals param, explicit `channel:true`, long-audio segmentation on a ~20-min file, 3-voice mono diarization — closes the last API unknowns.
2. **Slice 1 — walking skeleton (~3h, split across sessions per the taskboard):** one fixture call → one extractor → FULL receipts gate + injection screen (test-first, fixtures before code) → minimal notes page with ONE working click-claim→highlight→audio interaction (WAV/CBR + preload per F-34) → run manifest with named exit. Exit gate: planted fake quote visibly demoted on screen; `npm test` green offline.
3. **Slice 2 — width (~2.5h):** remaining P1 extractors + trackers (deterministic) + email-from-verified-claims-only + budget governor + exports + the SCORE-CRITICAL fixture set (negation, absence/coverage records, dual-mono preflight F-35, digit-fold refusal).
4. **Slice 3 — content + trust (~3h):** DEAL-STATE.md + 5 scripted 1:1 calls + stereo TTS generation + planted injection call + golden-call hand-labeling (2 calls, during script-writing, F-41) + DATA-FLOW.md + README (with roadmap section naming everything consciously deferred — itself scores as craft).
5. **Slice 4 — demo hardening (~3h):** cached demo path FIRST, 90-second backup recording, the three stage numbers wired (% verified, $/call, cold-start minutes), rehearsals logged, room-audio confirmation (F-36 — ask organizers TODAY), projector contrast pass (F-43).
- Evidence report to Sourav at every slice boundary (SYNC entry + the exit-test output). The scorecard's two checkpoints (C1 mid-build to CUT, C2 Fri 15:00 to FREEZE) govern the endgame. Sleep is scheduled (SC-09); the gate is never built in the last 6 hours.

**A-009 verdicts folded in:** negation/absence/context-receipts = SCORE-CRITICAL (cheap fixtures). Haiku-tiering machinery = GOLD-PLATING (story + cost logging + caching only; tiering is a roadmap section). Scorecard capped at one page + 3 stage numbers. Competitive anchoring capped at 3 kill-lines in the script. 7 extraction families, not 15. AGPL quarantine rule (patterns from Speakr/Whishper, never code) + ATTRIBUTIONS section. F-42's four judge answers added to Q&A prep.

**Still open for Sourav (do not block Slice 1):** D1 name escalation · D3 real dual-channel recording · D4 Anthropic key (Slices 1–2 run keyless on fixtures) · stranger recruit for the cold-clone test.

---

Original staged roadmap below (all stage documents exist in draft; they become the build's governing specs).

## The roadmap — status at a glance

| Stage | What it is | Status |
|---|---|---|
| 1. Frameworks for building OSS products | How the best open-source products are built, launched, trusted | ✅ DONE — 6 research docs, audited |
| 2. Scoring sub-parameters | Break each judging weight into our own measurable sub-goals, each a differentiator (competitor POV + Gong-ICP POV) | ✅ DRAFTED BELOW — your review |
| 3. How to build (dev frameworks) | GSD / Superpowers / gstack governing the build: vertical slices, iron laws, test-first, evidence-before-done | ✅ DONE — governance layer written |
| 4. Consolidate Aakash + Saritha | Fold competitive-intel lane (11) + reasoning-model lane (10) into the plan | ⏳ WAITING on their lane findings (anarlog receipts already filed in 11; 10 is empty) |
| 5. How the model analyzes transcripts | Slice/dice strategy, contextual clarity, WHAT data points to capture (Gong-ICP POV), how to store them so integrations are plug-and-play | 🔲 NEXT — needs your call on using DiscoveryClaude as seed (see question) |
| 6. Analysis architecture + token optimization | DiscoveryClaude-style tiering: cheap model flags first, strong model analyzes only what's flagged; batch where possible | 🔲 NEXT — design pending |
| 7. Corner cases + stress testing | Every failure mode with a planned response; adversarial test suite | ✅ DONE — 87-row risk register + 48-test matrix (stress-test PLAN exists; running it = build phase) |
| 8. UI/UX principles, README, launch surface | Design principles, README, DATA-FLOW honesty page, demo script | ✅ DRAFTED — UI blueprint + README skeleton + full demo script exist |

Technical deep-specs (every file, every data shape, the receipts gate, exits, budgets) are ALSO drafted — they slot under stages 5–7 as appendices once stages 5–6 decisions are made, and get revised to match.

---

## Stage 2 v2 — Scoring parameters → engineering sub-parameters

Umbrella principle, from the deck itself: **"The harness is the moat, not the wrapper"** and **"65% of the score is product, demo and story."** Every sub-parameter below is a *quality bar with a verification method*, not a feature description. Three classes per weight: DATA (is the information right and contextual?), ENGINE (does the machinery hold?), SURFACE (does a human feel it?).

### Product pull — 30% · deck question: "Would a stranger switch to this tomorrow?"
A stranger switches only if it's RIGHT on *their* call. So this weight is won by extraction correctness, not features.

DATA
- **2.1 Contextual disambiguation.** A word is not a meaning: "Gong" may be a competitor or an instrument; "Local Presence" is a feature name, not a phrase; "forty" may be a price, a discount, or a seat count. Mechanism: a per-deal **glossary/entity registry** (product names, competitor names, people) injected into extractor context; extractors label entity type; unknown-sense mentions get `confidence: low`, never a confident wrong label. Verify: fixture call seeded with ambiguous terms; each must resolve or demote.
- **2.2 Negation, hypothetical, and reported speech.** "We do NOT have budget issues" must never become a budget objection; "IF we bought this…" is not a commitment; "our old vendor said X" is not the buyer's view. Verify: one fixture per trap; wrong extraction = test failure.
- **2.3 Coreference resolution.** "It's too expensive" — what is *it*? Claims must name the resolved referent and cite the utterance that establishes it, or demote. Verify: fixture with pronoun-heavy exchange.
- **2.4 Context-preserving receipts.** A quote ripped from context can mislead (sarcasm, answering a hypothetical). Receipts render with surrounding turns visible (±1), so a claim can't be an out-of-context cherry-pick. Verify: UI shows neighbors; a sarcastic-line fixture reads correctly.
- **2.5 Absence honesty.** "No next step agreed / pricing never discussed" — highest-value manager signals, unquotable by nature. Separate `coverage` record class, never fake receipts. Verify: quiet-call fixture yields coverage records, zero fake claims.

ENGINE
- **2.6 Extraction precision over recall.** Fewer, fully-proven claims beat many maybes — the deck's stranger trusts or leaves in one session. Target: on the hand-labeled golden call, ≥90% of shipped claims correct; misses go to the visible unverified bucket. Verify: labeled fixture scoring in tests.
- **2.7 Honest degradation ladder.** Mono → inferred roles labeled as inferred; noisy audio → lower coverage said out loud; non-English → clear refusal. Never silent garbage. Verify: one fixture per degraded mode.

SURFACE
- **2.8 Five-minute cold start, zero signup** (key mints itself, sample deal preloaded). Verify: a human who didn't build it, timed.
- **2.9 No bot in meetings; works on recordings you already have.** Adoption-blocker removal, stated on the README fold.

### Demo magnetism — 25% · deck question: "Did the room go 'oh damn'?"
"Oh damn" = watching something impossible-looking get PROVEN, live. Proof-beats, not tour-beats.

- **3.1 The falsifiable moment:** click claim → line lights → customer's voice plays that second. Perceived latency <300ms; rehearsed ≥10 times; 4 seconds of silence after. Verify: rehearsal clock.
- **3.2 The system refusing to lie, on screen:** a planted fake claim visibly demoted with its reason; a planted hijack attempt quarantined with a label. Both deterministic (committed fixtures), not live-model luck. Verify: both states present in cached demo output before 5:45pm.
- **3.3 Zero-network determinism:** whole main act replays committed outputs; wifi off is announced as a flex. Verify: full run in airplane mode.
- **3.4 One followable deal:** fictional company, 5 calls, planted competitor arc + broken promises; search on stage finds them. Verify: search returns the planted facts.
- **3.5 Delivery craft:** never talk over the audio; pre-decided cut order; three never-cut beats (3.1, 3.2's two halves).

### API gravity — 20% · deck question: "Does daily use burn minutes on its own?"
Gravity = recurring, instrumented, *affordable* burn — not one-off usage.

- **4.1 Both-direction burn:** sample calls are generated by PyAI Speak, transcribed by PyAI Hear; every clone burns on first run. Verify: minted-minutes visible in run records.
- **4.2 Frictionless first burn:** self-minting sandbox key; zero human steps. Verify: cold-start test.
- **4.3 Recurring loop:** each new extractor (one JSON file) re-runs the whole call library; the commitment ledger re-checks past calls on every new call. Usage compounds. Verify: `new-extractor` → corpus re-run demo.
- **4.4 Efficient burn = sustainable gravity:** token economics designed (tiering, caching ~40-45% savings) so daily use stays cheap enough to BE daily. Cost per call logged, not estimated. Verify: cost stamped in every run record.

### Loop depth — 15% · deck question: "Do the gates actually block bad output?"
Blocking must be demonstrated by tests that try to break it, not described.

- **5.1 Quote-verification gate** (exact → normalized → rescue → visible demotion; digit-folding refused so a wrong number can never be laundered). Verify: planted-fake-quote and digit-fold tests.
- **5.2 Whole-answer rejection** on fabricated citations (an ID the model was never shown poisons the entire response). Verify: out-of-range-ID fixture.
- **5.3 Injection defense in layers:** transcript fenced as data; taint screen; email built only from verified claims (the choke point); escaping in every view. Verify: planted-injection end-to-end test — line appears in transcript, never in the email.
- **5.4 A gate that knows its limits:** absences via coverage records; "right quote, wrong claim" named as unsolved in README. Honesty is depth.
- **5.5 Operational spine:** named exits for every failure; append-only run records; budgets refusing before spend; capped aimed retries; crash sweeper. Verify: kill -9 test, $0.001-budget test.

### Craft — 10% · deck question: "Would we be proud of this code in public?"
DATA (the class the v1 draft ignored — data modeling as craft)
- **6.1 Contextual data modeling:** every stored datum self-explains — speaker + role + timestamps + surrounding-utterance IDs + confidence + provenance (model, prompt version, transcript hash). A row torn from the DB still tells you who said it, when, and how sure we were.
- **6.2 Entity normalization + stable IDs:** normalized company/person keys (fixing DiscoveryClaude's raw-name join gap), stable claim/utterance/run IDs, our own enums with per-CRM mapping blocks (never vendor GUIDs as canon) — plug-and-play by config.
- **6.3 Schema durability:** frozen core + sidecar for evolution; re-runs append, never overwrite; hash-based staleness detection.

ENGINE
- **6.4 Zero dependencies; pure offline-testable verification core.**
- **6.5 One canonical text source** (the API contradicts itself — "40"/"forty" in one response; proven by fixture) with a display layer that never feeds evidence.
- **6.6 Security floor:** upload validation, secret hygiene + leak scanning, escaping everywhere.

SURFACE
- **6.7 Honesty artifacts:** DATA-FLOW.md (every network call, with code line), limitations list, zero overclaims — one "fully local" sentence forfeits this category retroactively.

### Critical aspects the v1 draft ignored — now explicitly covered
Contextual word-sense disambiguation (2.1) · negation/hypothetical/reported speech (2.2) · coreference (2.3) · out-of-context quoting (2.4) · absence findings (2.5) · precision targets with labeled ground truth (2.6) · degradation honesty (2.7) · token economics as a gravity parameter (4.4) · contextual self-explaining storage (6.1) · entity normalization/stable keys (6.2) · schema durability (6.3).

---

## Stage 5 — MERGED DRAFT (both tracks in; gate opens after Stages 2 & 4 close)

**The catalog: 15 data-point families, prioritized.** P1 (the manager's first glance, all fully receipt-capable): next steps (with owner side + due date — a gap in DiscoveryClaude, fixed), call outcome, pain & impact, objections (with the rep's response as a second receipt), call risk flags. P2: keyword trackers (deterministic string matching — 100% receipts, zero AI cost), buying committee, decision/paper process, timeline, budget/pricing, competition (with DiscoveryClaude's hard-won `migrating_from` vs `active_user` distinction), metrics, and the **commitment ledger** — promises made on call 2 checked against call 4, two receipts across two calls; our most differentiated beat, already planted in the sample deal arc. P3 (coaching): questions asked, talk-ratio stats (computed from timestamps, never AI-generated). **Deliberately excluded: sentiment scores** — uncitable and unfalsifiable; saying so in the README is a credibility play.

**33-hour cut:** families 1–5 as five extractor files + trackers (no-AI, guarantees a green number on stage) + the commitment ledger as a simple cross-call join. Seven families total.

**Four discoveries that change the design:**
1. **The absence problem (needs an L-decision before any build):** the highest-value manager signals are absences — "no next step set," "pricing never came up." An absence can't cite a line; pushed through the receipts gate it would all land in "unverified" and look broken. Fix: a separate `coverage` record type ("searched, found nothing") that bypasses the gate — a negative finding is testimony about the whole call, not a claim about a line.
2. **Gong itself doesn't cite its call briefs** — only its Q&A assistant does. The receipts wedge holds against the incumbent, not just OSS rivals.
3. **Gong's famous deal warnings are mostly activity-clock signals, not transcript signals** — so we ship the per-call raw material shaped so the warning layer is a later cross-call query, not a rewrite.
4. **CRM plug-and-play rules (verified field names for HubSpot/Salesforce/JustCall):** store our own stable enums, never vendor values (HubSpot dispositions are GUIDs); every call carries a `source` block (external call/contact/deal IDs); each extractor file carries its own `crm_map` block so integration mapping is a data change, not code. Plus DiscoveryClaude's durability lessons: every signal tagged with a downstream owner from day one; frozen schema + JSONB sidecar for evolution; score-vs-CRM-outcome reconciliation as a recurring workflow.

## Stage 6 — scope (to design next)
- **Tiered analysis, DiscoveryClaude-style:** cheap fast model (Haiku) does a first pass — flags which utterance spans matter per insight type; the strong model (Sonnet) analyzes only flagged spans. Token cost drops; long calls stop being scary.
- **Batching:** multiple calls / multiple extractors share prompts and caches; already-designed prompt caching cuts ~40–45% of cost.
- **When tiering pays vs hurts:** on short calls a single strong pass is cheaper than two passes — the design must include the crossover rule.

## Stage 5/6 addenda — landed (full designs in agent reports, committed as team/plans/* on approval)
- **Representation layer (Sybill teardown):** default summary = the 5 sections users actually see (Outcome / Next steps / Key takeaways / Pain points / Interests), every line cited; 300–500-word hard cap enforced in code; per-field {type, micro-prompt, validator} extractor pattern; `applies_to` conditional sections (omit, never "N/A"); Slack-channel block + separate rep-DM block from one extraction; MEDDIC/BANT as extractor bundles; one human/relationship detail kept. Verified: Sybill has NO claim-level citation; their users report "20 action items when only 4-5 existed" — structurally impossible here (no citation → no task); their core summary template is locked, ours is files.
- **Stage 6 core (token/context):** serialize-first cache-writer then fan-out (−44%/call); timestamp-free prompt rendering (−14%); triage justified by ACCURACY (per-call glossary → gate pass-rate) not cost; absence testimony comes from the whole-call triage read; context ledger in every run record with cost-avoided accounting; silent-cache-miss assertion; Batch API for ≥20 calls; ~$3 per 50-call week. Chunking = stretch, gated on a recall eval.
- **Contextual layer:** 16-class ambiguity taxonomy; two-gate design (receipts gate proves the line is real; interpretation gate assesses whether it means what the claim says — never blocks, badges); entity registry with seeded glossary + proposals; stance fields (polarity/modality/attribution/certainty); paired receipts for short answers; 24 offline fixtures; no sentiment extractor in v1 (indefensible on unpunctuated text — a scoping decision, stated in README).

## Sourav's three mechanisms — ALL DEEP IN V1 (~6.5h, consumes the buffer; his ruling 2026-08-13)
**Design principle (Sourav, verbatim in spirit): machinery runs in the BACKGROUND, surfaced only when needed. The end-user surface stays simple — solves their pain, shows the differentiation. No added complexity in the primary flow.**
1. **Suggested next steps (~2h):** `suggested_next_steps` extractor fed by this call's verified claims + deal brief + workspace context files (product.md, messaging.md). Every suggestion basis-tagged (cited-from-call / deal-history / product-context) in a visibly separate "Suggested" band — a proposal can never masquerade as spoken.
2. **Evals + feedback loop (~2h), BACKGROUND:** mark-a-claim-wrong → logged to evals file with evidence → `evals` replay command reports precision drift → documented fix cycle. Runs quietly; surfaced only on demand (a small "was this right?" affordance, no dashboards in the main flow).
3. **CRM gold standards (~2.5h):** deal-outcomes file (stage, amount, industry, persona; CSV-importable) + won/lost pattern report + sample arc gets outcomes. Demo-mode labeled honestly (5 fictional calls = illustrative, never statistics).

## Real-call grounding for Stages 5 & 6 (Sourav's directive, 2026-08-13)
Source: `~/Downloads/SDR_Meeting_transcript.csv` — ~6,000 rows of REAL calls with CRM columns (company, industry, job title, deal_stage, deal_amount, transcript content). Uses:
1. **Representative-call selection:** score rows for coverage (objections + pricing + competitor + next-steps + typical length + multi-topic); pick 2-3 that cover the most recurring cases. These become the calibration calls for the extractor catalog (Stage 5) and the token/context math + ambiguity-class mining (Stage 6 — first row already confirms real Hinglish code-switching).
2. **Golden-call ground truth:** hand-label one real call (with Sourav) for the precision metric — real data beats synthetic for the ≥90% target.
3. **Gold-standards data:** the CSV's deal_stage/deal_amount/industry/persona columns feed mechanism #2 with REAL outcomes (demo-mode label no longer needed for the analysis itself — only for anything shown publicly).
**Privacy rule (hard):** the CSV and any identifiable content NEVER enter the repo or demo. Local calibration only; derived fixtures are anonymized (names/companies replaced); shipped samples remain synthetic per L15.

## Stage 4 — waiting on (the LAST planning dependency; Sourav briefs them directly)
- Aakash (lane 11): competitive receipts — anarlog evidence filed; Gong-screenshot capture + remaining findings pending.
- Saritha (lane 10): quote-fidelity model bake-off — empty so far. Her result picks the extraction model.

## Open decisions (unchanged): D1 name · D2 1:1 calls · D3 real recording · D4 keys · D5 owners.

---

## IMMEDIATE ACTIONS (Sourav's instruction, 2026-08-13 afternoon) — what approval of this plan executes NOW

**This is NOT build approval. Product-code build stays gated (waiting on Saritha's bake-off + Sourav's final gate).** Approved scope, in order:
1. **PUSH EVERYTHING NOW:** copy Aakash's two Downloads files into `research/11-competitive-intel/`; copy this master plan into the repo as `team/plans/master-plan.md`; commit all relevant files, findings, and plans; push to the existing private GitHub remote so the team can read and build on it.
2. **Then the isolated cleanup/coherence agent** (separate from the standing auditor): make the corpus clear, cohesive, directional — START-HERE/INDEX, truthful statuses, stale cross-references fixed, landed agent designs saved as `team/plans/*`. No changes to src/ or locked L-decisions; audit/ stays append-only.
3. **Second commit + push when cleanup is done.**
