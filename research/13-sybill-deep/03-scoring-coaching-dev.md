# Sybill — Scoring, Coaching, Methodology Support, and Developer Surface

Deep-research pass on sybill.ai's call-scoring/coaching product and its public developer
surface (api.sybill.ai, mcp.sybill.ai), for comparison against opengong-lite's
methodology-coach module (`methodologies/`, 14 built-in packs + custom compiler + evidence
gate, see `methodologies/README.md`).

**Method / limitation:** researched entirely from public marketing pages, the public
Intercom help center (help.sybill.ai), and the public API/MCP docs (api.sybill.ai/docs) —
no Sybill account, no in-app screenshots. Several claims below come through WebFetch's
summarizing pass rather than raw HTML, so exact wording is quoted wherever the tool
returned it verbatim; paraphrased claims are marked as such. Everything is sourced inline;
anything the docs are silent on is marked **UNCONFIRMED**.

---

## PART A — Scoring & Coaching

### A1. What scoring do they actually ship

The honest picture, cross-checking the product pages against the help center, is: **Sybill
ships persistent, always-on *behavioral/interaction* metrics, but its "scorecard" against a
qualification framework is not a native, stored, computed feature — it is a prompt template
the user pastes into chat.** These are two different things and Sybill's own marketing
blurs them.

**Persistent, dashboard-level metrics (Team Statistics, 4 tabs):**
Per the help article "4 Ways to Coach and Learn with Team Statistics"
(help.sybill.ai/en/articles/6399055):
- **Empathy tab** — leaderboard of "mean engagement of the prospects for each teammate" and
  "mean excitement of the prospects for each teammate."
- **Interaction tab** — talktime %, filler-word usage, sentence length, monologue duration,
  questions rate, next-steps rate, per rep.
- **Activity tab** — call frequency/duration, plus call-review counts, described as "an
  indication of the reps' commitment to learning from their mistakes."
- **Trackers tab** — most-frequent conversation topics org-wide (custom keyword trackers,
  configured in AI Studio Settings — help.sybill.ai/en/articles/9314197).

These are the only metrics with evidence of being computed automatically and shown in a
standing UI. None of them are a single composite "call score" — they're a metrics table,
not a rubric-scored verdict.

**The "Deal-Level Coaching Scorecard" (the closest thing to a rubric score) is not automatic.**
help.sybill.ai/en/articles/10375482 documents 12 scored dimensions (Discovery, Stakeholder
Engagement, Objection Handling, Blocker Anticipation and Mitigation, Detractor Management,
Demo Effectiveness, Trial/POC Management, Follow-up and Momentum, Negotiation, Next Steps
and Action Items, Value Selling, Overall Deal Management), each on "a scale of 1-5 (1 being
poor, 5 being excellent)," with a requirement for "justifications with specific examples
from the interactions" and improvement recommendations. **But the article's own instruction
is: "Enter the following prompt to in your deal-level AMA:"** — followed by the full prompt
text. This is a copy-paste template the manager types into deal-level Ask-Me-Anything
(AMA), not a feature that runs by default. The output is a one-time chat response; the
article shows no persistent scorecard UI, no saved history, no trend-over-time view.

It *could* in principle be turned into a recurring output — Sybill has a separate
"Recurring Prompts" feature (help.sybill.ai/en/articles/11724245) that schedules any saved
Ask-Sybill prompt to re-run daily/weekly/monthly/custom and post results to Slack/email.
But there is **no evidence** the scorecard prompt is wired to this, and even if a manager
manually saved it as a recurring prompt, the docs show no structured storage of the scores
— each run just re-posts a fresh narrative response to Slack/email, not a row in a
trackable table. **No comparison-over-time, no benchmark database, no score column
anywhere in the product docs.**

**Deal Inspection's "4 dimensions" (Qualification, Momentum, Risks, Internal Alignment)**
described on sybill.ai/intelligence/deal-inspection is the same pattern: reachable via
"popular prompts" typed into Ask Sybill ("How does this deal score on MEDDPICC?", "Does
this deal match our ICP based on past wins?"), answered conversationally, surfaced
"through the Ask Sybill interface as conversational responses" across Salesforce, Slack,
and email. No numeric score field, no rubric UI, is documented.

**Net:** Sybill's own comparison page against Gong concedes this gap directly.
sybill.ai/sybill-vs-gong: Gong is credited with "Call scoring" and "Coaching metrics" as a
manager-facing feature; Sybill's countervailing pitch is CRM-field autofill speed, not
scoring depth. Sybill explicitly self-positions as **"a sales assistant"** (automation) vs.
Gong as **"a sales analyst"** (leadership reporting/scoring). This is Sybill saying, in its
own marketing copy, that scoring/coaching analytics is not its lane.

Sources: help.sybill.ai/en/articles/10375482 · help.sybill.ai/en/articles/6399055 ·
help.sybill.ai/en/articles/11724245 · sybill.ai/intelligence/deal-inspection ·
sybill.ai/coaching-performance · sybill.ai/sybill-vs-gong

### A2. Methodology support (MEDDIC/MEDDPICC/BANT/SPICED/Sandler/custom)

**Only BANT and MEDDPICC are wired into structured, dashboard-surfaced fields.** They
appear consistently across Deal Summaries, Deal Card, Deal Board, and CRM Autofill:
- CRM Deal Summaries: "Capture exactly what matters - BANT, MEDDPICC, product gaps,
  renewals, competition" (help.sybill.ai/en/articles/9969597).
- Deal Card auto-generates "summaries using frameworks like BANT and MEDDPICC"
  (help.sybill.ai/en/articles/10451107).
- Deal Board can show "Deal Summaries columns... properties that you set up in your Deal
  Summaries (for example, BANT or MEDDPICC properties like Authority or Economic Buyer)"
  (help.sybill.ai/en/articles/10304782).
- Pre-Meeting Brief includes a "Qualification – MEDDPICC or sales qualification data (only
  visible for sales meetings)" field (help.sybill.ai/en/articles/12130560).
- Marketing claim (sybill.ai/ai-sales-agent): "Sybill autofills MEDDPICC, BANT, and custom
  CRM fields with 100% fill rate every time."

**SPICED and Sandler are NOT wired into structured fields** — they surface only as
free-text framework names a user can drop into an Ask-Me-Anything prompt. Per
help.sybill.ai/en/articles/10268348 ("Ask Me Anything: Call & Deal Level"): "AMA can adapt
to custom sales frameworks. You can specify the framework elements in your prompt (e.g.,
SPICED, BANT, MEDDPICC)" — with the sample prompt "Can you summarize this call in the
SPICED framework (Situation, Pain, Impact, Critical Event, Decision)?" This is the LLM
improvising against a framework named in-line in the chat message; there is no dedicated
SPICED CRM-field set, no SPICED scorecard, no SPICED entry anywhere else in the product
docs. Sybill's glossary (sybill.ai/glossary) defines BANT, MEDDIC, SPICED, SPIN, and
Sandler as terms, but definitions ≠ product wiring — only BANT/MEDDPICC get the "auto-fills
CRM fields" treatment.

**No methodology picker.** There is no admin control anywhere in the docs that looks like
"select your team's methodology: MEDDIC / MEDDPICC / BANT / SPICED / Sandler / Custom."
Configuration instead happens at the *individual CRM field* level:
1. Connect a CRM (HubSpot, Salesforce, Zoho, Dynamics 365).
2. Sybill auto-discovers "the fields in your CRM that matter most to your team. No manual
   field mapping required" (help.sybill.ai/en/articles/9969597 via sybill.ai copy).
3. Admin adds properties — either picking from a predefined BANT/MEDDPICC list, or fully
   custom: "Define a custom property name (e.g., User Research). Add a clear, actionable
   prompt." Output types: text, multi-line, single/multi-select dropdown.
4. Preview before saving; "only admins can edit the prompt" (help.sybill.ai/en/articles/10451107).
5. On initial setup, a **one-time backfill**: "Your last 30 deals will be updated with the
   configured fields and will be populated in your CRM using CRM Autofill"
   (help.sybill.ai/en/articles/11899540 — "CRM Autofill Feature Guide," article id
   11899540). This confirms the prior-intel claim about "last 30 deals" — but note it is a
   **one-time historical backfill at setup**, not continuous re-learning of style from an
   ever-refreshing 30-deal trailing window. The article separately recommends "20 to 30
   core fields" as a starting count (unrelated number, same article — don't conflate the
   two "30"s).
6. Going forward, updates land "within a few minutes" of each new call/email.

**No per-team or per-deal-stage methodology switching** was found. Individual fields *can*
be scoped: help.sybill.ai/en/articles/12130560 ("Getting Started with AI Workflows")
confirms a field can "Choose which meeting types they apply to (Sales, Customer, Marketing,
etc.)" and be conditioned to specific deal stages (e.g., a "Close Lost Reason" field only
populating at Closed Lost) — but this is field-level conditionality inside one org-wide
Deal Summary configuration, not a mechanism for Team A to run MEDDPICC while Team B runs
Sandler simultaneously. **UNCONFIRMED** whether multiple concurrent methodology
configurations per org/team are possible — no docs describe it either way.

**Tier gating:** per help.sybill.ai/en/articles/8132408 ("Which plan should I purchase?"),
auto-updating CRM fields for "opportunities and methodologies (MEDDPICC/SPICED)" is called
out as **Enterprise-only**; the general pricing page (sybill.ai/pricing) shows Business
gets "CRM Autofill – 10 fields" and Enterprise gets "Unlimited CRM Autofill" — so even the
field-count ceiling on methodology-style autofill is Business-tier-limited, full breadth
Enterprise-only.

**No other methodology has any presence** in Sybill's public materials: Challenger, GAP
Selling, SNAP, Solution Selling/PPVVC, Command of the Message, N.E.A.T., CHAMP,
ValueSelling — zero hits across the site, glossary, help center, blog, and pricing pages.
A manager wanting one of these gets nothing but a raw LLM chat prompt with no validated
component schema, no field mapping, and no evidence discipline behind the answer.

Sources: help.sybill.ai/en/articles/9969597 · /10451107 · /10304782 · /12130560 ·
/10268348 · /11899540 · /8132408 · sybill.ai/ai-sales-agent · sybill.ai/glossary ·
sybill.ai/pricing

### A3. Coaching product — what it actually does

- **Talk-time / interaction physics**: talktime %, filler-word rate, sentence length,
  monologue duration, question-asking rate, next-steps rate (Interaction tab,
  help.sybill.ai/en/articles/6399055).
- **Buyer-emotion signals** ("empathy"): mean prospect engagement and mean prospect
  excitement, per rep — gated to Business/Enterprise per the plan-tiers article
  (help.sybill.ai/en/articles/8132408, "buyer emotional intelligence insights" listed as
  Business & Enterprise).
- **Objection handling & win-rate framing**: "Which reps have the highest and lowest
  objection win rates?" is a stock Ask-Sybill/Copilot query, not a stored metric field
  (sybill.ai/coaching-performance).
- **Peer/self benchmarking**: reps compare themselves to "team averages" and to their own
  "last quarter"; managers see "which reps need the most coaching" and can identify top
  performers' habits to replicate.
- **No cross-account/industry benchmark** was found anywhere — all comparison framing is
  intra-team (vs. teammates, vs. one's own past self). No claim of an external benchmark
  database.
- **Training/enablement scaffolding**: "Collections" (help.sybill.ai/en/articles/10319311)
  let managers build "Sales Coaching Playlists" of grouped calls for onboarding/training;
  "Commenting on Meeting Recordings" (help.sybill.ai/en/articles/11508639) supports
  timestamped peer/manager annotation on calls — asynchronous review, not scored.
- **Ask-Me-Anything coaching**: on-demand, narrative, unscored feedback per call — e.g.
  "What could I have done better during this call?", "Did I create urgency around the
  buyer's timeline?", "Did I confirm clear next steps?" (help.sybill.ai/en/articles/10268348).
  Explicitly narrative: "The article does not describe any scoring output format for AMA
  responses. Responses appear to be narrative-based answers rather than scored or
  quantified assessments."

Manager vs. rep views: reps get self-coaching + compare-to-average; managers get
team-aggregated views and "who needs coaching" flags. No distinct scorecard UI was found
for either persona beyond the Team Statistics tabs described above.

Sources: help.sybill.ai/en/articles/6399055 · /8132408 · /10319311 · /11508639 · /10268348
· sybill.ai/coaching-performance

### A4. Admin/configuration surfaces

- **CRM Autofill setup** (Settings → Integrations → CRM): connect CRM → auto-discovered
  field candidates → admin adds standard (BANT/MEDDPICC) or fully custom properties, each
  with an editable free-text prompt, output type (text/number/single-multi-select
  dropdown), on Deal/Contact/Company standard objects plus top-level custom fields → preview
  → save → one-time 30-deal historical backfill → live updates within minutes thereafter.
  Admin-only prompt editing (help.sybill.ai/en/articles/11899540, /10451107).
- **AI Studio Settings** (help.sybill.ai/en/articles/9314197): email-template generation
  (auto-built from CRM's sent-email history or manually from ≥3 samples, or a raw "Prompt
  Editor"), custom Trackers (name + keyword list, case-insensitive matching across
  transcripts), and Custom Vocabulary (org-specific terminology for transcription
  accuracy). **No methodology-selection or per-team-settings control lives here** — this
  page is about voice/vocabulary, not scoring frameworks.
- **Recurring Prompts** (help.sybill.ai/en/articles/11724245): save any Ask-Sybill prompt,
  toggle "run on a schedule" (daily/weekly/monthly/custom), route output to in-app, email,
  and/or Slack channels (Slack channel selection admin-only). This is the closest thing to
  "automated methodology scoring on a cadence," but it is a generic prompt-scheduler, not a
  scorecard feature, and produces no stored/queryable score history — each run is a fresh,
  disposable chat message.
- **CRM field-mapping learning claim, precisely stated**: the marketing copy on
  sybill.ai's CRM-autofill page (paraphrased via WebFetch) claims Sybill "examines
  historical CRM entries to understand your team's writing style" and builds "custom AI
  prompts that mirror your style, tone, and points of interest" — but the actual help
  article (11899540) only documents a one-time 30-deal backfill at setup time and
  admin-edited field prompts, with no described mechanism for continuous style-learning
  from an ongoing trailing window. Treat the "learns your style continuously" framing as
  **marketing gloss, not a documented mechanism** — mark UNCONFIRMED beyond the one-time
  backfill.

Sources: help.sybill.ai/en/articles/11899540 · /9314197 · /11724245 · /10451107 ·
sybill.ai (CRM autofill page copy, paraphrased)

---

## PART B — Developer Surface

### B5. api.sybill.ai — REST API + MCP

The marketing site links to a real, publicly reachable docs tree at
`http://api.sybill.ai/docs/` (redirects to `/docs/introduction.html`), self-described as
**alpha**: "endpoints and schemas subject to change without notice." Root `https://api.sybill.ai`
(no path) 404s — there is no landing page at the bare domain, only under `/docs/`.

**Auth model** (api.sybill.ai/docs/authentication.html): Bearer-token API keys
(`sk_live_…`), created in-app at Settings → Integrations → API Keys, "shown only once at
creation." All endpoints except `/v1/health` require it. Three scopes, assigned per key:
- `ingest` — POST/PATCH/DELETE on meetings, messages, documents (write path).
- `read` — GET on conversations, deals, accounts, messages, rows, documents, sources,
  object types (export path).
- `ask_sybill` — chat access via REST or MCP.
401 on invalid/revoked key; 403 with `{"detail": "API key missing required scope: read"}`
on scope mismatch.

**Rate limits** (api.sybill.ai/docs/rate-limiting.html): per-key moving window — 60/min,
1,000/hr, 10,000/day (health checks exempt). Standard `X-RateLimit-*` + `Retry-After`
headers, 429 on breach. **MCP usage is rate-limited separately from REST**, per-plan, exact
numbers not published (UNCONFIRMED).

**Full endpoint catalog** (api.sybill.ai/docs/endpoints.html, OpenAPI v1 at
`/docs/openapi.yaml`, title "Sybill API," description "Programmatic access to your Sybill
workspace through REST endpoints for exports, imports, and Ask Sybill"):
- `GET /v1/health` — key validation, returns org id + granted scopes.
- `POST /v1/ask-sybill`, `GET /v1/ask-sybill/{threadId}/{runId}` — async chat query,
  waits up to 60s inline then 202+poll; results retained 30 days.
- `GET/POST/DELETE /v1/conversations`, `GET /v1/conversations/{id}` — list/ingest/delete/
  fetch-detail (transcript + recording + AI summary).
- `GET /v1/deals`, `GET /v1/deals/{id}` — CRM deals; detail includes `summary` and
  `crmAutofill` objects + contacts.
- `GET /v1/accounts`, `GET /v1/accounts/{id}` — CRM accounts + synced CRM fields.
- `GET/POST/DELETE /v1/messages`, `GET /v1/messages/{id}` — unified email/message API
  across native integrations + pushed messages.
- `GET/POST/PATCH/DELETE /v1/rows`, `GET /v1/rows/{id}` — arbitrary structured records
  under a developer-defined **Object Type** (their generic "bring your own schema" escape
  hatch — tickets, leads, forms, or literally anything).
- `GET/POST/PATCH/DELETE /v1/documents`, `GET /v1/documents/{id}` — text-bearing artifacts
  (PDFs, notes, web pages, chat uploads, email attachments).
- `POST/GET/PATCH/DELETE /v1/sources`, `/v1/sources/{id}` — logical channel definitions for
  pushed data (e.g., "Zendesk," "Sales Notes").
- `POST/GET/PATCH/DELETE /v1/object-types`, `/v1/object-types/{id}` — typed field schemas
  (`fieldType` ∈ textarea/string/boolean/int/double/datetime/date/list) that back `/rows`.

**No score, rating, or methodology field exists anywhere in the documented data models**
(api.sybill.ai/docs/data-models.html). Conversation, Message, Row, Document, Deal, Account,
Source, and Object Type schemas were all checked field-by-field — none carry a
score/rating/confidence field, and Object Type `fieldType` enum has no numeric-score or
percentage type (a developer could repurpose `int`/`double` for a home-rolled score, but
Sybill defines none itself). The two places a methodology *answer* could theoretically live
— `summary` on a Conversation detail, and `crmAutofill` on a Deal detail — are both
documented only as `object | null` with **"dynamic keys"**: no fixed schema, no
enumeration, no confirmation either way of whether MEDDPICC-named keys appear inside. This
means a developer integrating today cannot write a stable parser against "the MEDDPICC
score" or "the discovery score" — it's opaque, shape-shifting LLM output dropped into an
untyped JSON blob, keyed however the model felt like keying it that run.

**MCP server** (api.sybill.ai/docs/mcp.html): `https://mcp.sybill.ai/mcp`, Streamable HTTP
transport, OAuth (browser sign-in flow; expired sessions → 401). Eight tools, all
read/ask-only — **no write/ingest tools exposed over MCP** (ingest is REST-key-only):
`ask_sybill`, `get_ask_sybill_result`, `list_conversations`, `get_conversation`,
`list_deals`, `get_deal`, `list_accounts`, `get_account`. Claude Desktop config:
```json
{"mcpServers":{"sybill":{"command":"npx","args":["-y","mcp-remote","https://mcp.sybill.ai/mcp"]}}}
```
Errors: 429 on rate limit, 500 on processing failure.

**Webhooks** (help.sybill.ai/en/articles/9925117, "Webhook Automations with Sybill"):
configured at Settings → Integrations → Automations, either via Zapier/Make or a raw POST
endpoint. **Only one event type is documented**: `meeting.new_recording.v1`. Payload:
meeting metadata (duration, platform, participants, type), full speaker-segmented
transcript with timestamps, AI summary (key takeaways, next steps, outcome, conversation
starters), per-participant interests/pain-points, and CRM account/opportunity ids — **no
score field in the webhook payload either**, confirming the same gap as the REST API.
Svix-signed for authenticity verification; retry schedule immediate → 5s → 5m → 30m → 2h →
5h → then 10h intervals. A payload-reference spreadsheet is linked (Google Sheets), and
pre-built Zapier templates exist for Zoho.

**Credit/access gating**: API and MCP calls are metered against the *same weekly AI-credit
pool* as everything else in the app — help.sybill.ai/en/articles/15384825 states "API / MCP
Calls: Anytime you call on Ask Sybill or raw Sybill data via API or MCP" consumes credits,
citing "approximately 300–400 credits for running deal analysis through Sybill's MCP" as a
typical single call. Plan gating: **Free and Pro get no API/MCP access at all**; Business
($90/mo annual, 5,000 credits/user/week) gets "API and MCP access"; Enterprise gets the
same with unlimited credits. There is no separate developer-tier quota — a team's own
in-product AI usage and its developer integration compete for the same weekly budget.

Sources: api.sybill.ai/docs/introduction.html · /authentication.html · /rate-limiting.html
· /endpoints.html · /data-models.html · /mcp.html · /openapi.yaml ·
help.sybill.ai/en/articles/9925117 · /15384825

### B6. Integration list

**CRM** (read + write): HubSpot, Salesforce, Zoho, Microsoft Dynamics 365 — live, with
automatic post-call/email CRM field updates. Pipedrive, NetSuite — "coming soon."
**Conferencing** (read recordings/transcripts, write summaries back): Zoom, Google Meet,
Microsoft Teams, Webex.
**Email** (read threads, write drafted follow-ups + CRM sync): Gmail, Outlook, Zoho Mail.
**Dialers** (read call recordings, write summaries): Outreach, Zoom Phone, Salesloft —
live. Nooks, Aircall, RingCentral, HubSpot Dialer, Salesforce Sales Dialer — "coming soon."
**Collaboration**: Slack (internal-Slack capture in + Ask-Sybill-from-Slack out), Microsoft
Teams (internal comms). Google Drive — "coming soon" (docs/sheets as deal context).
**Automation/data-stack**: Zapier and Make as first-class connectors; generic
webhook/API route into Notion, Monday.com, ClickUp, Excel, Close, Amplitude, Jira, Linear —
these last eight are reachable only through Zapier/Make or a developer's own webhook
receiver, not native first-party connectors with documented field-level data flows.
**MCP**: positioned as bringing "deal context into Claude/ChatGPT/Gemini... eliminating
manual transcript copying" — read-only, per the MCP tool list above.

Source: sybill.ai/integrations (link inventory + per-integration copy)

### B7. Engineering-adjacent crumbs

- **No engineering/tech blog content exists.** sybill.ai/blogs is 100% GTM/SEO content
  (best-AI-app roundups, sales-enablement how-tos); zero posts on model architecture,
  scoring pipeline, or extraction methodology.
- **Trust center** (trust.sybill.ai): SOC 2, ISO/IEC 27001:2022, GDPR, PCI DSS attested;
  subprocessors listed include AWS, Google Cloud, MongoDB, Slack, Intercom. **The
  underlying LLM vendor is never named anywhere in public materials** — no mention of
  OpenAI, Anthropic, or any other model provider on the trust center, API docs, or product
  pages. Mark this **UNCONFIRMED / deliberately undisclosed**.
- **Careers page** lists a Senior ML Engineer role (Mountain View), but that specific
  posting is closed ("Position Closed — this position is no longer accepting candidates")
  with no cached job description reachable through the tools available in this session
  (web.archive.org is not fetchable from this environment) — so no tech-stack crumbs
  recovered from it. Open roles at time of research: Staff Software Engineer (Full-Stack),
  Senior React Developer, HR & Admin Specialist, SMB Account Executive, Senior Visual
  Designer.
- **API docs self-describe as alpha**, "subject to change without notice" — the entire
  developer surface (REST + MCP) is young and explicitly unstable by Sybill's own
  admission, which is itself a data point about how immature the third-party-build story
  is today.

Sources: sybill.ai/blogs · trust.sybill.ai · sybill.ai/careers ·
api.sybill.ai/docs/introduction.html

---

## Design implications for our build

**(a) The methodology-scoring architecture that beats theirs, for a manager who
picks-and-chooses.**
Sybill's methodology story is two named frameworks (BANT, MEDDPICC) hard-wired into CRM
autofill, plus an escape hatch where *any other* framework name (SPICED, Sandler, or
literally anything) only works if the manager remembers to type it into an ask-anything
prompt and trusts an unstructured, unvalidated LLM answer with no field schema behind it.
There is no methodology picker, no per-team methodology assignment, and — critically — no
schema for what a "MEDDPICC score" even consists of; it's improvised per chat turn. Our
`methodologies/` module inverts every one of these gaps on purpose: an **admin picks the
methodology once** (`npm run coach -- set meddpicc`, one `_settings.json` write) from **14
built-in packs** whose component lists are validated against the methodology owners'
canonical materials (MEDDPICC's I = Implicate the Pain; SPICED's Critical Event as one
component; SPIN's situation-question penalty) — the exact breadth (SPICED, Sandler, GAP,
SNAP, Challenger, Command of the Message, N.E.A.T., CHAMP, ValueSelling, Solution
Selling/PPVVC) that simply does not exist as structured product in Sybill at all, only as a
prompt-name gamble. And for the "we don't follow a textbook method" team Sybill has no
answer for beyond ad hoc custom CRM fields, we have a **custom-method compiler**
(`npm run coach -- compile our-method.txt --save`) that keeps the team's own terminology but
validates it against the same pack schema every built-in methodology obeys, so a
home-grown method still gets structured, comparable, per-trait verdicts instead of one-off
prose.

**(b) What their scoring lacks that receipts enable.**
Every scoring surface documented above — the 12-dimension Deal Coaching Scorecard, the
"How does this deal score on MEDDPICC?" AMA answer, the Deal Inspection four-dimension
narrative — is a **freestanding LLM claim with nothing behind it a manager could click to
verify.** No article describes a citation, a linked transcript timestamp, or a
confidence/verification step; a "5/5 on Objection Handling" is exactly as trustworthy as
the model's mood that run, and it isn't stored anywhere to be re-checked later (the
Recurring-Prompts mechanism just re-generates a fresh, disposable narrative — it doesn't
audit the last one). Our scoring is evidence-gated by construction: every verdict —
met/partial/missed/not-applicable per trait — carries **verbatim evidence quotes the code
verifies against the transcript** (exact match → normalized containment → unique
whole-transcript rescue relabeled `segment_corrected` → else visibly demoted), a met verdict
whose evidence fails the gate gets flagged unverified and score-capped at partial, and
low-confidence verdicts (<0.6) render as "check this" for human review. That's the
sellable difference in one sentence: **Sybill's score is a claim; ours is a claim with a
receipt the manager can click straight to the line in the transcript that earned it.**
Nothing in Sybill's public docs — help center, pricing, or API schema — describes anything
resembling this verification step existing anywhere in their product.

**(c) The export/API story that exploits their lock-in gaps.**
Sybill's own data models are the tell: `summary` and `crmAutofill` are `object | null` with
"dynamic keys" — by their own docs, **there is no stable, typed field for a methodology
score anywhere in their REST API or webhook payloads**, across Conversations, Deals,
Accounts, Messages, Rows, Documents. A developer building on Sybill today can pull raw
transcripts, CRM records, and freeform AI summaries, but cannot reliably query "give me
every deal's MEDDPICC Economic-Buyer field as a typed value" — they'd have to parse
whatever shape the LLM produced that run, on every run, with no guarantee of stability
("alpha... subject to change without notice"). Layer onto that: API/MCP access is
Business-tier-and-up only, metered from the *same* weekly AI-credit pool as in-app usage
(300–400 credits per MCP deal-analysis call), and MCP exposes read/ask tools only — no
write-back. That's a real lock-in gap to exploit in positioning: our bundle/viewer +ᅟ CRM
posture should promise (once the roadmap items in `methodologies/README.md` — bundle field,
viewer tab, `ai_methodology_score` CRM write-back — land) a **typed, versioned,
evidence-linked score object per trait per call**, exportable without credit-metering
throttles and without an opaque "dynamic keys" escape hatch, as the structural answer to
exactly the gap Sybill's own OpenAPI spec admits it has.

---

## Summary of UNCONFIRMED items (flagged inline above, collected here)

- Whether a persistent, native numeric "call score" or "deal score" UI widget exists inside
  the logged-in app (only reachable via public marketing/help docs in this research; the
  documented scoring paths are all AMA-prompt-driven, one-time chat outputs).
- Whether multiple concurrent methodology configurations (e.g., different teams running
  different frameworks simultaneously) are possible at any tier.
- Exact MCP rate limits (documented as "vary by plan," no numbers published).
- Whether `summary`/`crmAutofill` object keys are ever MEDDPICC/BANT-named in practice — the
  API docs explicitly decline to enumerate this ("dynamic keys").
- The underlying LLM vendor(s) powering Sybill's extraction/scoring — never disclosed in
  any public material found (trust center, API docs, blog, or product pages).
- Whether "learns your team's writing style" (marketing copy) is anything beyond the
  documented one-time 30-deal backfill at CRM-autofill setup — the help article does not
  describe continuous style re-learning.
- Senior ML Engineer job description content — posting closed, not recoverable in this
  session (no archive.org access).
