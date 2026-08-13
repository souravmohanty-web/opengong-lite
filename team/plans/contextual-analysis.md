# Contextual Analysis Layer — operative design (condensed from planning session, 2026-08-13)

## Core: two orthogonal gates
- **Evidence gate (L7, locked):** does this quote exist in this transcript? Blocking, deterministic. Unchanged.
- **Interpretation gate (new):** does the quote MEAN what the claim says? Never blocks — demotes + badges. Mechanic: LLM declares stance enums per claim; deterministic cue lexicons scan the evidence window; **code flags disagreement**. Lexicons are bad classifiers but excellent disagreement detectors.
- `interpretation_confidence: high|medium|low` derived in code (never model-supplied). A claim can be `match_exact + low` = "line is real, meaning unsure" — the honest state nobody else shows.

## Ambiguity classes (16; MUST unless noted)
entity-sense ("gong"=competitor|instrument; registry resolves) · entity over-match (idioms; SHOULD) · number-sense ("forty" needs a unit anchor ±4 tokens or unit=unknown) · negation (cue set incl. don't/never/without) · double-negation (always → human review) · hypothetical ("if we bought" → conditional bucket, never a commitment) · reported speech ("vendor said" → third_party + attributed_to) · sarcasm (v1 ships NO sentiment extractor — scoping decision) · coreference (bare pronoun → requires supporting_evidence quoting the antecedent, gated) · hedges ("probably around" → approximate, never rewrite claim text) · STT-error (homophone list no/know, hire/higher + Levenshtein≤2 registry near-miss → stt_risk badge; SHOULD) · cross-turn (quote ≤6 tokens or bare ack/quantity → requires adjacent-turn supporting evidence; renders as PAIRED receipt) · code-switching (romanised-Hindi cues incl. nahi=negation; STRETCH) · mono role-inversion (role_confidence<0.75 → demote role-dependent claims; SHOULD) · temporal ("end of quarter" anchored to call_date; SHOULD) · adversarial (injection line → anomaly claim with quote, never obeyed).

## Entity registry (v1)
`registry/entities.json` (human-owned) + `registry/proposals.json` (machine, NEVER auto-merged). Schema: `{id, term, type, aliases, stt_variants, disambiguation (with explicit "NOT a..." clause), owner_side, not_when}`. All lowercase (canonical text is). Seeded by content owner alongside DEAL-STATE.md (MUST, zero code). Injection: only entries whose surfaces occur in THIS call (pre-scan) → ~150-500 tokens in the cached prefix; cap 40 entries.

## Claim schema additions (`schemas/claim-context.json`, $ref'd by every extractor)
`stance {polarity, modality, attribution, attributed_to, certainty}` (enums with "unclear" allowed — "unclear is safer than a guess") · `entity_refs [{term, type, registry_id|null, confidence(3-way enum)}]` · `quantities [{surface (as spoken, never normalized), unit, unit_source, approximate}]` · `requires_context` + `supporting_evidence[]` (gated identically) · evidence gains `context_window {before[], after[]}` (ids only).

## Non-negotiables
- Exactly ONE rendering of the transcript enters prompts, byte-identical to what the gate verifies (asserted in code, fixture F-24).
- No digit folding anywhere (L7 wins over the stale note in research/00 — that note needs a correction line).
- Deal brief (≤200 tok, claims-derived) is self-defeating as an evidence source: quoting it fails the gate automatically (fixture F-22).
- Markdown export always carries the context window: "you cannot copy a quote out of its context from this tool."
- 24 offline fixtures incl. 3 negative controls (clean lines must produce ZERO flags — over-flagging is as useless as none).

## Build: MUST ≈ 5h (cue scans+index 1h · registry 0.75h · schema+prompt 0.75h · cross-check gate 1h · window+supporting-evidence 0.5h · fixtures 1h). Cut order: code-switch → deal brief → registry proposer → STT near-miss. Never cut: stance fields, quote-fidelity prompt rules, cross-check, fixtures F-03/05/06/08/12/16/21.
