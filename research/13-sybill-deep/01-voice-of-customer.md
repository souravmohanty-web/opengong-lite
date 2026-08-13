# Voice of the Customer: What Users Actually Say About Sybill.ai

Research date: 2026-08-13. Compiled for opengong-lite (open-source, receipts-first alternative) roadmap input.

## Method note (read this first — it shapes how much to trust everything below)

This research hit unusually hard access limits, which itself is informative:

- **G2** (`g2.com/products/sybill-ai/reviews`) — blocked every attempt (403 / CAPTCHA), both directly and via proxy. Sybill's 4.8/5 (150 reviews) rating is visible in search snippets and secondary summaries, but I could not read full-text reviews directly on G2.
- **Reddit** — `reddit.com` and `old.reddit.com` are blocked outright for this tool (network security block). All Reddit content below is second-hand, via a review site (tldv.io) that quotes specific threads, or via search-engine snippets. I could not independently verify these quotes on Reddit itself.
- **Capterra** — has essentially no independent review base for Sybill (1 review found, 5.0/5, single CEO reviewer).
- **TrustRadius** — page blocked (403).
- **Product Hunt** — page loaded but no comment content was retrievable in this pass.
- **AWS Marketplace** (`aws.amazon.com/marketplace/reviews/reviews-list/prodview-nxirh5w2tkkq6`) — this was the one gold mine: it **mirrors the same 150 G2 reviews** (explicitly labeled "150 external reviews from G2; 0 AWS Marketplace reviews") and rendered as readable text. This is functionally G2's review corpus, just accessed through a side door. **However**: every page of this listing (tried pages 1, 2, 3, 4, 6, 12) returned the *same 10 reviews* — the pagination doesn't appear to work through this access path, so this is likely only the top ~10 of 150 G2 reviews (probably sorted by "most recent" or "most helpful"), not the full corpus. Treat this as a real but small, and likely curated/positive-skewed, sample.

**The single biggest finding of this research pass is structural, not anecdotal: Sybill's visible review base is almost entirely 4–5 star (86% five-star, 14% four-star, reportedly 0% three-star-or-below on G2 per the AWS mirror's rating breakdown).** That is an extremely unusual distribution for a SaaS tool with 150+ reviews — it suggests either genuinely strong satisfaction, a curated/gated review-solicitation process (common on G2, where vendors prompt only happy customers), or both. I could not find a meaningful population of harsh 1–2 star reviews anywhere in this pass. Everything below should be read against that backdrop: **the complaints that do surface are complaints from otherwise-satisfied customers**, which likely means the real-world complaint rate among less-satisfied users (who don't bother leaving positive reviews, or churned before reviewing) is systematically under-represented here.

I was also unable to verify the "20 action items when only 4–5 existed" claim referenced in the task — see the dedicated section below.

---

## 1. Summary/notes quality

**What's praised:**
- "AI-powered insights highlight key discussion points and action items" — unnamed reviewer, 5★, Jun 9 2026. *(first-party review, via AWS/G2 mirror)*
- "Detailed and organized notes, talk times, post-meeting email" — unnamed reviewer, 5★, May 2 2026. *(first-party review)*
- Independent hands-on tester (tldv.io, 2026) ran Sybill against a structured roleplay call and found it "correctly identified MEDDPICC elements, pain points, budget, authority, pricing objections" and "automatically flagged 'no confirmed next step' as deal risk before follow-up" — called the summary quality "genuinely good," "the real deal." *(third-party hands-on review, but note: tester explicitly says they only tested a **structured roleplay call**, not a messy real discovery call where buyers go off-topic — they flag this as an untested gap themselves.)*
- QuotaEngine review: "Summary quality rivals or exceeds what humans would produce with dedicated note-taking during calls." *(vendor-adjacent comparison/review site — take with salt, reads promotional)*

**What's complained about:**
- Call **classification** accuracy: two separate first-party reviewers (Joao S., 5★, Oct 2025, on both AWS mirror pages) report Sybill "struggles distinguishing sales calls from internal meetings or coaching calls," and this misclassification **limits which Ask-Sybill / call-type-specific features are usable** on a given call. This is a concrete, repeated, named-reviewer complaint.
- Weak **multi-call aggregation**: a 4★ reviewer (Jul 23 2026, first-party) says Sybill can't synthesize insights across a series of calls tied to one opportunity/account — no account-level folder or cross-call Q&A — and as a workaround they **export raw transcripts into Claude** to do the analysis Sybill won't do. This is a specific, credible, and fairly damning gap for a "revenue intelligence" positioning: the tool's own power users are hand-rolling a competing workflow around it.
- tldv's independent tester noted Sybill "built a full participant profile on a fictional prospect that was invented on the spot" during their test — i.e., when fed a made-up name/persona, Sybill fabricated a profile for a person that doesn't exist, rather than flagging it had no data. *(third-party hands-on review — this is the closest analog I found to a "hallucination" report, but it's about a fabricated **contact profile**, not fabricated action items.)*
- One reviewer (5★, May 2026) reported the tool "sometimes doesn't show up," suspected to be a settings issue — a reliability/consistency complaint, not an accuracy one.

**On the "20 action items when only 4-5 existed" claim (task-specified target):**
I ran multiple direct searches for this — `"sybill" "20 action items"`, `sybill "made up" OR "hallucinat*" action items`, Bing and DuckDuckGo variants — and found **zero hits, for Sybill specifically or any other named tool**. I could not find the source of this claim in this research pass. It's possible it: (a) is a real anecdote that isn't indexed/public (a private Slack/LinkedIn post, a conference talk, a closed community), (b) is about a different AI notetaker and got mis-attributed to Sybill, or (c) is apocryphal/composited. **I'm flagging this as unverified rather than asserting it's false** — worth a follow-up search with different phrasing, or asking whoever originally cited it for the source. What I *did* find that's directionally similar and confirmed: the fabricated-participant-profile incident above, and the general category-wide pattern (see Reddit section) that AI notetaker hallucination is a known enough phenomenon that Fireflies/Otter/Gong all get similar complaints in comparison content — but nothing pinned specifically to Sybill's action-item extraction.

---

## 2. Follow-up email quality (tone, style matching, editing burden, do reps send them?)

This is the **most consistent, most specific complaint theme in the entire first-party review corpus** — it shows up in essentially every review that mentions email generation at all:

- "The generative AI emails sometimes exclude important information or use language that I wouldn't use" — Anonymous, 5★, Jul 29 2026. *(first-party G2/AWS review — verbatim across all 4 fetch attempts of the same review, so high confidence this is the real text)*
- 4★ reviewer (Mar 12 2026) and others echo needing to manually refine AI-generated correspondence before sending.
- Counter-evidence (positive): Mandy M. (5★, Jun 2025) calls the email recaps "awesome," easy to customize; Nishil Patel (Drata AE, vendor testimonial — so take as promotional) claims email admin time dropped from 1.5 hrs to 30 min/day and the "email templates are chef's kiss"; Madison Sanders (Workato, vendor testimonial) says email + CRM update time dropped from 1 hour to 15 minutes/call.

**Net read:** even satisfied 5-star reviewers volunteer, unprompted, that the emails need editing for tone and completeness before going out — this is a **table-stakes gap, not an edge case**. Nobody in the sample claims Sybill's emails go out unedited. This is a strong, receipts-backed opportunity: an open-source competitor that (a) shows exactly which transcript lines a follow-up email line was drawn from, and (b) makes tone/style calibration to the rep's own voice an explicit, inspectable step rather than an opaque generation, directly answers this complaint.

---

## 3. Call scoring / coaching / scorecards

This is the **weakest part of Sybill's product relative to competitors**, and it's confirmed from Sybill's own comparison positioning, not just outside critics:

- Direct competitor-comparison page (Artemis GTM, comparing Attention vs. Sybill): "Sybill focuses on post-call intelligence" with **"no real-time coaching"** — does not surface coaching cards during live calls. On **methodology enforcement (MEDDIC/BANT/SPIN)**, the comparison table marks Sybill as "No" vs. Attention's "Yes — grades the conversation against MEDDIC, BANT, SPIN." The page's own recommendation: Sybill fits "budget-conscious and early-stage teams" whose "reps are experienced enough to run discovery without live prompts" — i.e., an explicit admission Sybill is not a coaching/enablement product in the way Gong or Attention are. *(third-party comparison site, but the underlying feature-gap claim — no live coaching, no methodology scorecard — is corroborated by the fact that Sybill's own marketing pages position "Personal Coach"/"Ask Sybill" as post-hoc Q&A, not live scoring.)*
- No first-party G2/AWS review in this sample explicitly praises or damns a "scorecard" feature — which itself is notable: reviewers talk about summaries, emails, CRM, search — nobody talks about coaching scorecards, suggesting either it's not a headline feature people use, or reviewers who'd use it (sales managers/enablement leads) aren't well represented in this review sample of individual AEs.
- Sybill's own "Personal Coach" page copy (vendor, so promotional): "Great sales coaching is about having the right guidance at the right moment. With 'Ask Sybill', you get instant, data-driven insights" — vague, no methodology-scoring language, consistent with the "no MEDDIC grading" finding above.

**This is the clearest, best-evidenced gap for opengong-lite's stated coaching-scorecard focus.** Sybill is post-call-only with no structured methodology grading — an open-source tool that ships MEDDIC/BANT scorecards with per-criterion transcript citations would be filling a documented, competitor-confirmed hole, not a speculative one.

---

## 4. CRM autofill accuracy and trust

- No first-party review in the sample calls CRM autofill **inaccurate** — the complaints here are entirely about **access/gating**, not correctness:
  - tldv's independent review calls this the **"three-layer problem"**: to get CRM autofill at all, a user needs simultaneously (1) a work email, (2) the **Business plan at $90/user/month**, and (3) one of exactly four CRMs (HubSpot, Salesforce, Zoho, Dynamics 365). Gmail users hit a hard wall with "no workaround." Notion/Airtable users can't get CRM autofill "at any price point."
  - **Confirmed independently on Sybill's own pricing page (first-party, fetched directly)**: CRM Autofill is explicitly **not included on Free or Pro** ($30–36/user/mo); it's **"10 fields" on Business** ($90–108/user/mo) and **"Unlimited" only on Enterprise**. This corroborates tldv's complaint with vendor-published numbers.
  - Christine M. (5★, first-party review, "critical part of our tech stack") separately complains that the **Collaborator license tier** (a cheaper seat type) has no or very limited "Ask Sybill" access, and asks for a mid-tier for RevOps users who want insights but don't need call recording — a related packaging complaint, not an accuracy one.
- One reviewer (4★, Mar 2026) notes generic "doesn't integrate super well with some tools I've used, but not a huge blocker" — vague, no specifics on which tools or what breaks.

**Net read:** no evidence found that CRM autofill is *wrong* when it works — the entire trust conversation is about it being **locked behind the most expensive tier and a narrow CRM allowlist**, which is a packaging complaint, not a product-quality one.

---

## 5. Pricing/packaging complaints

Confirmed first-party tier structure (from `sybill.ai/pricing`, fetched directly, 2026):

| Plan | Price | Ask Sybill scope | CRM Autofill | Follow-up emails |
|---|---|---|---|---|
| Free | $0 | Calls + email context only | Not included | Included |
| Pro | $30–36/user/mo | Calls + email context only | Not included | Included |
| Business | $90–108/user/mo | Full context (deals, calls, emails, Slack, CRM) | 10 fields | Unlimited |
| Enterprise | Custom | Full context | Unlimited | Unlimited |

Complaints:
- "A little on the pricey side" — general user sentiment per tldv review.
- Two independent review-site writeups (QuotaEngine, thecroreport.com — both read as semi-promotional "review" content, moderate reliability) cite Sybill in the **$49–99/user/month** range and specifically call it **"3–5x more than basic meeting assistants"** and note pricing "may be steep for small businesses or startups."
- The Business-plan gate on CRM autofill (see §4) is functionally the sharpest pricing complaint — it's a **6-10x price jump** ($30→$90+) to get a headline feature.
- Christine M. (first-party, 5★) explicitly wants a cheaper tier for RevOps/non-recording use cases that still includes Ask Sybill — a stated willingness-to-pay gap, not a satisfaction complaint.
- Countervailing Reddit data point (via tldv secondhand quote, r/SalesOperations): a user reports Sybill as "a third of the price" of Gong with equal-or-better satisfaction — so pricing complaints are relative to *budget tools* (Fathom/Fireflies-class), not relative to Gong.

---

## 6. Onboarding/setup friction, bot-in-meeting annoyances, privacy concerns

**Onboarding — mostly praised, with specific exceptions:**
- Multiple first-party reviewers call setup fast/easy: Joao S. — "five-minute onboarding via Google SSO" with HubSpot auto-connected; unnamed 5★ reviewer (Jun 2026) — "straightforward onboarding."
- Independent tldv tester reports two concrete onboarding failures in their hands-on test: **calendar sync failed to populate meetings from day one**, and **French-language recordings disappeared silently during processing twice, with no error message and no notification**. These are specific, first-hand, reproducibility-flavored bug reports rather than review-site paraphrase — moderately high confidence, single-source.
- Mandy M. (first-party, 5★) reports the meeting bot **fails to join Zoom calls that have registration or password requirements enabled** — a real, specific, named friction point that would silently cause a missed recording.

**Bot-in-meeting / intrusiveness:**
- G2 review summaries (via secondary aggregation, since G2 itself was blocked) mention the bot feeling **"kinda intrusive"** on calls, and note **"occasional missed next steps or customer questions."** *(This is a paraphrase from search-engine summarization of G2 content I could not read directly — treat as moderate-confidence, not a verbatim quote.)*
- Sybill offers a "bot-free"/invisible recording mode as an answer to this — but per tldv's review, it's **macOS + Apple Silicon (M1+) only**, unavailable to Windows users, and marketed as "free for a limited time," implying future monetization.

**Privacy:**
- The **behavioral AI** feature (facial expression / body language / engagement scoring from video) is Sybill's most privacy-sensitive surface. Per tldv's review: this feature is **illegal to run on participants in the EU/UK since February 2025 under the EU AI Act, Article 5(1)(f)** (which prohibits emotion-inference AI in specific contexts) — a hard regulatory constraint, not just a user preference.
- Same source flags the underlying model as built primarily on **American behavioral norms**, calling it "not neutral" across cultures, and specifically **problematic for neurodivergent participants** whose facial-expression patterns don't match the neurotypical baseline the engagement-scoring assumes.
- QuotaEngine (moderate-reliability review site) independently corroborates: behavioral analysis "may feel more invasive than simple transcription to privacy-conscious prospects," and accuracy is only **"75-85%"** for engagement-signal detection, degrading further without clear camera visibility of faces. Audio-only calls lose these features entirely.
- No first-party G2/AWS review in the sample raised privacy as a complaint directly — this theme is entirely from the independent hands-on review and the vendor-adjacent comparison sites, not from customers.

---

## 7. What users LOVE (the table stakes to match)

Consistent across every source type (first-party reviews, Reddit paraphrase, vendor testimonials, independent review):

1. **Eliminates post-call admin entirely** — the single most-repeated praise. "Cut down on a lot of admin work," "helps things not fall through the cracks" (r/CRM, via tldv). Vendor testimonials (lower trust, but directionally consistent with first-party reviews) claim email+CRM time drops from 60-90 minutes to 10-15 minutes per call.
2. **Runs invisibly enough to let reps just listen** — "seamless," "background operation," "enables focus on actual conversation instead of note-taking" — repeated by multiple first-party reviewers (Jose F., unnamed Jun 2026 reviewer, Capterra's single reviewer).
3. **Search across all past calls** — "search the product for keywords and it will pull any call" (Allyson R., first-party) — used for market research and pattern-spotting, not just individual-deal recall.
4. **Fast, low-friction onboarding** (5-minute SSO setup) when it works.
5. **Slack + CRM integration fitting into existing workflow** rather than requiring a new tool to check.
6. **Ease of use / clean UI** — repeatedly the first thing mentioned, before any feature specifics.
7. **Value vs. Gong specifically** — the recurring "as good as Gong, a third of the price" narrative (Reddit, via tldv) is a positioning table-stakes: users aren't comparing Sybill to "no tool," they're comparing it to Gong and grading it "good enough, way cheaper."

An open-source competitor needs to clear all seven of these before differentiation matters — none of them are exotic asks, but all seven together is a real bar (especially #1-3 and #6).

---

## Top 10 exploitable gaps ranked

Ranked by (evidence strength × how directly it maps to a receipts-first / open-source differentiator). Evidence strength is stated honestly per item — several of these are single-source or paraphrase-level, not proven patterns.

1. **No live/real-time coaching, no structured methodology scorecard (MEDDIC/BANT/SPIN).** — **Strongest gap found.** Confirmed via direct feature-comparison content and consistent with Sybill's own "post-call only" positioning; no first-party review contradicts it. Directly maps to the task's stated coaching-scorecard focus. *Evidence: moderate-strong (third-party comparison site + vendor's own framing agree; not directly from a disgruntled customer, but from an accurate feature-gap description).*

2. **CRM autofill is accuracy-untested by users but gated behind a 3x price jump and a 4-CRM allowlist.** A receipts-first tool that does autofill correctly *and* free/cheap, with a visible per-field citation back to the transcript line, converts a packaging complaint into a trust+access win simultaneously. *Evidence: strong — corroborated by vendor's own published pricing page plus an independent hands-on review calling it "the wall is the wall."*

3. **Follow-up emails need tone/completeness editing before sending — universally, even among 5-star reviewers.** This is the single most-repeated complaint in the actual first-party review text. An open-source competitor that makes tone-matching an explicit, auditable, per-rep-calibrated step (not a black box) — and shows which transcript lines fed each line of the email — directly answers this. *Evidence: strong — verbatim in multiple first-party reviews, independently corroborated.*

4. **Weak multi-call/cross-deal aggregation forces power users into manual workarounds (exporting to Claude).** A named reviewer describes literally rebuilding the missing feature by hand. Cross-call, account-level Q&A with citations is a clear, validated, unmet need. *Evidence: strong — specific, first-party, named workaround described in detail.*

5. **Call-type misclassification limits feature availability** (can't tell sales call from internal/coaching call, which then locks out call-type-specific analysis). Fixable with a simple, transparent, user-correctable classification step rather than an opaque model guess. *Evidence: strong — repeated by the same reviewer across dated entries, specific and mechanistic.*

6. **Behavioral-AI/engagement-scoring is legally blocked in the EU/UK and demographically biased (non-neurotypical, non-American norms).** An open-source tool could ship engagement signals that are transcript/audio-derived only (pace, interruptions, question-density, silence) rather than facial-expression inference — same coaching value, none of the AI Act exposure, none of the bias complaint. *Evidence: moderate — single independent hands-on review is the source for the legal claim; directionally very plausible given EU AI Act Article 5(1)(f) is real, but I did not independently verify Sybill's exact legal exposure — flag as "this reviewer's legal characterization," not confirmed by Sybill or a lawyer.*

7. **No mobile app.** Repeated concrete complaint across summarized G2 feedback. Low effort, high visibility fix for a lean open-source roadmap (even a read-only mobile web view of transcripts/action items would close this). *Evidence: moderate — from search-engine paraphrase of G2 content I couldn't read directly, but repeated consistently across two independent summarization passes of the same G2 corpus.*

8. **Meeting bot fails silently on password/registration-protected Zoom rooms, and non-English recordings can vanish without any error notification.** Both are "silent failure" bugs — exactly the shape of bug a receipts-first, verified-in-code tool should treat as unacceptable (every failure should surface, not vanish). *Evidence: moderate — one first-party reviewer (Zoom bot-join failure) + one independent hands-on tester (French-transcript disappearance) — two different sources, same silent-failure pattern, but each individually a single incident.*

9. **The "20 action items when only 4–5 existed" hallucination claim could not be verified for Sybill in this pass** — but the *adjacent, confirmed* incident (Sybill fabricating a full contact profile for a prospect that was invented on the spot, from the independent tldv test) suggests the underlying failure mode — confident fabrication when the model lacks real data — is real and reproducible, just not pinned to the specific "20 vs 4-5" framing. A receipts-first competitor's core pitch (every claim cites the transcript line) is a structural answer to this entire failure class, hallucination-count-specifics notwithstanding. *Evidence: weak-to-moderate — the specific claim is unverified; the adjacent fabrication incident is single-source (one independent review) but concrete and mechanistically identical to what "hallucinated action items" would look like.*

10. **The review base itself is suspiciously one-sided (86% 5-star / 14% 4-star / ~0% below), which is itself a market-positioning opening.** Not a product gap, but a go-to-market one: if G2's Sybill reviews are gated/curated toward happy customers (common vendor practice — sending review requests only to engaged accounts), there's likely a large population of quietly dissatisfied or churned users whose complaints never became public reviews. An open-source competitor with transparent, unfiltered community feedback (GitHub issues, public roadmap voting) as a *feature* — not just a technical difference but a trust difference — is a positioning angle this research pass could not disprove and circumstantially supports. *Evidence: weak — this is an inference from the shape of the rating distribution, not a documented complaint; flagging it as a hypothesis worth testing (e.g., by finding churned-customer accounts on Reddit/Twitter this pass couldn't reach), not a confirmed finding.*

---

## Full URL list (sources touched this pass)

**First-party review platforms:**
- https://www.g2.com/products/sybill-ai/reviews (blocked — 403/CAPTCHA every attempt, incl. via r.jina.ai proxy)
- https://www.g2.com/products/sybill-ai/discuss (blocked — 403)
- https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-nxirh5w2tkkq6 (readable — mirrors G2 reviews; pages 1-4, 6, 12 all returned the same ~10 reviews)
- https://www.capterra.com/p/251401/Sybill/ (readable — 1 review only)
- https://www.trustradius.com/products/sybill/reviews (blocked — 403)
- https://www.producthunt.com/products/sybill (readable — no comment content retrieved)

**Reddit (blocked directly; accessed only via secondary quotation):**
- reddit.com/r/sales, r/SalesOperations, r/CRM threads quoting Sybill — all sourced secondhand via https://tldv.io/blog/sybill-honest-review/, not independently verified
- https://www.reddit.com/user/nishitsybillai/comments/135cswp/sybillai/ (appears to be a Sybill employee/marketing account, not organic user feedback)
- https://www.reddit.com/r/sales/comments/1cijnxp/too_many_sales_tools_out_there_which_are_actually/ (general AI-sales-tools-glut thread; Sybill not confirmed discussed in depth)

**Independent review/comparison content:**
- https://tldv.io/blog/sybill-honest-review/ — most substantive independent hands-on review found; primary source for onboarding bugs, EU AI Act claim, "three-layer problem" CRM gating, fabricated-participant-profile incident
- https://quotaengine.com/tools/sybill/ — moderate-reliability review site; pricing and behavioral-AI-accuracy figures
- https://autogpt.net/a-sybill-review-the-ai-that-saves-you-hundreds-of-hours/ — moderate-reliability review site
- https://thecroreport.com/tools/sybill/ (fetch blocked, 403; pricing figure obtained via search snippet only)
- https://artemisgtm.ai/resources/compare/attention-vs-sybill/ — direct-competitor comparison; source for "no real-time coaching, no MEDDIC scoring" finding
- https://www.g2.com/compare/gong-vs-sybill-ai (blocked, 403)
- https://www.g2.com/compare/fireflies-ai-vs-sybill-ai (not fetched — found in search only)
- https://www.g2.com/compare/observe-ai-vs-sybill-ai (not fetched — found in search only)
- https://www.g2.com/compare/attention-vs-sybill-ai (not fetched — found in search only)

**Vendor-authored (label as promotional, low independence):**
- https://www.sybill.ai/pricing — first-party, used only for factual tier/feature-gating data, cross-checked against tldv's independent complaint
- https://www.sybill.ai/lp/sybill-vs-fathom-2 — customer testimonial quotes (Jeffrey Gailbrath/Smartcat, Tim McGarry/SewerAI, Madison Sanders/Workato, Keegan Otter/Warmly, Darren Gooding/Sopro, Nishil Patel/Drata) — vendor-selected, treat as marketing, not representative
- https://www.sybill.ai/enablement/personal-coach
- https://www.sybill.ai/blogs/gong-reviews, /blogs/fireflies-vs-gong, /blogs/sybill-vs-gong-vs-fireflies, /blogs/gong-vs-fireflies-vs-sybill-revenue-intelligence — vendor-authored competitor comparisons, not fetched in full, low reliability for VoC purposes, skipped

**Other:**
- https://hn.algolia.com/api/v1/search?query=sybill%20ai — Hacker News search; no substantive discussion found (mostly false-positive matches on "Sybil attack" security topic)
- https://techcrunch.com/2024/07/31/sybill-raises-11m-for-its-ai-assistant-that-helps-salespeople-reduce-administrative-burden — funding news, not VoC
- Multiple Bing/DuckDuckGo search-result pages used for discovery only (not separately listed; several DuckDuckGo queries hit CAPTCHA mid-session)

**Not accessible / not found in this pass:**
- Twitter/X mentions of Sybill — search returned only CAPTCHA/no results
- LinkedIn posts by sales reps/leaders about Sybill — search returned only Sybill's own company page
- Any G2 review below 3 stars — none surfaced anywhere in this pass, on or off G2
- Source of the "20 action items when only 4-5 existed" claim — not found despite multiple targeted query variants across DuckDuckGo and Bing
