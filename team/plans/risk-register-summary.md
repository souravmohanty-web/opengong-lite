# Risk Register — operative summary (full 87-row register from planning session; condensed 2026-08-13)

## Top risks (likelihood × impact)
1. **Schedule**: ~24h work vs shrinking clock; every ambiguous decision-hour eats buffer. Owner: Sourav (gates), all (execution).
2. **Cached demo path built LAST but needed MOST** → build it at the START of UI work + record the 90-sec backup video immediately (it doubles as README hero GIF + launch asset).
3. **Known code defects in kept code** (≤15 min each, fix in first build hour): stereo path missing max-length utterance split (a 4-min monologue = one "utterance" = gate certifies nothing, silently); zero AbortSignals on fetches (silent hang on stage wifi); all 429s conflated to daily-cap (should honor Retry-After); utterances not re-sorted by time.
4. **Extraction model unverified** — a model that normalizes "forty"→"40" collapses the on-stage verified-% number. Saritha's bake-off criterion = quote fidelity ≥90% exact-anchor, 0 fabricated ids.
5. **Nothing longer than 21s has been through the pipeline.** One ~20-min probe closes three unknowns at once (segment granularity, latency, 429 shape).
6. **Demo physical failure modes (SCORE-CRITICAL, cheap)**: audio seek imprecision → WAV/CBR + preload + per-claim rehearsal check (F-34); judge's "stereo" is usually dual-mono → channel-similarity preflight + mixdown (F-35); no room speakers = silent climax → confirm with organizers + karaoke-highlight visual fallback (F-36); projector washout → contrast pass (F-43).
7. **SECURITY.md currently overclaims** (promises escaping/gating not yet built) — fix before ANY public flip (the Hyprnote failure mode). Repo stays private until: name resolved + org sign-off + DATA-FLOW.md true + claims match code.
8. **Golden-call labels + stranger recruit are UNOWNED** — without them 15/100 scorecard points are red by default.

## Accepted risks (stated honestly, never hidden): relevance failures (right quote, wrong claim — v2 NLI, said on stage) · 3+ speaker calls · non-English (warn, never silently garble) · fuzzy matching (containment suffices; no JS lib) · PII beyond regex · hosted sharing (cut) · unprobed vendor limits (named exits at runtime) · HN-scale load · Windows · multi-user · formal threat-model coverage (two named sinks defended + one planted demo).

## Cheapest high-value mitigations: AbortSignal.any on every fetch (10 min) · stereo split+sort (15 min) · the 20-min-audio probe (25 min) · offline replay path + backup video EARLY (45 min) · `git tag demo-known-good` before endgame (5 min).

## Ops rules: AGPL quarantine (patterns from Speakr/Whishper, never code) + ATTRIBUTIONS section · gitleaks license check before any org transfer · fresh sandbox key Friday 9am (7-day expiry) · sample TTS generation ≥12h before demo on a different key · code freeze 17:00 Friday (only pre-listed recoveries after).
