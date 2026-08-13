# Lane 12: Recall.ai as a reference — meeting-bot infra & API design

**Goal:** study Recall.ai (the meeting-recording-infrastructure leader — unified bot API
across Zoom/Meet/Teams, recordings, transcripts, real-time streams) as a REFERENCE for
OpenGong Lite's roadmap (live capture, CRM ingest) and for the honest build-vs-buy story
in our README. Not a competitor teardown — a pattern/infra-lesson source. All claims below
are cited to a fetched URL; none are from memory.

**Where this lands:** roadmap framing ("Live capture" bullet in README already names
"a Vexa-style `meeting.completed` webhook payload" as the ingest shape — this doc is the
evidence for that claim and its Recall.ai alternative), `DECISION-BRIEF.md` if promoted to
an L-decision, and README "why we don't build a recorder" framing if useful.

---

## 1. What Recall.ai is + the build-vs-buy thesis

**What they sell:** a unified API that sends a bot into Zoom, Google Meet, Microsoft
Teams, Webex, Slack Huddles, GoTo Meeting and more; returns recordings (video/audio),
transcripts, and metadata, either in real time or after the call. "With just a few lines
of code... integrate into more video conferencing platforms than any other API... configure
transcription, recording formats, and platform settings with a single change, and scale
across providers without rewriting code."
Source: https://www.recall.ai/product/meeting-bot-api

**The pitch to a team like ours:** "Using a meeting bot as a service lets you skip the
complex work of building and maintaining multi-platform integrations, infrastructure, and
transcription pipelines, allowing you to focus on your product while the service handles
the heavy lifting of joining, recording, and processing meetings reliably."
Source: https://www.recall.ai/product/meeting-bot-api
→ **How OGL uses this:** cite honestly in README/roadmap as the reason "Live capture" is
scoped as an *ingestion adapter* onto an existing bot vendor, not a from-scratch bot we
build. Matches the README's existing "you'll hate this if... a meeting bot that joins your
calls (we work on recordings you already have)" boundary — this is the evidence trail for
why that boundary is deliberate, not a gap.

**The Sybill case study — the real build-vs-buy numbers we can cite.** Sybill (AI sales
assistant) supported only Zoom; prospects on Teams/Meet couldn't buy. Co-founder Soumyarka
Mondal: "if they were going to solve this problem, they'd need to do one of two things:
Hire two full-time employees to spend the next 6-12 months creating internal integrations
[for Google Meet and Microsoft Teams]." They bought Recall.ai instead. Result: "tripled
their audience overnight," "$50,000 in MRR from its new, broader audience" within a month,
engineering redirected back to core AI work instead of platform plumbing.
Source: https://www.recall.ai/customers/sybill
→ **How OGL uses this:** the single strongest, most concrete "why buy not build" citation
we have — real founder quote, real numbers, real timeframe. Use verbatim-cited (not
paraphrased) if it goes in README/roadmap copy, per this session's sourcing discipline.

**Recall's own framing of platform difficulty (thinner than expected):** their own
"how to build a meeting bot" post asserts, without elaboration: "Building a meeting bot
from scratch usually means juggling SDKs, app reviews, raw media handling, and storage for
each meeting platform (Zoom, Google Meet, Microsoft Teams, etc.)." No numbers in that post
— the real numbers came from a third party (§3).
Source: https://www.recall.ai/blog/how-to-build-a-meeting-bot

---

## 2. API/webhook/recording design patterns worth borrowing

### 2.1 Bot as the top-level object, async job lifecycle via status-change webhooks

`POST /api/v1/bot/` creates a Bot. Minimal required field is `meeting_url`; everything
else (recording config, transcript provider, real-time endpoints, retention, webhook
targets, per-platform quirks) hangs off it as nested config on the same object — not
separate resources you wire together. Response shape:

```json
{
  "id": "uuid",
  "meeting_url": "string",
  "bot_name": "string",
  "join_at": "ISO-8601 datetime or null",
  "status_changes": [
    { "code": "string", "message": "string", "created_at": "ISO-8601 datetime", "sub_code": "string" }
  ],
  "recordings": [],
  "recording_config": { ... },
  "calendar_meetings": [],
  "metadata": { ... }
}
```
Source: https://docs.recall.ai/reference/bot_create

**The status lifecycle** (bot.joining_call → bot.in_waiting_room →
bot.in_call_not_recording → bot.recording_permission_allowed/denied →
bot.in_call_recording → bot.call_ended → bot.done, with bot.fatal as the terminal error
state, plus breakout-room sub-states) is the create-bot → in-call → done → artifacts
lifecycle in full: "Recall uses bot status changes to capture the lifecycle of a bot...
exposed through webhooks... Bot Status Changes... provide insight into the errors when a
bot fails to record or is unable to join a call." Explicit guidance: "Listen for bot status
webhooks rather than polling the API for status updates."
Source: https://docs.recall.ai/docs/bot-status-change-events,
https://docs.recall.ai/reference/bot_create
→ **How OGL uses this:** direct pattern match for our own future job model if/when
transcription moves off sync PyAI onto the async jobs API (already flagged as A1 in
`research/02-data-model.md` — "the whole pipeline moves to submit→poll/webhook"). Recall's
status-change list is a good template for our own job states (submitted → transcribing →
extracting → gated → done/error) if we formalize one; the "listen, don't poll" guidance
reinforces the webhook-first design already sketched for CRM/live-capture ingestion.

### 2.2 Webhook signing — Svix-based, HMAC-SHA256, verify-then-parse

Recall signs webhooks/websockets with a Svix-compatible scheme: headers `Webhook-Id`,
`Webhook-Timestamp`, `Webhook-Signature` (values like `v1,rAvfW3dJ...`); secret prefixed
`whsec_`. Verification: signed message = `{webhook-id}.{webhook-timestamp}.{raw-payload}`,
HMAC-SHA256 with the base64-decoded secret, base64-encode the result, timing-safe compare
against the `v1` value in the signature header (which may carry multiple versioned sigs
during rotation). Payload must be the **raw body string**, not parsed JSON — a common
webhook bug (parse-then-verify breaks on any whitespace/key-order difference). If Recall
doesn't get a 2xx, it retries "for the next 24 hours, with an increasing delay between
attempts," 15-second timeout per attempt.
Sources: https://docs.recall.ai/docs/authenticating-requests-from-recallai,
https://docs.recall.ai/docs/status-change-webhooks-setup-verification
→ **How OGL uses this:** directly comparable to the PyAI webhook fact already recorded in
`research/02-data-model.md` A8 (`X-PyAI-Signature`, HMAC-SHA256 over `"<t>.<rawBody>"`,
unconfirmed against a live delivery, and the doc already recommends polling instead for the
33h build). Recall's scheme is the same shape (id.timestamp.rawbody, HMAC-SHA256, raw body
required, timing-safe compare) — useful as a second confirmed reference implementation if
OGL ever verifies a live PyAI webhook delivery or builds outbound webhooks of its own (e.g.
notifying a CRM when a note is gated-verified). Cite-in-README candidate for "webhook
signing done right" if we ship any webhook surface.

### 2.3 Real-time: partial vs. finalized events, same shape needed for polish

Real-time transcription is exposed as two event types over the configured
`realtime_endpoints` (websocket/webhook/RTMP/desktop-SDK): `transcript.data` (finalized
utterance) and `transcript.partial_data` (in-progress). Documented UX pattern: "display
partial results in your UI, and then replace them with the finalized version once
received." Two provider knobs for streaming: `prioritize_accuracy` vs
`prioritize_low_latency`.
Source: https://docs.recall.ai/docs/bot-real-time-transcription (partial/final pattern),
https://docs.recall.ai/reference/bot_create (recording_config.transcript.provider modes)
→ **How OGL uses this:** roadmap note for "Live capture" — if OGL ever renders anything
before a call is fully processed (a live-in-progress note view), the partial-then-final
replace pattern is the right UX model to borrow, and it composes cleanly with our existing
receipts gate: partials render un-gated/provisional, finals go through the same gate as
today's batch path. Not needed for the current batch-only scope.

### 2.4 Recording/transcript artifact shape — separate resource, signed download URL, not inline blob

`TranscriptArtifact` (returned by `GET /api/v1/transcript/{id}/`) is its own resource:
`id`, `recording` (minimal ref), `status` (code/sub_code/updated_at — same status-object
shape as bot status changes), `metadata`, `diarization`, `provider`, and a `data` object
whose real payload is fetched via `download_url` (transcript JSON) and
`provider_data_download_url` (raw provider output) rather than embedded inline.
Source: https://docs.recall.ai/reference/transcript_retrieve

The downloaded transcript JSON itself carries word-level detail: each word has `text`,
`start_timestamp`, `end_timestamp`, `language`, `confidence`; each transcript part carries
`speaker` (name), `speaker_id` (numeric), `language`, `participant` metadata.
Source: WebSearch-aggregated from https://docs.recall.ai/docs/recallai-transcription and
https://docs.recall.ai/docs/bot-real-time-transcription (word/speaker field names
confirmed across both async and real-time docs pages; not independently re-fetched as raw
JSON — treat field *names* as confirmed, exact nesting as approximate).
→ **How OGL uses this:** validates our own `words[]` + speaker + timestamp design already
built into `research/02-data-model.md` (§1, the Whisper/WhisperX word-shape comparison) —
Recall converged on the same fields (word text, start/end timestamp, confidence, speaker
label, speaker_id) independently. The signed-URL-for-large-artifact pattern (rather than
inline) matches our own A5 finding in `research/02-data-model.md` ("large results are
offloaded to a signed `result_url`") — two independent vendors landed on the same shape,
which is a small but real validation of our normalization design (`loadResult()` handling
both inline and offloaded shapes).

---

## 3. Infra lessons that validate "don't build a recorder"

**The concrete build cost (third-party estimate, not Recall's own marketing):**
"Roughly a year of work for 3–5 engineers" to build and operate reliable capture across
major platforms — "handling different APIs, reconnects, participant changes, transcription
pipelines, and compliance." Per-bot compute: ~4 vCPU per active meeting, ~$0.40/recording
hour at $0.10/vCPU-hour cloud pricing — before any transcription, storage, or ops-team
cost. The article's own crossover analysis: at 1,000 monthly hours a managed API
(~$650/mo all-in) roughly matches raw custom compute (~$400/mo, engineering salaries not
included); the breakeven where owning infra beats buying "sits in the low hundreds of
thousands of hours" per month — i.e. only relevant at serious scale, never at OGL's size.
Source: https://www.forasoft.com/blog/article/meeting-bot-api-architecture
(third-party analysis, not Recall.ai's own words — flagged as such; directionally
consistent with Recall's own "SDKs, app reviews, raw media handling" framing in §1 but this
is the only source with actual numbers, so treat the specific figures as one analyst's
estimate, not vendor-verified fact)

**Recall's own engineering blog — the $1M lesson (this is the strongest, most citable
infra-pain source, straight from Recall's engineering team, not marketing):**
Recall used WebSockets over loopback to move raw video from headless Chromium to their
video encoder inside each bot. A single 1080p/30fps uncompressed I420 stream runs
~93 MB/s; production bots hit ~150 MB/s at p99. Two structural inefficiencies made this
expensive: (1) Chromium's WebSocket implementation fragments messages over 131KB, so a
single 3.1MB video frame split into 24 fragments with redundant copying; (2) the WebSocket
spec mandates XOR masking of every client-to-server byte — real CPU cost at 100+ MB/s.
Profiling showed most CPU time went to `memmove`/`memcpy`, not actual video processing.
Bots needed "4 CPU cores to run smoothly in all circumstances" under this design. Fix: a
custom lock-free shared-memory ring buffer (write/peek/read pointers, multi-producer
single-consumer, zero-copy reads) replacing the WebSocket hop entirely. Result: "reduced
the CPU usage of our bots by up to 50%," saving "over $1 million per year" in AWS costs.
Source: https://www.recall.ai/blog/how-websockets-cost-us-1m-on-our-aws-bill
→ **How OGL uses this:** the single best citation for "we would be foolish to build a
recorder ourselves." This is not a hypothetical difficulty — it's a funded, focused infra
team hitting a real 7-figure cost surprise on the *media transport* problem alone, before
transcription, diarization, or per-platform breakage even enter the picture. Directly
supports the existing README boundary ("a meeting bot that joins your calls... we work on
recordings you already have") and the roadmap's choice to treat live capture as an adapter
onto Recall/Vexa rather than in-house bot infrastructure. Strong candidate for a verbatim
citation in README's roadmap section if we want to make the "why not build it" case
explicit rather than implicit.

---

## 4. Transcription/diarization — contrast with our channel-based approach

Recall documents four diarization strategies, in descending order of how much they lean on
separated audio streams:

1. **Perfect Diarization** — transcribes each participant's audio stream independently
   (bot captures per-participant streams where the platform exposes them) and returns real
   participant names directly as speaker labels. "Audio is provided in separate streams
   instead of one mixed stream. This makes speaker attribution more accurate."
2. **Hybrid Diarization** — separate-stream transcription combined with machine
   diarization, mapping generic labels to real participants when possible.
3. **Speaker-Timeline Diarization** — uses the meeting platform's own active-speaker
   events to assign transcript sections to participants (no separate audio needed).
4. **Machine Diarization** — third-party voice-based diarization on a single mixed
   stream, producing generic labels (A/B/C or 0/1/2); "can be less accurate when different
   speakers have similar-sounding voices," and mixed-stream diarization in general "makes
   speaker attribution harder, especially when multiple people are speaking at the same
   time."
   Perfect Diarization's own limit: it "cannot distinguish multiple speakers sharing one
   device" — separated-stream diarization is a per-participant-connection guarantee, not a
   per-human-voice guarantee.

Cost note: Perfect Diarization increases async transcription cost 0.6x–1.2x, and real-time
usage ~1.8x, "due to independent overlapping speech processing."
Source: https://docs.recall.ai/docs/diarization

→ **How OGL uses this:** direct, useful contrast for our README's channel-based diarization
claim ("dual-channel/stereo recordings — the standard telephony export format — get exact
per-speaker labels; mono works with inferred roles, honestly labeled as inferred"). Recall
independently validates the *general principle* — separated-stream diarization beats
single-mixed-stream diarization for accuracy, especially on overlapping speech — which is
exactly OGL's stereo-channel bet, just applied to a different capture context (per-platform
web-call participant streams vs. telephony's two-channel agent/customer recording). Recall's
"Perfect Diarization can't split two people sharing one device" caveat is the same class of
honest limitation OGL states for mono ("inferred roles, honestly labeled as inferred") —
good precedent for keeping that kind of caveat in our own docs rather than smoothing it
over. Not a contradiction to reconcile — a second vendor landing on the same "trust the
channel boundary over the voice model" logic.

---

## 5. Pricing/positioning (roadmap framing only)

2026 pricing, no monthly platform fee, pure usage-based:
- Bot recording (Meeting Bot API and Desktop Recording SDK, same rate): **$0.50/hour**
  (down from $0.70/hour)
- Built-in transcription: **$0.15/hour** (or bring your own provider key at no Recall
  markup)
- Storage: free 7 days, then **$0.05/hour per 30-day period**
- Calendar API: free
- Startup discount: **$0.25/hour** for the first 10,000 hours
- Stated reasoning: "make Recall.ai accessible to more startups... build a proof of
  concept without a financial commitment."
Source: https://www.recall.ai/blog/new-recall-ai-pricing-for-2026

**Vexa.ai — the open-source alternative already named in our own roadmap.** Apache-2.0
licensed, self-hostable meeting-bot API for Google Meet/Teams/Zoom with real-time
WebSocket transcripts and an MCP server; positions itself explicitly as "a privacy-first,
open source alternative to Recall.ai." Pricing claim: "$0.30/hr vs Recall.ai's ~$0.50/hr
(40% cheaper)," self-host to remove per-hour cost entirely. API-compatibility claim:
"migrating to Vexa takes hours, not weeks... same REST API patterns."
Sources: https://vexa.ai/, https://vexa.ai/compare/recall-ai,
https://github.com/vexa-ai/vexa
→ **How OGL uses this:** confirms the README roadmap line is well-grounded — "the ingest
input is shaped to accept a Vexa-style `meeting.completed` webhook payload unchanged" is a
real, live, Apache-2.0 project (not vaporware), and it explicitly targets Recall.ai API
compatibility, which is why designing OGL's live-capture ingestion adapter against the
Recall-family shape (§2) buys optionality on *either* vendor — Recall for the managed/paid
path, Vexa for the self-hosted/open-source-aligned path that matches OGL's own OSS
positioning. Worth stating explicitly in roadmap copy: "Recall.ai (managed) or Vexa
(self-hosted, Apache-2.0) as the live-capture adapter — both speak roughly the same
bot-lifecycle shape."

---

## What is CONFIRMED

- Recall.ai's core product = unified meeting-bot API (join, record, transcribe, real-time
  stream) across major platforms. — https://www.recall.ai/product/meeting-bot-api
- Sybill build-vs-buy: 6–12mo / 2 FTEs to build Teams+Meet in-house, vs buying Recall and
  tripling addressable audience + $50k MRR in a month. — https://www.recall.ai/customers/sybill
- Bot object + status-change webhook lifecycle (joining_call → in_call_recording → done/
  fatal), "listen don't poll" guidance. — https://docs.recall.ai/reference/bot_create,
  https://docs.recall.ai/docs/bot-status-change-events
- Webhook signing: Svix-style, HMAC-SHA256 over `id.timestamp.rawbody`, `whsec_` secret,
  timing-safe compare, raw-body requirement, 24h retry window. —
  https://docs.recall.ai/docs/authenticating-requests-from-recallai
- Real-time transcript.data vs transcript.partial_data, "display partial then replace with
  final" UX pattern. — https://docs.recall.ai/docs/bot-real-time-transcription
- Transcript artifact = separate resource with signed download_url, not inline blob;
  word-level fields (text/start/end/confidence) + speaker/speaker_id/participant match our
  own word-shape design. — https://docs.recall.ai/reference/transcript_retrieve
- The $1M WebSocket engineering story: per-bot 4 vCPU baseline, Chromium WS fragmentation +
  masking overhead, custom shared-memory ring buffer fix, 50% CPU cut / $1M+/yr saved. —
  https://www.recall.ai/blog/how-websockets-cost-us-1m-on-our-aws-bill
- Four diarization tiers (Perfect/Hybrid/Speaker-Timeline/Machine); separated-stream
  diarization beats mixed-stream for accuracy and overlap handling; Perfect Diarization
  still can't split co-located speakers on one device. — https://docs.recall.ai/docs/diarization
- 2026 pricing: $0.50/hr recording, $0.15/hr transcription, $0.05/hr/30d storage, no
  platform fee, $0.25/hr startup rate. — https://www.recall.ai/blog/new-recall-ai-pricing-for-2026
- Vexa.ai: Apache-2.0, self-hostable, Recall-API-compatible, ~$0.30/hr hosted or free
  self-hosted. — https://vexa.ai/, https://vexa.ai/compare/recall-ai

## What is STILL OPEN

- The forasoft "1 year / 3-5 engineers" and "$650/mo vs $400/mo crossover" figures are a
  third-party analyst's estimate, not Recall's own disclosed numbers — cite as "one
  analyst's estimate," not vendor fact, if it lands in README.
- Exact nested JSON shape of a downloaded transcript file (vs. the `transcript_retrieve`
  API wrapper) was not independently re-fetched as raw JSON in this pass — field *names*
  are confirmed from two doc pages, exact nesting/ordering is not.
- PyAI's own webhook signature (`X-PyAI-Signature`, per `research/02-data-model.md` A8) is
  still unconfirmed against a live delivery — this doc doesn't close that gap, only offers
  Recall's confirmed scheme as a second reference implementation if/when someone verifies
  PyAI's.
- No fetch of Recall's calendar-integration docs or full customer list beyond Sybill — out
  of scope per the task filter (video-specific / enterprise-sales fluff skipped).

## Promotion path

Roadmap framing ("Live capture" bullet, Recall-or-Vexa adapter choice) → README/roadmap
copy owner. Build-vs-buy citation (Sybill numbers, $1M WebSocket story) → README "Honest
architecture" / roadmap section if we want an explicit "why not build a recorder" callout.
Webhook-signing pattern (§2.2) → candidate reference if OGL ever verifies PyAI's own
webhook or ships outbound webhooks. Anything spec-shaped (e.g. formalizing a job-status
lifecycle for async PyAI) → SYNC.md proposal → auditor → L-number, citing this doc.
