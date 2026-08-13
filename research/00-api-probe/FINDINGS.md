# Lane Zero: PyAI API probe — ground truth (verified 2026-08-13, ~10:40 IST)

Live probes against `https://api.pyai.com/v1` with a self-minted sandbox key. Raw responses committed in this folder as fixtures. Everything below is observed, not assumed.

## What is CONFIRMED

1. **Sandbox key minting works exactly as advertised.** `POST /v1/sandbox/keys` with empty body → instant `pyai_test_…` key, no signup. Response includes org/project ids, scopes, expiry (~7 days), and a note: never 402s, daily usage cap, scoped to Hear/Speak/Omni basics. First-run auto-provisioning in `npm start` is fully viable.
2. **Sandbox scopes: `hear:transcribe, hear:stream, transcribe:jobs, voice:synthesize, omni:session, nova:run, amd:*, cast:render`. There is NO recap scope.** The deck's "Hear + Recap loop" is not reachable on sandbox keys. → We build our own extraction loop. (Also: `voice:synthesize` means we can generate sample-call audio with PyAI's own TTS — sample data burns minutes too, and it's a better story than macOS `say`.)
3. **Sync endpoint (`POST /v1/audio/transcriptions`) is minimal.** `model=pyai-hear`, multipart file → `{text, duration}` ONLY. `response_format=verbose_json`, `srt`, `timestamp_granularities[]`, `diarize` are all silently ignored. No segments, no words, no punctuation, no capitalization (`"hi rahul thanks for taking the time today…"`).
4. **Batch endpoint (`POST /v1/transcription/jobs`) is the real one.** Multipart upload (or `audio_url` — error message confirms: "exactly one audio source required: provide 'audio_url' OR an upload"). Returns `{job_id, status: queued}`; poll `GET /v1/transcription/jobs/{job_id}`. A 21s file completed in <10s. Result shape:
   ```json
   {"result": {
     "text": "…",
     "words": [{"word": "hi", "start": 0, "end": 0.16}, …],
     "segments": [{"id": 0, "start": 0, "end": 20.72, "text": "…", "speaker": null}],
     "speakers": 1,
     "audio_seconds": 21.174
   }}
   ```
   **Word-level timestamps confirmed** — the receipts backbone exists.
5. **Diarization schema exists but did not split our synthetic audio.** `segments[].speaker` field is present (null) and top-level `speakers` count is returned, so the API models diarization. On a 3-turn file made from two macOS `say` voices (16kHz mono), it returned `speakers: 1`, one giant segment. Guessed params (`min_speakers`, `max_speakers`, `num_speakers`, `punctuate`, `smart_format`) were accepted without error but changed nothing.
6. **Errors are RFC-7807 problem+json** with `request_id` — nice for the harness's failure records.
7. **Transcript text is lowercase, unpunctuated, and normalizes numbers inconsistently** ("almost 40 less" in one run, "forty" in another for the same audio). Receipts matching MUST normalize (lowercase, strip punctuation, number-word folding) — exact string match on LLM-quoted text will fail.

## What is STILL OPEN (test at build hour zero)

- **Does diarization split real two-human audio?** Synthetic same-pipeline voices are the worst case for speaker embeddings. Test with a genuine two-person recording before concluding anything. If it still returns 1 speaker → fallback plan: LLM turn-attribution from content (Rep/Prospect roles), never fabricated names.
- Segmentation on longer audio (does it produce many segments, or is our single segment a short-file artifact?).
- Streaming WS (`hear:stream`) response shape — not needed for MVP, skip unless time allows.
- Sandbox daily cap size — unknown number; matters for demo-day budget governor.
- Whether batch accepts a `language` hint / handles Hinglish.

## ADDENDUM (probe round 2, same day ~11:15 IST) — nova, TTS, and the diarization answer

8. **`pyai-nova` exists at `/v1/chat/completions` but is a sandbox stub.** OpenAI-compatible response shape with `x_pyai_nova`/`x_pyai_nfuse` verification blocks (confidence, checks_passed, cost_usd, vs_frontier), but it returns the same canned meta-text for every prompt and ignores `response_format`. NOT usable as the extraction brain. → Extraction LLM is external (e.g. Anthropic) and must be named honestly in DATA-FLOW.md. (Closes auditor F-11/F-17; fixture: chat-completions responses inline in session log.)
9. **PyAI TTS works on sandbox** (`POST /v1/audio/speech`, model `pyai-voice`, rich `/v1/voices` catalog with personas; returns 24kHz mono WAV). One voice (`stock_amos_en_us`) failed twice with `upstream_error` "Speech synthesis is unavailable" while others worked — per-voice availability is flaky; sample-generation scripts need voice fallback.
10. **Mono TTS audio does NOT diarize** — two clearly different voices (male en-IN, female en-GB) concatenated in mono → `speakers: 1`, one segment. Auditor F-12 confirmed: naive TTS sample calls would demo as one speaker.
11. **THE ANSWER: diarization is channel-based.** Same audio mixed as **stereo, one speaker per channel**, submitted to the jobs API → `speakers: 2`, segments with `speaker: "speaker_1"/"speaker_2"` and `channel: 0/1`, correct boundaries and timestamps (fixture: `stereo_result.json`). This is the telephony-standard dual-channel recording format.

### Consequences of the addendum
- **Sample calls: render each speaker's lines as separate TTS tracks, mix to stereo (rep=left, prospect=right).** Perfect diarization + numbered speaker-labeled segments by construction, burns PyAI minutes in both directions (Speak + Hear), and matches how real call platforms record. F-12 solved.
- **The harness's segment-ID citation gate gets real numbered, speaker-labeled segments** from the API for stereo input — the gate design survives better than the round-2 adjudication assumed, for stereo.
- **Mono uploads remain the degraded path**: our own pause-gap utterance layer + LLM role attribution (Rep/Prospect, never invented names) + the promoted text-containment verification. Product story: "upload your call-platform recording (dual-channel) for exact speaker labels; mono works with inferred roles."

1. Pipeline uses the **batch jobs endpoint**, async job polling — which fits the named-loop/run-record harness naturally.
2. **Segments are too coarse for receipts as-returned.** Build our own "utterance" layer: group `words[]` into utterances by pause gaps (>0.6s) + speaker changes (when available). Claims cite utterance ids + word-index ranges → deep-link to timestamp.
3. **A repunctuation/formatting pass is required** for human-readable transcript display (LLM formats for display; raw text remains ground truth for evidence matching).
4. **Receipt gate = normalized containment match** (lowercase, strip punctuation, collapse whitespace, fold number words) against raw transcript, not display text.
5. Speaker names: **content-inferred roles (Rep/Prospect) with confidence, never invented names** — pending real-audio diarization test.

> **CORRECTION (locked ruling L7, audit A-005–A-008): digit/number-word folding is
> FORBIDDEN in the gate; verification runs against the exact prompt-rendered canonical
> text.** See `DECISION-BRIEF.md` L7. This supersedes item 4 above and the same
> recommendation in the "What is CONFIRMED" item 7 earlier in this file — both predate the
> locked ruling. Left in place rather than deleted, per the append-only spirit of this
> lane's research trail; do not implement digit-folding in the gate.
