# CHECKPOINT — resume-from-here (living; update at every milestone)

**Read this first if context reset.** Then: `team/SYNC.md` top entry (live state) → `DECISION-BRIEF.md` (locked L1–L19) → this file. The repo IS the memory; nothing important lives only in chat.

Last updated: 2026-08-13 late night. Demo: **Friday 6pm** (whole company judging).

## What this is
OpenGong Lite — open-source call notes where every claim links to the exact transcript line (receipts). Hackathon flagship (Week-1 public launch if it wins). Fictional demo deal: **Brightsmile Dental (buyer) × CallForge (vendor), competitor RingHawk.**

## STRATEGIC (AUDITED late night 2026-08-13): entry = SARITHA'S REPO as base + graft OUR gate back
- **SUPERSEDES the earlier "our repo as base" plan.** Two Fable audits + a peer adversarial vector run flipped the direction with evidence (reports: scratchpad/audit-ours.md, audit-theirs.md, her-gate-vectors.md).
- **Friday base = Saritha's Next.js product** (/private/tmp/.../colleague-build; GitHub github.com/sarithakonudula/open-gong-lite). It's the real product ours isn't: samples-first UI, upload/URL/live-mic ingest, ZERO-KEY PyAI auto-mint, PyAI-FIRST extraction (Hear→Recap→OpenAI-compatible→deterministic), share URLs, click-to-play, Dockerfile+railway+CI. Solves the 11 gaps + the Anthropic problem (ours is Anthropic-locked; a PyAI-only clone of ours gets keyword trackers, NOT deal notes).
- **BUT her gate is UNSAFE as-is — cannot demo without the patch.** Her recap-map manufactures receipts (copies best-keyword-overlap line as the quote → gate passes by construction). PROBE: "budget is frozen" call shipped verified "agreed to sign a $50k annual contract" INTO the email. Vector run: 17/21 held; her email choke + injection screens FAITHFUL (passed all incl. whole-draft rejection); 3 CRITICAL fabrication paths in ONE function gateEvidenceQuote = our exact pre-F-2 bugs (F3 empty-quote, F4 space-quote, F5 digit-fusion 40.15→4015 no digit-flank guard) + MEDIUM no-min-length + spec deviation (unknown lineId demotes one vs poisons whole response).
- **THE GRAFT (cheap, precise, ~30 lines, ONE function):** port our audited af45d99 fix into her gateEvidenceQuote (empty/whitespace reject, digit-flank-guarded strip, min quote length) + delete her Recap-body email pass-through (restore choke invariant) + fix bestEvidence/claimFrom to demote-not-self-certify + add our fab set as regression tests in her test:gates. Makes the demo STRONGER (mixed verified/demoted is the pitch). Peer's vectors.ts runner is rerunnable = live proof on stage.
- **2026-08-14 midday: PR #1 RECONCILED over Saritha's merged main, MERGEABLE, 9 commits (fork/gate-hardening @ c988cae).** She merged our features into her main (scorecard tab, deal signals, diarization fixes) + reimplemented part of the gate hardening herself (her normalizeQuote is stronger, kept). Merge law was strongest-guard-wins-per-hunk: hers won 3 hunks, ours won chokeFollowUp removal + unfound-claim sentinel + min-quote floor (her whole-utterance exception let "Yes." anchor claims — closed). Her deal-signals + methodology audited CLEAN (verbatim-by-construction + re-gated; lock-in probes added). Also fixed on the branch: her main's BROKEN BUILD (LayoutProps TS2304, shared bug) + lint. 87/87 gates tests, 21/21 vectors, lint+tsc clean, vocabulary (labels.ts) extended to scorecard/signals. HER ONE CLICK = both repos green. Original graft record:
- **(superseded, 2026-08-14 early):** graft DELIVERED as draft PR sarithakonudula/open-gong-lite#1 (from souravmohanty-web fork, branch gate-hardening, 2 commits f07d799+240728d). Commit 1 (peer): gates.ts hardening (min-quote 15, digit-flank guard, empty/ws reject) + recap-map NO_EVIDENCE (no self-certified receipts, no invented next steps) + test-fabrication.ts. Commit 2 (this session): chokeFollowUp pass-through REMOVED (email always composed from gate-passed claims or withheld) + demo-extract NO_EVIDENCE sentinel + 2 regression tests + FULL humanize pass (README + all user-facing strings, zero em-dashes, harness table matches patched behavior). VERIFIED on branch: test:gates 34/34, vectors 21/21, eslint clean, smoke green. PR stays DRAFT; merge is Saritha's call. Evidence comment posted on PR. Our repo's 4 README overclaims + offline-author provenance disclosure also FIXED (peer, aedbcef).
- Ours is NOT the base but contributes: the hardened gate, injection/email-choke discipline (already faithfully in hers), deep extractors/coverage bands, honesty posture. Ours also has 2 honesty landmines to NOT carry over: hand-authored demo bundles shown as extracted (extraction_model: offline-author, undisclosed) + 4 README overclaims.

## Current state
- **Scorecard: 72/100** (1 honest red), `npm run scorecard`. pp-2.6 precision GREEN (live handler reads team/labels.json → 97.7%, 43/44, Gate C PASS, product_pull uncapped). dm-3.4 cross-call-search GREEN (live-exercises deal-index). ag-4.3 recurring-loop GREEN (real corpus re-run). ag-4.1 both-direction-minutes RED **honestly** (423s TTS + 423s Hear measured vs 3600s target — NOT faked; runs/r_sample_corpus_burn/run.json). Gate B GREEN, Gate A pending (rehearsal). Remaining: rehearsal (~+13) + name (public).
- **UI REBUILT + LIVE (notes-first, judge-first):** `npm run demo:notes` → http://127.0.0.1:4318. Samples-first landing (action headline "Gong records what happened. We do what was promised.", 5 clickable sample cards, "1 held back" flagged pre-click), notes-first call pages with click-to-reveal (note card → exact transcript line + play, HTTP Range/206 seek), visible HELD BACK gate beat (call-03 planted fake), follow-up email panel (composeEmail choke point, every bullet cited). src/notes-view.mjs + scripts/build-notes.mjs + test/notes-view.test.js. viewer.js/server.js untouched (peer, frozen). Email being tightened to human-recap sections (drop terse data lines).
- **FULL CHAIN NOW ONE COMMAND:** `node scripts/pipeline.mjs <audio-file-or-url>` (npm run pipeline) = ingest (src/ingest.js, finally wired) → transcript → extraction → gate/injection → bundle → composeEmail. "Done end to end" is literally true (test-proven, 381 green). Live audio→Hear leg key-gated (PYAI_API_KEY set); extraction gated on ANTHROPIC_API_KEY (absent → auto fallback). NOT run live (didn't burn quota unprompted).
- **KEYLESS FALLBACK (D4 graft, src/fallback.js):** no ANTHROPIC_API_KEY → deterministic tracker-only extraction (keyword string-match, zero AI, every claim gate-verified), honestly labeled everywhere (bundle.provenance.extraction_mode='deterministic-trackers-only', extraction_note, extractors_skipped_no_key). Quiet call w/ no keyword hits → zero claims, never invented.
- **LATENT BUG FIXED:** runPipeline threw on 7 of 9 default extractors when a real key was present (flattenClaims too narrow). Added flattenExtraction (superset) in src/extract.js — the live LLM path actually works now; ingest was never truly wired to a FULL run before this.
- **FRAGILITY (watch):** `npm test`/`npm run scorecard` regenerate samples/bundles/*.json + samples/notes/*.run.json with fresh timestamps (SC-03 + ag-4.3 live re-run extract-offline.mjs) — NON-IDEMPOTENT, tree churns on every run; once REVERTED the copy-pass humanization (objections-0). Leave tree clean via git checkout after. Root fix = extract-offline.mjs factClaim() humanization at source + make SC-03/ag-4.3 read-only (backlog).
- **End-to-end chain audit (honest):** middle done+wired (transcript→summary→data points→notes). Recording-link ingest (src/ingest.js audioUrl) BUILT+tested but NOT wired into run.js and demo runs cached-by-design (determinism); live audio_url encore key-gated. Follow-up email BUILT+tested, now being surfaced.
- **Demo runs on REAL content:** 5 gate-verified bundles (samples/bundles/01–05), 98.1% verified, the planted fake claim demoted (call-03), segment_corrected (call-05), cross-call RingHawk + dropped-TCPA ledger. `samples/audio/*.m4a` (WAVs gitignored).

## DONE + committed (durable)
- Full engine: gate (fabrication-safe, 3 audits), injection screen, registry, prompt, extract runner, run records, email choke point, exports, viewer (audio-optional), server. ~340 tests.
- Deep extractors (10 families, DiscoveryClaude-referenced, anti-arbitrage: judgments rubric-anchored or demoted to coverage; +stakeholders +consumer tags).
- Real sample deal (anonymized from real corpus, all traps planted + verified). Note copy humanized (no em-dashes, no AI tells, clean display names; receipts stay verbatim).
- DATA-FLOW.md, README + real hero screenshot, roadmap section (CRM honestly scoped).
- Command Center dashboard (`npm run control-room` → control-room.html).
- Deal-workspace UI (`npm run demo:deal` → http://127.0.0.1:4318 — navigable 5-call deal, cross-call search, commitment ledger).
- Bug report on PyAI (research/00-api-probe/BUG-REPORT.md, 10 bugs).
- Bugs/optimizations living log: team/BUGS-AND-OPTIMIZATIONS.md.

## IN FLIGHT (uncommitted / landing — a reset can recover from task outputs + these files)
- Product-pull scorecard fixtures (ambiguity/negation/coreference/absence/degradation) + CRM source-block schema (src/bundle.js) + JustCall crm_map — files: test/fixtures/scorecard/, test/scorecard-2.*.test.js (1 test currently red mid-write). NOT committed until green.
- Recall.ai reference research → research/12-recall-ai/FINDINGS.md.

## HOW TO RESUME / SEE IT
- Deal workspace: `npm run demo:deal` → http://127.0.0.1:4318
- Single call live: `node src/server.js samples/bundles/03.bundle.json samples/audio/call-03.m4a` → http://127.0.0.1:4317
- Score: `npm run scorecard`. Ops: `npm run control-room && open control-room.html`. Tests: `npm test`.

## REMAINING PATH (ranked; H=human-gated, B=buildable)
1. (H, ~30min) labels.json on one golden call → clears Gate C, uncaps Product pull.
2. (H) ≥10 rehearsals + airplane-mode run + backup recording → clears Gate A.
3. (H) D1 name decision → repo public.
4. (B) product-pull fixtures land (in flight) → Product pull toward its cap.
5. (H, deploy) redeploy the clean UI to Railway (deploy wrapper owned by a teammate — login page + jargon copy live in the deploy config, not the repo).
6. (H) $5 Anthropic key → real $/call number + live encore (optional; demo runs cached without it).

## KEY FACTS (do not re-derive)
- Gate is fabrication-safe (3 adversarial audits; no quote verifies where it doesn't occur). Receipts = verbatim quotes, gate-verified in code.
- Samples are SYNTHETIC/anonymized fiction — real calls only informed the dynamics; nothing real ships. Privacy rule absolute.
- Extraction ran OFFLINE (agent as LLM, gate-verified) — no Anthropic key needed for the cached demo; scripts/extract-offline.mjs is the harness (its factClaim() at ~:96 is the source of any remaining field:value note text — humanized in bundles, fix at source is a backlog item).
- PyAI live key in .env (gitignored): Hear + voice:synthesize scopes work; limits rps20/conc10/$10 cap. TTS endpoint is flaky (503/404/timeout — transient).
- Team: hackathon session (spec/gate/orchestration + standing auditor), projects-2f/GH+adhoc (viewer/server/README/deploy), Saritha (reasoning lane), Aakash (competitive intel).

## Checkpoint cadence
Commit + update this file + SYNC entry at each milestone. Green commits only (exclude in-flight red WIP). Memory file mirrors this at /Users/souravm/.claude/.../project_pyai_hackathon_opengong.md.
