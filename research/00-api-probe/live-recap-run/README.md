# Live 100%-PyAI run: Hear + Recap on call-03 (2026-08-14, Sourav's live key)

The full one-key chain, proven live, artifacts verbatim in this folder.

## What ran
1. `POST /v1/transcription/jobs` with samples/audio/call-03.wav (`channel=true`).
   Submit 1.2s. Completed with speakers: 2 (channel diarization), 86.32s audio,
   12 segments, 296 words. NOTE: the .m4a of the same call was REJECTED
   ("unreadable or unsupported audio") so the demo uploads WAV.
2. `PUT /v1/recap/config {enabled:true}` flipped Recap on for the org
   (scopes recap:configure/recap:read were already on the key; the old
   "Recap not enabled on this org" finding is stale, it just needed the toggle).
3. `POST /v1/recap/calls/{job_id}` pack sales_outbound with the Hear utterances.
   Accepted in 1s, status complete in ~110s.

## What Recap returned (recap-live-result.json)
Real deal intelligence: tldr, moments with offsets, objections WITH verbatim
transcript quotes, action items, risk signals, talk ratio, coverage gaps,
and `crm_write_status: skipped:no_config` (Recap has CRM write hooks).

AND a real fabrication: the headline says the buyer is switching "for
$15 per seat". The call says twenty eight per month, RingHawk countered
twenty two, the buyer asked fifteen OFF. Recap fused the discount ask
into a price that was never spoken.

## What the gate did with it (the demo beat)
Recap output mapped through the entry's harness (mapRecapToDealNotes ->
validateDealNotes, branch gate-hardening @ 9cc86c7):
- the $15 headline claim: uncorroborated, demoted (summary AND intent)
- paraphrased summaries: demoted
- the two verbatim-quote objections: verified
- follow-up email: composed from the two verified claims only; the
  fabrication never reached it. (The greeting used to embed the headline
  verbatim; fixed in 9cc86c7 with a neutral email title.)

## Latency (live path, honest numbers)
- Hear submit: 1.2s. Hear job complete: under 2 min for 86s of audio.
- Recap accept: 1s. Recap complete: ~110s.
- Whole live chain for a 1.5-min call: roughly 3-4 minutes end to end.
  Encore staging: start the upload at the top of Q&A, results land before it ends.

Stage line this proves: "Everything you just watched ran on PyAI alone,
one key. And when PyAI's own summarizer invented a price, our gate caught
it, demoted it, and kept it out of the email. Live, not curated."
