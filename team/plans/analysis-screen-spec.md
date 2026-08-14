# Call-analysis screen: content + output + design spec

Directional inputs for the deployment (Saritha's app), from Sourav's review of a real
call analysis. Method follows ui-ux-pro-max (analyze → design system → domain rules →
stack), but the order of work is the one that matters: **fix the model, then the
harness's output contract, then put design on top.** Design cannot rescue bad content.

## 0. Diagnosis of the reviewed screen (three layers failing at once)

1. **Model/extraction layer:** notes render our internal CATEGORY LABELS as if they were
   findings — "A need or evaluation driver came up on the call.", "Pricing, seats, or
   renewal came up on the call." Those are template phrases from the deterministic
   fallback extractor, not statements about this call. Worse, unmatched templates render
   as struck-through "not found" items: the page theatrically demotes text no AI ever
   claimed — self-inflicted noise.
2. **Harness/output layer:** the `__unsupported__` evidence sentinel (internal, from the
   gate-hardening graft) leaks raw into the UI, styled as if it were a quote:
   `___unsupported___: "(no supporting line found in this call)"`. Internal IDs (`L4`)
   render as source refs. The same three-line explainer paragraph repeats verbatim under
   every unbacked item.
3. **Design layer:** banner-sized state chips above every note, strikethrough walls,
   low-contrast olive links on near-black, a serif display heading for a utility screen,
   and no hierarchy between the note (the content) and its machinery (the state).

## 0.5 What the full live run proves (real JustCall call, Railway deployment)

The complete page (12-min real mono call) shows the deeper failure. The LLM extraction
produced the RIGHT content — "The customer, Brianne, is looking for a solution to track
phone calls, record options, and send texts for their sales team" is a correct summary,
visible only in the "What the checker did" debug log — but the gate demoted it because
its quote wasn't verbatim-recoverable from messy real ASR. After three failed repair
tries (the model returned the literal placeholder "(no supporting line found in this
call)" instead of copying a line), the system fell back to the keyword extractor, whose
template notes ship because their quotes trivially exist. Net effect:

> **The pipeline currently punishes good content with imperfect citations and rewards
> empty content with perfect citations.** The email proves it: every bullet is a
> template phrase, "backed by a line in the call," and unsendable.

Also visible: "Speaker 3" labels on a mono call (spurious diarization) leak into
sources; internal addressing (`Try #1 · uncorroborated @ summary[0]`, `__unsupported__`,
`L4`) renders in product UI; the run's failure reason ("not enough backing to ship")
displays as a raw engineering string; and the page title itself carries engineering
state ("keyword extractor: limited, deterministic"). One good pattern worth keeping:
"Pricing — Nothing on this in the call." is exactly right.

**Priority fixes this ordering implies (before any design work):**
1. **Quote-fidelity repair, not give-up.** The repair prompt must demand a verbatim
   line copy ("copy one sentence character-for-character from the transcript; never
   write a placeholder; if you cannot quote it, drop that note and keep the others").
   Three tries returning placeholders means the current repair message isn't telling
   the model what to DO.
2. **Invert the fallback preference.** A correct-reading, demoted LLM note shown as
   "couldn't verify the quote" is worth MORE to the user than a shipped template line.
   When the LLM pass fails wholesale, show its notes demoted-but-prominent and the
   keyword hits as a small "topics detected" strip — never as headline notes.
3. **Partial credit per note.** "Not enough backing to ship" is a run-level verdict
   killing note-level value. Ship the page with every note in its true state; reserve
   the run-level banner for the EMAIL only (which rightly stays unshipped).
4. **Mono speaker hygiene:** on mono audio, suppress speaker labels entirely rather
   than render Sortformer's spurious "Speaker 3".

## 1. Model layer — what a note is allowed to say

- **A note must be a statement about THIS call, in call-specific words.** Template
  category text is banned as note text. Test: cover the quote — does the note still tell
  you something you didn't know? "Pricing came up" fails. "Quoted twenty eight per seat;
  buyer countered with RingHawk's twenty two" passes.
- **Deterministic/keyless extraction emits ONLY matched patterns.** An unmatched pattern
  emits NOTHING — not a demoted template claim. (Reference impl: this repo's
  `extractors/*.json` v2 prompts — every enum value requires an observable cue in a cited
  quote; "unclear" over drama; empty list is a valid result.)
- **Absence is one honest line, not a graveyard.** If pricing never came up, the section
  says at most `Pricing didn't come up on this call.` once, unstruck, quiet — or says
  nothing. Struck-through fake findings about absence are worse than silence.
- **LLM prompt rule to add:** "Write each note as a specific statement about this call.
  Never emit a category description ('X came up') as a note. If you cannot quote a line
  for it, do not write it."

## 2. Harness/output contract — what the renderer is allowed to receive

- **Sentinels never render.** `__unsupported__`, empty quotes, placeholder "(no
  supporting line found)" strings are gate-internal. Display contract: a claim with no
  real evidence renders as state "not found in the call" with NO source row at all —
  absence of a citation IS the information. One display-layer mapping function, tested.
- **Human refs only.** `L4` → a timestamp (`0:41`) and, on click, the line itself.
  Utterance ids never reach the DOM as text.
- **Explainers render once, per group, not per item.** One short line under the group
  header: "These lines couldn't be matched to anything said on the call. They stay
  visible and never enter the follow-up email." Items below it carry only their text.
- **Never a bare percentage; always the fraction** ("11 of 12 backed").
- **Dedupe before render.** Two notes with the same normalized text collapse to one.

## 3. Screen design (ui-ux-pro-max process, applied)

**Step 1 — requirements:** B2B sales-call review tool; users are reps/managers scanning
between calls; the product's one promise is *trust*; stack: Next.js + Tailwind (deploy),
static HTML/CSS (this repo). Style keywords: calm, evidentiary, dense-but-scannable.

**Step 2 — design system direction:**
- Type: one sans family (system stack fine). Base 16px, line-height 1.5. Section headers
  are labels, not display type — 13–14px caps-spaced, muted. The NOTE text is the
  largest thing in a card (17–18px). Kill the serif "1 · Summary" display headings.
- Semantic tokens, both themes, 4.5:1 minimum on every text/bg pair (the olive-on-black
  quote links fail this today — lift to a tested green/amber pair).
  `--note-backed`, `--note-notfound`, `--note-blocked`, `--ink`, `--ink-muted`,
  `--surface`, `--surface-raised`.
- Density dial: default compact. A call has 10–25 notes; the screen's job is scanning.

**Step 3 — the note card, anatomy (progressive disclosure):**
```
[note text — the sentence about the call]  [¹]     ← citation chip, superscript
   └ collapsed by default. Expanding shows: quote, speaker, timestamp, play button.
state affordances:
   backed        → no chip needed beyond the citation number (backed is the DEFAULT,
                   don't announce it — announce only exceptions)
   corrected     → small neutral tag "citation corrected" on the expanded row
   not found     → muted text + thin left border, small tag, NO strikethrough,
                   grouped under "Couldn't verify (2)" at the section's end
   blocked       → the ONLY state that keeps strikethrough + red, because it is the
                   only state where the text itself is dangerous
```
Rules applied: progressive disclosure (8), error-near-field once per group (8), min
44×44 tap targets on chips/play (2), SVG icons not emoji (4), reserve space when
expanding (3), keyboard focus + aria-expanded on the disclosure (1).

**Step 4 — layout:** one column, max-width ~720px for the notes; sticky slim header with
the deal/call name and the fraction ("11 of 12 backed"); sections ordered by reader
value: Outcome → Next steps → Key facts → Couldn't verify → Blocked. Empty sections
don't render.

## 3.5 Debug goes in a drawer, never on the page

"What the checker did," try counts, repair logs, run status strings, and extractor-mode
labels are OPERATOR information. Put them behind one collapsed "Run details" disclosure
at the page's end (or an admin-only view). The page title is the call's title, never the
pipeline's state. A stranger reading the page should not be able to tell which extractor
ran — only what was found and what couldn't be.

## 4. Acceptance checklist (testable, per surface)

- [ ] No note text matches a template/category phrase list (test with regexes on output).
- [ ] `__unsupported__` and empty-quote strings appear nowhere in rendered HTML (test).
- [ ] Unmatched deterministic patterns produce zero DOM nodes (test).
- [ ] Explainer text appears at most once per section (test).
- [ ] Every state color pair ≥ 4.5:1 in both themes (automated check).
- [ ] "Backed" items carry no state banner — only exceptions are announced (review).
- [ ] Internal ids (L\d+, u\d+) appear nowhere in rendered text (test).
- [ ] A quiet call renders short honest sections, not struck-through noise (fixture).
