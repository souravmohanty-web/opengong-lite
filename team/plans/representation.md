# Representation & Persona Layer — operative design (Sybill-informed, condensed, 2026-08-13)

## Summary anatomy (what ships)
Default = the 5 sections hands-on reviewers actually see in the market leader: **Outcome (first, one sentence, where the deal stands — never chronological) / Next steps / Key takeaways / Pain points / Interests** — every line cited. Hard cap **300–500 words** for a 30–45 min call (~2-min read), enforced as a token budget + post-hoc word-count assertion. Sections with nothing supported are OMITTED, never "N/A" (`applies_to: ["discovery","demo",...]` per extractor).

## The 3 style rules that make summaries read human
1. **Outcome first, one sentence.** Chronological recap is the #1 robot tell.
2. **Buyer's exact words for pains/objections, never corporate register.** Free for us — the citation IS the verbatim quote. Receipts and human prose are the same feature.
3. **Hard caps + omission over padding.** "This deal feels good" is unemittable — no line to cite. Keep exactly ONE human/relationship detail (vacation, milestone) — nobody believes a bot bothered.

## Per-field extractor pattern (copy Sybill's CRM-prompt style verbatim)
`{type, micro-prompt, validator}` per field — e.g. Next Steps (text): "bulleted, actionable; include owner & due date; ≤240 chars" · Stage (picklist): "closest valid stage; never move backward" · Close Date (date): "earliest firm date; must be ≥ today" · Budget (number): "USD; strip symbols/commas". Low-confidence/zero-citation values → "unconfirmed" rendering, never silent assertion.

## Personas (one extraction, multiple renderings — the cheap win)
- **AE**: summary.md + followup-draft.md written next to the audio file, post-run.
- **Team channel**: 8-line Slack-pasteable block (outcome, actions, objections, next steps) + **separate rep-DM block with their own to-dos** — the channel/DM split is the highest-value persona insight and costs nothing.
- **Manager**: multi-call rollup markdown (roadmap: saved scheduled queries).
- MEDDIC/BANT = extractor **bundles** (meddic.json, bant.json) — "supports MEDDIC" costs one file.

## Verified competitive facts (usable)
- Sybill has **NO claim-level citation anywhere** (checked product pages, FAQ, changelog, independent reviews).
- Their users report **"20 action items when only 4–5 existed"** — structurally impossible here: no citation → no task. This is the killer comparison.
- Their core Magic Summary template is **locked** ("no provision to modify") — ours is plugin files.
- Their latency: 5–30 min. Our local cited summary in <60s is a legitimate flex.
- Their video/body-language analysis carries EU AI Act emotion-recognition exposure — our audio-only scope is a compliance feature; say so.
- Honestly out of scope → "use Sybill/Gong" README section: live meeting bots, CRM write-back UI, pre-meeting briefs with web enrichment, collaboration workspace, forecasting. Naming these buys credibility.

## Buyer intent (in-scope subset)
Not a score: three cited text-inferred layers (expressed need → business objective → personal motivation), each with receipts, or absent. No sentiment numbers (uncitable; excluded by design and stated in README).
