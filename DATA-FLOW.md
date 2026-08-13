# DATA-FLOW.md

**What this document is:** every network call this codebase can make, traced to the
exact line that makes it. This is not a privacy policy — it's a code-audit trail. If a
claim below doesn't match `src/`, that's a bug in this document, not a rounding error;
open an issue.

## Positioning

OpenGong Lite is a **self-hosted app with hosted inference.** It does not run entirely
on your machine, and never claims to. Two things leave your machine: **audio → PyAI** (transcription) and
**transcript text → Anthropic** (extraction). Everything else — your uploaded files, the
SQLite index, run records, exported notes, and the receipts themselves — stays on your
infrastructure. This document names both vendors plainly and enumerates every call site
so that claim is checkable, not asserted.

Verified against the code on 2026-08-13. Repo-wide search for outbound network calls
(`fetch(`, `fetchImpl(`, `http(s).request`, `XMLHttpRequest`, `axios`, `undici`) turned
up exactly three call sites that leave the machine. A fourth `fetch()` exists
(`src/viewer.js:160`) but it's the browser tab calling the app's *own* local server
(`GET /bundle.json` against `127.0.0.1:4317`) — same-origin, not outbound, not listed
below as a network-call row.

## Every outbound network call

| # | Trigger | Method + endpoint | Vendor | Payload leaving the machine | Response | Retention | Call site |
|---|---|---|---|---|---|---|---|
| 1 | Cold start with no valid PyAI key on disk (`npm start`, or first `pyaiFetch` call with no `sandbox.pyai_key` / `PYAI_API_KEY`) | `POST /v1/sandbox/keys` | PyAI | Empty body — no user content, no audio, no transcript | A sandbox API key (`pyai_test_…`) + expiry (~7 days) + scopes | Key is written to local file `sandbox.pyai_key` (mode `0600`, gitignored); PyAI's own retention of the mint event is out of our control | `src/pyai.js:56` |
| 2 | Uploading/ingesting a call for transcription (`node src/ingest.js <file>`, or any code path that calls `submitJob`) | `POST /v1/transcription/jobs` (via the shared authed client) | PyAI | The **audio file itself** (multipart upload), or an `audio_url` if that ingestion path is used instead. No transcript, no notes, no claims — this is the *first* thing to touch PyAI, before any text exists | `{ job_id, status: 'queued' }` | PyAI processes the audio server-side to produce the transcript; OpenGong Lite does not control or extend PyAI's retention of the uploaded audio — see "What we don't control" below | `src/ingest.js:40` → `pyaiFetch` → `fetch()` at `src/pyai.js:104` |
| 3 | Polling a transcription job to completion (`pollJob`, called automatically after #2) | `GET /v1/transcription/jobs/:job_id` | PyAI | Nothing beyond the job id in the URL path — no new content sent | The transcript (`result.text`, `result.segments[]`, `result.words[]`) | Same as #2 — PyAI-side, not ours | `src/ingest.js:67` → `pyaiFetch` → `fetch()` at `src/pyai.js:104` |
| 4 | Boot-time reachability check (`npm start` → `src/index.js`) | `GET /v1/voices` | PyAI | Nothing — this is a cheap authed no-op call to prove the minted/loaded key actually works | A voice catalog (unrelated to the user's call — this call exists only to exercise the key and the 401→re-mint path) | Nothing user-derived sent or returned | `src/index.js:13` → `pyaiFetch` → `fetch()` at `src/pyai.js:104` |
| 5 | Running extraction on new audio (`--live` extraction, requires `ANTHROPIC_API_KEY`) | `POST /v1/messages` | Anthropic | The **rendered transcript text** (speaker/role tokens + utterance text, `[U<id>] role: text` — see `src/prompt.js:renderLine`; **no timestamps**, no audio, no filenames), plus the fixed system discipline/glossary text and the extractor's task prompt. This is the one call where call content leaves the machine as text | Structured JSON (claims + evidence, schema-enforced via `output_config.format`), token usage, cost | Anthropic's own retention/training policy for API traffic applies — not something this codebase configures or overrides; see "What we don't control" | `src/extract.js:484` (`callLlm = (req) => callMessages(req)`) → `src/llm.js:138` |

**Row count check (Gate B, SCORECARD.md auto-check "DATA-FLOW rows == fetch sites"):**
5 logical call rows, all traced to the 3 literal outbound-fetch call sites in the code
(`src/pyai.js:56`, `src/pyai.js:104`, `src/llm.js:138`). Rows 2–4 share one call site
(`src/pyai.js:104`) because `pyaiFetch()` is one authenticated client reused by three
different callers (`src/ingest.js:40`, `src/ingest.js:67`, `src/index.js:13`) — the table
lists each *caller*, since each is a distinct trigger with a distinct payload, but the
line that actually executes the request is the same for all three.

## Endpoints named in the codebase but not actually called

`capabilities.json` declares a `tts` role (`POST /v1/audio/speech`, `GET /v1/voices`
for voice selection) and `src/registry.js:30` mentions it in a comment. **This is not
invoked by the shipped app at any user-triggered runtime path.** TTS was used exactly
once, out-of-band, to *generate* the synthetic demo call audio committed under
`research/00-api-probe/` (`call.wav`, `tts_diar_result.json`) — a build-time content
step, not something `npm start`, `npm run demo`, or `node src/ingest.js` will ever call.
No `POST /v1/audio/speech` call site exists in `src/`. Similarly, `GET /v1/me` is not
called anywhere in `src/` — omitted from the table above because it doesn't exist in
code, not because it was overlooked.

## What NEVER leaves your machine

- **The audio file itself, after transcription.** PyAI receives it once (call #2 above)
  to produce a transcript; OpenGong Lite never re-uploads it, never stores a second copy
  of it in `runs/`, and never sends it anywhere else. (`src/server.js`'s local viewer
  serves audio straight from wherever the file already sits on disk — it doesn't proxy
  or forward it anywhere.)
- **Extraction bundles** (`runs/<run_id>/bundle.json`) — claims, evidence, coverage,
  provenance. Written locally via `writeAtomic` (`src/store.js:16`), never transmitted.
- **Run records** (`runs/<run_id>/run.json`) — cost ledger, exit reasons, cache hit/miss
  stats. Local-only, append-only, never transmitted.
- **Tier-1 exports** (`node src/export.js`, `src/export.js:19`) — a single self-contained
  HTML file with the viewer, styles, and bundle inlined. Zero network calls to produce
  or to open; the resulting file works over email/Slack/AirDrop/`file://` with no server
  involved at all.
- **Tier-2 share links (fragment URL).** `DECISION-BRIEF.md` L11 specifies this: notes +
  cited segments only (never the full transcript), encoded into a URL `#fragment`
  (deflate-raw + base64url), decoded client-side. Because URL fragments are never sent
  in an HTTP request (browser-spec behavior, not an app guarantee), "our server can't
  read your share link" would be literally true for this tier. **Status: designed
  (`team/plans/phase-3-ui.md`), not yet built** — no `hash-codec.js` or tier-2 writer
  exists in `src/` as of this writing. Do not represent this as shipped until the codec
  and its round-trip tests land.

## Turn it off

`npm run demo` (`node src/server.js`) is **structurally** network-free, not just
network-free by default config: `src/server.js` imports nothing from `pyai.js` or
`llm.js` — there is no code path inside it capable of making an outbound call,
regardless of environment variables or keys present. It serves a committed fixture
bundle (`test/fixtures/bundle.slice1.json`) and committed sample audio
(`research/00-api-probe/call.wav`) from local disk over a `127.0.0.1`-only HTTP server
(`src/server.js:12-13`). The script's own boot message says as much:
`"demo mode: no keys needed, works offline"` (`src/server.js:120`).

There is no `OPENGONG_OFFLINE`-style environment flag in this codebase today — the
demo path's offline guarantee comes from what `server.js` simply cannot import, not
from a toggle that could be flipped on accidentally. Worth stating precisely: **`npm
start` (`src/index.js`) is not the offline path** — it unconditionally mints/loads a
PyAI key and calls `GET /v1/voices` (row #4 above) every time it runs, key or no key
in your environment. Only `npm run demo` is the zero-network path.

## You'll hate this if…

- **You wanted everything to run on-device with zero external calls.** This isn't that,
  and we don't say it is. Transcription and extraction are hosted-API calls to PyAI and
  Anthropic respectively (rows 1–5 above). If your threat model requires zero bytes
  leaving the machine ever, this tool is the wrong shape for you.
- **You don't have your own Anthropic key.** The cached demo (`npm run demo`) needs
  nothing, but running extraction on your own audio requires `ANTHROPIC_API_KEY` — it's
  not bundled, not free, and not auto-provisioned the way the PyAI sandbox key is
  (`.env.example`).
- **Your calls aren't in English.** PyAI's transcription hard-400s on non-`en` today
  (`research/00-api-probe/FINDINGS.md` #14a) — this is an upstream API constraint, not a
  choice, and there's no workaround shipped.
- **You need more than two speakers cleanly diarized.** Exact per-speaker diarization
  only works on dual-channel (stereo) audio — one speaker per channel, so it caps at 2
  (`DECISION-BRIEF.md` L2). Mono audio degrades to pause-gap utterance splitting plus
  LLM-inferred Rep/Prospect roles, never invented names, and is honestly labeled as the
  degraded path (`DECISION-BRIEF.md` L3).

## What we don't control

PyAI's and Anthropic's own server-side retention, logging, and (for Anthropic, absent
a contrary agreement) potential training use of API traffic are governed by their
respective terms, not by anything in this repository. This document covers what
*OpenGong Lite* sends and stores; it is not a substitute for reading PyAI's and
Anthropic's own data-processing terms if that matters for your use case.
