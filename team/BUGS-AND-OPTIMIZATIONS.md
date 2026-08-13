# Bugs & Optimizations — living log

Append here whenever you hit a bug, an issue, or find an optimization — ours OR the platform's.
Format: `[STATUS] [CLASS] short title — detail — evidence/where — owner`.
STATUS: OPEN / FIXED / BACKLOG / ACCEPTED. CLASS: platform / gate / pipeline / perf / ops / launch.
Fixed items keep their line (struck context) so we don't re-discover. Platform bugs are filed separately in `research/00-api-probe/BUG-REPORT.md` — this file cross-links + adds operational ones.

---

## PLATFORM (PyAI) — file formally via research/00-api-probe/BUG-REPORT.md (10 bugs)
- **[OPEN][platform] TTS `/audio/speech` intermittently 503 / 404 / timeout** — transient, affects all voices (angus/amelia both 503 then 200 on immediate retry); confirmed NOT content/voice-specific (Hinglish line synthesized 200 while voices 503'd). Blocks unattended sample generation. Interim fix: retry loop around the generator. Proper fix: transient-retry inside `scripts/lib/tts.mjs` speakWithFallback. — hackathon
- **[OPEN][platform] Console "Speak" scope preset emits invalid `speak:synthesize`** — real scope is `voice:synthesize` (403 body names it). Blocks TTS grant via UI. — BUG-REPORT N/K1
- **[OPEN][platform] Three incompatible error envelopes** (RFC-7807 / OpenAI-style / bare `{error,service}` on 405s) + inconsistent request-id headers. — BUG-REPORT N1 (High)
- **[OPEN][platform] `result.text` vs `segments[].text` number rendering disagree** ("40" vs "forty", same response) — receipts-integrity risk; we build canonical from segments (L4). — BUG-REPORT K3
- **[OPEN][platform] "neither audio source" 400 reuses the "both provided" message**; `x-aiva-service: hear` codename leaks in a header. — BUG-REPORT N2/N3
- **[OPEN][platform] Sandbox key mint 500 / 429 without Retry-After; per-IP mint throttle** — use the live key for the build. — research/00 round-1

## GATE / EXTRACTION (ours)
- **[FIXED][gate] 2 fabrication paths from the F-2 punctuation strip** — dash-only quote → lone-space match; `:`/`-`/`/` collapsing distinct numbers ("3:30"→"330"). Fix: whitelist strip + digit-flank guard (nearest non-punct neighbor) + whitespace-only reject. 3rd audit PASS. — audit A-009/A-010, commit af45d99
- **[FIXED][gate] imperative next-steps false-blocked as injection → required section empties yet reads SHIPPED** — fix: imperative_smuggling only fires w/ tainted-utterance or smuggled-link; required-section-emptied-by-block → PARTIAL. — commit 7955f8e
- **[FIXED][gate] punctuation not stripped at stage-2 (L7 violation)** — model-added period killed real receipts. Fixed stage-2 only. — 7955f8e
- **[FIXED][pipeline] tracker-first deadlock** (awaited an LLM cache gate a tracker never triggers) — trackers partitioned out of the LLM fan-out. — commit aad40e3
- **[OPEN][gate][Slice-2] double-mark digit fusion "3..30"→"330"** — the immediate-neighbor guard misses consecutive marks. Tighten to nearest-non-punct-neighbor-is-digit + test. Not a practical fabrication (can't fold two VALID numbers) but close it. — audit re-check, N-1
- **[ACCEPTED][gate] hyphen/slash false-REJECTION** — "follow-up" won't match unpunctuated "follow up" (cost of never stripping `-`/`/` to kill FAB-2). Stated in README limitations; prefer false-demotion over a loosened matcher. Optional stage-2b: strip `-`/`/` only when NOT digit-flanked. — audit A-010
- **[OPEN][gate] speaker_mismatch enum** — gate emits it (cross-speaker exact_pm1); added to evidence.json context_flag enum. — commit aad40e3
- **[OPEN][req][email] LLM-polished draft must validate bullet TEXT-containment vs cited claim** (not just claim_id) — id-only today; airtight only because the email role never sees the transcript. REQUIREMENT before the D4 LLM email path ships. — audit (email choke point), F-1
- **[ACCEPTED][gate] right-quote-wrong-claim** — relevance failure no string method catches; named unsolved in README (v2 NLI). — L9

## PIPELINE / OPS
- **[OPEN][ops] TTS flakiness blocks unattended generation** — interim retry loop (bg run); proper fix = transient-retry (503/404/408/timeout/upstream) with backoff inside speakWithFallback before voice-walk. — tonight
- **[FIXED][ops] Raw WAV ~10MB/call bloats public repo** — gitignore `samples/audio/*.wav`, transcode to mp3 for the repo (transcription already ran on full-quality WAV so timestamps stay valid). — tonight
- **[OPEN][launch][scorecard-red] viewer needs a dropped-claims COUNT footer** ("9 verified, 2 uncorroborated, 1 blocked") — the one real 🔴 in the scorecard; reinforces loop-depth. — routed to projects-2f, scorecard ld-5.4
- **[BACKLOG][ops] $-per-call cost number** — sample bundles I extract have ~$0 Anthropic cost (I'm the LLM); a true $/call needs one live Anthropic run OR honest "transcription $X + N tokens BYO-LLM" display. — flagged to Sourav ($5 key)

## PERFORMANCE (implemented + backlog)
- **[FIXED][perf] serialize-first cache-writer then fan-out** — −44%/call (parallel extractors else all miss cache + pay 1.25× write). — token-optimization.md
- **[FIXED][perf] timestamp-free prompt render** — −14% transcript tokens (model cites ids, code resolves times). — token-optimization.md
- **[FIXED][perf] deterministic keyword tracker** — zero tokens, 100% receipts by construction. — commit aad40e3
- **[BACKLOG][perf] Batch API (50% off) for ≥20 calls; Haiku triage tiering** — story/roadmap only per A-009 (short demo calls favor single-pass; judges see logged cost not architecture). — token-optimization.md, A-009
- **[BACKLOG][perf] silent-cache-miss assertion** (cache_read==0 on a read-expected call → alarm) — designed; wire when live extraction runs. — token-optimization.md §5.2

## Convention
Agents: when you hit or fix something, append a line here (and cross-link the audit-log entry / commit). Keep it one line; detail goes in the referenced audit/commit.
- 2026-08-13 16:53 · projects-2f · HARDENED: viewer audio made fully optional — highlight fires independent of audio; 404/decode/autoplay failures degrade to 'audio unavailable' note, never a broken player (safeSeekAndPlay guard, 2 tests) · commit follows
- 2026-08-13 16:56 · projects-2f · GTM/craft: README roadmap section added (CRM-read 'connect your CRM, pick a recording' framed as adapter-not-rebuild via existing source/crm_map plumbing; + write-back, live capture, extractor sharing) — per Sourav scoping decision, explicitly deferred not built
- 2026-08-13 ~17:05 · hackathon · [OPEN][pipeline] runPipeline hard-codes flattenClaims (Slice-1 objections/summary/tracker shapes only) — the DEEP extractor shapes (competitor_mentions, pain_points, stage/urgency, stakeholders...) need flattenClaims extended for the LIVE path; offline harness scripts/extract-offline.mjs `flattenAny` is the reference mapping. — extraction agent
- 2026-08-13 ~17:05 · hackathon · [OPEN][ops] ASR mangles literal tracker keywords ("soc2"→"soc"/"soctu", "ringhawk"→"ringcak"/"ringhawks") so the deterministic keyword tracker misses them; the competitors extractor catches RingHawk semantically. Consider fuzzy/stem tracker matching OR lean on the extractor for competitor detection. — extraction agent
