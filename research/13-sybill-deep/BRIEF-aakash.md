# Brief for Aakash: scoring, coaching scorecards, and next-step email templates

Synthesized 2026-08-14 from three deep-research lanes on Sybill (01-voice-of-customer.md,
02-email-infra.md, 03-scoring-coaching-dev.md in this folder — every claim there carries a URL).
Read those for depth; this is the build direction.

## The thesis, one paragraph

Sybill's users like it and still edit its emails, can't verify its numbers, and get no real
scorecard: the "Deal-Level Coaching Scorecard" is a copy-paste chat prompt with no persistent UI,
only BANT and MEDDPICC are actually wired (Enterprise-gated), template selection is a manual
dropdown, and their public API has no score field at all — the two places a score could live are
undocumented "dynamic keys" objects. Everything you're about to build lands in confirmed gaps.
The engine rule that makes ours different in kind: **a score, a coaching verdict, or an email
line ships only if it cites a gate-verified moment — otherwise it abstains, visibly.**

## Feature 1: call scoring + rep scorecards

What Sybill actually has (03, verified against their docs):
- Always-on: behavioral stats only (talk %, filler words, monologue length, question rate,
  engagement leaderboards) across four Team Statistics tabs.
- The 12-dimension "coaching scorecard" their marketing touts: a prompt the user pastes into
  their deal chat. One-time output. No persistent scorecard, no trends, no per-rep history.
- Methodology: BANT + MEDDPICC wired to CRM autofill (MEDDPICC behind Enterprise). SPICED and
  Sandler are just names you can type into a chat. No methodology picker exists.
- Their own Gong-comparison page concedes it: they call Gong the "sales analyst" and themselves
  the "sales assistant."

Build direction:
- **Build ON the methodology coach already in the engine** (14 packs incl. MEDDPICC/SPICED/
  Sandler + custom-method compiler + evidence-gated verdicts). Do not re-derive method logic.
  Your work is the persistent surface: per-call score → per-rep scorecard → trend over calls.
- **The manager picks the pack** (Sourav's requirement). One config choice per team/workspace,
  switchable, and a custom pack is a file, not a feature request. This alone beats Sybill's
  field-by-field free-text prompt setup.
- **Every scored dimension carries its receipts.** A manager clicks "Budget: 4/5" and sees the
  two quotes that earned it, or sees "not discussed" (abstain) — never a bare number. Sybill has
  zero citation anywhere in scoring (03, confirmed). This is the moat applied to scoring.
- **Score object is typed and versioned** (schema + pack id + pack version + evidence ids).
  Their API's "dynamic keys" mess is the anti-pattern; ours should be the thing a developer can
  build on. Cheap now, impossible to retrofit later.
- Behavioral stats (talk ratio, question count) are computed from timestamps, deterministic,
  free — include them, but they're table stakes, not the pitch.

## Feature 2: follow-up email templates per next step

What Sybill actually has (02, from their own help center, read verbatim):
- Template DSL: plain text + `<AI instruction>` + `#VARIABLE`. (Their own docs contradict
  themselves on delimiters between two articles — keep ours singular and documented once.)
- Style matching: rep-level only, from CRM sent-mail or 3+ pasted samples. No team tier
  ("Coming Soon" per their own docs). No off-switch documented.
- **Template selection is a manual dropdown.** They extract next steps into #NEXT_STEPS but
  never route on them. Nobody in this market auto-selects the template by detected outcome.
- Draft-only, human always sends (universal — validates our choke posture).
- No grounding mechanism anywhere; their blog concedes misreads with human review as the only
  safeguard.

Build direction:
- **Outcome routing is the headline feature**: detected next step drives template choice —
  demo booked → confirmation+prep template; pricing requested → quote-follow-up; commitment
  made → fulfillment (the promise, restated, cited); no next step → re-engagement. The routing
  key is the gate-verified next_steps claims, so the router can never route on a hallucinated
  outcome. First in market, and only possible BECAUSE of the gate.
- **DSL: keep their 3-token shape** (it's good UX and reps may know it) with one structural
  difference: `<AI instruction>` tokens operate over GATED CLAIMS ONLY, never raw transcript.
  `#VARIABLES` map to claim types: #NEXT_STEPS, #PRICING, #OBJECTIONS, #PAIN, #COMMITMENTS.
  An empty slot renders empty (absence honesty), never invented filler.
- **The choke invariant is non-negotiable**: composeEmail from verified/segment_corrected
  claims only; unknown citation rejects the whole draft; model-authored titles never enter the
  email (that exact leak was found live and fixed in PR #1 — commit 9cc86c7). Templates are a
  rendering layer ABOVE the choke, never a bypass around it.
- Day-1 knobs: length (short/standard), tone (2-3 presets), manual template override, per-user
  default. Roadmap, not now: style learning from samples, team template libraries,
  multi-language.
- Even 5-star Sybill reviewers say they edit every email (01). Our target is different: the
  email is short and every line is checkable, so review takes seconds. "Faster to trust" beats
  "longer and fluent."

## Feature 3: coaching

- Their behavioral coaching is real but commodity. The gap named directly in competitor
  content (01): no live/methodology coaching scorecard. Your scorecard-over-time per rep, on
  the manager's chosen methodology, with clickable evidence per verdict, is the product answer.
- Don't build: engagement/excitement-style behavioral AI scoring. It's reportedly an AI-Act
  problem in EU/UK and bias-prone (01, single source, flagged) — and it's unciteable, which
  fails our own bar. Deliberately excluding it is a README credibility line, same as sentiment.

## Engine invariants (the "base model stays the same" contract)

1. Nothing user-visible ships without a receipt or an explicit abstain state.
2. The email choke: verified claims in, whole-draft rejection on any unknown citation.
3. Demote, don't hide — including score dimensions ("not discussed" renders).
4. Typed, versioned outputs (score objects, email drafts) — no dynamic-keys objects.
5. Fabrication regression tests grow with every new surface: a scoring or template bug that
   ships an unverified claim gets a permanent test, same as the gate.

## Messaging corrections (important — from lane 01)

- The "20 action items when only 4-5 existed" Sybill quote FAILED verification (no findable
  source). Do not use it in the demo, README, or Q&A. Verified replacement, same failure class:
  an independent hands-on tester documented Sybill fabricating a complete contact profile for
  an invented prospect. Both plan docs already corrected.
- Safe verified lines: Sybill's own blog concedes AI misreads with human review as the only
  safeguard; their scorecard is a copy-paste prompt; their template picker is manual; their
  API exposes no score field; CRM autofill is 3x-price-gated and capped at 10 fields.

## What NOT to copy (from all three lanes)

1. Ungated AI-instruction tokens that reach raw transcript (their DSL's structural flaw).
2. Mechanism-free accuracy marketing ("95%+ accurate" with no way to check).
3. Dynamic-keys API objects with no stable schema.
4. Silent failures (their bot fails password-protected Zoom rooms and drops non-English
   recordings with no error) — every failure here has a named exit, always.
5. Behavioral/facial engagement scoring.
