# CHECKPOINT — resume-from-here (living; update at every milestone)

**Read this first if context reset.** Then: `team/SYNC.md` top entry (live state) → `DECISION-BRIEF.md` (locked L1–L19) → this file. The repo IS the memory; nothing important lives only in chat.

Last updated: 2026-08-13 late night. Demo: **Friday 6pm** (whole company judging).

## What this is
OpenGong Lite — open-source call notes where every claim links to the exact transcript line (receipts). Hackathon flagship (Week-1 public launch if it wins). Fictional demo deal: **Brightsmile Dental (buyer) × CallForge (vendor), competitor RingHawk.**

## Current state
- **Scorecard: 41/100** (0 reds), `npm run scorecard`. Loop depth 15/15 (the moat). Gate B (honesty) GREEN. Gate C RED (needs labels.json). Gate A pending (rehearsal). The remaining ~59 is human-gated (labels + rehearsal) + a batch of buildable fixtures in flight.
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
