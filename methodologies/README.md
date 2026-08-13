# Methodology coach

Score a call against the sales methodology the team actually follows, and turn
every unmet trait into coaching a rep can use: what was missing on this call,
why it matters, the next-call move, and a line they could say.

An admin picks the methodology once (`_settings.json`, or
`npm run coach -- set meddpicc`). Every scored call then gets a verdict per
trait — met / partial / missed / not applicable — with verbatim evidence quotes
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
(`--offline-prepare` / `--offline-complete`) — the same agent-as-LLM harness
pattern as `scripts/extract-offline.mjs` — so a cloner is never dead-ended.

Transcript input: `Name (Role): text`, one utterance per line, or
`{segments:[{speaker, text}]}` JSON.

## Packs

One JSON file per methodology, validated at load — adding a methodology is one
file, zero code (the extractor pattern). Built-ins: MEDDIC, MEDDPICC, BANT,
SPIN, Sandler, Challenger, GAP Selling, SNAP, Solution Selling (PPVVC), SPICED,
Command of the Message, N.E.A.T., CHAMP, ValueSelling. Component lists follow
the methodology owners' current materials; disputed namings resolved to the
owner-canonical form (MEDDPICC's I is Implicate the Pain; SPICED's Critical
Event is one component; SPIN penalizes situation-question overload). Miller
Heiman Strategic Selling and Conceptual Selling are deliberately absent: they
score a deal's call series and meeting plans, not a single call.

Custom methodologies ("we don't follow a textbook method"):

```bash
npm run coach -- compile our-method.txt --save
npm run coach -- set <new-pack-id>
```

The compiler keeps the team's own terminology, validates against the pack
schema, and writes to `methodologies-custom/` (custom wins on id collision).

## Known limitations (on purpose)

- Scoring quality is downstream of the LLM verdict; the gate proves quotes were
  said, not that a verdict's interpretation is right — same "right quote, wrong
  claim" boundary as the main gate.
- Deal-level methodologies need cross-call state this module doesn't have yet.
- CRM write-back of `ai_methodology_score` / per-trait fields is declared
  nowhere and wired nowhere — roadmap, matching the repo's CRM posture.
- Not yet wired into the bundle/viewer; the scorecard is a CLI artifact until a
  bundle field and viewer tab land.
