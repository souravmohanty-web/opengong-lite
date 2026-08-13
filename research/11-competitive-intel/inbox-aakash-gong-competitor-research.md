# Gong Competitive Gap Research — for opengong-lite
*Deep-research run, 2026-08-13. 18 sources fetched, 90 claims extracted, 25 adversarially verified (3-vote): 17 confirmed, 8 refuted.*

## 1. Scaling challengers, ranked by momentum

### #1 Attention (attention.com) — highest momentum
- **Funding:** $30M Series B led by RTP Global (June 2026); ~$47M total ($14M Series A from Alven Oct 2024, $3.1M seed 2023). Founded 2021, NYC.
- **Traction:** 4x YoY ARR, 10x ACV growth over 2 years, 500+ customers (Abridge, Scale, Lovable, Preply, BambooHR). Self-reported.
- **Gong wedge — agentic action, not recording.** Tagline is literally "runs revenue teams — not just records them." CEO: "Most software in this space watches the call and writes up what happened. We take the next best action." Claims 20M+ agent actions/month: auto-sent follow-ups, CRM autofill, next-play execution, 200+ integrations.
- Confidence: high (PR Newswire primary + Tracxn/TechCrunch corroboration, 3-0 verified).

### #2 Sybill (sybill.ai)
- **Funding:** $11M Series A led by Greycroft (July 2024); $14.5M total. ARR $100K → $1M in 9 months in 2023; 500+ paying teams in 30+ countries at raise time (~$6.3M ARR est. later, per Getlatka).
- **Gong wedge — admin burden + rep-first design.** Automates summaries, style-matched follow-up email drafts, CRM field updates (Salesforce, HubSpot, Zoho, Dynamics). Claims 4-6 hrs/week saved per seller. Explicitly frames Gong/Chorus as "built like tools, not like an assistant" — "built for the rep's workflow, not the leader's dashboard."
- Confidence: high (TechCrunch + GlobeNewswire, 3-0 verified).

### #3 Momentum (momentum.io)
- **Funding:** $13M Series A led by FirstMark (July 2024); $18M total. 400%+ ARR growth in 2023 — but off a small base (~$300-400K entering 2023, ~$13.5M by 2025 per third-party estimates). Customers: Ramp, 1Password, Alation, Demandbase.
- **Gong wedge — automation/intelligence layer**, not a head-on recorder. Caution: the claim that it extracts data from Gong/Clari into Salesforce was *refuted* in verification — treat its positioning as automation-adjacent, possibly complementary to Gong rather than replacing it.
- Confidence: medium.

### Open-source demand signal
- **Meetily** (Zackriya Solutions): ~29,000 GitHub stars, ~3,100 forks as of Aug 2026, actively maintained. It's a meeting note-taker (adjacent to, not identical with, revenue intelligence), but it proves large appetite for self-hosted meeting-intelligence tooling. (Its "fully local, no cloud" claim was refuted — don't repeat it.)
- **Vexa** (vexa.ai): Apache 2.0 self-hostable meeting-bot API (joins Meet/Teams/Zoom, streams transcripts) — a candidate ingestion layer for opengong-lite.

## 2. Gong complaint taxonomy (verified pillars only)

**Pillar 1 — Pricing opacity and cost (strongest, most-corroborated complaint):**
- No public pricing; contact-sales-only quoting (confirmed on gong.io/pricing itself).
- Real-world: ~$1,100-$1,500+/seat/year ($113-134/user/month) + platform fee $5,000-$50,000/year. Typical contracts $30K-$100K+; Vendr median contract $54,900/yr (1,127 purchases). Small teams may pay more per seat ($1,600-2,400 for 10-25 seats).
- Reddit datapoints: $12K for 3 seats; $20K+ for 5-7 reps; $30K+ incl. setup for 9 seats.

**Pillar 2 — Data lock-in:**
- Customers report they can't self-service bulk-export their own conversation data: API supports individual call downloads only; bulk access needs admin-gated credentials + custom dev work; CSV exports lack transcript text. Corroborated by a verified 1-star Capterra review ("Buyer Beware - You can't export your data") and oliv.ai's 600+-review analysis. (2-1 vote — a major complaint, not necessarily the #1 complaint.)

**Pillar 3 — Unautomated post-call workflow:**
- Gong records and analyzes but doesn't act. This is the exact gap all three funded challengers monetize (Attention's agent actions, Sybill's follow-ups/CRM updates, Momentum's automation layer) — the market has voted with ~$80M of venture funding that this is Gong's biggest functional hole.

**Refuted narratives — do NOT repeat these in a pitch:**
- "Reps don't adopt Gong / it's surveillance shelfware" (0-3 and 1-2 votes — Sybill bets on this but primary evidence is missing)
- "Gong customers still do manual CRM work" as stated (0-3)
- 15-seat minimum, mandatory 12-month contracts, $5K-$65K implementation fees, "mandatory" platform fee framing (all refuted)

## 3. Top exploitable gaps for opengong-lite, ranked

1. **Pricing/accessibility.** Gong's $30K-100K+ opaque contracts exclude small teams entirely. The lightweight-alternative price ceiling is $19-30/user/month entry-tier (Avoma $19, tl;dv free-$20, Claap ~$30 w/ freemium, Fathom free-forever). Free/self-hosted undercuts even the undercutters.
2. **Data ownership/export.** Ship transcripts + structured data as open, bulk-exportable files as a *headline feature* — the direct antithesis of Gong's documented lock-in complaint.
3. **Post-call workflow automation.** Auto-summaries, follow-up drafts, CRM field updates — the venture-validated wedge. Even a lightweight version (webhook out / markdown follow-up draft) hits the gap.
4. **Rep-first design** (medium confidence). Serve the individual seller, not the manager dashboard — Sybill's whole positioning — but the "Gong shelfware" evidence base is weak, so treat as a design principle, not a marketing claim.

## Caveats
- Traction metrics (ARR multiples, agent actions, hours saved) are unaudited company claims from funding PR.
- Several complaint sources are competitor marketing blogs (Claap, Sybill, nimitai); dollar figures were cross-checked against Gong's own pricing page and Vendr transaction data but retain vendor-bias risk.
- Funding/traction figures are snapshots (Sybill's are July 2024; Attention's June 2026).

## Open questions worth a follow-up pass
- Current (mid-2026) ARR/customer counts for all three, and whether Sybill has raised past $14.5M.
- Frequency-ranked complaint distribution from a systematic G2/Reddit/Capterra corpus (only pricing + export complaints survived verification here).
- Whether Gong's rep-adoption problem is real (Sybill bets on it; evidence failed verification).
- Full open-source competitive set beyond Meetily/Vexa — does anything already own the bulk-export/data-ownership story?

## Key sources
- https://www.prnewswire.com/news-releases/attention-raises-30m-series-b-to-build-the-ai-system-that-runs-revenue-teams--not-just-records-them-302808821.html
- https://techcrunch.com/2024/07/31/sybill-raises-11m-for-its-ai-assistant-that-helps-salespeople-reduce-administrative-burden
- https://www.prnewswire.com/news-releases/momentum-raises-13-million-series-a-to-further-its-mission-of-transforming-customer-data-into-actionable-insights-for-revenue-teams-302203334.html
- https://www.gong.io/pricing/ · https://www.oliv.ai/blog/gong-reviews (600+ review analysis) · https://www.itsconvo.com/blog/gong-alternatives-reddit
- https://github.com/Zackriya-Solutions/meetily · https://vexa.ai/
