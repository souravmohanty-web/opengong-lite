# Methodology coach

Score a call against the sales methodology the team actually follows, and turn
every unmet trait into coaching a rep can use: what was missing on this call,
why it matters, the next-call move, and a line they could say.

An admin picks the methodology once (`_settings.json`, or
`npm run coach -- set meddpicc`). Every scored call then gets a verdict per
trait (met, partial, missed, or not applicable) with verbatim evidence quotes
that the code verifies against the transcript, the same receipts discipline as
the extraction gate: exact match, else normalized containment (no digit
folding), else unique whole-transcript rescue relabeled `segment_corrected`,
else visibly demoted. A met verdict whose evidence all failed the gate is
flagged unverified and score-capped at partial. Verdicts under 0.6 confidence
render as "check this" for human review.

## Try it (no keys)

```bash
npm run coach:demo                 # cached verdict, spends nothing
npm run coach -- list              # 14 built-in packs
npm run coach -- show meddpicc     # traits + classifying questions
```

With `ANTHROPIC_API_KEY` set, `npm run coach -- score your-call.txt` scores
live (model: capabilities.json role `extraction`). Without a key and without a
cached verdict, the CLI routes to the offline two-step
(`--offline-prepare` / `--offline-complete`), the same agent-as-LLM pattern
`scripts/extract-offline.mjs` uses, so a cloner is never dead-ended.

Transcript input: `Name (Role): text`, one utterance per line, or
`{segments:[{speaker, text}]}` JSON.

## Packs

One JSON file per methodology, validated at load. Adding a methodology is one
file and zero code, the same pattern as extractors. Built-ins: MEDDIC, MEDDPICC, BANT,
SPIN, Sandler, Challenger, GAP Selling, SNAP, Solution Selling (PPVVC), SPICED,
Command of the Message, N.E.A.T., CHAMP, ValueSelling. Component lists follow
the methodology owners' current materials; disputed namings resolved to the
owner-canonical form (MEDDPICC's I is Implicate the Pain; SPICED's Critical
Event is one component; SPIN penalizes situation-question overload). Miller
Heiman Strategic Selling and Conceptual Selling are deliberately absent: they
score a deal's whole call series and its meeting plans, which is more
state than a single call carries.

Custom methodologies ("we don't follow a textbook method"):

```bash
npm run coach -- compile our-method.txt --save
npm run coach -- set <new-pack-id>
```

The compiler keeps the team's own terminology, validates against the pack
schema, and writes to `methodologies-custom/` (custom wins on id collision).

## Known limitations (on purpose)

- Scoring quality is downstream of the LLM verdict. The gate proves the quotes
  were said. Whether the verdict read them right is the same "right quote, wrong
  claim" boundary the main gate has.
- Deal-level methodologies need cross-call state this module doesn't have yet.
- CRM write-back of `ai_methodology_score` / per-trait fields is declared
  nowhere and wired nowhere. Roadmap, matching the repo's CRM posture.
- Not yet wired into the bundle/viewer; the scorecard is a CLI artifact until a
  bundle field and viewer tab land.
