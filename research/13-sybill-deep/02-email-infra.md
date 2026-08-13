# Sybill's follow-up email system — deep research from primary sources

**Purpose:** reference material for building follow-up email templates (varying by next step) in OpenGong Lite. Every factual claim below is cited with its URL. Anything not directly documented is labeled **UNCONFIRMED**.

**Method:** fetched raw HTML from help.sybill.ai (Intercom-hosted help center) and sybill.ai directly, extracted article bodies, and read them verbatim rather than relying on search-snippet paraphrase. 12 help-center articles + 3 blog posts + the FAQ page were pulled this way. One independent review (tldv.io) was checked and found to add nothing new on this specific feature.

---

## TL;DR

- Sybill's follow-up email is a **draft-only, human-sent** feature. No source found — help docs, blogs, or FAQ — describes an auto-send mode. The rep always reviews and clicks send themselves. ([FAQ](https://www.sybill.ai/faq), [help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))
- The template DSL has **three token types**: plain "white text" (verbatim), `<angle-bracket AI instructions>` (yellow), and `#VARIABLE` fixed meeting-data tokens (blue). This is documented precisely in the main help article. ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))
- A **separate** "AI Email Template Samples" article, dated later, shows the same DSL written with **doubled** delimiters (`##variable`, `<<instruction>>`) and explicitly instructs users that doubling is required "when copying and pasting from Google Docs." The two docs are inconsistent on which is canonical — flagged below as an open discrepancy, not resolved by Sybill's own docs. ([template samples](https://help.sybill.ai/en/articles/10375500-ai-email-template-samples))
- Style matching is **opt-in per template**, not an always-on background process: a rep either (a) auto-generates from their CRM's sent-email history (if "sufficient" volume exists), or (b) manually pastes **≥3 sample emails**. There is no documented toggle to "turn off" style learning — the mechanism is that you simply don't invoke either generation path. ([AI Studio settings](https://help.sybill.ai/en/articles/9314197-ai-studio-settings), [help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))
- **Next-step-aware selection is manual, not automatic.** Sybill extracts next steps via NLU into a `#NEXT_STEPS` variable, and reps can name templates per meeting type/deal stage and switch between them from a dropdown after the email is generated — but no doc describes the system auto-selecting a template based on the detected call outcome (demo booked vs. pricing requested vs. no next step). This is a real, confirmed gap in what they've built (or at least documented).
- **No grounding/citation mechanism exists.** Across the help center, product pages, and FAQ, there is zero mention of the email being restricted to only what was said on the call, no per-line sourcing, no confidence flags. The strongest accuracy claim found is the vague "Sybill captures every important detail from the meeting that may play an important role in the deal cycle" ([FAQ](https://www.sybill.ai/faq)). Sybill's own blog content openly warns reps that "AI occasionally misinterprets sarcasm, off-the-record comments, or sensitive topics" and that a manual review is the only safeguard ([blog](https://www.sybill.ai/blogs/ai-tool-personalized-follow-up-emails-sales-calls)). This is the single biggest strategic opening for a receipts-first competitor.

---

## 1. Follow-up email generation: inputs, timing, delivery

### Inputs
- **Call transcript + "Magic Summary"** (Sybill's AI call-summary layer) — the base content source for the email draft. ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))
- **CRM context** — if a CRM is connected (HubSpot, Salesforce, Zoho, Dynamics 365), Sybill can pull the rep's sent-email history from it for style learning, and pulls deal/opportunity context for Deal Summaries. CRM connection is admin-gated ("You need to be a Sybill admin... to make this integration work for you at the user level.") ([CRM integration doc](https://help.sybill.ai/en/articles/8132410-how-does-sybill-s-integration-with-crm-systems-work))
- **The rep's own past emails** — either pulled automatically via CRM, or manually pasted (minimum 3 samples) if CRM data is insufficient or absent. ([AI Studio settings](https://help.sybill.ai/en/articles/9314197-ai-studio-settings))
- No source documents pulling from *other reps'* emails, a team-wide corpus, or external web research for the follow-up email specifically (web research is used for the separate **Pre-Meeting Brief** feature's "About the Company" field — a different product surface). ([AI Workflows guide](https://help.sybill.ai/en/articles/12130560-getting-started-with-ai-workflows-pre-meeting-briefs-meeting-summary-deal-summary))

### Timing
- **On-demand, not forced-auto-send.** The email draft is generated when the rep clicks the "Generate AI Follow-up Email" button on the Meeting Dashboard (available "typically within 5 minutes" of the meeting's completion, alongside the rest of the Meeting Report), or via AI Studio, or via the "Ask Sybill" chat bar ("...get help drafting an email"). ([post-meeting report](https://help.sybill.ai/en/articles/6137458-a-breakdown-of-sybill-s-post-meeting-report), [help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))
- Marketing copy on the auto-follow-up blog describes drafts appearing "within minutes" of the call and frames the feature as effectively automatic in cadence, but even that same page's own workflow description ends every pass with **"The rep reviews and sends."** ([blog: AI Auto Follow Up Emails](https://www.sybill.ai/blogs/ai-auto-follow-up-emails))

### Delivery
- **Draft → rep's own email client, human clicks send.** "Once the email is generated, you could edit it or send it through your email client." ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))
- There's a Chrome default-email-handler setup article specifically for wiring this handoff to Gmail/Outlook via the `mailto:` protocol handler — confirming the send step happens in the rep's actual mail client, not inside Sybill. ([Chrome email handler doc](https://help.sybill.ai/en/articles/6975942-how-to-set-the-default-email-handler-in-chrome))
- Slack: the shared `#sybill-notifications` channel gets a per-meeting card with a **button** to trigger "sending AI email" — i.e., Slack is a launch point for the same draft-then-send flow, not an independent send channel. ([Slack notifications doc](https://help.sybill.ai/en/articles/8132384-what-you-get-in-sybill-s-slack-notifications))
- **No auto-send mode found anywhere** — not in the help center, not in the FAQ, not in the blog posts, not in the tldv.io independent review. Every single description of the flow ends in a human review-and-send step. Sybill's own "Common Mistakes" blog section is literally titled "Sending without reviewing" and lists it as an anti-pattern. ([blog: AI Auto Follow Up Emails](https://www.sybill.ai/blogs/ai-auto-follow-up-emails))

---

## 2. The template system

### Syntax (per the main, most detailed source — the "complete guide" article, published Oct 30 2024)

Three token types, described with an explicit color-coding in the template editor:

| Token | Editor color | Meaning |
|---|---|---|
| Plain text | white | Literal text, rendered as-is (signatures, fixed phrases, calendar links) |
| `<AI instruction>` | yellow | A natural-language instruction the model executes against the call transcript / Magic Summary at generation time — can reformat a variable's output (paragraph vs. bullets) or pull a specific unique detail from the transcript |
| `#VARIABLE` | blue | A fixed, non-customizable variable pulled from the Magic Summary's structured fields |

Documented example pair: `<Short line on their pain point(s) and how we solve it>` and `#RECEIVERS_FIRST_NAME` / `#NEXT_STEPS`. ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))

Direct quote on the compositional idea (this is the closest thing to a spec Sybill publishes): *"Putting an <ai instruction> before the #variable allows you to modify the output of the meeting data. <> can also help you fetch details from the call transcript or the magic summary that may be unique to the meeting."* ([same URL])

**Discrepancy found:** the "AI Email Template Samples" article (Jan 22, 2025, three months later) shows the *same* concept written with doubled delimiters — `##receivers_first_name`, `<<Write a short statement showcasing the ROI by using Sybill>>` — and its own "Template Best Practices" section states: *"When copying and pasting from Google Docs, it's important to note: you need double ## and << >>"* ([AI email template samples](https://help.sybill.ai/en/articles/10375500-ai-email-template-samples)). Within that same article, several example templates (GHOSTED, INTRO CALL, CHECK IN, CLOSED/LOST, CURRENT/FUTURE STATE, FOLLOW UP, MULTI-THREAD) use plain **single** `#variable` and `<instruction>` instead of doubled — inconsistent even within the same document. Best read as: single-token is the underlying/canonical syntax from the main guide; doubling is a **paste-safety workaround** Sybill recommends specifically for the Google-Docs-copy path, not a second syntax. Treat this as evidence that Sybill's own internal doc hygiene is loose here, not as two competing DSLs.

### Variables (partial list — no single page enumerates them all)

Confirmed, named in primary sources:
- `#RECEIVERS_FIRST_NAME` / `##receivers_first_name`
- `#RECEIVERS_COMPANY` / `##receivers_company`
- `#NEXT_STEPS` / `##next_steps`
- `#SENDER_FIRST_NAME` / `##sender_first_name`
- `#SENDER_COMPANY` / `##sender_company`
- `#MEETING_TITLE` / `##meeting_title`
- `#PAIN_POINTS` (seen inline in a template example: "...focus on #pain_points")

Sybill's own doc admits the full list isn't textually published: *"these meeting variables are provided from a fixed number of variables. For a list of the meeting variables please check the image above"* — i.e., the canonical list only exists as a **screenshot inside the product's template editor**, not as help-center text. ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide)) Users cannot add custom variables to this set: *"No, for now these meeting variables are provided from a fixed number of variables."* (same URL)

### How templates are selected / assigned

- **Per-user, not per-team.** Templates live in AI Studio (renamed **AI Workflows** as of Sept 2025 — [AI Workflows guide](https://help.sybill.ai/en/articles/12130560-getting-started-with-ai-workflows-pre-meeting-briefs-meeting-summary-deal-summary)), which is scoped to the individual rep's account. Profile Settings confirms sharing/visibility is *"either user-level or company-wide"* with **no team-level tier**, and that admin-side editing of another user's settings is a "Coming Soon" roadmap item, not yet shipped. ([profile settings](https://help.sybill.ai/en/articles/9314175-profile-settings-a-complete-guide))
- **Selection is a manual dropdown action**, not automatic outcome-routing: *"if you have saved templates according to the different types of meetings & named them accordingly, you could simply choose from the drop-down on the title once an AI email is generated & click on 'Rewrite Email.'"* ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide)) The FAQ repeats this: *"After generating the email, simply switch to your preferred template to see the new email instantly."* ([FAQ](https://www.sybill.ai/faq))
- One default template exists per user, marked with a star icon in AI Studio; that default fires when the rep first generates an email from the Meeting Dashboard or email client, before any manual override. ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))
- Marketing copy claims templates can be organized "for every deal stage" ([FAQ](https://www.sybill.ai/faq)) and "for discovery calls, demos, negotiations, and check-ins" with "the AI adapts accordingly" ([blog](https://www.sybill.ai/blogs/ai-tool-personalized-follow-up-emails-sales-calls)) — but no help-center article describes the mechanics of automatic adaptation; every mechanical description found is the manual-dropdown-switch behavior above. Read the "adapts accordingly" marketing language as aspirational/soft, not as a documented auto-routing feature.
- Published example templates (from the samples article) group into two use-case buckets: **Sales** (Discovery, Ghosted, Intro Call – No Meeting Booked, Check-In #1, Closed/Lost: Feature Release, Current/Future State, Follow Up on Recent Discussion, Multi-Thread) and **CS** (Intro Call Follow-Up, CS Follow-Up). ([AI email template samples](https://help.sybill.ai/en/articles/10375500-ai-email-template-samples)) These are named by *call type / funnel stage*, not by *detected next-step outcome* — i.e., Sybill's own template taxonomy is organized around "what kind of meeting was this" rather than "what specific commitment came out of it," which is the gap our product can fill.

### Full example (verbatim from Sybill's own docs, DISCOVERY template)

```
Subject: Thanks for the Great Conversation – Next Steps

Hi ##receivers_first_name,

Thank you for taking the time to chat with me earlier today. I enjoyed
learning more about receivers_company and the challenges you're facing
with specific pain points discussed.

<<Write a short statement showcasing the ROI by using Sybill>>

Next steps:

<<Relevant next steps in bullets.>>

##next_steps

I'm looking forward to our next discussion and exploring how we can
help ##receivers_company <<achieve specific goal>>

Best,
##sender_first_name
```
Source: [AI Email Template Samples](https://help.sybill.ai/en/articles/10375500-ai-email-template-samples)

---

## 3. Style matching

- **Two generation paths**, both opt-in and rep-initiated:
  1. **Auto-generate via CRM**: requires CRM connection + "sufficient record of sample emails sent from you" in that CRM. Output: one template "very authentic to your voice." If insufficient volume/no connection, falls back to three pre-generated templates for the rep to edit. ([AI Studio settings](https://help.sybill.ai/en/articles/9314197-ai-studio-settings))
  2. **Generate from Email Samples**: minimum **3 samples**, pasted manually — can be the rep's own old emails, a colleague's, or even "something that ChatGPT recommends as best practices." Output: three candidate templates. ([AI Studio settings](https://help.sybill.ai/en/articles/9314197-ai-studio-settings); count also confirmed independently in [help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide) and the [FAQ](https://www.sybill.ai/faq): "generate three templates that can be further customized")
- **What it learns**, per Sybill's own blog copy (marketing language, not a spec, but the most explicit description found): *"tone, sentence structure, formality level, signoff style."* ([blog: personalized emails](https://www.sybill.ai/blogs/ai-tool-personalized-follow-up-emails-sales-calls))
- **Learning is continuous/reinforcing, not one-shot**: *"The more follow-ups you review and send through Sybill, the better it matches your style. Early drafts may need more editing, but after a few weeks, most reps report the tone is nearly perfect."* (same URL) — this implies the system is watching sent/edited output over time, not just the initial 3-sample seed, though no doc explains the retraining mechanism.
- **No explicit off-switch documented.** There is no toggle called out anywhere to disable style-learning; the closest thing is that "Don't Specify" exists for the *Tone* and *Length* parameters on a per-generation basis (see §5), which stops the system from applying an explicit tone override but does not disable the underlying style model.
- **Scope is rep-level, not team-level**, consistent with the AI Studio being scoped per user account and the Profile Settings confirmation that there's no team tier (see §2). CRM connection itself is admin-gated at the org level, but the *style corpus* used per template appears to be each rep's own sent mail — no doc describes a shared "team voice" model.
- Troubleshooting entry directly on this point: *"Issue: The generated email doesn't match my style. Solution: Ensure your CRM is properly integrated and contains enough email data for the AI to learn from. Alternatively, provide three sample emails..."* ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))

---

## 4. Next-step awareness

- Sybill extracts **next steps, questions/answers, and pain points** automatically via what it calls "advanced natural language understanding (NLU) models... semantic models, so you do not need to explicitly say certain keywords." ([next-steps doc](https://help.sybill.ai/en/articles/6137666-what-are-the-next-steps-questions-and-pain-points-captured-by-sybill)) This feeds the `#NEXT_STEPS` variable available inside templates.
- **No conditional-per-outcome template logic is documented.** The custom-field conditioning system that *does* exist (in AI Workflows, for Pre-Meeting Brief / Meeting Summary / Deal Summary fields — e.g. "Qualification only for Sales meetings," "FAQ only for Discovery, Demo, or Interview calls") is explicitly scoped to those three summary types. The email-template selection mechanism described everywhere else is the manual dropdown-and-"Rewrite Email" flow — there is no "if next_step == demo_booked then use template X" rule described anywhere in Sybill's own materials. ([AI Workflows guide](https://help.sybill.ai/en/articles/12130560-getting-started-with-ai-workflows-pre-meeting-briefs-meeting-summary-deal-summary))
- The closest thing to outcome-awareness in the *content* (not the template-selection logic) is that the `<AI instruction>` tokens can reference the call's specific outcome in prose (e.g., "Relevant next steps in bullets") and the model presumably conditions its instruction-following on whatever `#NEXT_STEPS` data exists for that call — but this is content-level adaptation within a single fixed template, not template-level routing by outcome.
- This is a genuine, confirmed capability gap in what Sybill documents (whether it's a gap in the product or just in the docs is **UNCONFIRMED** — it's possible reps route this manually as part of their workflow and Sybill doesn't need to build it, since a human is reviewing every email anyway).

---

## 5. Tone/length/language controls, admin controls, approval flow

### Tone & length (rep-facing, per-generation)
- Two independent dropdown parameters exposed in the Prompt Editor: **Length** (`Short` / `Medium` / `Don't Specify`) and **Tone** (`Informal` / `Professional` / `Don't Specify`). Defaults: Length = Medium, Tone = Informal. ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))
- `Don't Specify` on either axis means "don't apply an additional stylistic override — follow the template's own instructions/prompt content instead" — i.e., these are override knobs layered on top of the template, not the primary style mechanism.
- These are set **per generation**, and per the FAQ can be re-set per recipient even reusing the same underlying template: *"say you have an ideal template but for a certain customer you prefer the email to be written in a more informal style vs. for another customer something in a more professional style, you can do both from a single template by altering the 'Email Tone.'"* ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))

### Language
- Magic Summary (the underlying source content) is **English-only output**, even though the call itself can be in any of 100+ supported languages: *"The Magic Summary is only available in English. However, our platform supports 100+ languages... Sybill will generate a perfect call summary and transcript in English."* ([FAQ](https://www.sybill.ai/faq)) No source documents multi-language *email* output specifically — reasonable to assume it inherits the English-only constraint of the summary layer it's built on. **UNCONFIRMED** whether the email itself can be generated in a non-English language via an `<AI instruction>` override.

### Admin controls
- CRM connection (and therefore the auto-generate-from-CRM style path) requires **Sybill admin** role at setup time. ([CRM integration doc](https://help.sybill.ai/en/articles/8132410-how-does-sybill-s-integration-with-crm-systems-work))
- Two account roles exist: **Admin** and **Member**; team management gives admins visibility into seats/licenses ("Recorder" vs. "Collaborator") but the docs found describe **no admin control over an individual rep's email templates specifically** — that surface is user-owned. ([team management](https://help.sybill.ai/en/articles/9314179-team-management-settings))
- Confirmed roadmap gap, stated directly in the docs (not inferred): *"Admins will be able to view and edit user-level settings"* is listed under **"Coming Soon,"** implying it does not exist yet as of the doc's writing. ([profile settings](https://help.sybill.ai/en/articles/9314175-profile-settings-a-complete-guide))
- There is a workspace-level "Require Admin Approval for New Signups" toggle, but it governs account provisioning, not template/email content policy. (same URL)

### Approval / edit-before-send flow
- Universal across every source checked (help docs, FAQ, two separate blog posts, and even the tldv.io independent review's passing mention): **generate → review/edit → rep manually sends.** No auto-send path documented anywhere.
- Representative quotes:
  - *"Once the email is generated, you could edit it or send it through your email client."* ([help guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide))
  - *"You can review and customize the email before sending it out, ensuring it matches your style and preferences."* ([FAQ](https://www.sybill.ai/faq))
  - *"The rep reviews the draft (typically 1 to 2 minutes), makes any adjustments, and sends."* ([blog: personalized emails](https://www.sybill.ai/blogs/ai-tool-personalized-follow-up-emails-sales-calls))
  - Explicit anti-pattern warning, in Sybill's own words: *"Sending without reviewing — AI-generated does not mean send-ready every time. Reps should still review for nuance, accuracy, and relationship context."* ([blog: AI Auto Follow Up Emails](https://www.sybill.ai/blogs/ai-auto-follow-up-emails))

---

## 6. Grounding / accuracy claims

This is the most important section for our differentiation strategy, and the finding is clean: **Sybill makes no structural grounding claim and provides no citation mechanism for the follow-up email or the Magic Summary it's built from.**

- FAQ, on summary accuracy — the single strongest accuracy statement found anywhere in their materials, and it's a plain assertion with no mechanism behind it: *"How accurate is the Magic Summary in capturing key points from the call? Sybill captures every important detail from the meeting that may play an important role in the deal cycle."* ([FAQ](https://www.sybill.ai/faq)) No claim of "only what was said," no per-line sourcing, no confidence scoring.
- The Magic Summary product page ([sybill.ai/meetings/magic-summary](https://www.sybill.ai/meetings/magic-summary)) was checked directly and contains no accuracy/grounding/citation language at all — closest is generic "flag the important stuff."
- Sybill's own blog content **openly concedes the failure mode** a receipts system would catch, and offers human review as the only mitigation — no product-side safeguard is described:
  - *"AI occasionally misinterprets sarcasm, off-the-record comments, or sensitive topics. A 60-second review catches these."* ([blog: personalized emails](https://www.sybill.ai/blogs/ai-tool-personalized-follow-up-emails-sales-calls))
  - *"AI occasionally misinterprets context, includes off-the-record comments, or misjudges tone."* (same URL, FAQ section)
- An independent review (tldv.io) that tested Sybill's other features extensively did **not** find or report any grounding/citation mechanism for the follow-up email feature either — it simply wasn't evaluated in depth, which is itself informative: it's not a headline feature worth an independent reviewer's attention. ([tldv.io review](https://tldv.io/blog/sybill-honest-review/))
- **Conclusion: UNCONFIRMED that any grounding/citation system exists at all; the weight of evidence across primary and secondary sources is that it does not.** Sybill's trust posture for this feature is "we transcribe accurately and summarize well" + "you review before sending" — not "every claim is traceable to a transcript line."

---

## 7. Blueprint: our template system (receipts-first)

**Design goal:** every sentence in the generated email must trace back to a gate-verified claim (a `next_steps`, `pricing`, or `objection` item that survived the citation/verification gate — see `DECISION-BRIEF.md` L6–L9), never to an ungated model inference. Sybill's DSL is a good *syntax* reference; its *trust model* is exactly what we're not copying.

### Slots and variables (mapped to claim types)

| Token | Type | Source | Gate requirement |
|---|---|---|---|
| `{{recipient_first_name}}`, `{{recipient_company}}`, `{{sender_first_name}}` | fixed variable | CRM/calendar metadata | none needed — not a claim, just contact data |
| `{{meeting_title}}`, `{{meeting_date}}` | fixed variable | call metadata | none needed |
| `{{next_steps: n}}` | **claim slot**, repeatable | gate-passed `next_steps` claims only | MUST have passed the gate chain (exact/normalized/rescue match); `uncorroborated` items are never inserted, only optionally surfaced to the rep as a suggestion outside the email body |
| `{{pricing_terms}}` | claim slot | gate-passed `pricing` claims | same — pricing is the highest-stakes category to hallucinate into an email; zero tolerance for ungated insertion |
| `{{objections_addressed}}` | claim slot | gate-passed `objections` claims | same |
| `<<ai_instruction>>` | generation instruction, **not a raw model call** | model call constrained to operate *only* over the already-gated claim set assembled for this email, never the raw transcript | the instruction can reformat/rephrase gated claims (paragraph vs. bullets, tone) but cannot introduce new factual content not present in the claim set — this is the structural difference from Sybill's `<>`, which is documented as pulling "unique details from the call transcript" with no gate in between |

The key architectural departure from Sybill: their `<AI instruction>` tokens are free to reach back into the raw transcript/Magic Summary at generation time, with no verification step before that content lands in the sent email. Ours reach only into the **already-gated claim set** — the instruction can restyle, it cannot re-source.

### Per-next-step template selection logic

Sybill's own template taxonomy (§2) organizes by *call type* (Discovery, Ghosted, Intro Call, Check-In) and leaves outcome-based routing manual. We should do what they don't: route the template automatically off the gated `next_steps` claim's own type field.

```
if next_steps_claims contains type == "demo_scheduled":
    template = "demo-confirmation"       # confirms date/time, sets pre-demo expectations
elif next_steps_claims contains type == "pricing_requested":
    template = "pricing-followup"        # {{pricing_terms}} slot is load-bearing here
elif next_steps_claims contains type == "objection_pending":
    template = "objection-followup"      # leads with {{objections_addressed}}
elif next_steps_claims is empty:
    template = "no-next-step-recap"      # pure recap + soft CTA, no invented next step
else:
    template = "generic-recap"
```

This is a small, honest win over Sybill: their docs show *zero* automatic outcome-routing despite three separate marketing pages implying adaptive behavior. Shipping even this simple `switch` is a real, demoable differentiator, and it's cheap.

### Style knobs — day 1 vs. roadmap

**Day 1 (worth building now):**
- Length: `short` / `medium` / `unspecified` — directly matching Sybill's proven UX pattern (§5), it's a solved, low-risk knob.
- Tone: `informal` / `professional` / `unspecified` — same reasoning.
- Manual template selection dropdown as a fallback/override to the automatic routing above (never force the automation — let the rep override, same as Sybill's "Rewrite Email" pattern).
- One default template per user (not per team) — matches Sybill's proven scope and avoids building team-template infra we don't have time for.

**Roadmap (explicitly not day 1):**
- Style learning from sent-email samples (Sybill's 3-sample / CRM-corpus mechanism) — valuable, but it's a whole subsystem (corpus ingestion, style extraction, drift over time) and it doesn't touch the receipts differentiation at all. Skip for the hackathon.
- Team-level template management / admin push — Sybill itself doesn't have this yet ("Coming Soon" per their own docs, §5), so we're not behind by skipping it.
- Multi-language email generation.

### Three things Sybill does that we should deliberately NOT copy

1. **Free-reach `<AI instruction>` tokens that pull from the raw transcript at send-time with no verification gate.** This is Sybill's actual template mechanism (§2) and it's the exact hole our whole product exists to close. Copying it would mean copying their unverified-hallucination risk into a "trust the receipts" product — an unforced, self-defeating error. Our instruction tokens must be scoped to already-gated claims only (see slot table above).

2. **The doubled-delimiter documentation mess (`#` vs `##`, `<>` vs `<<>>`).** Their own docs are internally inconsistent about which is canonical (§2), and the stated justification — "needed when pasting from Google Docs" — is a symptom of not having a single authoritative template format with clean escaping rules. We should pick one delimiter pair, document it once, and never let a docs page contradict the product.

3. **Vague, mechanism-free accuracy marketing** ("captures every important detail... that may play an important role") sitting next to an admitted, undefended failure mode ("AI occasionally misinterprets... off-the-record comments," mitigated only by "review before sending," §6). This is the exact trust gap our receipts UI is built to close, and it would be a strategic mistake to end up making the same unverifiable claim ourselves in our own marketing — every claim we make about accuracy should point at the actual gate chain in code, not at a feel-good sentence.

---

## Sources

**Help center (help.sybill.ai — Intercom-hosted, primary):**
- [Using the AI Email for Follow-ups: A complete guide](https://help.sybill.ai/en/articles/8132340-using-the-ai-email-for-follow-ups-a-complete-guide)
- [AI Studio Settings](https://help.sybill.ai/en/articles/9314197-ai-studio-settings)
- [AI Email Template Samples](https://help.sybill.ai/en/articles/10375500-ai-email-template-samples)
- [What are the next steps, questions, and pain points captured by Sybill?](https://help.sybill.ai/en/articles/6137666-what-are-the-next-steps-questions-and-pain-points-captured-by-sybill)
- [How does Sybill's integration with CRM systems work?](https://help.sybill.ai/en/articles/8132410-how-does-sybill-s-integration-with-crm-systems-work)
- [CRM Settings](https://help.sybill.ai/en/articles/9314207-crm-settings)
- [Team Management Settings](https://help.sybill.ai/en/articles/9314179-team-management-settings)
- [Profile Settings: A Complete Guide](https://help.sybill.ai/en/articles/9314175-profile-settings-a-complete-guide)
- [A breakdown of Sybill's post-meeting report](https://help.sybill.ai/en/articles/6137458-a-breakdown-of-sybill-s-post-meeting-report)
- [CRM Deal Summaries](https://help.sybill.ai/en/articles/9969597-crm-deal-summaries)
- [CRM Autofill Feature Guide](https://help.sybill.ai/en/articles/11899540-crm-autofill-feature-guide)
- [Getting Started with AI Workflows: Pre-Meeting Briefs, Meeting Summary & Deal Summary](https://help.sybill.ai/en/articles/12130560-getting-started-with-ai-workflows-pre-meeting-briefs-meeting-summary-deal-summary)
- [Copilot Prompts Guide](https://help.sybill.ai/en/articles/10722005-copilot-prompts-guide)
- [What you get in Sybill's Slack notifications](https://help.sybill.ai/en/articles/8132384-what-you-get-in-sybill-s-slack-notifications)
- [How to set the default email handler in Chrome](https://help.sybill.ai/en/articles/6975942-how-to-set-the-default-email-handler-in-chrome)

**Product / marketing (sybill.ai):**
- [FAQ](https://www.sybill.ai/faq)
- [AI Auto Follow Up Emails for Faster Sales Follow-Ups](https://www.sybill.ai/blogs/ai-auto-follow-up-emails)
- [AI Tools That Write Personalized Follow-Up Emails After Sales Calls](https://www.sybill.ai/blogs/ai-tool-personalized-follow-up-emails-sales-calls)
- [AI Tasks with Sybill: Automate Sales Execution Efficiently](https://www.sybill.ai/product/ai-follow-up-emails)
- [Personalized Emails](https://www.sybill.ai/execution/personalized-emails)
- [Magic Summary](https://www.sybill.ai/meetings/magic-summary)

**Independent (secondary, checked for corroboration only):**
- [Sybill AI Review (2026): An Honest Look Before You Buy — tldv.io](https://tldv.io/blog/sybill-honest-review/) (did not evaluate the email feature in depth — negative-result data point on how prominent this feature is externally)

**Note on method:** WebSearch was used for initial discovery (article titles/URLs) until the session's search budget was exhausted; all substantive content extraction after that point was done by fetching raw HTML directly (`curl`) from help.sybill.ai and www.sybill.ai and parsing the article body server-rendered HTML, then cross-checked with WebFetch summaries where both were available. Raw HTML confirms these are genuine Intercom-hosted help articles, not fabricated or hallucinated content — the DISCOVERY template example in §2, for instance, was pulled verbatim from the article's actual `<article>` DOM node.
