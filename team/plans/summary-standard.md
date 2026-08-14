# Summary finesse standard (benchmark: Fireflies, per Sourav's review)

The bar is a real Fireflies export of a real SaaS Labs call. What reads as "finesse"
there is five mechanical properties, all implementable, none in conflict with receipts.
Target = their readability × our verification: every sentence below still carries a
citation; the difference is what the sentences SAY.

## The five properties

1. **An Overview paragraph, in prose.** 80–140 words, one flowing paragraph, no bullets.
   It tells the meeting's arc: what kind of call, who was on it, what was explored or
   shown, what concerns surfaced, how it ended. Fireflies: "Ananya showcased the
   customized Paperflite instance… while addressing concerns about onboarding and
   integration with existing tools like Talent LMS and Salesforce." Every sentence is
   still a claim with evidence; prose is a rendering choice, not a verification loss.

2. **Topic chapters with time spans.** Notes are grouped chronologically:
   "Needs Assessment and Platform Overview (07:50–19:19)", 3–6 bullets each. We have
   every timestamp already — chapters are a segmentation the summary extractor emits
   (`{title, t_start, t_end, bullets[]}`), not new data.

3. **Named actors and stolen details.** The difference between "A trust concern was
   raised" and "Kunal — an 'avid Highspot user for 7 years' — wants to know if
   Paperflite can match it" is the person and the detail. Rules: attribute by name when
   the transcript establishes the name, by role otherwise, never invented; every bullet
   carries at least one concrete detail (a number, a duration, a tool name, a quoted
   phrase); verb-led, 8–18 words.

4. **Action items grouped by OWNER, not listed flat.** Fireflies groups next steps under
   each person's name with a timestamp link per item. Our `next_steps` claims already
   carry `owner` and `due` — this is a render change plus name resolution, zero new
   extraction.

5. **Topic chips at the top.** Their keyword tags = our tracker hits, promoted from the
   bottom "Also mentioned" strip to compact chips under the title.

## Worked example — our sample call 3, current vs target

Current (machine register):
> Pricing on the table: twenty eight per month all-in; RingHawk countered twenty two;
> buyer asked for fifteen off.

Target (finesse register, same claims, same citations):
> **Overview.** Pricing call between Maya (CallForge) and Rahul (Brightsmile). Maya
> quoted twenty-eight per seat all-in for the five locations; Rahul pushed back with
> RingHawk's renewal counter at twenty-two and asked for fifteen percent off, framing it
> as what he needs to defend the switch to Dr. Mehta, who signs. The porting-time fear
> from their old vendor resurfaced; Maya committed to bringing real timelines and a
> sharper number. Decision clock: RingHawk auto-renews end of November.
>
> **Pricing and the counter (0:00–0:52)**
> - Maya quoted twenty-eight per seat, all five locations, routing and texting included
> - Rahul: RingHawk "came back the moment they smelled a switch" at twenty-two
> - Rahul asked for fifteen percent — "so the conversation is about service, not price"
>
> **Action items**
> **Maya** — bring porting-proof timelines from practices Brightsmile's size (1:11) ·
> come back with a sharper number (0:43)
> **Rahul** — take the revised number to Dr. Mehta (1:20)

## Prompt rules to add (summary extractor / deployment LLM)

- Write the Overview as one paragraph a colleague would read aloud; name the people
  when the transcript names them; tell the arc, not a topic list.
- Every bullet must contain a name-or-role plus one concrete detail (number, duration,
  tool, or short quoted phrase copied verbatim).
- Banned register: category sentences ("X came up", "X was discussed/mentioned/raised"),
  passive constructions when the speaker is known, bullets under 6 words.
- Chapters follow the call's order and carry start–end times from the cited utterances.
- Action items emit owner + action + spoken due phrase; the renderer groups by owner.

## Addendum: the Fathom benchmark (second example from Sourav — the CRISP bar)

Fireflies is the completeness bar; Fathom is the crispness bar. Sourav's real Fathom
export (Hobbes × JustCall eval) adds four properties, and its full structure is the
canonical output template:

1. **Meeting Purpose: ONE sentence.** "Evaluate Hobbes as a replacement for JustCall's
   current product tour tool." Complete orientation in a line. Always first.
2. **Key Takeaways are reasoned theses, not observations.** Each of its 4 bullets is
   claim + BECAUSE + a specific: "Hobbes's pricing model is a key concern. Billing per
   'active conversation' is risky, as it could be cost-prohibitive if applied to their
   high volume of unqualified leads (~1,500/mo)." Rule: a takeaway must carry a reason
   and a number/specific, and survive the "so what?" test. 3–5 max, bold lead phrase.
3. **Topic sections get CALL-SPECIFIC titles** ("Novatic's Limitations", never
   "Objections") **with labeled facts and paired sub-bullets**: a bold label lead
   ("HubSpot Integration Failure:") and nested consequence/response pairs — a concern
   immediately followed by the other side's answer ("Hobbes's Response: synthetic-data
   feature planned for early July"). Dialogue-aware structure, not a flat list.
4. **Action items carry deep links** ("WATCH (5 secs): …?timestamp=2053"). Ours are
   strictly better when rendered right: the citation chip that plays the second AND
   shows the line. Owner-first phrasing, compound actions allowed ("Discuss pricing w/
   Deepan; email Chirag re: next steps").

### Canonical template (target output shape, top to bottom)

```
[Call title] · [date]
Meeting Purpose        ← one sentence
Key Takeaways          ← 3–5 reasoned theses (claim + because + specific)
Topics                 ← call-specific section titles; bold labeled facts;
                         concern → response pairs as nested bullets
Next Steps             ← grouped by person, plain phrasing
Action Items           ← owner + compound action + citation (click plays the second)
```

Crispness rules (the "really good, crisp, specific" bar): no sentence without a
payload (name, number, tool, date, or verbatim phrase); no observation without its
consequence; generic section titles banned; if a takeaway could describe any sales
call, it fails.

## The beat-them layer (Sourav: "we'd need to be better than them")

Matching Fireflies' completeness and Fathom's crispness is TABLE STAKES — that's what
the template above buys. Better comes from six things their architecture cannot follow.
Every one is already built; the work is making the summary SURFACE them.

1. **A summary with an error model.** Fathom's "~1,500 unqualified leads/mo" takeaway
   must be trusted; if their AI invents a number, nothing on the page knows. Our page
   opens with its own score ("20 of 21 backed · 1 held back") and shows its misses. We
   are the only notetaker that can be wrong OUT LOUD — and we caught our own summarizer
   inventing "$15 per seat" on record. Line: *"Every notetaker summarizes. Ours is the
   only one that tells you when it's wrong."*
2. **Promises tracked ACROSS calls.** Fireflies/Fathom are per-meeting; action items die
   at the end of each call page. The commitment ledger carries them: SOC2 promised call
   2, delivery checked call 4, cited at both ends. Nobody else even attempts deal-level
   promise tracking. Line: *"They record meetings. We keep score of promises."*
3. **A follow-up email you don't have to fact-check.** Their drafts can contain anything
   the model wrote; you proofread or you risk it. Ours structurally cannot contain an
   unverified line (choke point, whole-draft rejection).
4. **Absence as a finding.** "No next step was agreed on this call" is a manager's
   highest-value alert; a tool optimizing for impressive-looking notes will never lead
   with it. We already do.
5. **Coaching on YOUR methodology.** Fathom ships fixed frameworks; our packs compile a
   team's own written method into scored, evidence-cited verdicts (14 packs + compiler).
6. **Your calls stay your files.** Both competitors hold your customer recordings in
   their cloud. Ours: files on disk, MIT, one self-contained HTML per share.

**Where they beat us today (say it plainly, fix or roadmap it):** live meeting capture
(bots), video, ask-anything chat over the call, integration breadth, and — until the
launch-week extractor upgrade lands — prose finesse. The order of work stands: match
their register first (this standard), then lead with the six beats. A crisp summary
that can prove itself beats a crisp summary, full stop.

**Q&A ammunition (demo script):** "How is this different from Fireflies or Fathom?" →
"Two ways you can check live: our summary shows you its own misses — theirs can't be
wrong on their own page — and our workspace tracks whether the promise made on call two
actually happened on call four. Also, it's open source and your recordings never leave
your machine."

## Implementation routing

- **Deployment (Saritha):** LLM prompt rules + render grouping. Appended to issue #14's
  repo as a comment; independent of the content-layer fixes but sequenced after them
  (finesse on top of template junk is lipstick).
- **Our repo:** summary extractor prompt gains overview+chapters shape; notes-view
  renders overview → chapters → owner-grouped actions; tracker chips move up. Pre-demo
  caution: regenerating sample bundles touches demo surfaces — the demo owner decides
  whether this lands before or after Friday.
