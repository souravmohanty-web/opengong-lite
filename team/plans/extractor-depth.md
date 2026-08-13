# Extractor Depth — DiscoveryClaude reference, receipts-first (2026-08-13)

How the OpenGong-Lite extractors gained DiscoveryClaude-level analytical depth **without**
becoming DiscoveryClaude. This is the "reference, not mirror" rationale.

## The one-line difference

> **DiscoveryClaude SCORES. We CITE.**

DiscoveryClaude answers "how good was this call, 0-10?" — a judgment. OpenGong-Lite answers
"what was said, and where exactly?" — a receipt. Every published fact points to a verbatim
transcript line the gate re-verifies. That citability is the whole wedge, so any depth we borrow
from DiscoveryClaude has to survive being reduced to *a quote plus an honestly-labelled read of it*.

## The spine: Anti-Subjective-Arbitrage

The product promise is **consistency you can trust** — the same call, run twice, produces the same
labels. A judgment that drifts between runs breaks that promise as badly as a fabricated quote does.
So there are **no free judgments**. Every derived enum field in every extractor obeys four rules,
stated in the extractor's own prompt:

1. **Criterion, not vibe.** Each enum *value* is defined by an observable, quotable test written into
   the prompt. Pain `business` = "buyer names a business metric (revenue / hours / bookings / churn)";
   `personal` = "buyer names a personal stake (my job / my time / my stress)". The model applies a
   stated test; it never invents the boundary at runtime.
2. **The judgment rides on a receipt.** The quote that satisfies the criterion (the *trigger*) must be
   among the `evidence` the item cites. A label with no trigger quote is not allowed to exist.
3. **Abstain, don't guess.** When no criterion is clearly met, the value is `unclear` — the honest
   state, cheaper than a confident wrong answer. (This is the interpretation layer's "unclear is safer
   than a guess" rule, extended from stance to every derived field.)
4. **Reproducible.** Assumes temperature 0 + `prompt_version` stamped on the run record — so
   label agreement on the golden call is a scorecard-measurable property (run twice, diff the labels).

**Consequence — demote or drop high-arbitrage fields.** A derived field that *cannot* be pinned to an
observable, quotable criterion does not ship as a confident label. It is either dropped, or demoted to a
**coverage record** (a `{value, basis, evidence}` read whose `basis` is honestly `cited` / `inferred` /
`absent`). That is exactly why `buying_stage` and `risk_flags` carry a `basis` field instead of a bare
enum, and why the fields in the "did NOT adopt" section below were cut.

## Three receipt kinds

| Kind | What it is | Verified by | Shape in our schema |
|---|---|---|---|
| **Receipt** | A verbatim quote anchored to an utterance | The evidence gate (blocking, deterministic) | `evidence: [ {utterance_id, quote} ]`, `$ref opengong://evidence` |
| **Derived judgment** | A label that *rides on* ≥1 receipt via a stated criterion | Rides on the receipt + the interpretation gate's `interpretation_confidence` badge (code-derived, never model-supplied) | an enum sub-field on a claim that also carries `evidence` before `text` |
| **Coverage record** | A call-level read that may have no citable line | Its own `basis` field marks `cited` / `inferred` / `absent` — never pretends to a receipt it lacks | `{value, basis, evidence}` object with **no `text`**, so it is never mistaken for a per-line claim |

Multi-receipt (a fact with two sides) uses the evidence array on **both** sides: the primary side's
`evidence[]`, plus a nested `{evidence[], text}` object for the second side (nullable when absent). The
supplied-id screen in `src/extract.js` recurses into every nested `evidence[]`, so both receipts are
id-screened at runtime today.

## Mapping table — DiscoveryClaude block → our extractor

| DiscoveryClaude block | Our extractor | Receipt(s) | Derived judgments (criterion-anchored) | Coverage records |
|---|---|---|---|---|
| Objections (category / handling / killed_or_stalled / marketing_signal + rep response) | `objections` | buyer objection `evidence` + `text`; **rep_response** `{evidence, text}` \| null (2nd receipt) | `category`, `handling` (rides on rep_response quote), `objection_status` (rides on buyer's follow-up quote) | — |
| Competitors (context / type / sentiment / switching_trigger / handling / decision_stage) | `competitors` | mention `evidence` + `text`; **switching_trigger** `{evidence, text}` \| null (2nd receipt) | `relationship` (present-tense vs leaving vs evaluating cue) | — |
| Pain (L1/L2/L3 layer / who_it_affects / quantified impact / verbatim) | `pain` | pain `evidence` + `text`; **quantified_impact** `{evidence, text}` \| null (2nd receipt) | `layer` (deepest metric/stake named), `who_it_affects` (party named in quote) | — |
| Next steps (type / owner / stakeholder / commitment) | `next_steps` | commitment `evidence` + `text`; `due` (verbatim string) | `type`, `owner`, `commitment` (rides on the modal words / date quoted) | — |
| Pricing/budget (budget_signal / pricing_signal taxonomy / budget_authority) | `pricing` | money `evidence` + `text` (numbers char-for-char) | `kind`, `pricing_signal` (rides on the reaction/comparison quote) | — |
| Buying stage (stage / urgency / trigger_event) | `buying_stage` | quote per dimension when `basis:cited` | `stage`, `urgency`, `trigger_event` values | all three dimensions are `{value, basis, evidence}` coverage reads |
| Audience / buying committee (who's present, economic buyer, threading) | `stakeholders` | person `evidence` + `text` per stakeholder | `role_signal` (economic_buyer / champion / blocker rides on the authority quote), `present_on_call` | `threading` (single vs multi) is a `{value, basis, evidence}` read |
| Context/risk flags (buyer_posture / transcript_quality / anomaly) | `risk_flags` | anomaly cites the offending line when one exists | — | all three flags are `{value, basis, evidence}`; `evidence_required:false` — highest-arbitrage layer, ships as coverage only |
| Coaching (behavior / moment / technique / reframe) | `coaching` (**STRETCH**, `enabled:false`) | the coachable **moment** `evidence` + `text` | `behavior`, `assessment` (from the cited moment) | `reframe` = generated advice riding on the moment; rep-facing only |
| — (the 5-section anatomy is ours) | `summary` | every block is `{evidence, text}` | — | — |

## Arbitrage rating per derived field

LOW = a near-mechanical read of the quote. MEDIUM = criterion-anchored but needs judgment. HIGH = not
reliably readable from one transcript → **must** be demoted to coverage or dropped.

| Field | Extractor | Arbitrage | Disposition |
|---|---|---|---|
| `category` | objections | LOW | ship (closest-fit taxonomy; enum locked by a registry test) |
| `handling` | objections | MEDIUM | ship — bound to the rep_response quote; `ignored`/`unclear` forced when rep_response is null |
| `objection_status` | objections | MEDIUM | ship — requires the buyer's own follow-up quote for `accepted`/`reiterated` |
| `relationship` | competitors | MEDIUM | ship — present-tense / leaving / evaluating cues |
| `layer` | pain | MEDIUM | ship — Sourav's metric-vs-stake criterion; deepest layer a quote supports |
| `who_it_affects` | pain | MEDIUM | ship — only when the affected party is named |
| `type`, `owner` | next_steps | LOW | ship |
| `commitment` | next_steps | MEDIUM | ship — rides on modal words / a named date |
| `kind`, `pricing_signal` | pricing | MEDIUM | ship — rides on the reaction / comparison quote |
| `role_signal` | stakeholders | MEDIUM | ship — rides on the authority/advocacy/gatekeeping quote |
| `stage`, `urgency`, `trigger_event` | buying_stage | MEDIUM–HIGH | **demoted to coverage** (`basis` field) — call-level, often only inferable |
| `buyer_posture` | risk_flags | HIGH | **coverage only**, `evidence_required:false` — soft read, defaults to `unclear`/`inferred` |
| `transcript_quality`, `anomaly` | risk_flags | HIGH / MEDIUM | coverage; `anomaly` cites the offending line when present |
| `assessment`, `reframe` | coaching | MEDIUM / n/a | STRETCH, rep-internal only; `reframe` is labelled generated advice, never a claim |

## Consumer tagging — one extraction, three views

Every extractor carries a top-level `consumer: [...]` array (primary first), naming the downstream
owner(s) of its signals: `rep` · `manager` · `marketing` · `crm`. This is DiscoveryClaude's hard-won
lesson — *tag every signal with its consumer from day one* — so a rollup never folds a rep-coaching read
into a marketing pattern. It is additive and optional in `schemas/extractor.schema.json` (not in
`required`), so `tracker.json` and any older extractor still validate.

One pass over the transcript renders three audiences without re-extracting:

- **Rep view — my to-dos.** `next_steps` (owner=rep, due), `summary` Outcome + Next steps, `coaching`.
  Consumers containing `rep`.
- **Manager view — deal state.** `buying_stage`, `stakeholders` (threading, economic buyer),
  `risk_flags` (posture, anomaly), `objections` (handling / objection_status), `pricing` signals.
  Consumers containing `manager`.
- **Marketing view — patterns across calls.** `pain` (layer, verbatim), `competitors`
  (relationship, switching_trigger), `objections` (category), `pricing` (pricing_signal). Consumers
  containing `marketing`. Cross-call aggregation happens downstream — no per-call extractor guesses
  "recurring vs one-off", because that is not observable in a single transcript.
- **CRM sync.** Fields with a `crm_map` and a consumer containing `crm` map to HubSpot/Salesforce
  properties.

The same claim can serve several audiences (objections → manager + marketing + crm); the array records
all of them, primary first. This is the Sybill persona-delivery idea done receipts-first: the *view*
changes, the *underlying cited facts* do not.

## What we deliberately did NOT adopt

- **The 0–10 scores.** DiscoveryClaude's headline numbers (call score, discovery score, etc.) are not
  citable — a "7/10 discovery" points to no line. Citability is the wedge, so scores are out. Where
  DiscoveryClaude would score, we emit a criterion-anchored enum riding on a receipt, or nothing.
- **Competitor sentiment.** The contextual-analysis plan explicitly scopes sentiment out of v1
  ("v1 ships NO sentiment extractor — scoping decision"); sarcasm makes it unreliable from text. Dropped.
- **Competitor type (direct/adjacent).** That is a fact about the *vendor*, not about this call — it
  belongs in the entity registry (`registry/entities.json`), not a per-call model guess. Dropped.
- **Objection `marketing_signal` (recurring vs one-off).** Cross-call by definition; unknowable from one
  transcript. The marketing consumer gets the citable `category` + verbatim `text`; recurrence is
  computed downstream. Dropped.
- **Call-level `budget_signal` / `budget_authority` inside `pricing`.** Per-mention pricing can't carry a
  whole-call budget read. Budget authority moved to `stakeholders.role_signal:economic_buyer` (citable);
  budget confirmation is a `buying_stage` concern. Dropped from `pricing`.
- **`killed_or_stalled_deal` as a boolean.** Predicting deal death from one call is speculation. Replaced
  with the observable `objection_status` (did the buyer, in their own quoted words, accept or reiterate?).

## Registry / lint compliance

All ten model extractors + the tracker load through `src/registry.js` against the real `schemas/`
(`registry.test.js` exercises the full `extractors/` dir). Every `output_schema` object is closed
(`additionalProperties:false`) and fully-required; optionality is expressed with type unions
(`["object","null"]`), never absent keys; no `minLength`/`maxLength`/`minimum`/`maximum`/`minItems>1`/
`allOf`/`not`/`if`. Evidence-bearing objects keep `evidence` key-ordered before `text`. The coverage-read
objects (`buying_stage`, `risk_flags`, `stakeholders.threading`) carry **no `text`**, which is precisely
what marks them as derived reads rather than per-line claims.

### Runtime handoff (out of this slice's scope)

`src/extract.js#flattenClaims` currently maps `objections` + `summary` (Slice 1) and trackers by shape.
The new extractors and the second-receipt objects (`rep_response`, `switching_trigger`,
`quantified_impact`) are **schema-complete and lint-clean today**; wiring them into flattened, paired
gate claims is the runtime slice's job (that file is owned elsewhere). The safety layer already covers
them: `checkSuppliedIds` id-screens every nested `evidence[]` regardless of flattening.
