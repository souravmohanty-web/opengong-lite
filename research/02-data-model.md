# OpenGong Lite — Data Model & Architecture

**Research doc 02** · 2026-08-13 · 33-hour hackathon build
Open-source call intelligence: audio → transcript → evidence-linked extraction → notes → export.

> **The Iron Law of this system**
>
> ```
> NO EXTRACTED CLAIM WITHOUT A VERBATIM QUOTE THAT RE-ANCHORS INTO THE STORED TRANSCRIPT
> ```
>
> Everything in the schema below exists to make that law structurally enforceable rather than aspirational. A claim whose quote cannot be located in the transcript is dropped, not shipped.

---

## 0. Hour-zero verification list (read this first)

Every item below is an **assumption that must be verified in the first hour** before any schema is frozen. They are ordered by blast radius.

| # | Assumption | Why it's uncertain | How to verify (≤10 min) | If wrong |
|---|---|---|---|---|
| **A1** | **Diarization is only available on the async jobs API, not the sync endpoint.** | The PyAI OpenAPI spec (`https://api.pyai.com/openapi.json`, v1.5.0) defines `POST /v1/audio/transcriptions` with **no** `diarize` / `channel` / `timestamp_granularities` parameter. `diarize` and `channel` appear **only** on `POST /v1/transcription/jobs`. | `curl -s https://api.pyai.com/openapi.json \| jq '.paths["/v1/audio/transcriptions"].post.requestBody'` and diff against `.paths["/v1/transcription/jobs"].post`. Then POST a 30s stereo WAV to each. | **Architecture change, not a schema tweak.** The whole pipeline moves to submit→poll/webhook. Budget for it now (see §6). |
| **A2** | **`verbose_json` response shape from the sync endpoint is undocumented.** | The spec's `Transcription` schema is literally `{text: string, model: string}` — but `response_format` accepts `verbose_json`. The spec does **not** describe what `verbose_json` adds. It is Whisper-compatible *by claim*, not by published schema. | POST a 30s WAV with `-F response_format=verbose_json` and dump the raw JSON. Compare field-for-field against the OpenAI Whisper `verbose_json` shape in §1.1. | If it returns bare `{text, model}` even under `verbose_json`, the sync endpoint is unusable for us — go to jobs API (A1). |
| **A3** | **Job result `words[]` element shape is completely undefined.** | In the spec, `result.words` is `{"type": "array", "items": {"type": "object"}}` — **an untyped object with zero declared properties**. The guide prose says "per-word timings" but never shows a word object. | Run one diarized job end-to-end, `jq '.result.words[0]'`. | If words lack a `speaker` field, speaker attribution for a claim must be derived from the enclosing segment (which we do anyway — see §4 design note). Low blast radius. |
| **A4** | **Segment `id` is stable and monotonic within a result.** | The spec declares `segments[].id: integer` but says nothing about ordering or stability across re-runs. | Inspect two runs of the same audio; check `id` monotonic and `start` non-decreasing. | If unstable, our `segment_id` must be locally reassigned at ingest (we do this anyway — see §5.2 "never trust vendor IDs"). |
| **A5** | **Large results are offloaded to a signed `result_url` and the shape there is identical to inline `result`.** | Spec: *"Present on completed jobs (inline). Large results are offloaded to result_url instead."* The offloaded document's schema is not separately declared. | Submit a >30 min recording; confirm `result_url` appears, fetch it, diff keys against an inline result. | Handle both paths from day one — the ingest adapter must normalize (§6, `loadResult()`). |
| **A6** | **English-only.** | Spec: `language` on the sync endpoint is *"English (`en`) only today: any other value is rejected with `400 unsupported_language`."* On the jobs API, `language` is the **Recap summarization** language and explicitly "does not affect transcription — Hear transcription is English-only today." | Read-only; already verified in spec text. | Scope the demo to English audio. Do not build language selection UI. |
| **A7** | **Model IDs differ between surfaces.** | Sync default is `pyai-hear`; the jobs API default is **`pyai-hear-telephony`**. | `GET /v1/models` with the key. | Pin the model ID explicitly in every request and stamp it into `TranscriptRun.model` (§5.3). |
| **A8** | **Webhook signature format.** | Spec: `X-PyAI-Signature`, HMAC-SHA256 over `"<t>.<rawBody>"`. Not independently confirmed against a live delivery. | Register a webhook against a tunnel, verify one delivery. | For a 33h build, **poll instead** — no public URL needed, no signature code. See §6. |

**Everything below is designed to be correct under either A1 outcome.** The `Segment` type is the pivot: both the sync `verbose_json` shape and the jobs `result.segments` shape normalize into it losslessly.

---

## 1. Transcript representation — what the field actually agrees on

I read the primary schemas rather than blog summaries. Here is what each system emits.

### 1.1 OpenAI Whisper `verbose_json`

Source: [OpenAI API reference — audio](https://developers.openai.com/api/reference/resources/audio), and the SDK type definitions ([`transcription_verbose.py`](https://github.com/openai/openai-python/blob/main/src/openai/types/audio/transcription_verbose.py), [`transcription_segment.py`](https://github.com/openai/openai-python/blob/main/src/openai/types/audio/transcription_segment.py)).

```jsonc
{
  "task": "transcribe",
  "language": "english",
  "duration": 742.5,
  "text": "<full transcript>",
  "segments": [{                    // optional — timestamp_granularities[]=segment
    "id": 0,                        // int — "Unique identifier of the segment"
    "seek": 0,                      // int — "Seek offset of the segment"
    "start": 0.0,                   // float, seconds
    "end": 4.28,                    // float, seconds
    "text": "Hey, thanks for hopping on.",
    "tokens": [50364, 2425, ...],   // List[int]
    "temperature": 0.0,
    "avg_logprob": -0.28,           // "If lower than -1, consider the logprobs failed"
    "compression_ratio": 1.42,      // "If greater than 2.4, consider compression failed"
    "no_speech_prob": 0.008
  }],
  "words": [{                       // optional — timestamp_granularities[]=word
    "word": "Hey",
    "start": 0.0,
    "end": 0.22
  }],
  "usage": { "type": "duration", "seconds": 742.5 }
}
```

**Critical**: Whisper's word objects have **no `speaker` field and no confidence**. Whisper does not diarize. Every "Whisper with speakers" product bolts on a second model.

### 1.2 WhisperX

Source: [`whisperx/schema.py`](https://github.com/m-bain/whisperX/blob/main/whisperx/schema.py) (read directly — the README does not publish the JSON shape).

```python
SingleWordSegment      = {word: str, start: float, end: float, score: float}
SingleCharSegment      = {char: str, start: float, end: float, score: float}
SingleSegment          = {start: float, end: float, text: str, avg_logprob: NotRequired[float]}
SingleAlignedSegment   = {start, end, text, avg_logprob?, words: List[SingleWordSegment],
                          chars: Optional[List[SingleCharSegment]]}
TranscriptionResult        = {segments: List[SingleSegment], language: str}
AlignedTranscriptionResult = {segments: List[SingleAlignedSegment],
                              word_segments: List[SingleWordSegment]}
```

Two things worth stealing:

1. **`word_segments` as a flat top-level array** *in addition to* words nested inside segments. Same data, two access paths: flat for search/binary-search-by-time, nested for rendering. We adopt this (§5.2).
2. **Speaker is assigned per-word, then propagated**, via `whisperx.assign_word_speakers()` — diarization turns from pyannote are intersected against wav2vec2-aligned word timings. Speaker is *derived*, not native to ASR.

### 1.3 Deepgram

Sources: [Diarization](https://developers.deepgram.com/docs/diarization), [Utterances](https://developers.deepgram.com/docs/utterances), [Working with timestamps, utterances and diarization](https://deepgram.com/learn/working-with-timestamps-utterances-and-speaker-diarization-in-deepgram).

```jsonc
// results.channels[].alternatives[].words[]
{ "word": "hello", "start": 15.259043, "end": 15.338787,
  "confidence": 0.9721591, "speaker": 0, "speaker_confidence": 0.5853265,
  "punctuated_word": "Hello," }          // punctuated_word only with smart_format

// results.utterances[]  (requires utterances=true)
{ "start": 10.0713, "end": 11.6713, "confidence": 0.9994, "channel": 0,
  "transcript": "Life moves pretty fast.", "words": [...],
  "speaker": 0, "id": "35404fd9-12ed-4b58-a9a9-9eaf93475ef6" }
```

Deepgram is the most complete published model of the four. Note `speaker_confidence` as a **separate** field from word `confidence` — diarization uncertainty is modeled independently of ASR uncertainty. And note the utterance carries a **UUID `id`**, not an ordinal.

### 1.4 AssemblyAI

Source: [Transcript object reference](https://www.assemblyai.com/docs/api-reference/transcripts/get).

```jsonc
{
  "id": "<uuid>", "status": "completed", "text": "...",
  "audio_duration": 742, "confidence": 0.94, "language_code": "en",
  "words":      [{ "text": "...", "start": 1500, "end": 1740,   // MILLISECONDS
                   "confidence": 0.97, "speaker": "A" }],       // speaker is a STRING
  "utterances": [{ "start": 1500, "end": 11670, "confidence": 0.95,
                   "speaker": "A", "text": "...", "words": [...] }],
  "chapters":   [{ "gist": "...", "headline": "...", "summary": "...",
                   "start": 1500, "end": 240000 }],
  "entities":   [{ "entity_type": "...", "text": "...", "start": ..., "end": ... }],
  "auto_highlights_result": { "status": "...", "results": [...] }
}
```

**Two unit traps, both real:** AssemblyAI uses **integer milliseconds** while Whisper/WhisperX/Deepgram/PyAI use **float seconds**; and its `speaker` is a **string label** (`"A"`, `"B"`) while Deepgram's is an **integer**. PyAI's segment `speaker` is a `string` and `channel` is an `integer`.

Note also that `entities[].start`/`end` are **timestamps**, not character offsets — the whole industry overloads `start`/`end` for time. Our schema must never reuse those names for character positions. (See §5.1: we use `t_start`/`t_end` for time and `start_pos`/`end_pos` for characters.)

### 1.5 pyannote.audio

Diarization is a *separate* output stream that carries no text at all:

```python
for turn, _, speaker in diarization.itertracks(yield_label=True):
    # turn.start, turn.end (float seconds), speaker == "SPEAKER_00"
diarization.write_rttm(f)   # RTTM interchange format
```

Sources: [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1), [discussion #1341](https://github.com/pyannote/pyannote-audio/discussions/1341).

This is the structural point: **diarization is a list of (start, end, label) turns that must be *intersected* with ASR output.** Nobody's ASR produces speakers natively.

### 1.6 PyAI (our provider) — what the spec actually says

Read from `https://api.pyai.com/openapi.json` (v1.5.0) and [the conversation-intelligence guide](https://docs.pyai.com/guides/conversation-intelligence).

**Sync — `POST /v1/audio/transcriptions`** (Whisper-compatible, scope `hear:transcribe`):

- Request (multipart): `file` (required), `model` (default `pyai-hear`), `response_format` ∈ `json | text | verbose_json` (default `json`), `language`, `seed`, `temperature`.
- **No `diarize`. No `channel`. No `timestamp_granularities`.**
- Documented 200 response — the entire `Transcription` component schema:
  ```jsonc
  { "text": "string", "model": "string" }
  ```
  → **⚠️ A2**: `verbose_json` is accepted but its shape is not published.

**Async — `POST /v1/transcription/jobs`** (scope `transcribe:jobs`) — *this is the surface that diarizes*:

| Param | Type | Meaning (verbatim from spec) |
|---|---|---|
| `audio_url` / multipart `audio` | — | "Provide **exactly one** source" |
| `model` | string | default **`pyai-hear-telephony`** |
| `channel` | bool | "Dual-channel (stereo) diarization: transcribe each channel separately and label speakers per channel (**exact**)." |
| `diarize` | bool | "Single-track (mono) speaker diarization **via Sortformer**; words are aligned to speaker turns." |
| `numerals` | bool | "Format spoken numbers as digits." |
| `output_formats` | `[json\|srt\|vtt]` | default `["json"]` |
| `webhook_url` | uri | signed `X-PyAI-Signature` completion callback |
| `trace` | bool | PII scan+redact. **"Not supported together with `diarize`/`channel`."** |

Result shape (from `TranscriptionJob.result`):

```jsonc
{
  "job_id": "job_aZ09...", "status": "queued|running|completed|failed|cancelled",
  "created_at": 1723545600000, "updated_at": 1723545660000,   // Unix MS
  "result": {
    "text": "...",
    "speakers": 2,                  // integer count
    "audio_seconds": 742.5,
    "segments": [{
      "id": 0,                      // integer
      "start": 10.0713,             // number, seconds
      "end": 11.6713,
      "text": "Life moves pretty fast.",
      "speaker": "speaker_0",       // STRING — mono diarization
      "channel": 0                  // INTEGER — stereo path
    }],
    "words": [ {} ],                // ⚠️ A3 — items: {type: object}, NO properties declared
    "formats": { "srt": "<signed url>", "vtt": "<signed url>" }
  },
  "result_url": "<signed url>",     // ⚠️ A5 — used instead of inline for large results
  "error": "..."                    // on failed
}
```

The guide confirms the read in prose: *"A completed job carries a `result` with the full `text`, a `speakers` count, `audio_seconds`, diarized `segments` (each with `start`, `end`, `text`, and a `speaker` and/or `channel`), per-word timings, and a `formats` map."* And: *"Stereo telephony recordings (one party per channel) give the cleanest speaker split; model-based diarization covers mono."*

### 1.7 The common denominator

Strip the five systems down and **exactly one structure survives everywhere**:

```
segment := { t_start: seconds, t_end: seconds, text: string, speaker: label }
```

Everything else is optional enrichment:

| Field | Whisper | WhisperX | Deepgram | AssemblyAI | PyAI jobs |
|---|:--:|:--:|:--:|:--:|:--:|
| segment/utterance start,end,text | ✅ | ✅ | ✅ | ✅ | ✅ |
| speaker on segment | ❌ | ✅ (post-align) | ✅ int | ✅ str | ✅ str + int channel |
| word-level timings | ✅ (opt-in) | ✅ | ✅ | ✅ | ⚠️ A3 |
| speaker per word | ❌ | ✅ | ✅ | ✅ | ⚠️ A3 |
| per-word confidence | ❌ | ✅ `score` | ✅ | ✅ | ⚠️ A3 |
| segment quality signals | ✅ (3 of them) | ⚠️ `avg_logprob` only | ✅ confidence | ✅ confidence | ❌ |
| time units | float s | float s | float s | **int ms** | float s |

### 1.8 What granularity do we need for claim-level citation?

**Answer: segment is the citation unit; characters are the anchor; words are optional polish.**

The reasoning, in order:

1. **A claim is never a word.** "The buyer objected to the annual commitment" is evidenced by a *sentence or two*, spoken by one person, at one moment. That is a segment (or a short run of segments) — never a single word, and rarely the whole call. Segment granularity matches the semantic unit of a claim.
2. **But segment granularity alone is too coarse to highlight.** A 30-second segment cited for a 6-word objection makes the reader hunt. So the evidence must additionally carry **character offsets into that segment's text**, plus the verbatim quote.
3. **Word timings are for the player, not the citation.** Their real job is "click the quote → seek the audio to the exact millisecond." That is a *demo-quality* feature, not a correctness feature. If A3 turns out badly, we degrade to seeking to `segment.t_start` and lose nothing load-bearing.

So: **cite the segment, anchor with characters, seek with words.** Three tiers, degrading independently.

---

## 2. Citation and evidence linking — how to model "claim X is proven by span Y"

### 2.1 The single most important finding

**Google's LangExtract does not ask the model for character offsets. It asks for verbatim source text and then locates that text in the source, in code.**

From [`langextract/core/data.py`](https://github.com/google/langextract/blob/main/langextract/core/data.py):

```python
class AlignmentStatus(enum.Enum):
    MATCH_EXACT   = "match_exact"
    MATCH_GREATER = "match_greater"
    MATCH_LESSER  = "match_lesser"
    MATCH_FUZZY   = "match_fuzzy"

@dataclasses.dataclass
class CharInterval:
    start_pos: int | None = None   # "The starting position of the interval (inclusive)."
    end_pos:   int | None = None   # "The ending position of the interval (exclusive)."

@dataclasses.dataclass(init=False)
class Extraction:
    extraction_class: str                       # which extractor produced it
    extraction_text:  str                       # the verbatim span
    char_interval:    CharInterval | None = None
    alignment_status: AlignmentStatus | None = None
    extraction_index: int | None = None
    group_index:      int | None = None
    description:      str | None = None
    attributes:       dict[str, str | list[str]] | None = None
```

The resolver aligns exact-first, then fuzzy (`fuzzy_alignment_threshold=0.75`, LCS, `min_density=1/3`), and **leaves `char_interval = None` when it cannot align** — which makes unaligned extractions trivially filterable.

Why this matters more than anything else in this document: **an LLM asked for character offsets will confidently produce wrong integers.** An LLM asked to quote verbatim produces a string you can verify deterministically with `indexOf`. The verification is free — no second model call, no judge, no token cost. This converts our Iron Law from a prompt instruction into a code-enforced invariant.

### 2.2 Anthropic's Citations API — good model, wrong tool for us

[Citations](https://platform.claude.com/docs/en/build-with-claude/citations) returns, per cited text block:

```jsonc
{ "type": "char_location",
  "cited_text": "The grass is green.",   // NOT counted toward output tokens
  "document_index": 0,
  "document_title": "My Document",
  "start_char_index": 0,                 // 0-indexed
  "end_char_index": 20 }                 // exclusive
```

(Also `page_location` with `start_page_number`/`end_page_number` for PDFs, and `content_block_location` with `start_block_index`/`end_block_index` for custom content.)

Two properties are worth copying: **`cited_text` is extracted server-side and doesn't bill as output tokens**, and *"citations are guaranteed to contain valid pointers to the provided documents."* That is exactly the guarantee we want.

**But we cannot use it.** Verified against the Anthropic API reference: **citations are incompatible with `output_config.format` (structured outputs) — the combination returns a 400.** Our extractors are defined by an `output_schema`; structured output is the whole point. So citations-the-feature is off the table, and we implement citations-the-pattern ourselves via §2.1.

We do keep its **naming and index semantics**: `cited_text`, 0-indexed start, **exclusive** end. That matches LangExtract's `CharInterval` (inclusive start, exclusive end) and Python/JS slice semantics. One convention, no conversions.

### 2.3 W3C Web Annotation Data Model — the durability answer

Source: [Web Annotation Data Model](https://www.w3.org/TR/annotation-model/).

```jsonc
{ "type": "TextQuoteSelector",
  "exact": "anotation", "prefix": "this is an ", "suffix": " that has some" }

{ "type": "TextPositionSelector", "start": 412, "end": 795 }
```

Spec semantics: for `TextPositionSelector`, *"The first character in the full text is character position 0, and the character is included within the segment"* and for `end`, *"the character is not included within the segment"* — inclusive start, exclusive end, counted in **Unicode code points**. For `TextQuoteSelector`, `prefix`/`suffix` exist *"to distinguish between multiple copies of the same sequence of characters."*

The load-bearing insight from 20 years of web annotation practice: **position selectors are fragile under edits; quote selectors are the durable anchor. Write both.**

This maps *exactly* onto our re-processing requirement (§5.5). When a call is re-transcribed with a better model, every character offset shifts — but the quote plus a little surrounding context re-anchors. So a stored Evidence record carries **quote + prefix + suffix + offsets**, and offsets are treated as a cache that can be recomputed, never as the source of truth.

This is also why "just store `segment_id` + offsets" is insufficient: a new transcript run resegments, so `segment_id` itself is not stable across runs.

### 2.4 LlamaIndex CitationQueryEngine — what *not* to copy

[`CitationQueryEngine`](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/query_engine/citation_query_engine.py) splits retrieved nodes into citation chunks (`citation_chunk_size=512`, `citation_chunk_overlap=20`) and has the LLM emit `[1]`-style markers referencing those chunks.

The idea worth taking: **the citation unit is a pre-assigned, numbered chunk the model can only point at, not invent.** Our transcript segments already are that — they're pre-numbered by ingest, and the model sees them numbered.

The idea to reject: **numeric-marker-only citation.** `[3]` proves the model picked a number, not that segment 3 says what the claim says. Requiring the verbatim quote *in addition* makes the citation falsifiable. We require both: the model names a `segment_id` **and** quotes verbatim; we verify the quote independently, and if the quote lands in a *different* segment than the one named, the quote wins and we correct the id.

### 2.5 The minimal robust evidence schema

The question posed was whether `claim {text, type, evidence: [{segment_id, char_start, char_end, quote}]}` suffices. **Close, but it is missing four things**, each of which earns its place:

| Add | Why |
|---|---|
| `alignment_status` | Distinguishes a verified exact match from a fuzzy rescue from an unverified guess. Without it, "we couldn't find this quote" and "we found it exactly" look identical downstream. (LangExtract's core idea.) |
| `prefix` / `suffix` | Re-anchoring after re-transcription (§2.3). Also disambiguates a quote that occurs more than once — a real problem on calls, where "yeah" and "right, okay" repeat constantly. |
| `t_start` / `t_end` | The audio-seek affordance and the human-readable timestamp. Denormalized from the segment for export self-containment. |
| `speaker` | A claim's meaning inverts depending on who said it. "We don't have budget until Q3" from the buyer is an objection; from the rep it's a mistake. Evidence without a speaker is not evidence. |

And one thing to **remove**: `claim.text` alone is under-specified. A claim needs `type` (which extractor), plus arbitrary extractor-defined `attributes` (LangExtract's pattern) so a new extractor can add fields without a schema migration.

---

## 3. Storage, and the share link

*Every number in this section was measured rather than estimated — FTS5 availability and query latency (§3.1), export payload size (§3.2), and real-Chrome fragment-URL limits (§3.2). Schemas from three comparable local-first projects were read from source, not from summaries.*

### 3.1 The decision: SQLite as the index, JSON as the record

Neither pure-SQLite nor pure-flat-files is right. Use both, with a clear rule about which is authoritative:

```
data/
  calls/
    call_01J8.../
      audio.wav                  # original upload (or a pointer if hosted)
      transcript.001.json        # TranscriptRun 1 — immutable once written
      transcript.002.json        # TranscriptRun 2 — a better model, later
      extraction.001.json        # ExtractionRun 1 → transcript 001
      extraction.002.json        # ExtractionRun 2 → transcript 002
      call.json                  # Call metadata
  index.db                       # SQLite — derived, disposable, rebuildable
```

**The JSON files on disk are the source of truth. `index.db` is a derived cache that can be deleted and rebuilt from the files at any time.**

This single rule buys more than it costs:

- **Re-processing is append-only.** A new run is a new numbered file. Nothing is mutated, nothing is lost, old notes keep working (§5.5). This is the hardest requirement in the brief and files solve it almost for free.
- **Diffable and git-friendly.** A reviewer can see exactly what changed when the model changed. In a demo, `git diff extraction.001.json extraction.002.json` is a genuinely compelling 20 seconds.
- **Debuggable at 3am on hour 26.** `jq` beats a SQL prompt when you are tired and the schema is 4 hours old.
- **Export is nearly free** — the export bundle *is* a JSON file we already have (§5.7).
- **SQLite still does the work it's good at**: listing calls, full-text search across transcripts (FTS5), "which calls mention this competitor", joining claims across calls. All of which are rebuildable projections.

**Rebuild command must exist from hour 3**: `opengong reindex` walks `data/calls/**/*.json` and repopulates `index.db`. Once that exists, the DB can never be a liability — a corrupt or schema-drifted index is one command away from correct. This is the cheapest possible insurance against a mid-hackathon schema change, which *will* happen.

**Node's built-in `node:sqlite` is the right dependency choice** (zero install, `DatabaseSync`), consistent with the minimal-dependency idiom.

**FTS5 availability — verified, not assumed.** Run on this machine:

```
$ node --version
v24.15.0
$ node -e '<create fts5 table, insert, MATCH query>'
FTS5 OK -> [{"x":"we already looked at the annual commitment","call_id":"call_1"}]
sqlite: 3.51.3
```

So `node:sqlite` ships SQLite **3.51.3 with FTS5 compiled in**, and `CREATE VIRTUAL TABLE … USING fts5(...)`, `INSERT`, and `MATCH` all work with zero dependencies. Two caveats to carry:

- **Node 22 prints `ExperimentalWarning: SQLite is an experimental feature` on every run; Node 24 does not.** (`node:sqlite` is Stability 1.1 on 22/24, 1.2 RC on 25+; the CLI flag was dropped in v22.13.0, so no flag is needed on either.) Independently confirmed on v22.23.2 and v24.15.0 — both ship SQLite 3.51.3 with `ENABLE_FTS5`. **Demo on Node 24, or pass `--no-warnings`** — a stderr warning scrolling past during a demo reads as unfinished.
- `serialize()` / `deserialize()` exist on Node 25 but **not on Node 22**. Don't build the share-bundle path on them if you're claiming Node ≥ 22.
- Use **single quotes** for SQL string literals. Double quotes are parsed as identifiers and produce the misleading `no such column: "..."` error (this bit during verification and will bite again at hour 20).
- The FTS5 guarantee holds for **official nodejs.org/nvm builds**, which statically link the bundled SQLite. Some distro packages build with `--shared-sqlite` against the system libsqlite3 and *could* differ, so add a one-line startup assertion — it turns a mystery failure into a clear message:
  ```js
  const ok = db.prepare(
    "select count(*) n from pragma_compile_options() where compile_options='ENABLE_FTS5'"
  ).get().n;
  if (!ok) throw new Error('This Node build lacks FTS5 — use the official nodejs.org build.');
  ```

**Scale is a non-issue at our size.** Measured at **165,000 segments** (300 calls × 550 segments ≈ 300 hours of audio): bulk insert in one transaction **567 ms**, FTS5 index build **563 ms**, database file **33.9 MB**, and MATCH queries — phrase, `NEAR`, prefix, boolean — returning in **1.8–8.6 ms**. Our target is "hundreds of calls," so both storage options are fast enough and the decision rests entirely on the four axes above, not on performance.

`better-sqlite3` is the safety net: near-identical API, installs prebuilt in ~1 s, ships a newer SQLite. Keep DB access behind a ~20-line module and swapping is a 5-minute change.

Because the DB is disposable, the fallback stays trivial regardless: if FTS5 were unavailable, search degrades to an in-memory scan over the JSON files. For a few hundred calls that is fast enough that nobody in a demo would notice.

### 3.2 Share links — ranked by demo impact ÷ implementation cost

This is the feature most likely to be cut for time, so it is designed in tiers where **each tier ships independently** and tier 1 alone is a complete demo.

| Tier | Approach | Cost | Demo impact | Verdict |
|---|---|---|---|---|
| **1** | **Self-contained static HTML.** One `.html` file with the ExportBundle inlined in `<script type="application/json" id="og-data">`, and ~200 lines of vanilla JS/CSS that render notes, claims, and click-to-highlight evidence. No server, no build step, no network. | ~2h | **Very high.** "Here's the file, open it, click a claim, watch it highlight the exact transcript span." Works over email, Slack, AirDrop, offline, forever. | **Build this. It is the deliverable.** |
| **2** | **Fragment URL for the notes + cited segments only** (`#<deflate-raw + base64url>`), decompressed client-side with `DecompressionStream`. Same viewer page as tier 1, data from `location.hash` instead of inlined. | +1h | **High, and the best privacy story in the build**: paste a link into Slack, colleague clicks, notes render with working citations — and the server logs show nothing, because **fragments are never sent to the server** ([MDN](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)). | **Build second** — with the payload rule below. |
| **3** | **Publish tier-1 file to a static host.** `netlify deploy --allow-anonymous` — **no account, one command**, real URL, claimable within 1 hour. | +20min | High — turns a file into a link with one command and zero credentials. | Build if 1 and 2 both land. Pure addition; no data-model change. |
| **4** | Gist-style API upload as a store. | — | — | **Cannot be built. Anonymous gists were removed 2018-03-19** ([GitHub deprecation notice](https://github.blog/news-insights/product-news/deprecation-notice-removing-anonymous-gist-creation/)); creating one now needs a signed-in account and the `gist` OAuth scope, so a static page would have to ship a scrapeable token. |
| **5** | Signed short-lived links from a tiny server. | +3h | Low for a demo, and a local-first tool whose share feature needs a server undercuts its own pitch. | **Skip** for the hackathon; note it as the obvious production path. |

**I had tier 2 wrong, and the correction matters.** My first pass dismissed fragment URLs on the grounds that "practical URL length limits bite well before a 60-minute transcript fits." Tested in real Chrome 150, that is false: `history.replaceState` accepted fragments at 8 K, 32 K, 100 K, 1 M, and 2 M chars, and a **29,487-char fragment carrying a full 63-minute transcript survived a real navigation and decompressed correctly in-page with zero libraries**. Chrome's documented ceiling is 2 MB; the widely-repeated "32 kB" figure is the *omnibox display* cap (`kMaxURLDisplayChars`), not a navigation limit.

**The real constraint is paste targets, not browsers.** [Notion caps any URL at 2,000 characters](https://developers.notion.com/reference/request-limits) — hard and documented. So a 29.5 K-char link works perfectly in a browser and then **silently dies when pasted into a Notion doc**. That is a bug report, not a feature.

Which is exactly why the payload split works out:

| Payload | base64url(deflate-raw) | Fits Notion's 2,000 cap? |
|---|---:|:--:|
| Full transcript, verbose JSON | 35,476 chars | ❌ |
| Full transcript, columnar `[startMs, durMs, spkIdx, text]` | 29,528 chars | ❌ |
| **Notes + only the cited segments** | **1,264 chars** | ✅ |

**So the rule is: the fragment carries the claims and their evidence, never the full transcript.** That is precisely what this product is *about* — every claim with the span that proves it — and it is the part a colleague reading your notes actually needs. Ship a threshold: under ~1,500 chars use the fragment; above it, fall back to the tier-1 file.

Two implementation notes, both verified:

- Use **`deflate-raw`**, not brotli. `CompressionStream('deflate-raw')` is available in Chrome 103+, Firefox 113+, Safari 16.4+, and Node 20.12+. Brotli exists in Node 22.20+ but **in no browser** — so the browser could not decode what you wrote. (This is the same encoding [mermaid.live](https://github.com/mermaid-js/mermaid-live-editor/blob/develop/src/lib/util/serde.ts) and [kroki.io](https://docs.kroki.io/kroki/setup/encode-diagram/) independently converged on.)
- When inlining JSON in tier 1, **escape `<` as `<`**. A transcript containing the literal string `</script>` will otherwise terminate the tag and break the page — and on a sales call, quoted HTML is not far-fetched.

**Sizing — measured, not estimated.** I synthesized a realistic 60-minute two-party call (155 wpm → 9,300 words, 417 segments, 40 claims each with quote + prefix + suffix + offsets) and serialized the actual `ExportBundle`:

| Payload | Raw | gzipped |
|---|---:|---:|
| transcript text alone | 47 KB | — |
| **bundle without `words[]`** | **189 KB** | **18 KB** |
| bundle with `words[]` | 1,457 KB | 159 KB |

So the tier-1 share file is **~204 KB** (189 KB bundle + ~15 KB inlined JS/CSS) — trivially emailable, instant to open, no network.

**The measurement changed a default.** I expected word-level timings to roughly triple the payload; they actually inflate it **7.7×** (189 KB → 1,457 KB), because every word carries text, two floats, speaker, confidence, a segment back-pointer, and two character offsets — ~150 bytes of JSON to describe a 4-character word. That is decisive: `include_words` defaults to **false** in the export (§5.7), and the share page seeks to `segment.t_start` rather than word-exact. Word-exact seeking becomes an opt-in flag for a single-call deep-dive, never the default for a shared file.

**The share file must be self-verifying.** The bundle embeds `transcript_run.model`, `extraction_run.model`, and each claim's `alignment_status`. The rendered page shows a small provenance footer: which models, when, and how many claims were dropped for failing evidence alignment. A share link that quietly hides its dropped claims is exactly the Gong-style opacity we are supposedly killing.

---

## 4. Extensibility — the extractor registry

### 4.1 What the best small projects actually do

**ESLint (flat config).** A rule is `{meta, create}`; `meta.schema` is JSON Schema that validates the rule's **options**. A plugin is a plain object `{meta, rules, configs}`, and `eslint.config.js` does `plugins: {example: examplePlugin}`, `rules: {"example/rule-name": ["error", {...}]}`. Discovery is **pure object lookup** — flat config deliberately abandoned magic `eslint-plugin-*` resolution. ([Custom rules](https://eslint.org/docs/latest/extend/custom-rules), [Plugins](https://eslint.org/docs/latest/extend/plugins))

> Transferable: the `{name → definition}` map; `additionalProperties: false` as house style; and the discipline of **separating the schema that validates the extractor *file* from the schema that validates the model's *output*.** Conflating those two is the easy mistake.

**Fastify.** `register()` creates an encapsulated scope; `fastify-plugin` breaks encapsulation via `Symbol.for('skip-override')`; `decorate(name, fn, ['dep1','dep2'])` declares dependencies, and — the line worth stealing verbatim — *"the dependency check occurs **before the server instance boots**, not during runtime."* ([Plugins](https://fastify.dev/docs/latest/Reference/Plugins/), [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/))

> Transferable: **all extractor validation happens at load, before any audio is processed.** A malformed extractor fails `opengong start`, not call #400 at 2am during the demo.

Also from Fastify: `addSchema({$id, ...})` + `$ref` to share one schema fragment across many routes. That is precisely how we avoid re-declaring the evidence schema in every extractor file (§4.3). And its Ajv baseline (`removeAdditional`, `allErrors: false`) plus `attachValidation: true` — record the failure, keep going — is the right posture for one failing extractor among six.

**@fastify/autoload** is the closest real analogue to directory-based discovery: scan a directory, `await import(pathToFileURL(file).href)`, take `content.default || content`, register it.

**promptfoo.** Assertions are `{type, value, threshold, weight, metric}` dispatched on the `type` string, with a `not-` prefix negating any type. File-backed assertions load via `value: file://path/to/script.js:exportName`, and the exported function returns `boolean | number | GradingResult` where `GradingResult = {pass, score, reason, componentResults?}`. ([Assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/), [JavaScript assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/))

> Transferable: the `file://path.js:exportName` convention is a compact, dependency-free way to let declarative config point at executable code. We adopt it *only* as an optional escape hatch (§4.5).

**LangExtract / BAML.** LangExtract's declarative unit is prompt + few-shot examples, with `max_char_buffer` (chunking) and `extraction_passes` (multi-pass recall) — both directly relevant to long call transcripts. [BAML](https://docs.boundaryml.com/guide/introduction/what-is-baml) colocates schema and prompt in one declarative file and codegens a typed client — the right *shape*, wrong *cost* for 33 hours. **Take the shape, skip the compiler.**

### 4.2 Structured output — the mechanism the `output_schema` drives

**Anthropic** (recommended path here):

```jsonc
{ "model": "claude-opus-5", "max_tokens": 16000,
  "output_config": { "format": { "type": "json_schema", "schema": { /* ... */ } } } }
```

Supported subset: basic types, `enum`, `const`, `anyOf`, `allOf`, `$ref`/`$defs`, string formats, and `additionalProperties: false` **required on every object**. **Not** supported: recursive schemas, numeric constraints (`minimum`/`maximum`/`multipleOf`), string constraints (`minLength`/`maxLength`), complex array constraints. First request with a new schema pays a one-time compile cost, then a 24-hour schema cache. Also available: `strict: true` as a **top-level field on a tool definition** (not on `tool_choice`).

**OpenAI-compatible** (`json_schema` strict mode): every property must appear in `required`; `additionalProperties: false` mandatory; optional fields emulated via `{"type": ["string","null"]}`; **unsupported**: `allOf`, `not`, `dependentRequired`, `dependentSchemas`, `if`/`then`/`else`.

> **Write every extractor's `output_schema` to the intersection**: all-required, `additionalProperties: false` everywhere, no `allOf`/`if`/`not` (OpenAI), no numeric/string constraints (Anthropic). A ~60-line portability linter enforces this at load (§4.4) and means an extractor written on day one runs on either provider unchanged.

**And the hard constraint that shapes our whole evidence design:** on Anthropic, **structured outputs are incompatible with the citations feature — the pair returns 400.** We are using structured outputs, therefore we cannot use native citations, therefore we align quotes ourselves (§2.1). This is not a preference; it is forced.

### 4.3 The registry: one declarative JSON file per extractor

```jsonc
// extractors/objections.json
{
  "$schema": "../schemas/extractor.schema.json",
  "name": "objections",
  "version": 1,
  "title": "Buyer objections",
  "description": "Concerns the buyer raised that stand between them and a yes.",
  "enabled": true,
  "model": { "provider": "anthropic", "id": "claude-opus-5", "effort": "medium" },
  "scope": "whole_call",              // whole_call | per_chunk
  "prompt": "Identify every objection the buyer raises. For each, quote the buyer's exact words verbatim from the transcript — copy the characters, do not paraphrase, do not clean up filler words.",
  "evidence_required": true,
  "output_schema": {
    "type": "object", "additionalProperties": false, "required": ["items"],
    "properties": {
      "items": { "type": "array", "items": {
        "type": "object", "additionalProperties": false,
        "required": ["claim", "category", "evidence"],
        "properties": {
          "claim":    { "type": "string" },
          "category": { "type": "string",
                        "enum": ["price","timing","authority","competitor","fit","trust"] },
          "evidence": { "$ref": "opengong://evidence" }
        }
      }}
    }
  }
}
```

The evidence fragment is registered **once** and `$ref`'d by every extractor, so evidence can neither be forgotten nor defined inconsistently:

```jsonc
// schemas/evidence.json   →  $id: "opengong://evidence"
{
  "$id": "opengong://evidence",
  "type": "object", "additionalProperties": false,
  "required": ["quote", "segment_id"],
  "properties": {
    "quote":      { "type": "string" },   // VERBATIM span copied from the transcript
    "segment_id": { "type": "integer" }   // which numbered segment it came from
  }
}
```

Note what the **model** is asked for: only `quote` and `segment_id`. It is never asked for character offsets, timestamps, speaker, or alignment status — **every one of those is computed by us** (§4.6). The smaller the model's evidence surface, the less there is to hallucinate.

Adding a new extractor — pricing mentions, competitor mentions, next steps, buying-intent signals — is **adding one JSON file**. No code, no rebuild, no rewrite. That is the extensibility requirement, met literally.

### 4.4 Load: discover → validate → freeze, all before any audio

```js
import { readdir, readFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

export async function loadExtractors(dir) {
  const files = (await readdir(dir)).filter(f => extname(f) === '.json');
  const registry = new Map();
  for (const f of files) {
    const def = JSON.parse(await readFile(join(dir, f), 'utf8'));
    if (def.name !== basename(f, '.json'))
      throw new Error(`${f}: "name" must match the filename`);
    if (registry.has(def.name))
      throw new Error(`duplicate extractor name: ${def.name}`);
    const errors = [
      ...validateExtractorDef(def),        // meta-schema: required fields, types
      ...lintOutputSchemaPortability(def), // the Anthropic ∩ OpenAI intersection
      ...(def.evidence_required ? lintEvidenceReachable(def) : []),
    ];
    if (errors.length) throw new Error(`${f}: ${errors.join('; ')}`);
    registry.set(def.name, Object.freeze(def));
  }
  return registry;
}
```

`lintEvidenceReachable` is the structural teeth behind the Iron Law: it walks `output_schema` and asserts that **every object reachable from the root that represents a claim carries an `evidence` `$ref`**. An extractor cannot declare `evidence_required: true` and then quietly define a claim shape with no evidence field — that is a startup error, not a silent runtime gap.

Use `fs.readdir`, not `fs.glob`. `fs.glob` exists in Node 22.2+ but is Stability 1 (experimental) and prints warnings; a flat `extractors/*.json` directory does not need it. Hand-write the ~80 lines of validation rather than pulling in Ajv — we only validate schemas we authored, against a subset we chose, not arbitrary JSON Schema.

### 4.5 Execute: fan out, isolate failures

```js
const results = await Promise.allSettled(
  [...registry.values()].filter(d => d.enabled)
                        .map(def => runExtractor(def, transcript))
);
```

One extractor failing — a refusal, a timeout, a malformed response — must never kill the run. Each extractor's outcome is recorded independently with `status: ok | refused | failed | dropped_all` (Fastify's `attachValidation` philosophy). A call with five good extractions and one failure is a *useful* call, and the UI says which one failed and why.

**Escape hatch (optional, only if needed):** adopt promptfoo's convention for a `"post_process": "file://./aggregate.js:dedupe"` key. Keeps the default path pure data while letting one extractor do custom aggregation — without turning every extractor into code.

### 4.6 The evidence gate — where the Iron Law is actually enforced

The schema forces the model to *emit* a quote. It cannot force the quote to be *real*. This function is the difference:

```js
function groundEvidence(parsed, transcript, def) {
  const kept = [], dropped = [];
  for (const item of parsed.items ?? []) {
    const g = anchor(item.evidence.quote, transcript, item.evidence.segment_id);
    if (g) {
      item.evidence = { ...item.evidence, ...g };   // adds offsets, times, speaker, status
      kept.push(item);
    } else if (def.evidence_required) {
      dropped.push({ item, reason: 'evidence_not_found_in_transcript' });
    } else {
      item.evidence = { ...item.evidence, alignment_status: 'unaligned' };
      kept.push(item);
    }
  }
  return { items: kept, dropped };
}
```

`anchor()` runs a **three-pass ladder**, each pass strictly cheaper to trust than the last:

1. **Exact** — `segment.text.indexOf(quote)`. Try the model's named `segment_id` first, then the whole transcript. → `match_exact`.
2. **Normalized** — collapse whitespace, unify quote/apostrophe characters, casefold, and strip filler tokens; match on the normalized string, then map the hit back to raw offsets. Catches "smart quotes" and the model helpfully removing an "um". → `match_normalized`.
3. **Fuzzy** — token LCS over the segment window with LangExtract's defaults (`threshold 0.75`, `min_density 1/3`). → `match_fuzzy`.

**Ship pass 1 first and ship it alone if time is tight.** An unaligned claim being *dropped* is the correct default behavior and needs no fuzzy matching to be correct. Passes 2 and 3 recover recall; pass 1 delivers the guarantee.

On success `anchor()` returns the fields the model was never trusted with:

```js
{ segment_id, start_pos, end_pos, quote, prefix, suffix,
  t_start, t_end, speaker, alignment_status }
```

Note it also **corrects `segment_id`** when the quote is found in a different segment than the model named. The quote is the evidence; the id is the model's guess about the quote.

---

## 5. The recommended schema

TypeScript-style types. Times are **float seconds** throughout (converted at ingest); character positions are **inclusive start / exclusive end**, counted in Unicode code points, matching W3C `TextPositionSelector`, LangExtract `CharInterval`, and Anthropic `char_location`. Timestamps are **Unix milliseconds** (matching PyAI's `created_at`/`updated_at`).

### 5.1 Naming rules (adopted deliberately, to avoid the industry's traps)

- **`t_start` / `t_end`** always mean *time in seconds*. Never `start`/`end` — §1.4 showed four vendors overloading those names for time while a fifth (and every citation system) uses them for characters.
- **`start_pos` / `end_pos`** always mean *character offsets*. Borrowed from LangExtract verbatim so an importer/exporter is free.
- **Vendor time units are converted exactly once**, at ingest. AssemblyAI-style integer ms never reaches the core.
- **Speaker labels are always strings.** Deepgram's integers and PyAI's channel integers are stringified at ingest (`"ch0"`, `"speaker_0"`).

### 5.2 Call, Transcript, Segment, Word, Speaker

```ts
type Id = string;              // ULID-ish, sortable, e.g. "call_01J8XZ..."
type Seconds = number;         // float
type UnixMs = number;          // integer

interface Call {
  id: Id;
  created_at: UnixMs;
  title: string | null;
  source: {
    kind: 'upload' | 'url' | 'import';
    filename: string | null;
    audio_path: string | null;      // relative to the call directory
    audio_url: string | null;
    duration_s: Seconds | null;
    sha256: string | null;          // dedupe + provenance; cheap and worth it
  };
  participants: Participant[];      // human-assigned; see Speaker below
  metadata: Record<string, string>; // deal id, account, rep — free-form, never load-bearing
  active_transcript_run: Id | null; // which run the UI shows by default
  active_extraction_run: Id | null;
}

interface Participant {
  speaker: SpeakerLabel;            // links to Speaker.label
  name: string | null;
  role: 'rep' | 'buyer' | 'unknown';
}

// ── Transcript ──────────────────────────────────────────────────────────────
// A TranscriptRun is IMMUTABLE once written. Re-transcribing creates a new one.

interface TranscriptRun {
  id: Id;                           // "trun_01J8..."
  call_id: Id;
  seq: number;                      // 1, 2, 3... → transcript.001.json
  created_at: UnixMs;

  provider: 'pyai' | 'openai' | 'whisperx' | 'deepgram' | 'assemblyai' | 'manual';
  model: string;                    // EXACT id: "pyai-hear-telephony" (⚠️ A7)
  api_surface: 'sync' | 'jobs';     // ⚠️ A1 — which endpoint produced this
  params: Record<string, unknown>;  // {diarize:true, numerals:true} — full replay recipe
  provider_job_id: string | null;   // PyAI job_id, for support/debugging
  schema_version: 1;

  language: string;                 // "en"
  duration_s: Seconds;
  speaker_count: number | null;     // PyAI result.speakers
  diarization: 'none' | 'channel' | 'model';   // channel = exact; model = Sortformer

  text: string;                     // FULL transcript, the canonical citation surface
  segments: Segment[];
  words: Word[];                    // FLAT, sorted by t_start (WhisperX word_segments)
  speakers: Speaker[];

  quality: {
    // Present only if the provider gives them (Whisper does; PyAI does not).
    mean_avg_logprob: number | null;
    max_no_speech_prob: number | null;
    warnings: string[];             // e.g. "channel:true returned 1 speaker — likely mono"
  };

  raw_ref: string | null;           // path to the untouched provider payload
}
```

> **Design note — `text` is the canonical citation surface.** `TranscriptRun.text` is built **by us** at ingest by joining segments with a known separator, not copied from the provider's `text` field. Reason: character offsets must be computable and reproducible. If we cite into a provider-supplied `text` whose relationship to `segments` is unspecified, our offsets are unverifiable. We control the join, so we control the offsets. The provider's own `text` is kept in `raw_ref` only.

```ts
type SpeakerLabel = string;         // ALWAYS a string: "speaker_0", "ch0", "A"

interface Segment {
  id: number;                       // OUR ordinal, 0-based, reassigned at ingest (⚠️ A4)
  provider_id: string | number | null;  // whatever the vendor called it
  t_start: Seconds;
  t_end: Seconds;
  text: string;
  speaker: SpeakerLabel | null;
  channel: number | null;           // PyAI stereo path
  start_pos: number;                // offset of this segment within TranscriptRun.text
  end_pos: number;                  // exclusive
  confidence: number | null;
  word_range: [number, number] | null;  // [i, j) into TranscriptRun.words
}

interface Word {
  text: string;
  t_start: Seconds;
  t_end: Seconds;
  speaker: SpeakerLabel | null;     // ⚠️ A3 — may be absent from PyAI
  confidence: number | null;
  segment_id: number;               // back-pointer
  start_pos: number;                // offset within TranscriptRun.text
  end_pos: number;
}

interface Speaker {
  label: SpeakerLabel;              // "speaker_0" | "ch0"
  display_name: string | null;      // human-assigned later
  role: 'rep' | 'buyer' | 'unknown';
  talk_time_s: Seconds;             // computed — the talk-ratio metric falls out free
  segment_count: number;
  source: 'channel' | 'model' | 'manual';
}
```

**Why `start_pos`/`end_pos` on both Segment and Word:** it makes anchoring O(log n) (binary search a character offset → the segment/word containing it) and makes highlighting in the export a pure string-slice operation with no re-derivation. It costs two integers per row and removes an entire class of off-by-one bugs.

**`words` may be empty.** Everything load-bearing works without it. This is deliberate insurance against ⚠️ A3.

### 5.3 ExtractionRun, Claim, Evidence

```ts
interface ExtractionRun {
  id: Id;                           // "erun_01J8..."
  call_id: Id;
  transcript_run_id: Id;            // ← THE critical link: which transcript was read
  transcript_hash: string;          // sha256 of TranscriptRun.text — free staleness check
  seq: number;
  created_at: UnixMs;
  schema_version: 1;

  extractors: ExtractorStamp[];     // exactly what ran, at what version
  claims: Claim[];
  dropped: DroppedClaim[];          // NOT thrown away — see below
  notes: NoteDoc | null;            // the assembled human-readable note

  stats: {
    claims_kept: number;
    claims_dropped: number;
    by_alignment: Record<AlignmentStatus, number>;
    duration_ms: number;
    tokens: { input: number; output: number } | null;
  };
}

interface ExtractorStamp {
  name: string;                     // "objections"
  version: number;                  // extractor file version
  definition_sha256: string;        // hash of the extractor JSON — catches silent edits
  model: { provider: string; id: string; effort?: string };
  status: 'ok' | 'refused' | 'failed' | 'skipped';
  error: string | null;
  claim_count: number;
}

type AlignmentStatus =
  | 'match_exact'        // indexOf hit — the gold standard
  | 'match_normalized'   // matched after whitespace/quote/filler normalization
  | 'match_fuzzy'        // token-LCS above threshold
  | 'unaligned';         // only possible when evidence_required === false

interface Claim {
  id: Id;                           // "clm_01J8..."
  extractor: string;                // "objections" — the dispatch key
  type: string;                     // extractor-defined subtype: "price", "timing"
  text: string;                     // the claim in the system's words
  attributes: Record<string, string | string[] | number | boolean>;  // LangExtract pattern
  evidence: Evidence[];             // ≥1 when the extractor is evidence_required
  confidence: number | null;        // model-reported, if the schema asked for it
  order: number;                    // stable render order
}

interface Evidence {
  // ── what the MODEL supplied (never trusted, always verified) ──
  quote: string;                    // VERBATIM span (Anthropic's `cited_text`)
  claimed_segment_id: number | null;// the model's guess

  // ── what WE computed (authoritative) ──
  segment_id: number;               // corrected: the segment the quote actually lands in
  start_pos: number;                // into TranscriptRun.text — inclusive
  end_pos: number;                  //                          exclusive
  prefix: string;                   // W3C TextQuoteSelector — ~32 chars before
  suffix: string;                   //                         ~32 chars after
  t_start: Seconds;                 // denormalized for export self-containment
  t_end: Seconds;
  speaker: SpeakerLabel | null;     // WHO said it — inverts the meaning of a claim
  alignment_status: AlignmentStatus;
}

interface DroppedClaim {
  extractor: string;
  raw: unknown;                     // the model's original object, untouched
  reason: 'evidence_not_found_in_transcript'
        | 'schema_validation_failed'
        | 'empty_quote';
  quote: string | null;
}
```

> **Keep the dropped claims.** They are the single best debugging artifact in the system — they show precisely where the model fabricated, and they make the honesty of the pipeline demonstrable rather than asserted. The share page shows the count; the JSON keeps the detail. Throwing them away would make the Iron Law unfalsifiable.

### 5.4 Notes

```ts
interface NoteDoc {
  sections: NoteSection[];
  generated_at: UnixMs;
}

interface NoteSection {
  key: string;                      // "summary" | "objections" | "next_steps"
  title: string;
  extractor: string | null;
  blocks: NoteBlock[];
}

interface NoteBlock {
  text: string;
  claim_ids: Id[];                  // EVERY block traces to claims → evidence → transcript
}
```

The invariant that makes "notes where every claim cites the transcript" true rather than decorative: **a `NoteBlock` with an empty `claim_ids` cannot be rendered as a finding.** Prose glue (headings, connectives) is allowed to have no claims — but it is also not allowed to assert anything. Enforce this in the note assembler, not in a prompt.

### 5.5 Versioning and re-processing — the design in one picture

```
Call ──┬── TranscriptRun seq=1 (pyai-hear-telephony, diarize)
       │        └── ExtractionRun seq=1 → transcript_run_id = trun_1  ← old notes
       │        └── ExtractionRun seq=2 → transcript_run_id = trun_1  ← better prompts,
       │                                                                 same audio read
       └── TranscriptRun seq=2 (a better model, 3 months later)
                └── ExtractionRun seq=3 → transcript_run_id = trun_2  ← full re-run
```

Five rules, all of which fall out of the types above:

1. **Runs are immutable and append-only.** Nothing is ever updated in place. `active_*_run` on the `Call` is the only mutable pointer, and it is a *view preference*, not data.
2. **Every claim reaches its transcript through exactly one `transcript_run_id`.** There is no ambiguity about which text a citation cites. This is why `ExtractionRun` — not `Claim` — holds the link: one indirection, impossible to get inconsistent.
3. **Everything that could change the output is stamped**: provider, model id, api_surface, params, extractor version, and `definition_sha256`. If two runs differ, you can always say *why*. The `definition_sha256` specifically catches the silent case — someone edits `objections.json` without bumping `version`.
4. **`schema_version` on both run types.** When our own schema changes at hour 20 (it will), old files stay readable and a migration is a pure function `v1 → v2` over files on disk.
5. **Re-anchoring, not re-pointing.** To carry a claim from run 1 onto run 2's transcript, re-run `anchor()` using the stored `quote` + `prefix` + `suffix` against the *new* text. Offsets are recomputed; the quote is the identity. This is exactly the W3C durable-anchor pattern (§2.3), and it is why prefix/suffix are stored rather than derived on demand.

Rule 5 is the payoff: **a call re-transcribed with a better model does not orphan its old notes.** They re-anchor, and the ones that fail to re-anchor are surfaced as needing review — which is honest, and which no closed tool does.

**Prior art says this is the part everyone gets wrong — which makes it the part worth getting right.** Two of the three comparable local-first projects have no versioning at all:

| Project | How it stores derived output | Consequence |
|---|---|---|
| [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) (`backend/app/db.py`) | Summary as a `json.dumps()` blob in `summary_processes.result`, **primary-keyed on `meeting_id`** | **Re-running overwrites the previous summary.** No history, no diff, no rollback. Also: two competing transcript representations (`transcripts` *and* `transcript_chunks`), and zero indexes — not even on `transcripts.meeting_id`. |
| [screenpipe](https://github.com/screenpipe/screenpipe) (`crates/screenpipe-db/src/migrations/`) | Re-processing is `DELETE FROM audio_transcriptions WHERE audio_chunk_id = ?` then re-insert | Idempotent and clean, but **destroys history**. Fine for a screen-recording buffer; wrong for notes someone has already read and acted on. |
| [hyprnote / anarlog](https://github.com/fastrepl/anarlog) (`crates/db-app/migrations/`) | `STRICT` tables; every word carries a **stable string `id`**; notes carry **`source_hash` + `generation_metadata_json`** | The mature design — and the two ideas above map straight onto our requirement. Stable per-unit ids are what let a later correction pass swap content without breaking references; `source_hash` gives **free staleness detection**. |

`transcript_hash` on `ExtractionRun` (§5.3) is hyprnote's `source_hash` idea adopted directly: compare it against the current `TranscriptRun`'s hash and you know instantly whether a note is stale, with no re-anchoring pass and no model call. It costs one sha256 at write time.

> ⚠️ **Two repos in this space have moved** — `mediar-ai/screenpipe` → `screenpipe/screenpipe`, and `fastrepl/hyprnote` → `fastrepl/anarlog`. The old raw URLs 404, which is worth knowing before you go looking for their schemas.

### 5.6 SQLite projection (derived — rebuildable via `opengong reindex`)

```sql
CREATE TABLE calls (
  id TEXT PRIMARY KEY, created_at INTEGER, title TEXT,
  duration_s REAL, sha256 TEXT,
  active_transcript_run TEXT, active_extraction_run TEXT, json_path TEXT
);
CREATE TABLE transcript_runs (
  id TEXT PRIMARY KEY, call_id TEXT, seq INTEGER, created_at INTEGER,
  provider TEXT, model TEXT, api_surface TEXT, diarization TEXT,
  speaker_count INTEGER, json_path TEXT
);
CREATE TABLE extraction_runs (
  id TEXT PRIMARY KEY, call_id TEXT, transcript_run_id TEXT, seq INTEGER,
  created_at INTEGER, claims_kept INTEGER, claims_dropped INTEGER, json_path TEXT
);
CREATE TABLE claims (
  id TEXT PRIMARY KEY, extraction_run_id TEXT, call_id TEXT,
  extractor TEXT, type TEXT, text TEXT,
  quote TEXT, segment_id INTEGER, t_start REAL, speaker TEXT,
  alignment_status TEXT
);
CREATE INDEX claims_by_extractor ON claims(extractor, type);
CREATE INDEX claims_by_call      ON claims(call_id);

-- Segments must be a real table for external-content FTS5 to point at.
CREATE TABLE segments (
  id INTEGER PRIMARY KEY, transcript_run_id TEXT, call_id TEXT,
  segment_id INTEGER, t_start REAL, t_end REAL, speaker TEXT, text TEXT
);

-- Cross-call transcript search. USE EXTERNAL-CONTENT FTS5, not standalone.
CREATE VIRTUAL TABLE segments_fts USING fts5(
  text,
  content='segments', content_rowid='id', tokenize='unicode61'
);
-- Populate after bulk insert (or via triggers if you need incremental sync):
--   INSERT INTO segments_fts(rowid, text) SELECT id, text FROM segments;
```

> **Use `content=` from the start — this is not a micro-optimization.** screenpipe migrated from standalone FTS5 to external-content and documented the payoff in the migration itself: the standalone table duplicated every string (**~175 MB wasted on a 14-day database**), and deletes were catastrophically slow — **~38 s vs ~0.09 s** to delete 951 rows, a ~420× difference, because the standalone trigger rewrites the index. Standalone FTS5 looks simpler for about an hour and then becomes the thing you have to migrate off mid-hackathon.

Query shape — note that `snippet()` returns exactly the citation-shaped row the UI needs:

```sql
SELECT s.call_id, s.t_start, s.speaker,
       snippet(segments_fts, 0, '>>', '<<', '…', 12) AS snip,
       bm25(segments_fts) AS rank
FROM segments_fts
JOIN segments s ON s.id = segments_fts.rowid
WHERE segments_fts MATCH ?
ORDER BY rank
LIMIT 20;
```

This is what makes "which of our calls mention Competitor X, and what exactly did the buyer say" a single query — the thing Gong actually sells.

### 5.7 Export

```ts
interface ExportBundle {
  format: 'opengong.bundle.v1';
  exported_at: UnixMs;
  call: Call;
  transcript_run: TranscriptRun;    // words[] may be stripped — see below
  extraction_run: ExtractionRun;    // includes dropped[] and stats
  options: {
    include_words: boolean;         // DEFAULT FALSE — payload control (§3.2)
    include_dropped: boolean;       // DEFAULT TRUE  — honesty by default
    redacted: boolean;
  };
}
```

Three export targets, one bundle:

- **JSON** — `ExportBundle` written verbatim. Machine-readable, re-importable, the interop story.
- **Markdown** — notes with inline blockquote evidence and `[mm:ss] Speaker:` attribution, plus a provenance footer naming both models. Pasteable into a CRM, a Slack message, or a PR.
- **Share HTML** — the tier-1 self-contained file (§3.2): the bundle inlined in `<script type="application/json">` plus ~200 lines of vanilla JS. Click a claim → the evidence span highlights in the transcript; click the timestamp → the audio seeks (word-level if `words` present, segment-level otherwise).

**One rule for all three: an export must never contain a claim whose evidence is not also in the export.** The bundle carries the transcript that its claims cite. A share link that cites a transcript the reader cannot see is the exact failure mode we exist to fix.

---

## 6. Architecture — components and data flow

```
                        ┌──────────────────────────────────────────┐
   audio file ─────────▶│ 1. INGEST                                │
   (wav/mp3/m4a)        │    hash · store · create Call            │
                        └───────────────────┬──────────────────────┘
                                            │
                        ┌───────────────────▼──────────────────────┐
                        │ 2. TRANSCRIBE  (PyAI Hear)               │
                        │    ⚠️ A1 decides the shape of this box:  │
                        │    jobs API → submit · poll · loadResult  │
                        │    sync API → single POST                 │
                        └───────────────────┬──────────────────────┘
                                            │  provider JSON
                        ┌───────────────────▼──────────────────────┐
                        │ 3. NORMALIZE  ← the isolation layer      │
                        │    ms→s · speaker→string · reassign ids  │
                        │    build text · compute start/end_pos    │
                        │    → TranscriptRun (immutable)           │
                        └───────────────────┬──────────────────────┘
                                            │
   extractors/*.json ──▶┌───────────────────▼──────────────────────┐
   (loaded + validated  │ 4. EXTRACT                               │
    at STARTUP)         │    Promise.allSettled over extractors    │
                        │    structured output per output_schema   │
                        └───────────────────┬──────────────────────┘
                                            │  raw claims + quotes
                        ┌───────────────────▼──────────────────────┐
                        │ 5. GROUND  ← where the Iron Law lives    │
                        │    exact → normalized → fuzzy            │
                        │    keep + stamp | drop with reason       │
                        │    → ExtractionRun (immutable)           │
                        └───────────────────┬──────────────────────┘
                                            │
                        ┌───────────────────▼──────────────────────┐
                        │ 6. ASSEMBLE NOTES                        │
                        │    every finding block → claim_ids       │
                        └───────────────────┬──────────────────────┘
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              ▼                             ▼                             ▼
      ┌───────────────┐            ┌───────────────┐            ┌───────────────┐
      │ 7a. STORE     │            │ 7b. INDEX     │            │ 7c. EXPORT    │
      │ JSON on disk  │───────────▶│ SQLite (FTS5) │            │ MD/JSON/HTML  │
      │ SOURCE OF     │  reindex   │  DERIVED,     │            │ share file    │
      │ TRUTH         │            │  DISPOSABLE   │            │               │
      └───────────────┘            └───────────────┘            └───────────────┘
```

### 6.1 The two boxes that matter

**Box 3 (NORMALIZE) is the whole reason this design survives A1–A8 going wrong.** Every provider quirk — millisecond timestamps, integer speakers, unstable segment ids, an undocumented `verbose_json`, a `words[]` array with no declared shape, an offloaded `result_url` — is absorbed here and never reaches boxes 4–7. Concretely:

```js
// Handles A5 (inline vs offloaded) in three lines, per the PyAI guide's own advice.
async function loadResult(job) {
  return job.result_url ? await (await fetch(job.result_url)).json() : job.result;
}
```

If A1 flips (sync turns out to diarize after all), only box 2 and one adapter function in box 3 change. Boxes 4–7 — the extraction engine, the grounding gate, the storage layout, the exports — do not know or care.

**Box 5 (GROUND) is the product.** Boxes 1–4 are commodity; every "AI notetaker" has them. Box 5 is what makes the notes trustworthy, and it is deterministic, free, and testable without a model in the loop. Write its unit tests first: given a transcript and a quote, assert the anchor lands where it should — including the adversarial cases (quote spanning two segments, quote appearing twice, quote with smart quotes, quote the model invented).

### 6.2 Build order for 33 hours

| Hours | Deliverable | Gate |
|---|---|---|
| 0–1 | **Verify A1–A8.** One 30-second stereo WAV against both endpoints; dump raw JSON. Check `node:sqlite` + FTS5. | Do not write a line of schema before this. |
| 1–4 | Boxes 1–3: ingest, transcribe, normalize → a `TranscriptRun` on disk. | `jq '.segments[0]'` looks right. |
| 4–6 | Box 5 **before** box 4: `anchor()` + its unit tests, against a hand-written transcript. | Adversarial anchor tests pass. |
| 6–10 | Box 4: registry load/validate, two extractors (`summary`, `objections`), structured output wired. | A malformed extractor file fails startup. |
| 10–14 | Box 6 + 7a/7b: notes, JSON on disk, SQLite index, `opengong reindex`. | Delete `index.db`; rebuild; nothing lost. |
| 14–20 | **Box 7c tier-1 share HTML.** Click-to-highlight. | Open the file with wifi off; it works. |
| 20–26 | Three more extractors as *files only* — next steps, pricing mentions, competitor mentions. | Zero code changes. This is the extensibility demo. |
| 26–30 | Re-processing demo: second `TranscriptRun`, re-anchor old claims, show the diff. | Old notes survive; failures are surfaced. |
| 30–33 | Buffer, polish, the actual demo script. | — |

Note the deliberate inversion at hours 4–6: **the grounding gate is built before the extractors that feed it.** It is the component whose correctness everything else depends on, it needs no API keys, and it is fully testable offline. Building it first means the risky, network-dependent work later has a known-good target to hit.

---

## 7. Top decisions, restated

1. **Segment is the citation unit; characters are the anchor; words are polish.** Word-level data is genuinely optional (⚠️ A3), so nothing load-bearing depends on it.
2. **Never ask the model for offsets — ask for a verbatim quote and locate it in code.** (LangExtract's core insight.) This makes the Iron Law a deterministic, zero-cost invariant instead of a prompt we hope holds.
3. **Store quote + prefix + suffix + offsets** (W3C Web Annotation). Offsets are a recomputable cache; the quote is the durable identity. This is what lets a re-transcribed call keep its old notes.
4. **JSON files are the source of truth; SQLite is a rebuildable index.** Append-only numbered runs make re-processing trivial, exports nearly free, and a mid-hackathon schema change survivable.
5. **One declarative JSON file per extractor, validated at startup, never at runtime.** A shared `opengong://evidence` `$ref` makes evidence structurally unforgettable; a portability linter keeps every schema runnable on either provider.

And the finding that most changes the plan: **⚠️ A1 — diarization lives only on the async jobs API.** If that holds, the transcription stage is submit-and-poll from hour one, not a single POST. Verify it first.

---

## Sources

**Transcript schemas**
- OpenAI audio API reference — https://developers.openai.com/api/reference/resources/audio
- `openai-python` `transcription_verbose.py` / `transcription_segment.py` — https://github.com/openai/openai-python/blob/main/src/openai/types/audio/
- WhisperX `schema.py` — https://github.com/m-bain/whisperX/blob/main/whisperx/schema.py
- Deepgram diarization — https://developers.deepgram.com/docs/diarization
- Deepgram utterances — https://developers.deepgram.com/docs/utterances
- Deepgram timestamps/utterances/diarization guide — https://deepgram.com/learn/working-with-timestamps-utterances-and-speaker-diarization-in-deepgram
- AssemblyAI transcript object — https://www.assemblyai.com/docs/api-reference/transcripts/get
- pyannote speaker-diarization-3.1 — https://huggingface.co/pyannote/speaker-diarization-3.1
- pyannote saving/loading results — https://github.com/pyannote/pyannote-audio/discussions/1341

**PyAI (our provider)**
- OpenAPI spec (authoritative) — https://api.pyai.com/openapi.json
- Docs index — https://docs.pyai.com/llms.txt
- Transcribe audio — https://docs.pyai.com/api-reference/hear/transcribe-audio
- Create async transcription job — https://docs.pyai.com/api-reference/transcription-jobs/create-an-async-transcription-job
- Conversation-intelligence guide — https://docs.pyai.com/guides/conversation-intelligence
- Build your own Gong — https://docs.pyai.com/use-cases/build-your-own-gong

**Citation / evidence**
- Google LangExtract `data.py` — https://github.com/google/langextract/blob/main/langextract/core/data.py
- LangExtract — https://github.com/google/langextract
- Anthropic Citations — https://platform.claude.com/docs/en/build-with-claude/citations
- W3C Web Annotation Data Model — https://www.w3.org/TR/annotation-model/
- LlamaIndex CitationQueryEngine — https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/query_engine/citation_query_engine.py

**Extensibility**
- ESLint custom rules — https://eslint.org/docs/latest/extend/custom-rules
- ESLint plugins — https://eslint.org/docs/latest/extend/plugins
- Fastify plugins — https://fastify.dev/docs/latest/Reference/Plugins/
- Fastify decorators — https://fastify.dev/docs/latest/Reference/Decorators/
- Fastify validation & serialization — https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- @fastify/autoload — https://github.com/fastify/fastify-autoload
- promptfoo assertions — https://www.promptfoo.dev/docs/configuration/expected-outputs/
- promptfoo JavaScript assertions — https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/
- OpenAI structured outputs — https://developers.openai.com/api/docs/guides/structured-outputs
- Anthropic tool use / structured outputs — https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- BAML — https://docs.boundaryml.com/guide/introduction/what-is-baml

**Node / storage**
- `fs.glob` (Stability 1, v22.2+) — https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromisesglobpattern-options
- `node:sqlite` — https://nodejs.org/api/sqlite.html
- `node:sqlite` (Node 22 LTS) — https://nodejs.org/docs/latest-v22.x/api/sqlite.html
- SQLite FTS5 (external content tables) — https://www.sqlite.org/fts5.html

**Comparable local-first projects (schemas read from source)**
- Meetily — https://github.com/Zackriya-Solutions/meeting-minutes (`backend/app/db.py`)
- screenpipe (was `mediar-ai/screenpipe`) — https://github.com/screenpipe/screenpipe/tree/main/crates/screenpipe-db/src/migrations
- hyprnote / anarlog (was `fastrepl/hyprnote`) — https://github.com/fastrepl/anarlog/tree/main/crates/db-app/migrations

**Share links**
- URL fragments are not sent to the server — https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment
- Chromium URL display guidelines (2 MB max URL, 32 kB display cap) — https://chromium.googlesource.com/chromium/src/+/main/docs/security/url_display_guidelines/url_display_guidelines.md
- Notion 2,000-character URL limit — https://developers.notion.com/reference/request-limits
- GitHub: anonymous gist creation removed (2018-03-19) — https://github.blog/news-insights/product-news/deprecation-notice-removing-anonymous-gist-creation/
- Netlify CLI `--allow-anonymous` — https://www.netlify.com/changelog/2026-03-27-create-and-deploy-anything-netlify-clis-improved-ax/
- Cloudflare Drop — https://developers.cloudflare.com/changelog/post/2026-07-08-cloudflare-drag-and-drop/
- `CompressionStream` — https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream
- mermaid.live serde (deflate + URL-safe base64) — https://github.com/mermaid-js/mermaid-live-editor/blob/develop/src/lib/util/serde.ts
- kroki diagram encoding — https://docs.kroki.io/kroki/setup/encode-diagram/
