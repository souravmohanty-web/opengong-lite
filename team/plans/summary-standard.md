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

## Implementation routing

- **Deployment (Saritha):** LLM prompt rules + render grouping. Appended to issue #14's
  repo as a comment; independent of the content-layer fixes but sequenced after them
  (finesse on top of template junk is lipstick).
- **Our repo:** summary extractor prompt gains overview+chapters shape; notes-view
  renders overview → chapters → owner-grouped actions; tracker chips move up. Pre-demo
  caution: regenerating sample bundles touches demo surfaces — the demo owner decides
  whether this lands before or after Friday.
