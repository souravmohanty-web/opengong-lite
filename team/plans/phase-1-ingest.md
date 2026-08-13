# Phase 1 (Ingest) — review brief for Sourav

**Status: built pre-freeze, exit test passed, UNCOMMITTED.** This doc is the plan-mode
artifact for approval: approve → one commit lands it; reject → `git clean` removes it
(nothing else touches these files).

## What was built (all in working tree, uncommitted)

| File | Job |
|---|---|
| `src/transcript.js` | Canonical transcript builder, pure function. Diarized path: API's speaker-labeled segments become utterances (L2). Mono path: our own utterance layer — split `words[]` on pause-gap >0.6s plus hard 40-word cap; speaker stays `null`, roles left for extraction (L3). Canonical text joined from words/segments, never `result.text` (L4). `transcript_hash` sha256 stamp (L10). |
| `src/ingest.js` | Upload validation (extension allowlist, 200MB cap, basename-only — L19) → `POST /transcription/jobs` multipart or `audio_url` (L1) → poll with timeout → named exits `PYAI_JOB_FAILED` / `PYAI_JOB_TIMEOUT` / `UPLOAD_REJECTED` (L13). CLI: `node src/ingest.js <file>`. |
| `test/transcript.golden.test.js` | 5 golden tests against committed fixtures: stereo speaker mapping; mono max-length split; the "40 vs forty" regression guard (asserts canonical text can never come from `result.text`); TTS-mono no-invented-speakers; hash stability. |
| `test/ingest.test.js` | Validation unit tests (traversal, extension, source exclusivity). |

## Evidence (run fresh pre-freeze, this session)

- `npm test` → **11/11 pass** (6 Phase-0 + 5 Phase-1 golden/unit).
- Live e2e: `node src/ingest.js research/00-api-probe/call.wav` →
  `job_a8k3kaat9eKU8ljSWHpsaMc4`… → completed → mono, 2 utterances, canonical text
  renders "forty" (words-derived), full JSON in session scratchpad.

## Known limits (deliberate, per brief)

- Mono role attribution (Rep/Prospect + confidence) is NOT here — it needs the LLM and
  belongs to Phase 2's extraction context (L3, L5).
- Display-layer repunctuation not built — display is separate from evidence (L4), arrives
  with the notes UI (Phase 3).
- Long-audio segment granularity is a known unknown (brief §5) — the utterance layer
  handles it either way, but golden fixtures only cover short files.

## Decision requested

- [ ] APPROVE → commit Phase 1 as-is, board row → done
- [ ] REJECT/AMEND → say what changes; files stay uncommitted until then
