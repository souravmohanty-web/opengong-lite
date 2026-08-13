# Synthesis: Aakash's preliminary findings → what we adopt (2026-08-13)

Inbox files: `inbox-aakash-gong-competitor-research.md` (verified competitive research) + `inbox-aakash-product-spec.md` (PM-input product spec).

## Adopted from the competitive research
1. **Pricing pillar, now with hard numbers:** Gong median contract $54,900/yr (Vendr, 1,127 purchases); $12K/3 seats, $30K+/9 seats datapoints. Use in README side-by-side + demo price anchor.
2. **Data lock-in → our headline feature:** verified complaint that Gong customers can't bulk-export their own call data. We are local-files-by-construction — promote **"your data is files"** to a README fold feature. Zero build cost.
3. **Refuted-narratives list (do NOT say on stage/README):** "reps don't adopt Gong / shelfware" (failed verification), "Gong customers still do manual CRM work," 15-seat minimums / mandatory platform-fee framing. This fits our no-unverified-claims rule.
4. **Funded-challenger map** (Attention $47M / Sybill $14.5M / Momentum $18M): the market's validated wedge is *post-call action*. Confirms our suggested-next-steps + commitment-ledger direction.

## Ruling on the PM product-spec (conflict, resolved)
The spec proposes a HubSpot-native action layer with pasted-transcript ingestion ("Gong records what happened. We do what was promised"). Adopted **on top of** our locked foundation, not instead of it:
- **KEPT (locked):** upload → PyAI Hear → receipts gate. Reasons: (a) pasted transcripts kill the API-gravity score (20% = PyAI minutes burned); (b) actions grounded in unverified extraction reproduce Sybill's documented fabrication failure class (verified case: an independent tester fed it a prospect who didn't exist and it wrote a complete contact profile for him; the earlier "20 action items when 5 existed" quote failed source verification 2026-08-14, see research/13-sybill-deep/01). Verification is what makes an action layer trustworthy.
- **ADOPTED:** Flow 1 (commitment → context-rich follow-up) = our commitment ledger + email-from-verified-claims + suggested_next_steps (already deep in v1). Flow 3 (momentum score) = cheap single scoring pass, candidate for Slice 2+. Flow 2 (stalled-deal revival) + HubSpot read/write = post-hackathon roadmap via the `crm_map` design (spec's custom-property names adopted: `ai_momentum_score`, `ai_next_action`, `ai_commitment_status`). Flow 4 (similar-deal playbooks) = the gold-standards mechanism, roadmap.
- **Merged positioning:** *Gong records. We prove — then we act on what was proven.*

Aakash: treat this as the standing interpretation; challenge with evidence via 💬 + SYNC per protocol.

---

## Addendum (Aug 13 ~20:15, filed by projects-2f; **A1-RATIFIED by hackathon/spec-owner ~20:40**): `inbox-aakash-architecture-comparison.md`

> RATIFICATION: the ADOPT/FLAG split below is correct and binding. Intel adopted; the baseline "our (planned)" column is REJECTED-architecture lineage (PM build-plan.md) and must never be quoted as our shape — it conflicts L1/L2/L10 + technical-spec-core. Kill-line routing: Meetily-paywalls-diarization is a VERIFIED swap-candidate into demo-run-of-show's 3-line competitive cap (code-verified, same as anarlog-provenance + Meetily-0-byte-player + playcall-plaintext). NOTE: "Gong briefs don't cite" stays README-only until Gong screenshots are captured (prior competitive-anchoring ruling — do not speak it on stage unverified). Aakash to be redirected to benchmark round 4 against DECISION-BRIEF L1-L19, not build-plan.md.

Third inbox file: OSS-field sweep + reconstructed Sybill architecture + steal-list.
**Caveat first:** its baseline is `build-plan.md` — the PM-spec this synthesis already
ruled on — so its "our (planned)" column describes the REJECTED ingestion shape
(pasted transcripts, no ASR, HubSpot-as-DB, Next.js). The intel stands; the baseline
column must not be quoted as our architecture.

### ADOPT (spec-independent, high value)
1. **Lane-empty confirmation, now with a two-camp map:** OSS splits into local
   note-takers (Meetily 29K★, anarlog 9K★, Amurex) vs bot/transcription APIs (Vexa,
   Attendee, Speaches) — nobody does the sales layer, nobody touches the CRM.
   Adapted pitch line: *"20K+ stars of open source can transcribe your sales call.
   None of it can prove a claim or act on one. That's us."*
2. **Kill-line (new, strong):** Meetily paywalls diarization out of its 29K-star OSS
   edition — ours is free-by-construction from stereo channels (L2). Same pattern as
   the anarlog finding: the popular OSS tools gate or skip exactly what we lead with.
3. **Judge-proof lines** (F-42 Q&A prep): Sybill at Series A also outsources ingestion
   (Recall.ai — in-house bots "could've taken a year"), also drafts-but-never-sends
   email (= our L8 choke point), also runs batch post-call only (= our jobs API). Our
   scope cuts are the incumbent-challenger's production architecture.
4. **Steal-list items mapped to our build:** confidence-gated review queue → our
   interpretation-gate badges + per-claim confidence already planned; amber
   "check this one" render = one schema field + one CSS class (Slice-2 candidate).
   Append-don't-replace → action-layer rule when CRM write-back ships (roadmap).
   Vexa `meeting.completed` webhook-compatible input shape → costs nothing to keep in
   mind for a future transcript-import path (NOT the primary ingest — that stays
   audio → PyAI per L1). Meetily's opt-in telemetry posture → copy if analytics ever.
5. **Positioning line, merged with our wedge:** *Sybill's architecture, Gong's target,
   zero lock-in — and receipts none of them have.*

### FLAG — PM-spec lineage, do NOT quote as our architecture (conflicts with canon)
- "ASR: None (transcripts arrive labeled)" / "`Name (Role):` format sidesteps
  diarization" → contradicts L1/L2: PyAI batch ASR + channel diarization IS the
  product's happy path and the API-gravity score.
- "Storage: None — HubSpot is the DB" → contradicts L10 (JSON files are the source of
  truth; "your data is files" is a headline feature per §2 above).
- "Next.js on Vercel, synchronous `/api/analyze`" → our stack is zero-dep Node +
  local server (technical-spec-core ruling).
- §3's framing "validates build-plan.md" → the four validations DO carry over to our
  real shape (don't build a recorder / draft-don't-send / batch post-call / grounded
  LLM) — but ours grounds via verified receipts, not RAG-context-only, which is
  stronger and is the wedge. Quote them for our build, not for build-plan.md's.
