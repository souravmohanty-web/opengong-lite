# DATA-FLOW.md

**What this document is:** every network call this codebase can make, traced to the exact
line that makes it. Treat it as a code-audit trail rather than a privacy policy. If a
claim below doesn't match `src/`, that's a bug in this document. Open an issue.

## Positioning

OpenGong Lite is a self-hosted app with hosted inference. It does not run entirely on
your machine, and never claims to. Two things leave your machine: audio goes to PyAI for
transcription, and transcript text goes to Anthropic for extraction. Everything else
stays on your infrastructure: your uploaded files, run records, extraction bundles,
exported notes, and the receipts themselves. This document names both vendors plainly and
enumerates every call site so that claim is checkable.

Verified against the code on 2026-08-13. A repo-wide search for outbound network calls
(`fetch(`, `fetchImpl(`, `http(s).request`, `XMLHttpRequest`, `axios`, `undici`) turned up
exactly three call sites that leave the machine. A fourth `fetch()` exists
(`src/viewer.js:160`) but it's the browser tab calling the app's *own* local server
(`GET /bundle.json` against `127.0.0.1:4317`). Same-origin, so it isn't listed below as a
network-call row.

## Every outbound network call

| # | Trigger | Method + endpoint | Vendor | Payload leaving the machine | Response | Retention | Call site |
|---|---|---|---|---|---|---|---|
| 1 | Cold start with no valid PyAI key on disk (`npm start`, or first `pyaiFetch` call with no `sandbox.pyai_key` / `PYAI_API_KEY`) | `POST /v1/sandbox/keys` | PyAI | Empty body. No user content, no audio, no transcript | A sandbox API key (`pyai_test_…`) plus expiry (~7 days) and scopes | Key is written to local file `sandbox.pyai_key` (mode `0600`, gitignored). PyAI's own retention of the mint event is out of our control | `src/pyai.js:56` |
| 2 | Uploading/ingesting a call for transcription (`node src/ingest.js <file>`, or any code path that calls `submitJob`) | `POST /v1/transcription/jobs` (via the shared authed client) | PyAI | The **audio file itself** (multipart upload), or an `audio_url` if that ingestion path is used instead. No transcript, no notes, no claims. This is the first thing to touch PyAI, before any text exists | `{ job_id, status: 'queued' }` | PyAI processes the audio server-side to produce the transcript. OpenGong Lite does not control or extend PyAI's retention of the uploaded audio. See "What we don't control" below | `src/ingest.js:40` → `pyaiFetch` → `fetch()` at `src/pyai.js:104` |
| 3 | Polling a transcription job to completion (`pollJob`, called automatically after #2) | `GET /v1/transcription/jobs/:job_id` | PyAI | Nothing beyond the job id in the URL path. No new content sent | The transcript (`result.text`, `result.segments[]`, `result.words[]`) | Same as #2, PyAI-side and not ours | `src/ingest.js:67` → `pyaiFetch` → `fetch()` at `src/pyai.js:104` |
| 4 | Boot (`npm start` → `src/index.js`) | none | nobody | Nothing. Boot makes zero network calls: it reads any stored key from disk and serves the sample workspace. A key self-mints lazily on the first real transcription, never at boot (commit c0bec7b) | n/a | Nothing sent anywhere | `src/index.js` (only `loadKey()`, a local file read) |
| 5 | Running extraction on new audio (`--live` extraction, requires `ANTHROPIC_API_KEY`) | `POST /v1/messages` | Anthropic | The **rendered transcript text** (speaker/role tokens plus utterance text, `[U<id>] role: text`, see `src/prompt.js:renderLine`. No timestamps, no audio, no filenames), plus the fixed system discipline/glossary text and the extractor's task prompt. This is the one call where call content leaves the machine as text | Structured JSON (claims plus evidence, schema-enforced via `output_config.format`), token usage, cost | Anthropic's own retention/training policy for API traffic applies. This codebase does not configure or override it. See "What we don't control" | `src/extract.js:484` (`callLlm = (req) => callMessages(req)`) → `src/llm.js:138` |

**Row count check (Gate B, SCORECARD.md auto-check "DATA-FLOW rows == fetch sites"):**
5 logical call rows, all traced to the 3 literal outbound-fetch call sites in the code
(`src/pyai.js:56`, `src/pyai.js:104`, `src/llm.js:138`). Rows 2 through 4 share one call
site (`src/pyai.js:104`) because `pyaiFetch()` is one authenticated client reused by three
different callers (`src/ingest.js:40`, `src/ingest.js:67`, `src/index.js:13`). The table
lists each *caller*, since each is a distinct trigger with a distinct payload, but the
line that actually executes the request is the same for all three.

## Endpoints named in the codebase but not actually called

`capabilities.json` declares a `tts` role (`POST /v1/audio/speech`, `GET /v1/voices` for
voice selection) and `src/registry.js:30` mentions it in a comment. **The shipped app
never invokes this at any user-triggered runtime path.** TTS was used exactly once,
out-of-band, to *generate* the synthetic demo call audio committed under
`research/00-api-probe/` (`call.wav`, `tts_diar_result.json`). That was a build-time
content step. Neither `npm start`, `npm run demo`, nor `node src/ingest.js` will ever call
it. No `POST /v1/audio/speech` call site exists in `src/`. Similarly, `GET /v1/me` is not
called anywhere in `src/`. It's omitted from the table above because it doesn't exist in
code, and not because it was overlooked.

## What NEVER leaves your machine

- **The audio file itself, after transcription.** PyAI receives it once (call #2 above) to
  produce a transcript. OpenGong Lite never re-uploads it, never stores a second copy of
  it in `runs/`, and never sends it anywhere else. (`src/server.js`'s local viewer serves
  audio straight from wherever the file already sits on disk. It doesn't proxy or forward
  it anywhere.)
- **Extraction bundles** (`runs/<run_id>/bundle.json`): claims, evidence, coverage,
  provenance. Written locally via `writeAtomic` (`src/store.js:16`), never transmitted.
- **Run records** (`runs/<run_id>/run.json`): cost ledger, exit reasons, cache hit/miss
  stats. Local-only, append-only, never transmitted.
- **Tier-1 exports** (`node src/export.js`, `src/export.js:19`): a single self-contained
  HTML file with the viewer, styles, and bundle inlined. Zero network calls to produce it
  or to open it. The resulting file works over email, Slack, AirDrop, and `file://` with
  no server involved at all.
- **Tier-2 share links (fragment URL).** `DECISION-BRIEF.md` L11 specifies this: notes plus
  cited segments only, never the full transcript, encoded into a URL `#fragment`
  (deflate-raw plus base64url), decoded client-side. Because URL fragments are never sent
  in an HTTP request (browser-spec behavior, and not an app guarantee), "our server can't
  read your share link" would be literally true for this tier. **Status: designed
  (`team/plans/phase-3-ui.md`) and not yet built.** No `hash-codec.js` or tier-2 writer
  exists in `src/` as of this writing. Do not represent this as shipped until the codec
  and its round-trip tests land.

## Turn it off

`npm run demo` (`node src/server.js`) is **structurally** network-free, and not merely
network-free by default config. `src/server.js` imports nothing from `pyai.js` or
`llm.js`, so there is no code path inside it capable of making an outbound call,
regardless of environment variables or keys present. It serves a committed fixture bundle
(`test/fixtures/bundle.slice1.json`) and committed sample audio
(`research/00-api-probe/call.wav`) from local disk over a `127.0.0.1`-only HTTP server
(`src/server.js:12-13`). The script's own boot message says as much: `"demo mode: no keys
needed, works offline"` (`src/server.js:120`).

There is no `OPENGONG_OFFLINE`-style environment flag in this codebase today. The demo
path's offline guarantee comes from what `server.js` simply cannot import, rather than
from a toggle that could be flipped on accidentally. Worth stating precisely: **`npm start` makes no network calls at boot.** It reads any stored key from disk and serves the cached sample deal. The first live transcription is what mints or uses a key. Everything before that point runs offline.

## You'll hate this if…

- **You wanted everything to run on-device with zero external calls.** This isn't that,
  and we don't say it is. Transcription and extraction are hosted-API calls to PyAI and
  Anthropic respectively (rows 1 through 5 above). If your threat model requires zero
  bytes leaving the machine ever, this tool is the wrong shape for you.
- **You don't have your own Anthropic key.** The cached demo (`npm run demo`) needs
  nothing, but running extraction on your own audio requires `ANTHROPIC_API_KEY`. It isn't
  bundled, isn't free, and isn't auto-provisioned the way the PyAI sandbox key is
  (`.env.example`).
- **Your calls aren't in English.** PyAI's transcription hard-400s on non-`en` today
  (`research/00-api-probe/FINDINGS.md` #14a). That's an upstream API constraint, and
  there's no workaround shipped.
- **You need more than two speakers cleanly diarized.** Exact per-speaker diarization only
  works on dual-channel (stereo) audio, one speaker per channel, so it caps at 2
  (`DECISION-BRIEF.md` L2). Mono audio degrades to pause-gap utterance splitting with
  every utterance carrying `speaker: null` and `role: null` (`src/transcript.js:96`).
  Nothing downstream fills those in today, so mono comes back as one unlabeled speaker
  stream. Rep/Prospect role inference is on the roadmap (`DECISION-BRIEF.md` L3).

## What we don't control

PyAI's and Anthropic's own server-side retention, logging, and (for Anthropic, absent a
contrary agreement) potential training use of API traffic are governed by their respective
terms, and not by anything in this repository. This document covers what *OpenGong Lite*
sends and stores. It is not a substitute for reading PyAI's and Anthropic's own
data-processing terms if that matters for your use case.
