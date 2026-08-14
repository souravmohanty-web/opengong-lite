# Output-quality match: our email and summary vs the documented standard

**What this is:** a side-by-side audit of what OpenGong Lite actually renders (the follow-up
email panel and the summary sections on `public/notes/*.html`, across all 6 sample bundles)
against the standard we can point at in writing:

- **Their email standard** = the verbatim DISCOVERY template Sybill publishes, plus the
  template taxonomy and the tone/length defaults, all cited in
  [`02-email-infra.md`](02-email-infra.md) (§2 for the template, §5 for the knobs).
- **Their summary standard** = the 5-section anatomy in
  [`../../team/plans/representation.md`](../../team/plans/representation.md): Outcome /
  Next steps / Key takeaways / Pain points / Interests, 300 to 500 words, omit rather
  than "N/A".

**Scope of the fixes made here.** The template system (per-next-step routing, the DSL) is
Aakash's lane per issue #2 and nothing in it was built. The render layer we own was fixed:
`composeEmail`'s deterministic baseline shape in `src/email.js`, the email panel and the
summary section rendering in `src/notes-view.mjs`. The choke point is untouched: the
composer still refuses anything bundle-shaped, still admits only `verified` and
`segment_corrected` claims, and `screenDraft` still rejects a whole draft that cites an
ungrounded id.

**Evidence for every claim below:** `npm test` 437 tests, 436 pass, 1 skipped, 0 fail (was
421 before this pass), plus `npm run build:notes` regenerating all 6 pages.

---

## 1. The checklist

### (a) A follow-up email a real rep would send

Derived line by line from the DISCOVERY template Sybill publishes verbatim
([02-email-infra.md §2](02-email-infra.md)) and the tone/length defaults in §5.

| # | Item | Where it comes from |
|---|---|---|
| E1 | Named greeting | `Hi ##receivers_first_name,` |
| E2 | One line of context that names the call | "Thank you for taking the time to chat with me earlier today" |
| E3 | Where the call landed, stated early, in one line | "<<Write a short statement...>>" sitting above the steps |
| E4 | The recap grouped under a label, not one flat list | template separates prose from the `Next steps:` block |
| E5 | An explicit `Next steps:` block | literal in the template |
| E6 | Each next step carries an owner and a due date | representation.md: "bulleted, actionable; include owner & due date" |
| E7 | How firm the commitment is stays visible | ours; no Sybill analog |
| E8 | A human close and a signoff with the sender's name | "Best, ##sender_first_name" |
| E9 | Short, informal register | their defaults: Length = Medium, Tone = Informal (§5) |
| E10 | Draft only, a human reviews and sends | every source ends "the rep reviews and sends" (§1, §5) |
| E11 | No line said twice | craft floor |
| E12 | Second person, written to the buyer | the whole template is second person |
| E13 | The template routes off the call's outcome | their documented gap (§4), our stated opening |
| E14 | The draft sounds like the rep who sends it | their style-matching (§3) |
| E15 | Every asserting line traces to something said on the call | ours; they have none (§6) |
| E16 | Anything the call could not back is visibly held out | ours |
| E17 | An instruction planted in the audio cannot reach the draft | ours (L8) |

### (b) A summary a real manager would read

From [`representation.md`](../../team/plans/representation.md), verbatim where it matters.

| # | Item | The line it comes from |
|---|---|---|
| S1 | Outcome first, one sentence, never chronological | "Outcome first, one sentence. Chronological recap is the #1 robot tell." |
| S2 | Section order: Outcome, Next steps, Key takeaways, Pain points, Interests | "Default = the 5 sections..." |
| S3 | 300 to 500 words, enforced as a post-hoc word-count assertion | "Hard cap 300-500 words... enforced as a token budget + post-hoc word-count assertion" |
| S4 | A section with nothing supported is omitted, never "N/A" | "Sections with nothing supported are OMITTED, never 'N/A'" |
| S5 | The buyer's exact words for pains and objections | "Buyer's exact words for pains/objections, never corporate register" |
| S6 | Exactly one human or relationship detail | "Keep exactly ONE human/relationship detail" |
| S7 | Next steps carry owner and due date | the per-field extractor pattern |
| S8 | Low-confidence or zero-citation values render as unconfirmed, never asserted silently | "Low-confidence/zero-citation values → 'unconfirmed' rendering" |
| S9 | Every line cited | ours; the differentiator |

---

## 2. The verdict table

| # | Item | Verdict | Note |
|---|---|---|---|
| E1 | Named greeting | **GAP-FIXED** | `Hi Rahul,` from the caller-owned `owners` map. No name known renders `Hi there,` and invents nobody. |
| E2 | Context opener | **GAP-FIXED** | "Thanks for the time on the demo call." The old panel opened straight on a colon and a list. |
| E3 | Outcome stated early | **GAP-FIXED** | The first summary claim is lifted out of the recap and rendered as the lead line. It is still a backed claim carrying its id. |
| E4 | Recap grouped | **GAP-FIXED** | `What we covered` and `Next steps` are separate labelled blocks. Was one undifferentiated list of up to 12 bullets. |
| E5 | Explicit next-steps block | **GAP-FIXED** | Grouped off `claim.section`, falling back to the extractor name. |
| E6 | Owner and due date on each step | **GAP-FIXED** | `Maya · Friday`, `Rahul · early next week`. Read off the claim's own `owner` and `due` fields, which the extractor wrote and the gate passed. A vague due (`none`, `unclear`, `tbd`) renders nothing. |
| E7 | Commitment firmness visible | **EXCEEDED** | `Both · weekend after signing · tentative`. Sybill has no such concept: a `#NEXT_STEPS` variable is flat text. A step nobody actually committed to (`commitment: unclear`) gets no owner chip at all, because there is nobody to name. |
| E8 | Human close and signoff | **GAP-FIXED** | An honesty close ("If I got any of it wrong, tell me and I'll fix it") then `Best, / Maya`. The draft used to end on "Every line traces to a numbered source above," which is a product sentence, not an email one. |
| E9 | Short, informal register | **MATCHED** | Chrome sentences are short and second person. The per-generation length knob is not built: see E-open-1. |
| E10 | Draft only, human sends | **MATCHED** | The panel is labelled `draft` and there is no send path in the product at all, so the anti-pattern Sybill warns about ("Sending without reviewing") is structurally unavailable. |
| E11 | No line said twice | **GAP-FIXED** | Two rules. A summary roll-up sitting in the next-steps block is dropped when the itemized steps are present (they carry owner and due; the roll-up is still on the page, just not repeated in the draft). Exact duplicate text collapses to one bullet. Call 05 went from 12 bullets to 11 and call 01 from 10 to 9, with nothing backed lost. |
| E12 | Second person, written to the buyer | **GAP-REMAINING** | The bullets read "Rep to send the agreement this afternoon," not "I'll send the agreement this afternoon." Claim text renders verbatim because verbatim is what makes it checkable, and a heuristic rewrite of a backed line is exactly the un-auditable step this product exists to remove. The fix is the LLM-polished draft, which goes through `screenDraft` against the same claims. **Owner: Aakash (issue #2 template lane) plus the D4-gated polish path.** |
| E13 | Per-outcome template routing | **GAP-REMAINING** | Deliberately not built here. **Owner: Aakash, issue #2.** Note this is a gap in Sybill too: their own docs describe manual dropdown selection only (§4), so shipping the routing `switch` is still an open win, not catch-up. |
| E14 | Style matching to the rep | **GAP-REMAINING** | Out of scope by decision, per 02-email-infra.md's own day-1-vs-roadmap split. It touches nothing about receipts. |
| E15 | Every asserting line traceable | **EXCEEDED** | Every bullet, including the new outcome lead, carries a `claim_id` that must be a `verified` or `segment_corrected` claim in the same bundle, and a test asserts every line rendered in the panel maps back to one. Sybill publishes no grounding or citation mechanism anywhere (§6) and their own blog concedes the failure mode. |
| E16 | Unbacked content visibly held out | **EXCEEDED** | The panel says how many notes stayed out, and the held-back block on the same page shows each one with the reason. No competitor surface shows the reader what was dropped. |
| E17 | Planted instructions cannot reach the draft | **EXCEEDED** | Call 06 carries a real planted injection. A `blocked_injection` claim cannot enter the composer, and any draft citing one dies whole. Covered by tests that assert the payload strings never appear in the email. |
| S1 | Outcome first, one sentence | **MATCHED** | The summary section was already first and already outcome-shaped, 25 to 53 words across the 6 samples. |
| S2 | Section order | **GAP-FIXED** | The page ran Summary, Pain, Objections, Competition, Pricing, Stakeholders, Next steps: the thing a manager most needs was last. Now Outcome, Next steps, Pain, Objections, Pricing, Competition, Stakeholders. The section label is now `Outcome`, the word the standard uses. |
| S3 | 300 to 500 word cap | **MATCHED**, now enforced | Bodies run 120 to 212 words across the 6 samples. The cap was never checked; there is now a test that fails if any sample's notes body passes 500 words. |
| S4 | Omit, never "N/A" | **MATCHED**, now asserted | The renderer already skipped empty sections. A test now asserts no rendered section is empty and no page contains an N/A placeholder. |
| S5 | Buyer's exact words for pains | **EXCEEDED** | The citation is the verbatim quote, so the receipt behind every pain line is literally what the buyer said, at the second they said it, playable. |
| S6 | Exactly one human detail | **GAP-REMAINING** | A content-layer question (what the extractors are told to pull), not a render-layer one. **Owner: the extractor content lane.** |
| S7 | Next steps with owner and due | **GAP-FIXED** for the email | The deal ledger already showed owner and due; the email did not. It does now. |
| S8 | Low-confidence renders unconfirmed | **MATCHED** | The held-back block, in plain words: "We couldn't find this in the call." |
| S9 | Every line cited | **EXCEEDED** | Numbered citation chips per note, numbering restarting per section, each opening the transcript line with the quote marked and playable. |

### Open items, with owners

| Ref | Item | Owner |
|---|---|---|
| E-open-1 | Per-generation length and tone knobs (their Short/Medium and Informal/Professional) | Aakash, issue #2 template lane |
| E-open-2 | Second-person register in the bullets (E12) | Aakash plus the D4-gated LLM polish path |
| E-open-3 | Per-outcome template routing (E13) | Aakash, issue #2 |
| E-open-4 | Style matching from the rep's sent mail (E14) | roadmap, deliberately not day 1 |
| S-open-1 | The one human detail (S6) | extractor content lane |
| S-open-2 | Sample call 06's title reads "Messy," an authoring label, and it reaches the draft as "the messy call" | content owner, `samples/bundles/06.bundle.json` |

### Where our standard beats theirs, stated plainly

1. **Every line is backed or it is not in the email.** Sybill's `<AI instruction>` tokens
   reach back into the raw transcript at generation time with no verification step in
   between (§2). Ours reach only the gate-passed claim set. Their strongest published
   accuracy claim is "Sybill captures every important detail"; ours is a `claim_id` on
   every bullet and a test that fails if one is missing.
2. **Absence is rendered, not smoothed over.** "N of M notes backed. K held back. We
   couldn't find them in the call." A tool that quietly drops what it could not verify
   looks better and tells you less.
3. **No invented filler.** A missing name renders no name. A vague due date renders no
   date. An unclear commitment renders no owner. The composer has no path to write a
   sentence that is not either a backed claim or fixed chrome that asserts nothing about
   the call.
4. **Firmness travels with the commitment** (E7), which no documented competitor surface
   carries.

---

## 3. Before and after, one full email

Call 02, `public/notes/02.html`, the demo call. Same bundle, same gate, same claims.

### Before

```
Subject  Follow-up: the demo call

Recapping what we covered and what happens next:

- Demo landed: after-hours routing, AMD, and consent-tracked texting all resonated with the buyer.
- Buyer is drawn to answering-machine detection and to consent-tracked texting for compliance.
- Front desk currently loses time to answering-machine beeps on recall campaigns; AMD would give that time back.
- Downtime is a dealbreaker: 'we cannot be down during patient hours at all, if switching means two dead days of phones the deal is off before it starts.'
- No numbers yet: buyer signals pricing is the next conversation once documents are exchanged.
- Rep committed to send the SOC 2 report and the TCPA one-pager to the office manager, both by Friday.
- Buyer to pull the RingHawk call-volume report and send it so the rep can size the deal, early next week.
- Once the documents are exchanged, both sides move to pricing.
- Rep to send SOC 2 report and TCPA one-pager by Friday; buyer to send the call-volume report early next week.

Every line traces to a numbered source above.
```

Nine bullets, one list, no greeting, no close. The outcome, the pains, the objection, the
pricing note and four commitments all sit at the same weight. The last bullet restates the
three above it. Nothing tells the reader who owes what, or by when, although the claims
carried both fields the whole time. The plain-text `body` the pipeline wrote to
`email.json` also opened with an em dash, against the house voice rule.

### After

```
Subject  Follow-up: the demo call

Hi Rahul,

Thanks for the time on the demo call. Here is what I took away, and what we said we would do next.

Demo landed: after-hours routing, AMD, and consent-tracked texting all resonated with the buyer.

What we covered:
- Buyer is drawn to answering-machine detection and to consent-tracked texting for compliance.
- Front desk currently loses time to answering-machine beeps on recall campaigns; AMD would give that time back.
- Downtime is a dealbreaker: 'we cannot be down during patient hours at all, if switching means two dead days of phones the deal is off before it starts.'
- No numbers yet: buyer signals pricing is the next conversation once documents are exchanged.

Next steps:
- Rep committed to send the SOC 2 report and the TCPA one-pager to the office manager, both by Friday. (Maya · Friday)
- Buyer to pull the RingHawk call-volume report and send it so the rep can size the deal, early next week. (Rahul · early next week)
- Once the documents are exchanged, both sides move to pricing. (Both · after documents exchanged · tentative)

Every line above came from something said on the call. If I got any of it wrong, tell me and I'll fix it.

Best,
Maya
```

Eight bullets instead of nine, and the one that went is the roll-up that repeated the three
steps under it. Every remaining line still carries the same `claim_id` it carried before,
and the outcome lead is a claim too, not a written-in sentence. The names come from the
caller-owned `owners` map in `scripts/build-notes.mjs`, which is a deal fact, never
something the renderer infers.

---

## 4. What changed in code

| File | Change |
|---|---|
| `src/email.js` | `composeEmail` returns `greeting`, `opener`, `outcome`, `recap`, `next_steps`, `assurance`, `signoff` alongside the flat `bullets` list. Grouping off `claim.section` / `claim.extractor`. Owner, due and firmness read off the claim via the exported `stepMeta`. Roll-up suppression and exact-duplicate collapse. `screenDraft` now also prunes the render groups, so a cut bullet can never survive inside one. Choke point, emailable statuses and whole-draft rejection untouched. |
| `src/notes-view.mjs` | The email panel renders the new shape (greeting, opener, lead, labelled blocks, owner chips, close, signoff) with matching CSS. Email claims are enriched with the section they rendered under plus owner, due and commitment from the raw claim. `PRIMARY` reordered to Outcome, Next steps, then the detail; the summary section is labelled `Outcome`. |
| `scripts/build-notes.mjs` | Passes the existing `OWNERS` map into the call pages so the draft can name the rep and the buyer. |
| `test/email.test.js` | 11 new tests: greeting and signoff present, no invented names, outcome lead lifted out of the recap, owner and due rendered, unclear commitment gets no owner, roll-up suppression both ways, duplicate collapse, every bullet maps to an emailable claim id, authored chrome carries no em dash or bare percentage, `screenDraft` prunes groups. |
| `test/notes-view.test.js` | 5 new tests: the rendered panel has greeting, opener, lead, both block labels and a signoff; owner and due chips render on real bundles; every line on screen in the panel maps to an emailable claim id and renders exactly once, across all 6 bundles; the notes lead on the outcome then next steps; the body stays inside the 500-word cap and renders no N/A. |
