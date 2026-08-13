# OpenGong Lite — Decision Brief

**Status:** Research phase complete. 6 research artifacts + 8 audit rounds, all findings evidence-backed with live API fixtures. This is the single merged spec the team builds from.
**Date:** 2026-08-13, ~12:00 IST. Demo: Friday 6pm.
**Sources:** `research/00`–`05`, `audit/audit-log.md` (A-001–A-008), `audit/framework.md`, `audit/unlearn.md`. Raw API fixtures in `research/00-api-probe/`.

---

## 1. The wedge, confirmed

**Nobody in open source does claim-level citations for call notes.** Three repos attempted it and shipped prompt-wishes (asked the LLM to cite, never verified). Our receipts gate — verified in code, unproven claims visibly demoted — is a genuine first, and it's also the demo moment: *Gong asks you to trust its summary. We show you the line.*

Scoring map: receipts UI = demo magnetism (25%) + product pull (30%). Extractor plugins + minute-burning sample generation = API gravity (20%). The gate chain + named exits = loop depth (15%). DATA-FLOW.md + honest README = craft (10%) + Show HN survival.

---

## 2. Locked decisions (evidence-backed — do not relitigate without new evidence)

### Transcription & speakers
- **L1. Batch jobs API only.** `POST /v1/transcription/jobs` (multipart or `audio_url`), poll `GET /v1/transcription/jobs/{id}`. The sync endpoint returns `{text, duration}` only and silently ignores all OpenAI-style params. *(fixtures)*
- **L2. Stereo is the happy path.** Diarization is **channel-based**: one speaker per channel → `speakers: 2`, `speaker_1/speaker_2` labels + `channel` per segment. Mono never splits speakers (two clearly different voices → `speakers: 1`). *(stereo_result.json)*
- **L3. Mono is the degraded path, honestly labeled.** Our own utterance layer: split `words[]` on pause-gap >0.6s **plus hard max-length split (~40 words)**; LLM infers Rep/Prospect **roles** with confidence. **Never render invented speaker names; never render "Customer:" off `speaker: null`.**
- **L4. Canonical text is built by us** by joining segment/word text. **Never verify against top-level `result.text`** — it renders "40" where `segments[].text` renders "forty" *in the same response* (F-21). Display layer (repunctuated, capitalized) is separate and never used for evidence.

### Extraction & the receipts gate
- **L5. Extraction LLM is external (Anthropic).** `pyai-nova` exists at `/v1/chat/completions` but is a canned stub on sandbox. Name the vendor plainly in DATA-FLOW.md and README. *(fixtures)*
- **L6. Never ask the model for offsets.** Model returns a **verbatim quote + segment ordinal**; code locates the quote. Quote is **REQUIRED on every evidence item** (no segment-only citations).
- **L7. Gate chain (binding audit ruling, A-005–A-008):**
  1. Exact match of quote in the named segment ±1;
  2. else normalized containment (lowercase, strip punctuation, collapse whitespace — **no digit folding**; verification runs against the exact prompt-rendered canonical text) ;
  3. else whole-transcript rescue **only** for long/unique (or prefix+suffix disambiguated) quotes → relabeled `segment_corrected`, counted in run stats;
  4. else the claim lands in the **visible "uncorroborated" bucket** — demote, don't silently drop, don't block the whole run.
  Coverage thresholds decide `SHIPPED` vs `PARTIAL`. The gate firing on stage **is** the demo of the moat.
- **L8. Follow-up email drafts only from gate-passed claims** (this is also the prompt-injection choke point).
- **L9. No NLI models on the blocking path** (64–77% accuracy = blocks more truth than lies). No fuzzy-matching library dependency; containment covers same-source quoting.

### Storage & sharing
- **L10. JSON files are source of truth; SQLite is a rebuildable index.** Append-only `ExtractionRun` records (`run_id`, model + prompt version stamps, `transcript_hash` for staleness) — re-runs never overwrite history (Meetily's mistake). FTS5 as **external-content** table (standalone FTS5 = ~420× delete penalty, screenpipe's documented migration). Demo on Node 24 (`node:sqlite` warning-free).
- **L11. Share links:** Tier 1 = self-contained HTML file export. Tier 2 = **fragment-URL** carrying *only notes + cited segments* (~1.3KB compressed; fragments never reach any server → "our server can't read your link" is literally true; never the full transcript). Tier 3 (hosted) = **cut for the hackathon**.

### Extensibility & harness
- **L12. Extractors are declarative `extractor.json` files** (PostHog `plugin.json` pattern): `{name, prompt, output_schema, evidence_required: true, role}`. **Extractors declare a role, never a model** (ruling resolving 02-vs-03 conflict); `capabilities.json` maps role → model with failure-class-typed fallbacks. `npx opengong new-extractor` starter.
- **L13. Harness per `research/03`** (seven parts: named exits + write-ahead run record, gates, aimed capped retries ×2, failure invariant, registry, p-limit parallelism + atomic writes, 3-axis budget governor) — **with every vendor-specific number stripped to UNKNOWN** (03 confused PyAI with pyannoteAI; its 1GiB/24h/80rpm/TTL numbers are void). RFC-7807 `request_id`s go into run records. *(A-003)*
- **L14. Key lifecycle:** auto-mint sandbox key in `npm start` (verified: instant, no signup); keys expire ~7 days → **re-mint on 401 for `pyai_test_*` keys** (else every week-2 Show HN cloner gets a dead key); daily-cap exhaustion gets a named exit + friendly message.

### Sample data & demo
- **L15. One fictional deal arc** (Hedgebox pattern): write `DEAL-STATE.md` first, then script calls as **1:1 two-person calls** (stereo trick caps at 2 speakers — see Open Decision D2). Recurring competitor, dropped commitments planted across calls so cross-call search finds real things.
- **L16. Sample audio = per-speaker PyAI TTS tracks mixed to stereo** (rep=left, prospect=right): perfect diarization by construction + burns minutes both directions. TTS voices are individually flaky (`upstream_error` on one voice while others work) → script needs voice fallback. *(fixtures)*
- **L17. The demo replays committed cached outputs; live processing is the encore.** Never bet the main act on wifi + quota + latency. A 6th "messy" sample call contains a **planted prompt-injection line**; the pipeline visibly neutralizing it is a scripted demo beat.
- **L18. Positioning: "self-hosted app + hosted inference (PyAI speech, Anthropic extraction)."** Never claim "fully local/private" (Hyprnote's public shredding). `DATA-FLOW.md`: one row per possible network call — destination, payload, retention, `file:line` that makes it. "You'll hate this if…" block in README.

### Security floor
- **L19.** HTML-escape everything in the share/notes viewer (transcript → HTML is an XSS chain); upload validation (MIME, size cap, path traversal); no key logging; gitleaks in CI; MIT LICENSE + SECURITY.md. **Prompt-injection threat model needs one named owner** (F-4 — see D5).

---

## 3. Build order (single merged sequence)

| Phase | Hours (of ~28 left) | Deliverable | Exit test |
|---|---|---|---|
| 0. Skeleton | 1 | Repo, LICENSE, key-mint flow, committed fixtures, `capabilities.json`, gitleaks CI | `npm start` mints a key cold |
| 1. Ingest | 3 | Upload → job → poll → **canonical transcript** (stereo happy path + mono fallback layer) | Golden tests against fixtures pass |
| 2. Extraction + gate | 5 | Extractor registry, LLM calls, full gate chain, run records, named exits, budgets | Planted-fake-quote test lands in uncorroborated bucket |
| 3. Notes UI + receipts | 5 | Notes page: click claim → highlight segment → play timestamp; exports; share tiers 1–2 | The "oh damn" interaction works |
| 4. Content + trust | 4 | DEAL-STATE.md + 5 scripted calls + stereo TTS generation, DATA-FLOW.md, README | Cross-call search finds planted facts |
| 5. Hardening + demo | 4 | Injection demo beat, cached demo path, screenshot/clip, **another person runs setup cold** | 5-min setup verified by a stranger |
| Buffer | ~6 | The plan is wrong somewhere. This absorbs it. | — |

---

## 4. Open decisions — humans only (decide before Phase 0 ends)

- **D1. The name.** "OpenGong" invites a trademark C&D on the company's Week-1 public launch. Raise with organizers today — flagging it is itself a credibility play. (Ship checklist unaffected; repo can rename until launch.)
- **D2. Deal-arc rewrite for the 2-speaker cap.** Recommended: all five calls become 1:1 (realistic for SMB sales anyway). Alternative (probe first, 20 min): 3-voice mono test to see if anything splits. Decide before a single script line is written.
- **D3. A real dual-channel human recording** (any JustCall call export). Only real audio proves the happy path end-to-end before the demo claims it.
- **D4. The two-key reality.** Cloners need a PyAI key (auto-minted) *and* an Anthropic key (not free, not auto-mintable). Default demo path = cached fixtures (zero keys); README states both keys plainly. Who supplies the team's Anthropic key + spend cap for the build?
- **D5. Assign owners:** integration/spec owner (this brief), injection threat-model owner, content owner (deal arc), demo owner.

## 5. Known unknowns (probe when relevant, not before)

Sandbox daily-cap number · long-audio segment granularity (is 1-segment-per-file a short-file artifact?) · key-mint per-IP throttling under HN load · Hinglish WER on pyai-hear · `audio_url` fetch constraints.
