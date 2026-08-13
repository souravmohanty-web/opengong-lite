# opengong-lite — Product Spec (from PM input, 2026-08-13)

## Thesis
Transcription and note-taking are commoditized (free notetakers; open-source ASR; Meetily/Vexa).
The defensible layer — and the one the market validated with ~$80M of funding into Attention/Sybill/Momentum —
is **conversation-triggered actions grounded in CRM context**. opengong-lite = the open-source,
HubSpot-native action layer on top of any transcript source.

Positioning line: *Gong records what happened. We do what was promised.*

## Core loop
```
Transcript in (Vexa bot / file upload / notetaker webhook)
  → Extraction pass (commitments, entities, deal signals) — LLM structured output
  → Context assembler (HubSpot: contact, company, deal, full activity timeline,
    page-view/intent data, past emails, similar deals)
  → Action generator (email drafts, stage suggestions, momentum score, playbooks)
  → Rep approval inbox (one-click send / accept)
  → Write-back to HubSpot (properties, timeline events, engagements)
```
Human-in-the-loop by default: the system drafts, the rep sends. Auto-mode is a toggle later.

## Flow 1 — Commitment detection → context-rich follow-up email (THE DEMO)
Trigger: rep says on the call "I'll send over a summary / pricing / the deck."
1. Extract the commitment from the transcript (who promised what, to whom, by when).
2. Pull HubSpot context for that contact/company: activity timeline, page views (intent),
   prior emails, deal stage, open tickets/notes.
3. Generate the email with full context — references what the prospect looked at,
   what was discussed, what was promised. Rep reviews and hits send.
4. Write back: log the email as a HubSpot engagement; stamp a custom deal/contact property
   (e.g. `ai_last_followup`, `ai_commitment_status = fulfilled`).

## Flow 2 — Stalled-deal revival
Trigger: deal hasn't moved stage / had activity in N days (time-based cron over HubSpot deals).
1. Pull all activities + the last call transcript for the deal.
2. Generate a tailored re-engagement message + a recommended next step.
3. Suggest a stage move (rep approves; write to deal stage + note explaining why).

## Flow 3 — Deal momentum prediction
Per call: score whether the conversation advanced or stalled the deal.
Signals: concrete next step agreed? new stakeholders introduced? pricing/timeline discussed?
objections raised and resolved vs. left open? champion language?
Output: `ai_momentum_score` (+ direction: advancing / stalling / at-risk) written to a custom
deal property, trended across calls. This is one LLM scoring pass — cheap, high demo value.

## Flow 4 — Similar-deal playbooks (stretch)
From the transcript, extract industry + requirements. Search HubSpot closed-won/closed-lost
deals with similar company attributes. Synthesize: "deals like this closed when X happened
by call 2; they died when Y" → tailored path-to-close for this deal.

## HubSpot objects touched
- Read: contacts, companies, deals, engagements (emails/calls/meetings/notes),
  web-activity/page views (needs tracking code on site), pipelines/stages.
- Write: custom properties (`ai_momentum_score`, `ai_next_action`, `ai_last_followup`,
  `ai_commitment_status`), email engagements, notes, deal stage (approval-gated).

## Hackathon scoping
- **Must-have:** Flow 1 end-to-end with a real HubSpot portal + a sample transcript. This is the wow.
- **Should-have:** Flow 3 (one extra LLM pass + one custom property + a trend sparkline).
- **Nice:** Flow 2 with a "simulate 14 days idle" button instead of a real cron.
- **Stretch:** Flow 4.
- Ingestion: don't build a recorder. Use pasted/uploaded transcripts for the demo;
  wire Vexa (Apache 2.0 meeting-bot API) later for live capture.

## Differentiation vs. the field (from gong-competitor-research.md)
- vs. Gong: acts instead of records; free/self-hosted; your data is bulk-exportable.
- vs. free notetakers (Fathom/tl;dv): they stop at the summary; no CRM-grounded action.
- vs. Attention/Sybill: same wedge, but open-source + self-hosted + HubSpot-native — no
  $30K contract, no data lock-in.
- vs. Meetily/Vexa: they're ingestion; we're the action layer on top (and can consume them).
