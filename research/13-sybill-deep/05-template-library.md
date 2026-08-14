# Sybill's public template library — a full catalog sweep

**Purpose:** map Sybill's public template catalog (sybill.ai/templates, ~150+ items) to build our
starter template set. This is a **different source** from `02-email-infra.md`, which covers the
help-center DSL (`help.sybill.ai`) and one Discovery template from an old "AI Studio" samples
article. That article's templates (GHOSTED, INTRO CALL, CHECK IN, CLOSED/LOST, in ALL CAPS) are a
narrower, older set living inside the product's in-app template editor. The catalog below is
sybill.ai's public **marketing/library** surface — a much bigger, differently-organized set, some
of it clearly newer. Where the two overlap (the `#variable` / `<instruction>` DSL), this file does
not re-derive the syntax; it only notes where the catalog confirms or extends it.

**Method:** fetched `sitemap.xml` directly with `curl` for a complete, un-summarized URL list
(152 individual template pages + 12 category pages + 15 creator pages, confirmed by exact
`grep -c` counts on the raw XML), then used WebFetch against the category index pages and ~20
individual template pages to pull situation text and template bodies. Every claim below is cited
to its URL. Where a page's full sample was marked "coming soon" or I did not open the page, that's
stated as **UNCONFIRMED**, not inferred.

---

## TL;DR

- **152 individual template pages**, organized under **two independent, overlapping taxonomies**:
  a "by type" tag set (Company summaries, Deal summaries, Meeting summaries, Email follow-ups,
  Pre-meeting briefs, Automated prompts, Custom prompts — shown as filter tabs on
  [`/all-templates`](https://www.sybill.ai/all-templates)) and a "by use case" set of **12 category
  pages** (`/template-categories/*`) with their own situation-first copy. A template can carry both
  tags; the two systems don't fully agree with each other — several Deal/Meeting Summary templates
  (e.g. `post-demo-deal-summary`, `disco-call-meeting-summary`) never surface on any of the 12
  category pages at all.
- **Templates are attributed to 15 named creators** (14 named sellers/consultants + "Sybill" as
  house creator), each with their own bio page (`/template-creator/*`) — this is a
  content-marketing/community mechanic (crowdsourced authorship as social proof), not a product
  feature. Not something we need to replicate, but worth naming as a structural move.
- **Most catalog pages show a "template prompt," not a finished template.** For several — the
  ghosted-deal nudge email itself included — the actual rendered sample is marked **"coming soon"**
  on the page; what's shown instead is a short natural-language instruction a rep would paste into
  Sybill's AI ("For [deal] that's gone quiet, write a short, ready-to-send re-engagement email...").
  ([ghosted-deal-nudge-email](https://www.sybill.ai/templates/ghosted-deal-nudge-email)) Where a
  full body **is** shown (most of the 8 Email follow-up templates), it uses the exact `#variable` /
  `<AI instruction>` DSL already documented in `02-email-infra.md` — this catalog is additive
  confirmation of that syntax, not a new one.
- **Deal Summaries and Meeting Summaries share a near-identical field skeleton**, but Deal Summaries
  explicitly pull from "meetings, emails, and CRM notes" (multi-touchpoint rollup) while Meeting
  Summaries are scoped to one call. See §3 for the field-by-field diff — this is the single most
  directly reusable finding for our contact/deal split.
- **A partial update to `02-email-infra.md`'s "no automatic routing" finding:** several
  Deal-Execution-Strategy templates are marketed with call-triggered language — "Deal doctor," for
  instance, says outright: *"On every call, auto-diagnose the deal's health and flag new risks."*
  ([deal-doctor-auto-risk-alert](https://www.sybill.ai/templates/deal-doctor-auto-risk-alert)) This
  is scoped to **risk-alert/summary-type outputs**, not to the *follow-up email* specifically —
  the Email Follow-ups category still shows no auto-trigger language anywhere in the 8 templates
  checked. So the two findings don't contradict: Sybill appears to market some automatic,
  event-triggered *analysis* generation, while follow-up *emails* remain rep-initiated everywhere
  this sweep looked. Mechanism (webhook? in-app cron? still-manual-but-suggestively-named?) is
  **UNCONFIRMED** — the marketing copy asserts the trigger, no doc explains how it fires.
- **One dead link found in their own sitemap:** `/templates/smart-follow-up-email-generator`
  returns HTTP 404 despite being listed in `sitemap.xml`.

---

## 1. The taxonomy

### 1.1 The two tag systems

**By type** (tabs on [`/all-templates`](https://www.sybill.ai/all-templates)): Company summaries,
Automated prompts, Custom prompts, Deal summaries, Meeting summaries, Email follow-ups,
Pre-meeting briefs. **By role** (same page): RevOps, Sales Leaders, Customer Success, Sales
Managers, Account Executives. **By use case** — 12 category pages, each with its own
situation-forward marketing copy:

| Category | URL | Templates found |
|---|---|---|
| Engagement & Follow-up | [`/template-categories/engagement-follow-up`](https://www.sybill.ai/template-categories/engagement-follow-up) | 8 |
| Qualification | [`/template-categories/qualification`](https://www.sybill.ai/template-categories/qualification) | 12 |
| Deal Inspection | [`/template-categories/deal-inspection`](https://www.sybill.ai/template-categories/deal-inspection) | 5 |
| Meeting Prep | [`/template-categories/meeting-prep`](https://www.sybill.ai/template-categories/meeting-prep) | 13 |
| Coaching & Performance | [`/template-categories/coaching-performance`](https://www.sybill.ai/template-categories/coaching-performance) | 14 |
| Forecasting | [`/template-categories/forecasting`](https://www.sybill.ai/template-categories/forecasting) | 5 |
| Buyer Intelligence | [`/template-categories/buyer-intelligence`](https://www.sybill.ai/template-categories/buyer-intelligence) | 12 |
| Competitor Intelligence | [`/template-categories/competitor-intelligence`](https://www.sybill.ai/template-categories/competitor-intelligence) | 4 |
| Customer Handoff | [`/template-categories/customer-handoff`](https://www.sybill.ai/template-categories/customer-handoff) | 10 |
| Deal Execution & Strategy | [`/template-categories/deal-execution-strategy`](https://www.sybill.ai/template-categories/deal-execution-strategy) | 16 |
| Reporting | [`/template-categories/reporting`](https://www.sybill.ai/template-categories/reporting) | 16 |
| Win/Loss Analysis | [`/template-categories/win-loss-analysis`](https://www.sybill.ai/template-categories/win-loss-analysis) | 3 |

That's 118 category-page appearances against 152 total slugs in the sitemap (verified by
`grep -c '/templates/'` on the raw XML). The remaining ~34 either carry only "by type" tags (this
accounts for most of them — several Deal/Meeting Summary and Recap templates, deep-dived in §1.3
and §3, never appear on any of the 12 category pages) or are self-titled enough that the sweep
didn't open them individually; those are listed by slug only in §1.4, marked UNCONFIRMED.

### 1.2 Engagement & Follow-up — full category (8/8), the closest analog to our product

This is the category our own follow-up email work maps to most directly, so every template in it
was opened. Source for the situation lines:
[`/template-categories/engagement-follow-up`](https://www.sybill.ai/template-categories/engagement-follow-up).
Structural detail is per-template page (cited inline).

| Template | Situation (their words) | Creator | Sample shown? |
|---|---|---|---|
| [Ghosted-deal nudge email](https://www.sybill.ai/templates/ghosted-deal-nudge-email) | "Re-engage prospects when active deals go quiet" | Sybill | **No — "coming soon"** |
| [Discovery follow-up](https://www.sybill.ai/templates/discovery-follow-up) | "Capture momentum after initial calls by recapping insights and clarifying next steps" | Ryan Chiu | Yes |
| [Demo follow-up email](https://www.sybill.ai/templates/demo-follow-up-email) | "Reinforce demo takeaways and establish next action steps" | Nishit Asnani | Yes |
| [Negotiation follow-up email](https://www.sybill.ai/templates/negotiation-follow-up-email) | "Document pricing, terms, and timelines to maintain momentum during negotiations" | Nikki Gagnon | Yes |
| [Closed-lost re-entry email](https://www.sybill.ai/templates/closed-lost-re-entry-email) | "End lost deals professionally while maintaining future engagement potential" | Kendra Wagner | Yes |
| [Closed-won kickoff email](https://www.sybill.ai/templates/closed-won-kickoff-email) | "Celebrate wins and prepare for smooth onboarding transition" | Sybill | Yes |
| [CS handoff email](https://www.sybill.ai/templates/cs-handoff-email) | "Introduce buyers to Customer Success with captured goals and next steps" | Matt Swim | Yes (preview image) |
| [Trial follow-up email](https://www.sybill.ai/templates/trial-follow-up-email) | "Keep trials on track by connecting follow-ups to buyer priorities" | Matt Swim | Yes |

**Structure, where shown** (all seven with a visible body use the identical shape and the exact
`#variable` / `<AI instruction>` DSL from `02-email-infra.md`):

1. Subject line — short, 2-4 words, no punctuation flourish: *"Next steps after our demo,"*
   *"Great connecting today,"* *"Aligning on terms,"* *"Thanks for your time,"* *"Making the most
   of your trial,"* *"Excited to get started together."*
2. Greeting — `Hi #receivers_first_name,`
3. Opener — one sentence anchoring the specific call: thanks/acknowledgment + `#meeting_date_time`
   or `#meeting_title` + `#receivers_company`.
4. One or two body sentences pulling from `#outcome`, `#pain_points`, `#key_takeaways`, or
   `#interests` — a recap grounded in what that call surfaced.
5. **A single `<AI instruction>` block that is genuinely conditional** — the recurring pattern
   across every one of these is "if X was discussed, restate it via `#next_steps`; if not, propose
   1-2 logical next actions." Verbatim from Discovery follow-up: *"If specific next steps were
   mentioned during the meeting, restate them concisely here using #next-steps. If not, recommend
   1–2 logical next steps for Discovery... based on #pain_points and persona."*
   ([discovery-follow-up](https://www.sybill.ai/templates/discovery-follow-up)) This same
   if-said/else-propose branch appears in the Closed-won kickoff, Trial follow-up, and Negotiation
   templates too — it's the one deliberate design move that recurs across the whole category.
6. Closing question — short, low-pressure, inviting a reply ("Does that sound good?", "Would you
   be open to me reaching back out in a few months...?").
7. Signature — `#sender_first_name`.

**Full verbatim example** (Closed-won kickoff email, the shortest and cleanest one shown):

```
Hi #receivers_first_name,

Thrilled to welcome #receivers_company on board. From our conversations, your near-term focus is
#outcome, and we're excited to help you get there.

<If onboarding or kickoff steps were discussed, recap them here using #next_steps. If not, propose
the first step (e.g., kickoff call, CSM intro). Keep tone warm, simple, and human. Use short
sentences. No fluff. Make it skimmable.>

Looking forward to partnering with you.
— #sender_first_name
```
Source: [closed-won-kickoff-email](https://www.sybill.ai/templates/closed-won-kickoff-email).

**Closed-lost re-entry** is worth quoting too, since it's the closest cousin to our no-next-step
and ghosted templates:

```
Subject: Thanks for your time

Hi #receivers_first_name,

Thanks to you and the #receivers_company team for evaluating #sender_company. From our last call
(#meeting_title), I captured #outcome and #pain_points as important factors in the decision.

<Recap reason for not moving forward briefly, maintain professional tone, suggest staying in
touch, use short friendly sentences without jargon or salesy language>

Would you be open to me reaching back out in a few months with any updates that might change the
fit?

— #sender_first_name
```
Source: [closed-lost-re-entry-email](https://www.sybill.ai/templates/closed-lost-re-entry-email).

**The one that matters most for this brief — Ghosted-deal nudge email — is genuinely thin on this
sweep.** The category page's one-line pitch is *"Re-engage prospects when active deals go quiet."*
The template page itself shows only the underlying AI prompt, not a rendered template:

> *"For [deal] that's gone quiet, write a short, ready-to-send re-engagement email to my main
> contact, grounded in where we actually left off, warm and easy to reply to, in my voice and with
> a subject line."*
([ghosted-deal-nudge-email](https://www.sybill.ai/templates/ghosted-deal-nudge-email))

Note the phrase **"grounded in where we actually left off"** — this is a marketing promise of
specificity with, per `02-email-infra.md` §6, no documented citation/grounding mechanism behind
it anywhere else in Sybill's materials. The sample email body itself is marked "coming soon" on
the page, so its actual subject-line formula, opener, and CTA shape are **UNCONFIRMED** — the only
thing confirmed is the prompt and the promise. That gap is exactly what §4's adapted version below
is built to close.

### 1.3 Deal Summaries and Meeting Summaries — the type-tag families (see §3 for the diff)

Sourced from [`/template-types/deal-summaries`](https://www.sybill.ai/template-types/deal-summaries)
and [`/template-types/meeting-summaries`](https://www.sybill.ai/template-types/meeting-summaries),
plus six individual template pages opened for field-level detail. Full breakdown in §3 — listed
here for the taxonomy record:

**Deal summaries** (4 featured on the type page, all "coming soon" for a rendered sample):
[Post-trial deal summary](https://www.sybill.ai/templates/post-trial-deal-summary),
[Post-disco deal summary](https://www.sybill.ai/templates/post-disco-deal-summary),
[Closed/lost deal summary](https://www.sybill.ai/templates/closed-lost-deal-summary),
[Post-demo deal summary](https://www.sybill.ai/templates/post-demo-deal-summary) (this one *does*
show a preview screenshot).

**Meeting summaries** (7 featured on the type page, all "coming soon" for a rendered sample):
[All-hands recap](https://www.sybill.ai/templates/all-hands-recap),
[Onboarding meeting summary](https://www.sybill.ai/templates/onboarding-meeting-summary),
[Post-demo meeting summary](https://www.sybill.ai/templates/post-demo-meeting-summary),
[Closed/won meeting summary](https://www.sybill.ai/templates/closed-won-meeting-summary),
[All hands meeting summary](https://www.sybill.ai/templates/all-hands-meeting-summary),
[Disco call meeting summary](https://www.sybill.ai/templates/disco-call-meeting-summary),
[Closed/lost meeting summary](https://www.sybill.ai/templates/closed-lost-meeting-summary).

Neither type page states a definition distinguishing deal-level from meeting-level explicitly —
that distinction has to be read off the field prompts themselves (§3).

### 1.4 Everything else — by category, situation-first

The remaining nine categories were swept for name + situation only (not opened individually for
field structure — that's UNCONFIRMED for these, flagged per-template below where the name alone
doesn't make the shape obvious).

**Qualification** (12 — a full permutation of deal-scoring frameworks, each shipped as both a
single-deal "deal inspect" version and an "every open deal" 360° roll-up version):
[SPICED deal inspect](https://www.sybill.ai/templates/spiced-deal-inspect) /
[SPICED 360°](https://www.sybill.ai/templates/spiced-360),
[MEDDPICC deal inspect](https://www.sybill.ai/templates/meddpicc-deal-inspect) /
[MEDDPICC 360°](https://www.sybill.ai/templates/meddpicc-360),
[BANT deal inspect](https://www.sybill.ai/templates/bant-deal-inspect) /
[BANT 360°](https://www.sybill.ai/templates/bant-360),
[CHAMP deal inspect](https://www.sybill.ai/templates/champ-deal-inspect) /
[CHAMP 360°](https://www.sybill.ai/templates/champ-360),
[FAINT deal inspect](https://www.sybill.ai/templates/faint-deal-inspect) /
[FAINT 360°](https://www.sybill.ai/templates/faint-360),
[Hybrid qualification 360°](https://www.sybill.ai/templates/hybrid-qualification-360) ("Scores
every open deal with the right framework for its segment — BANT, SPICED, or MEDDICC"),
[Qualification gap analysis](https://www.sybill.ai/templates/qualification-gap-analysis).
Structure UNCONFIRMED beyond the situation blurbs — the "deal inspect vs. 360°" single/all-deals
pairing is itself a pattern worth naming (see §2).

**Deal Inspection** (5): [Pipeline health check](https://www.sybill.ai/templates/pipeline-health-check),
[Pipeline update for your manager](https://www.sybill.ai/templates/pipeline-update-for-your-manager),
[Pipeline metrics check](https://www.sybill.ai/templates/pipeline-metrics-check),
[Buyer-verified stage check](https://www.sybill.ai/templates/buyer-verified-stage-check) ("Reveals
deals staged based on seller actions rather than buyer signals" — a direct cousin of our
gate-verification thesis, worth a closer look later if we build a stage-check feature),
["Poopy" pipeline report](https://www.sybill.ai/templates/poopy-pipeline-report) (their own
irreverent naming choice, kept verbatim — surfaces missing-next-steps and single-threading, ranked
by urgency).

**Meeting Prep** (13): mostly internal, pre-call briefs — Morning/Team/Executive/Customer/Sales-team
meeting prep, Demo call prep, Customer meeting brief, Disco call pre-meeting brief, Deal review
prep, Demo call brief, Sales manager 1:1 brief, Executive meeting brief, Discovery call prep. Full
list at [`/template-categories/meeting-prep`](https://www.sybill.ai/template-categories/meeting-prep).
Not deep-dived; these are the inbound-facing counterpart to summaries, outside this brief's scope.

**Coaching & Performance** (14): Discovery quality review, New AE onboarding plan, What top reps
do differently, Flight-risk early warning, Weekly five F's team diagnostic, Coaching by region,
Rep revenue scorecard, Best vertical to focus on, Win story builder, Rep report card, Interview
guide builder, Value vs. feature self-audit, Discovery question generator, Discovery call
scorecard. Full list:
[`/template-categories/coaching-performance`](https://www.sybill.ai/template-categories/coaching-performance).
Manager-facing, out of scope for our rep-facing email set.

**Forecasting** (5): Forecast/commit dashboard, Win likelihood, Next quarter navigator, Revenue
risk report, Deal slippage forecast.
[`/template-categories/forecasting`](https://www.sybill.ai/template-categories/forecasting).

**Buyer Intelligence** (12): Pricing & commercials tracker, ICP + outbound campaign from wins, Why
customers buy (win themes + quotes), Champion coverage (whole pipeline), Testimonial finder,
Champion activation plan, Buyer sentiment tracker, Multi-threading map, Needs-to-solution mapping,
Buyer needs summary, Buying signal finder, ICP fit check.
[`/template-categories/buyer-intelligence`](https://www.sybill.ai/template-categories/buyer-intelligence).

**Competitor Intelligence** (4): Competitive win/loss dashboard, Battlecard builder, Competitor
objections (trends), Competitor tracker.
[`/template-categories/competitor-intelligence`](https://www.sybill.ai/template-categories/competitor-intelligence).

**Customer Handoff** (10): Expansion summary, Customer health summary, Renewal cockpit, Account
health & churn radar (CS), Onboarding risk report, SDR-to-AE handoff brief, Handoff quality
dashboard (org), Enterprise account transition, Handoff quality (one rep), Sales-to-CS handoff
brief. [`/template-categories/customer-handoff`](https://www.sybill.ai/template-categories/customer-handoff).

**Deal Execution & Strategy** (16, the biggest category): Prospect company summary, Trial success
plan (on trial start), Stage-gate/go-no-go check, Auto win-story/loss-review (on close), Post-call
autopilot (tasks + CRM), Deal doctor (auto risk alert), Upsell finder, Outbound objection analysis,
Mutual action plan builder, The objection audit, End-of-day wrap-up, Objection prep, Daily deal
pulse, Custom deck builder, Closing collateral checklist, Board-ready summary for champions.
[`/template-categories/deal-execution-strategy`](https://www.sybill.ai/template-categories/deal-execution-strategy).
This category carries the parenthetical-trigger naming pattern ("on close," "on trial start,"
"auto risk alert") discussed in the TL;DR and §2.

**Reporting** (16, overlaps heavily with the Deal-summary/Meeting-summary type tags under different
"recap" naming — see §3 sidebar): Executive/QBR company summary, Company overview summary,
All-hands recap, Product gap analysis, Executive dashboard (this quarter), Fractional CRO gap
analysis, Post-trial/Post-demo/Post-discovery deal *recap* (distinct slugs from the *summary*
versions — both exist), Onboarding call recap, Closed-lost recap, Closed-won recap, Demo call
recap, Discovery call recap, Post-trial deal summary, Post-disco deal summary.
[`/template-categories/reporting`](https://www.sybill.ai/template-categories/reporting).

**Win/Loss Analysis** (3): Win/loss review ("Top win and loss reasons from a rep's last 10 deals,
with coaching to improve"), Win/loss themes, Executive win/loss dashboard.
[`/template-categories/win-loss-analysis`](https://www.sybill.ai/template-categories/win-loss-analysis).
Note: the sitemap also lists a fourth, differently-slugged
`/templates/win-loss-report` that never surfaced on this category page — not opened, situation
UNCONFIRMED, possibly a legacy/duplicate URL.

**Uncategorized-on-any-of-the-12-pages, name-only, structure and full situation UNCONFIRMED** (not
opened this sweep): `1-1-coaching-summary`, `all-hands-meeting-summary`, `business-case-builder`,
`business-case-template`, `collateral-strategy-org`, `competitor-objection-analysis` (singular —
distinct slug from the plural `competitor-objections-trends` above), `cs-partnership-report`,
`follow-up-demo-mutual-action-plan`, `internal-handoff-meeting-prep`, `manager-brief`,
`methodology-meter`, `objection-trends---weekly`, `one-thing-feedback-model-for-reps`,
`org-coaching-themes`, `pipeline-management-blind-spots`, `pipeline-risk-report`,
`praise-signal-monitor`, `predicted-vs-actual-report`, `purchase-probability-deal-score`,
`qbr-performance-dashboard`, `rep-level-five-fs-one-on-one`, `rep-performance-gap-finder`,
`rep-pipeline-confidence-risk-report`, `revops-priority-map`, `the-deal-detective`,
`win-loss-report`. And one dead link: `smart-follow-up-email-generator` returns **HTTP 404** as of
this sweep despite being listed in `sitemap.xml` — confirmed by direct fetch.

---

## 2. The patterns — what repeats across the catalog

**Subject-line formula: short, lowercase-register, no colon-and-hook clickbait.** Every subject
line pulled from a rendered template is 3-5 words, sentence case, and names the *topic* rather than
teasing it: "Next steps after our demo," "Great connecting today," "Aligning on terms," "Thanks for
your time," "Making the most of your trial," "Excited to get started together." None of them use a
question mark, an emoji, or urgency language ("don't miss," "last chance"). This is a deliberate
restraint — a genre choice against the pushier subject-line style common in cold outbound.

**Opener always anchors a specific, nameable call moment before saying anything else.** Every
rendered template's first substantive sentence references `#meeting_title` or `#meeting_date_time`
or both, before any pitch content. The call is real and named before the ask is made.

**The if-said/else-propose branch is the one recurring structural move.** Every category-8 email
with a visible body uses the same conditional shape: *"if [outcome type] was discussed, restate it
via #variable; if not, propose 1-2 logical next actions."* This appears near-verbatim in Discovery
follow-up, Closed-won kickoff, Trial follow-up, and Negotiation follow-up. It's the DSL doing real
work — it's also the exact point where an ungated model call can invent a next step that was never
agreed, since nothing in the visible template stops the "propose 1-2 logical next actions" branch
from firing on a call where nothing concrete happened (see `02-email-infra.md` §6-7 on the missing
grounding layer; the catalog confirms the branch exists in more templates than the one help-center
example did).

**CTA shape is uniformly soft and reply-inviting, never a scheduling link or hard ask.** "Does that
sound good?", "Would you be open to me reaching back out in a few months...?", a proposed first
step phrased as an offer, not a demand. No template in this category uses a calendar-link CTA or a
countdown/urgency CTA.

**Length norm: 4-6 sentences, one paragraph plus a closing line.** None of the rendered bodies run
past roughly 120 words. This matches the length discipline `02-email-infra.md` §5 documents as a
first-class rep-facing control (Short/Medium/Don't-Specify) — the catalog's own defaults sit at the
short end of that range.

**The "deal inspect vs. 360°" pairing (Qualification category) is a naming pattern worth
borrowing conceptually, not copying literally:** every scoring framework ships as two products —
one scoped to a single deal, one scoped to "every open deal." This is the same
contact/deal-vs-portfolio split we're already building, just applied to qualification scoring
instead of summaries.

**The "(on close)" / "(on trial start)" / "(auto risk alert)" parenthetical-trigger naming
convention (Deal Execution & Strategy category) is marketing language for event-triggered
generation**, and it's the strongest evidence in the whole catalog that Sybill is moving toward (or
at least messaging toward) automatic, call-triggered content rather than the purely
dropdown-driven selection `02-email-infra.md` documented from the help center. It's scoped to
internal analysis outputs (deal-health diagnosis, win/loss story capture), not to the outbound
follow-up email — see TL;DR.

**Ghosted-deal nudge, specifically — what would make it work as a genre piece, based on what is and
isn't shown:** the one line of copy Sybill commits to — *"grounded in where we actually left
off"* — names exactly the right ingredient (a real, specific, nameable moment from the actual call,
not a generic "just checking in") but the page doesn't show the mechanism or the rendered result.
The genre's implicit promise, read across the category's sibling templates (all of which anchor on
`#meeting_title` / `#meeting_date_time` / `#outcome` before anything else), is: **name the exact
thing that was true when contact stopped, then ask one soft question.** That's a promise our claim
system can actually keep with a citation; theirs, per every other primary source checked in
`02-email-infra.md`, has no verification step behind it.

---

## 3. Deal summaries vs. meeting summaries — the field-level diff

Six template pages were opened for field detail: four Deal Summaries
([post-demo](https://www.sybill.ai/templates/post-demo-deal-summary),
[post-disco](https://www.sybill.ai/templates/post-disco-deal-summary),
[closed-lost](https://www.sybill.ai/templates/closed-lost-deal-summary),
[post-trial](https://www.sybill.ai/templates/post-trial-deal-summary)) and five Meeting Summaries
([disco call](https://www.sybill.ai/templates/disco-call-meeting-summary),
[post-demo](https://www.sybill.ai/templates/post-demo-meeting-summary),
[closed-won](https://www.sybill.ai/templates/closed-won-meeting-summary),
[closed-lost](https://www.sybill.ai/templates/closed-lost-meeting-summary)). Neither type page
states the distinction in prose; it has to be read off the field prompts, but once you line the
two families up side by side it's a clean, consistent split.

### Shared skeleton

| Deal summary core fields | Meeting summary core fields |
|---|---|
| Current status | Outcomes |
| AI tasks | AI tasks |
| Qualification (BANT-style) | Conversation starters |
| Pain points | Qualification |
| Value proposition | Pain points |
| Potential blockers | Participants |
| *(3-5 situation-specific fields)* | FAQ |
| | Key takeaways |
| | *(2-3 situation-specific fields)* |

Both families always keep "AI tasks," "Qualification," and "Pain points" as constants, whatever the
situation. That's their version of a fixed chrome layer analogous to our claim-slot chrome
(greeting/opener/signoff) — always present, never situation-specific.

### The actual differentiator: data scope, stated explicitly in the field prompts

**Deal summaries roll up across the whole deal, explicitly multiple touchpoints, in their own
prompt language:**
- Post-demo deal summary, "AI tasks" field: *"Extract action items across meetings, emails, and
  CRM notes with ownership assignment."* ([post-demo-deal-summary](https://www.sybill.ai/templates/post-demo-deal-summary))
- Post-disco deal summary, same field: *"Extract deal-level action items across meetings, emails,
  and CRM notes."* ([post-disco-deal-summary](https://www.sybill.ai/templates/post-disco-deal-summary))
- Closed/lost deal summary, "Root cause" field: *"Analyze calls, emails, and notes to surface the
  true root cause. Highlight 1–3 moments where a different play could have changed the outcome"* —
  explicitly reaching across the whole deal's call history, not one call.
  ([closed-lost-deal-summary](https://www.sybill.ai/templates/closed-lost-deal-summary))
- Post-trial deal summary: *"Analyze recent engagement (calls, emails, Slack)... references 'every
  conversation' to keep summaries current."* ([post-trial-deal-summary](https://www.sybill.ai/templates/post-trial-deal-summary))

**Meeting summaries are explicitly scoped to one call.** None of the five opened use
cross-call/cross-touchpoint language anywhere in their field prompts — every field ("Discovery
gaps," "Buyer reactions," "Objection handling," "Win reasons," "Lost reason deep-dive") reads as a
single-call read. Disco call meeting summary's "Discovery gaps" field: *"Highlight critical
discovery questions left unanswered (budget, authority, timing). Recommend 2 next questions to
ask"* — a next-call recommendation grounded in *this* call, not a rollup.
([disco-call-meeting-summary](https://www.sybill.ai/templates/disco-call-meeting-summary))

### Situation-specific fields, by family member

| Template | Distinctive fields (deal-level, multi-touch) |
|---|---|
| Post-demo deal summary | Decision drivers, Objection handling strategy, Deal momentum plan, Intent signals |
| Post-disco deal summary | Strategic gaps, Champion development, Path to next steps, Deal risks, Buying signals, Exec alignment |
| Closed/lost deal summary | Closed/lost reason, Root cause, Competitive playbook, Re-engagement plan, Learning summary |
| Post-trial deal summary | Trial success criteria, Engagement risk check, Expansion lever, Proof of value |

| Template | Distinctive fields (single-call) |
|---|---|
| Disco call meeting summary | Discovery gaps, Champion signals, Next step recs |
| Post-demo meeting summary | Buyer reactions, Objection handling, Momentum actions |
| Closed/won meeting summary | Win reasons, Handoff prep, Expansion potential |
| Closed/lost meeting summary | Lost reason deep-dive, Competitor insight, Future re-engagement |

**Read for our data model:** their Deal Summary is our aggregate deal-state view (claims rolled up
across every call in a deal, keyed by `deal_id`); their Meeting Summary is our per-call notes page
(claims scoped to one `call_id`). The naming split is clean enough to borrow directly — worth
naming our two views "Deal notes" and "Call notes" rather than inventing new nomenclature, since
it's already the vocabulary a rep coming from this space expects. The one thing we do that they
don't document anywhere in this catalog: **the commitment ledger** — a deal-level view that
diffs what was promised on an earlier call against what happened on a later one
(`README.md` line 60). Their closest analog, "AI tasks" rolled up "across meetings, emails, and CRM
notes," is a flat list, not a promised/delivered diff — there's no field in any of the four Deal
Summary templates that says "this was promised on call N and never mentioned again."

---

## 4. Our starter template set v1

Design rule, unchanged from `02-email-infra.md` §7: every asserting line traces to a gate-verified
claim (`status ∈ {verified, segment_corrected}`, per `src/email.js`). `<<AI instruction>>` blocks
are restyling passes over the already-gated claim set for this email — never a fresh reach into the
transcript. An empty slot renders nothing; it never gets filled with a plausible-sounding sentence.
Voice: no em dashes, no "X, not Y" parallelism, no AI-tell words, short sentences, second person.
Names below use the fictional `samples/DEAL-STATE.md` arc (Maya = rep at CallForge, Rahul =
Brightsmile Dental Group ops director, RingHawk = incumbent competitor) purely to make the samples
concrete — swap freely.

Routing triggers below are written against our real extractor schemas
(`extractors/next_steps.json`, `extractors/pricing.json`, `extractors/objections.json`,
`extractors/buying_stage.json`) — every enum value named is a real field, not invented for this
doc.

### 1. Post-discovery follow-up

- **Routing trigger:** `pain` claims present on this call AND no `pricing` claims yet on this deal
  AND at least one `next_steps` claim exists. Reads as: the problem got named, nothing commercial
  has come up, something got agreed.
- **Block structure:** static chrome (greeting, opener) → claim-slot: pain recap (1-3 `pain`
  claims, verbatim text) → claim-slot: next steps (owner + due, per `stepMeta()`). No pricing
  slot rendered — nothing to render, so nothing renders.
- **Sample:**

  > Hi Rahul,
  >
  > Thanks for the time today. Here's what I took away.
  >
  > What we covered:
  > - After-hours bookings are getting missed, about ten a week by your count.
  > - Calls are dropping mid-transfer between the front desk and the doctor's line.
  >
  > Next steps:
  > - I'll send over the SOC 2 report. (Maya · Friday)
  >
  > Every line above came from something said on the call. If I got any of it wrong, tell me and
  > I'll fix it.
  >
  > Best,
  > Maya

### 2. Post-demo follow-up

- **Routing trigger:** `buying_stage.stage.value ∈ {evaluating, shortlist}` AND `next_steps`
  claims of `type ∈ {concrete_date, send_info}` present AND (optionally) `objections` claims with
  `handling = addressed`.
- **Block structure:** claim-slot outcome line (first `summary` claim, lifted per `composeEmail()`)
  → claim-slot: objections addressed (buyer's stated concern + how it landed, from
  `objections[].text` + `rep_response.text`) → claim-slot: next steps.
- **Sample:**

  > Hi Rahul,
  >
  > Thanks for the time on the demo. Here's what I took away, and what we said we'd do next.
  >
  > The pilot scope landed, and answering machine detection and SMS follow-ups both stood out to
  > you.
  >
  > What we covered:
  > - You asked about downtime during onboarding. I walked through the weekend cutover we use for
  >   multi-location practices.
  >
  > Next steps:
  > - I'll send the SOC 2 report and the TCPA one-pager. (Maya · Friday)
  > - You'll send over your current call-volume report.
  >
  > Every line above came from something said on the call. If I got any of it wrong, tell me and
  > I'll fix it.
  >
  > Best,
  > Maya

### 3. Pricing follow-up

- **Routing trigger:** `pricing` claims present with `kind ∈ {quote, discount_request, budget}` OR
  `pricing_signal ∈ {sticker_shock, comparison, discount_request, competitor_price_cited}`.
- **Block structure:** claim-slot: pricing recap (verbatim `pricing[].text`, no computed totals,
  no rounding, no math the model did itself) → claim-slot: objections addressed where
  `category = price` → claim-slot: next steps. Zero tolerance: a number renders only if it is the
  literal text of a gate-passed claim.
- **Sample:**

  > Hi Rahul,
  >
  > Thanks for the time today. Here's where pricing landed.
  >
  > What we covered:
  > - Twenty eight per seat, and you mentioned RingHawk's renewal quote came in around twenty two.
  > - You asked about a fifteen percent discount for the multi-location commitment.
  >
  > Next steps:
  > - I'll put together numbers that reflect the discount ask. (Maya)
  > - Dr. Mehta signs off once the number is final.
  >
  > Every line above came from something said on the call. If I got any of it wrong, tell me and
  > I'll fix it.
  >
  > Best,
  > Maya

### 4. Commitment-fulfillment (the ledger) — ours, no Sybill analog found

- **Routing trigger:** at least one `next_steps` claim from an earlier call in the same `deal_id`
  where `owner = rep`, cross-referenced against every later call's claim set. Not mentioned again
  in a later call's `next_steps` or `summary` claims → still open. Referenced as done in a later
  claim → delivered. This is the one template genre this sweep found **no equivalent for anywhere
  in Sybill's 152-template catalog** — the closest analog, "AI tasks... across meetings, emails,
  and CRM notes" in the Deal Summary templates (§3), is a flat action list, not a
  promised-vs-delivered diff.
- **Block structure:** static chrome → claim-slot: ledger table (each earlier rep-owned
  `next_steps` claim, marked delivered or still-open, each half of the pair carrying its own claim
  id and call citation) → claim-slot: this call's new next steps.
- **Sample:**

  > Hi Rahul,
  >
  > Thanks for the time today. Quick check on where things stand.
  >
  > Here's what I promised, and where it is:
  > - SOC 2 report: sent.
  > - TCPA one-pager: I still owe you this. Sorry for the delay, sending it today.
  >
  > And from you:
  > - Call-volume report: received, thank you.
  >
  > New from today:
  > - We're scoping a two-location pilot, ninety days. (Maya · this week)
  >
  > Every line above came from something said on a call. If I got any of it wrong, tell me and
  > I'll fix it.
  >
  > Best,
  > Maya

### 5. Ghosted-deal nudge (adapted from their genre piece)

- **Routing trigger:** a `next_steps` claim with `type ≠ no_next_step` exists on the deal's most
  recent call, and no further call has been logged against that `deal_id` after N days (silence
  detector on the deal, not on the calendar).
- **Block structure:** claim-slot: last real moment (the single most recent `next_steps` or
  `summary` claim from the last actual call, cited by name) → static soft CTA. This is the
  structural fix for the gap §1.2 and §2 name: Sybill's own template page promises the email will
  be *"grounded in where we actually left off"* but shows no mechanism and no rendered sample
  ([ghosted-deal-nudge-email](https://www.sybill.ai/templates/ghosted-deal-nudge-email)). Ours can
  cite the actual line, because it's a gate-passed claim with a call id and a timestamp, not a
  free-text reach into a transcript.
- **Sample:**

  > Hi Rahul,
  >
  > Last time we spoke, you were pulling together your call-volume report and Dr. Mehta was going
  > to look at the two-location pilot. Haven't heard back since, so wanted to check in.
  >
  > Still the right time, or has something changed on your end?
  >
  > Best,
  > Maya

### 6. No-next-step re-engagement

- **Routing trigger:** a call happened (claims exist) but `next_steps` returns
  `type = no_next_step` or an empty array. This is the honesty case in `samples/DEAL-STATE.md`
  call 6 (the messy call, planted-injection test, "NO next step agreed").
- **Block structure:** claim-slot: honest recap (`pain`/`summary` claims only, whatever exists) →
  static open-ended CTA. No next-steps block rendered at all — never a manufactured one. No urgency
  language, since none is backed by a claim.
- **Sample:**

  > Hi Rahul,
  >
  > Thanks for the time today. Here's what I took away.
  >
  > Front-desk turnover came up as a new pain point on your end.
  >
  > We didn't land on a specific next step. What would be useful to you right now, a call with Dr.
  > Mehta, a written proposal, or something else?
  >
  > Best,
  > Maya

### 7. Objection-addressed follow-up — ours, no dedicated Sybill outbound-email analog found

- **Routing trigger:** `objections` claims present with `handling = addressed` and
  `objection_status ∈ {buyer_accepted, left_open}`. (Sybill's nearest cousins — Objection prep,
  The objection audit, Competitor objection analysis — are all internal/manager-facing reports in
  the Deal Execution & Strategy and Coaching categories, not an outbound rep email. See §1.4.)
- **Block structure:** claim-slot: objection + resolution pairs (`objections[].text` +
  `rep_response.text`, each its own citation) → claim-slot: next steps.
- **Sample:**

  > Hi Rahul,
  >
  > Thanks for the time today. Wanted to follow up on a couple of things you raised.
  >
  > What we covered:
  > - You asked about downtime during onboarding. We use a weekend cutover for multi-location
  >   practices, so the front desk isn't down during business hours.
  >
  > Next steps:
  > - I'll send a one-pager on the cutover process. (Maya · this week)
  >
  > Every line above came from something said on the call. If I got any of it wrong, tell me and
  > I'll fix it.
  >
  > Best,
  > Maya

### 8. Close / pilot confirmation

- **Routing trigger:** `buying_stage.stage.value = committed` AND at least one `next_steps` claim
  exists. Maps to `samples/DEAL-STATE.md` call 5 (verbal commit, pilot agreed, price lands,
  signature timing named).
- **Block structure:** claim-slot outcome line (the commit itself) → claim-slot: confirmed terms
  (`pricing` claims of `kind = quote`, only if present) → claim-slot: next steps (signature /
  logistics).
- **Sample:**

  > Hi Rahul,
  >
  > Thanks for the time today. Excited about where this landed.
  >
  > The pilot's confirmed: two locations, ninety days, twenty six per seat.
  >
  > Next steps:
  > - Paperwork goes out early next week. (Maya)
  > - Weekend cutover, so nothing's down during business hours.
  >
  > Every line above came from something said on the call. If I got any of it wrong, tell me and
  > I'll fix it.
  >
  > Best,
  > Maya

---

## Sources

**Structural/index pages:**
- [sitemap.xml](https://www.sybill.ai/sitemap.xml) — fetched raw via `curl`, 152 `/templates/*`
  URLs + 12 `/template-categories/*` + 15 `/template-creator/*` confirmed by exact count
- [/templates](https://www.sybill.ai/templates)
- [/all-templates](https://www.sybill.ai/all-templates)
- [/template-types/deal-summaries](https://www.sybill.ai/template-types/deal-summaries)
- [/template-types/meeting-summaries](https://www.sybill.ai/template-types/meeting-summaries)

**Category pages (12/12 swept):**
[engagement-follow-up](https://www.sybill.ai/template-categories/engagement-follow-up) ·
[qualification](https://www.sybill.ai/template-categories/qualification) ·
[deal-inspection](https://www.sybill.ai/template-categories/deal-inspection) ·
[meeting-prep](https://www.sybill.ai/template-categories/meeting-prep) ·
[coaching-performance](https://www.sybill.ai/template-categories/coaching-performance) ·
[forecasting](https://www.sybill.ai/template-categories/forecasting) ·
[buyer-intelligence](https://www.sybill.ai/template-categories/buyer-intelligence) ·
[competitor-intelligence](https://www.sybill.ai/template-categories/competitor-intelligence) ·
[customer-handoff](https://www.sybill.ai/template-categories/customer-handoff) ·
[deal-execution-strategy](https://www.sybill.ai/template-categories/deal-execution-strategy) ·
[reporting](https://www.sybill.ai/template-categories/reporting) ·
[win-loss-analysis](https://www.sybill.ai/template-categories/win-loss-analysis)

**Individual template pages opened for structure:**
[ghosted-deal-nudge-email](https://www.sybill.ai/templates/ghosted-deal-nudge-email) ·
[discovery-follow-up](https://www.sybill.ai/templates/discovery-follow-up) ·
[demo-follow-up-email](https://www.sybill.ai/templates/demo-follow-up-email) ·
[negotiation-follow-up-email](https://www.sybill.ai/templates/negotiation-follow-up-email) ·
[closed-lost-re-entry-email](https://www.sybill.ai/templates/closed-lost-re-entry-email) ·
[closed-won-kickoff-email](https://www.sybill.ai/templates/closed-won-kickoff-email) ·
[cs-handoff-email](https://www.sybill.ai/templates/cs-handoff-email) ·
[trial-follow-up-email](https://www.sybill.ai/templates/trial-follow-up-email) ·
[post-demo-deal-summary](https://www.sybill.ai/templates/post-demo-deal-summary) ·
[post-disco-deal-summary](https://www.sybill.ai/templates/post-disco-deal-summary) ·
[closed-lost-deal-summary](https://www.sybill.ai/templates/closed-lost-deal-summary) ·
[post-trial-deal-summary](https://www.sybill.ai/templates/post-trial-deal-summary) ·
[disco-call-meeting-summary](https://www.sybill.ai/templates/disco-call-meeting-summary) ·
[post-demo-meeting-summary](https://www.sybill.ai/templates/post-demo-meeting-summary) ·
[closed-won-meeting-summary](https://www.sybill.ai/templates/closed-won-meeting-summary) ·
[closed-lost-meeting-summary](https://www.sybill.ai/templates/closed-lost-meeting-summary) ·
[deal-doctor-auto-risk-alert](https://www.sybill.ai/templates/deal-doctor-auto-risk-alert) ·
[auto-win-story-loss-review-on-close](https://www.sybill.ai/templates/auto-win-story-loss-review-on-close)

**Dead link found:** [smart-follow-up-email-generator](https://www.sybill.ai/templates/smart-follow-up-email-generator) — HTTP 404, listed in sitemap.xml, confirmed by direct fetch this sweep.

**Internal sources used to build §4 (not Sybill — our own repo, for accurate field/routing names):**
`src/email.js`, `test/email.test.js`, `extractors/next_steps.json`, `extractors/pricing.json`,
`extractors/objections.json`, `extractors/buying_stage.json`, `samples/DEAL-STATE.md`,
`README.md`, `research/13-sybill-deep/02-email-infra.md`.

**Not re-derived in this file (see `02-email-infra.md` instead):** the `#variable` /
`<AI instruction>` DSL syntax itself, the doubled-delimiter discrepancy, style-matching mechanics,
tone/length controls, and the one Discovery template sample from `help.sybill.ai`'s "AI Email
Template Samples" article.
