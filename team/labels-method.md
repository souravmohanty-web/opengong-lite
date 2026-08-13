# Golden-call labels — method (team/labels.json)

Built by: `projects-2f` build session, 2026-08-14. Fulfills the TASKBOARD.md Slice-3
row "Golden-call hand-labeling (2 calls) | Sourav + drafting agent | blocked: scripts +
Sourav time" — scripts landed, so this is the drafting-agent half of that row. **Status:
DRAFT, pending Sourav's spot-check/sign-off** (see `review_status` in labels.json)
— nothing here is presented as a Sourav-reviewed number, only as a defensible,
independently-checkable one.

## Why this file exists

`scripts/scorecard.mjs`'s Gate C ("trust floor") checks for the existence of
`team/labels.json` / `labels.json` / `samples/labels.json`. No file → Gate C is `RED`
→ Product pull is capped at 15/30 (`team/scorecard.json`, gate `C`, and confirmed in
`test/scorecard.test.js` SC-09: *"Gate C fires red right now because no labels.json
exists yet ... else: this scorecard run correctly moves on"*). Metric
`pp-2.6-precision-golden-call` (`team/scorecard.json`) targets **precision ≥90% on a
hand-labeled golden call, n≥8**. This file is that hand-labeling.

I did **not** touch `scripts/scorecard.mjs` or `team/scorecard.json` — those aren't
mine to edit per this task's ownership boundary (`team/labels.json` +
`team/labels-method.md` only), and the Iron Law in `team/PROTOCOL.md` is "no edits to
files another session has claimed." `pp-2.6`'s `grader` is `"pending-samples"`, not
`"auto"`, so the runner has no `CHECKS['pp-2.6-precision-golden-call']` handler yet —
adding the precision-computation code itself is future work for whoever owns that
metric ("UNOWNED" per `team/SCORECARD.md` line 13/44). What labels.json's mere
*existence* does today, verified by re-running the scorecard (see Results below): Gate
C flips from `RED` to `PENDING`, which removes the `<=15` cap on product_pull (only
`RED` caps it — see `computeRollup()` in scorecard.mjs). That's the real, current,
checkable effect; I'm not overclaiming a "Gate C PASS" state the runner doesn't
compute.

## Ground truth source

`samples/DEAL-STATE.md` — the deal-arc script with its own planted-traps table and
cross-call answer key ("this table doubles as the golden-label answer key" — its own
closing line). Used directly, not paraphrased, for:

- the **negation trap** (call 1: "we do not have a budget problem ... it's a trust
  problem")
- the **coreference trap** (call 1: "it's just too expensive" → *it* = the RingHawk
  renewal, not the new vendor's price)
- the **reported-speech trap** (call 3: "the old vendor told us ... porting numbers
  takes months")
- the **planted FAKE claim** ("rep agreed to match RingHawk's price") — this exact
  language from the task brief matches `samples/bundles/03.bundle.json` claim
  `pricing-4`

## Calls chosen and why

Two full calls, both fully labeled claim-by-claim (target was "at least one full call,
ideally 2"):

- **Call 01** (Discovery) — carries the negation trap and the coreference trap, plus
  the "off-call authority" pattern (Dr. Mehta's dental-practice equivalent doesn't
  appear here, but the office-manager-influencer pattern does).
- **Call 03** (Pricing) — carries the reported-speech trap, the Dr. Mehta
  never-on-calls pattern (directly checkable against DEAL-STATE's cast table), and the
  planted fake claim named in the task brief.

Together these two calls exercise every named trap category in the ground-truth
source, not just an arbitrary sample.

## Procedure (per claim)

For every claim in each bundle's `claims[]` array:

1. Pull the claim's `text`, `status`, and every `evidence[].quote` +
   `evidence[].utterance_id`.
2. Look up that `utterance_id` in the same bundle's `transcript.utterances[]` and
   confirm the quote is a real substring of the real utterance text (the receipts
   mechanism already guarantees this structurally — my job is judging the
   *interpretation*, not re-verifying string containment).
3. Read the quote in the context of the full utterance and its immediate neighbors.
4. Ask: is the claim's `text` a fair reading of what was actually said, or does it
   misread a negation / hypothetical / reported-speech / coreference / number, or
   assert something the quote doesn't support?
5. Cross-check against `samples/DEAL-STATE.md`'s planted-traps table wherever the
   claim touches a named trap or a cast-table fact (e.g. "Dr. Mehta never on these
   calls").
6. Label `correct` or `incorrect`, with a one-line rationale that names the specific
   quote/utterance and, where relevant, the trap or answer-key line it was checked
   against — so the label is falsifiable by a reviewer, not just asserted.

For the one non-`verified` claim (`pricing-4` on call 03): confirmed its
`evidence[0].match_type` is `"none"` / `reason: "not_found_in_transcript"`, confirmed
the quoted text really doesn't appear anywhere in utterance 6 or the transcript, and
labeled it `correctly_caught_fake` — a true negative, per the task's explicit
instruction, not a shipped error.

## Precision formula

```
precision = shipped_correct / shipped_total
```

`shipped` = claims with `status: "verified"` — the ones the pipeline actually asserts
as fact to a user. Demoted (`uncorroborated`, `segment_corrected`) or blocked
(`blocked_injection`) claims are excluded from the denominator because they were never
shipped as a fact; they're still labeled in the file (as `correctly_caught_fake` /
`correctly_blocked`) so the demotion mechanism itself has evidence behind it, but
counting a correctly-refused claim as a "precision opportunity" would understate how
good the shipped set is for the wrong reason.

## Results

| | count |
|---|---|
| Shipped claims labeled (status:verified) | 44 (24 from call 01, 20 from call 03) |
| Shipped, correct | 43 |
| Shipped, incorrect | 1 |
| **Precision** | **43/44 = 97.7%** |
| Non-shipped claims labeled (demoted/blocked) | 1 (the planted fake, correctly caught) |
| Target (SCORECARD 2.6 / pp-2.6) | ≥90% precision, n≥8 |
| Result | **PASS** — 97.7% ≥ 90%, n=44 ≥ 8 |

The one `incorrect` label (`buying_stage-urgency` on call 01: "wants it live by
Thursday") is a genuine, intentionally-not-smoothed-over stretch — the transcript
supports a demo being scheduled for Thursday, not a production go-live urgency. I kept
this labeled `incorrect` rather than finding a generous reading, per the task's
explicit instruction: *"label truthfully — if a claim is a stretch, mark it. Don't
inflate precision."* Precision would read 100% (44/44) without it; I chose not to
round that corner. Full rationale is inline on that entry in `labels.json`.

Four trap-category claims are called out by name in `labels.json`'s
`summary.traps_covered` because they're the strongest positive evidence in the set:
the negation, coreference, and reported-speech traps were all resolved *correctly* by
the live extractors on a real call (not just in the dedicated `pp-2.1`/`pp-2.2`/`pp-2.3`
synthetic fixtures), and the planted fake claim was correctly refused rather than
shipped.

## Known limitations / honesty notes

- **Single labeler, one pass.** This is the drafting-agent half of "Sourav + drafting
  agent" on the TASKBOARD row — it has not yet had Sourav's independent spot-check.
  Every label carries a falsifiable rationale specifically so that check is cheap to
  do, not so it can be skipped.
- **Two calls, not all five.** DEAL-STATE.md's plants span all five arc calls (e.g.
  the dropped-TCPA-commitment beat lives in call 4, the code-switch/Hinglish honesty
  test also in call 3 audio but not reflected in this text-transcript bundle). Calls
  01 and 03 were chosen because between them they cover every *named trap category* in
  the answer key, not because the other calls are less trustworthy — labeling them is
  straightforward follow-on work with this same procedure if a reviewer wants a larger
  n.
- **`competitors-0` and `summary-*` claims sometimes aggregate facts from more than the
  utterance(s) they cite** (e.g. call 01's `competitors-0` states "five locations,"
  which is established by the rep's question in utterance 2 but not re-cited in that
  claim's own `evidence[]` array). I labeled these `correct` because the underlying
  facts are true and uncontested elsewhere in the same call — not fabricated — but
  flagged the citation-completeness gap inline in the rationale rather than silently
  passing it. This is a real, minor extractor behavior worth a follow-up ticket
  (aggregation claims should cite every sub-fact they state), separate from precision
  labeling.
- **`scripts/control-room.mjs`'s `loadLabels()` entry-count display** does
  `Array.isArray(labels) ? labels.length : Object.keys(labels).length` — since
  `team/labels.json` is a metadata object (not a bare array) it will show "7 entries"
  (the top-level keys) rather than the 45 actual labeled claims. This is a pre-existing
  generic display against a schema that didn't exist yet when control-room.mjs was
  written; not fixed here (out of this task's file ownership), and non-blocking — it's
  cosmetic display text, not a test assertion (confirmed: no test in
  `test/control-room.test.js` asserts on labels count).

## Verification run (this session)

```
$ npm test            # full suite, before and after adding these two files
$ npm run scorecard    # before: Gate C RED, product_pull capped at 15/30
                        # after:  Gate C PENDING, cap lifted
```

See the task-completion report for this session's actual command output.
