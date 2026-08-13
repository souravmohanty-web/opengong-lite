# Phase 3 blueprint — Notes UI + receipts interaction

**Status: RECONCILED against `technical-spec-core.md` (which binds where they conflict)
and split across build slices: the minimal one-interaction viewer + server SHIPPED in
Slice 1 (`src/viewer.js`, `src/viewer.html`, `src/server.js`, tests green); the full
state machine, exports, and share tiers below are the Slice 2–3 design. Author: projects-2f.**
Grounded in: brief §3 Phase 3, L4/L6/L7 (evidence), L10 (bundle), L11 (share tiers),
L17 (cached demo), L19 (escaping); research/02 §§3.2, 5.4, 5.7 (measured numbers cited).
Exit test (brief): **the "oh damn" interaction works** — click a claim, watch the exact
transcript line light up, hear the moment.

## 0. The one design decision everything hangs on

**One viewer, three fuel lines.** The notes page is a single vanilla-JS/CSS viewer module
that renders an `ExportBundle` (02 §5.7). It is fed three ways:

1. **App mode** — local server injects the bundle + serves `audio.wav`; player enabled.
2. **Tier-1 share** — same viewer + bundle inlined in `<script type="application/json" id="og-data">`; no audio, no network (02: ~204 KB total, opens with wifi off).
3. **Tier-2 share** — same viewer page, bundle (claims + cited segments ONLY, never the
   full transcript) read from `location.hash`, deflate-raw + base64url via
   `DecompressionStream` (02 measured: 1,264 chars — under Notion's 2,000-char paste cap).

Build the viewer once, wire fuel lines in order 1 → 2 → 3. Any mode can be cut without
touching the others; tier-1 alone satisfies the exit test.

## 1. Component map (all vanilla, no deps — idiom)

```
src/viewer/
  view-model.js   PURE: ExportBundle → render-ready model. Resolves NoteBlock.claim_ids
                  → Claim → Evidence[]; maps evidence start_pos/end_pos → per-segment
                  span slices; buckets claims: verified / segment_corrected / uncorroborated.
                  Enforces 02 §5.4 invariant: a finding block with zero claim_ids is a
                  BUILD ERROR, not a render fallback.
  escape.js       PURE: the single escaping choke point (see §4).
  render.js       view-model → DOM. Two panes: notes (left), transcript (right).
                  All text lands via textContent / createTextNode — innerHTML is banned
                  in review for any string that ever touched a transcript or an LLM.
  interactions.js the state machine (§2). No rendering; toggles data-state attributes.
  audio.js        app-mode only: <audio> wrapper, seek(t_start), timeupdate → active
                  segment via binary search. Absent element = feature silently absent.
  hash-codec.js   PURE: bundle ⇄ #fragment (deflate-raw, base64url). Shared by export
                  writer (Node ≥20.12 CompressionStream) and viewer (browser).
src/export.js     bundle → {json, md, html} writers (§3).
server route      GET /calls/:id → viewer shell w/ injected bundle + /audio/:id stream.
```

## 2. Interaction states — claim → line → audio

State machine (one active claim max; states as `data-state` attrs, CSS does the rest):

| State | Trigger | What the user sees |
|---|---|---|
| `idle` | load | Notes pane: sections with claim cards, each badged by alignment_status count. Transcript pane: speaker-labeled segments with `[mm:ss]`. Provenance footer: models, run stamps, **dropped-claims count** (02 §5.3 — honesty is rendered, not asserted). |
| `claim-active` | click claim card | Card raises; transcript auto-scrolls to first evidence segment; the exact quote span (from `start_pos/end_pos` slice, never re-searched) wraps in `<mark>`; other evidence spans get secondary marks; evidence count shown ("2 receipts"). |
| `evidence-cycling` | click "next receipt" or repeat-click card | Scroll + primary mark advance through Evidence[] round-robin. |
| `corrected` | claim whose evidence is `segment_corrected` | Same as claim-active plus an inline badge: "model cited seg 4, quote found in seg 5 — corrected". This IS the demo of the gate (L7). |
| `uncorroborated` | click a demoted claim | NO transcript jump (there is nothing to jump to). Card is visually demoted (grey, dashed border) with "no verified line in transcript" label. Never hidden (L7: demote, don't drop). |
| `playing` | click any `[mm:ss]` timestamp (app mode) | Audio seeks to `t_start`, plays; reverse link: timeupdate highlights the currently-spoken segment. Share modes: timestamp is inert text — no dead controls rendered. |
| `line-inspect` | click a transcript segment | Reverse lookup: which claims cite this segment; their cards pulse. Cheap (evidence already indexed by segment in view-model) and it demos "receipts go both ways". |
| `blocked` | claim with `status: blocked_injection` | Quarantine strip: red border, claim text struck through, the offending line rendered escaped. NEVER in the notes body or email (view-model throws if a notes block cites it). Evaluated before uncorroborated — the planted line IS in the transcript; that's the point of the second screen. |

Seek granularity: `segment.t_start` (02 §3.2: words excluded from bundles by default —
7.7× payload inflation; word-exact seek is an app-mode nicety only if `words[]` present).

## 3. Export rendering (one bundle, three writers — 02 §5.7)

- **JSON**: `ExportBundle` verbatim. `include_words: false`, `include_dropped: true` defaults.
- **Markdown**: sections → headings; each finding → bullet + blockquote receipt
  `> [12:34] speaker_2: "honestly my main concern is pricing…"`; uncorroborated findings
  under a separate "Unverified" heading; provenance footer (both model ids + run seq).
- **Share HTML (tier 1)**: viewer shell + inlined bundle. Invariant (02 §5.7): an export
  never contains a claim whose evidence is not also in the export.
- **Fragment URL (tier 2)**: claims + cited segments only. Threshold rule (02 measured):
  encoded length ≤ ~1,500 chars → offer the link; above → viewer offers tier-1 file
  download instead ("link would break in paste targets"). Footer states the literal truth:
  "this link's data lives after the #; our server never sees it" (L11).

## 4. HTML-escaping strategy (L19 — transcript → HTML is an XSS chain)

Threat inputs: transcript text (a caller can literally SAY "less-than script greater-than"
or paste-read HTML), LLM claim text, filenames, metadata. All untrusted, including
fragment-decoded data (anyone can craft a link).

1. **One choke point**: `escape.js` exports `esc()`; render.js builds DOM via
   `textContent`/`createTextNode` so escaping is structural, not remembered. `esc()` exists
   only for the two template-string surfaces (md writer, HTML shell title).
2. **The inline-JSON trap** (02 §3.2, verified): when inlining the bundle into
   `<script type="application/json">`, escape `<` → `<` — a transcript containing
   `</script>` otherwise terminates the tag. Serializer does this always, not conditionally.
3. **Attribute discipline**: ids/times/counts rendered into attributes are
   numbers formatted by us (`mm:ss`), never raw strings.
4. **CSP belt-and-suspenders**: exported HTML carries
   `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">`
   — even a missed escape can't exfiltrate (no network targets allowed).
5. **No `javascript:`-capable hrefs** anywhere; the only links are the tier-2 fragment
   (same-page) and nothing else.

## 5. Fixture-driven test list (node:test, no browser deps; DOM-free by design)

Pure-function tests against committed fixtures (research/00-api-probe/* + one
hand-authored `fixtures/bundle.golden.json` built from stereo_result):

1. view-model: claim with exact-match evidence → span slice equals quote (positions from
   Evidence, not re-search).
2. view-model: `segment_corrected` evidence buckets into corrected, keeps corrected id.
3. view-model: uncorroborated claim → demoted bucket, zero anchor targets.
4. view-model: finding block with empty claim_ids → throws (the 02 §5.4 invariant).
5. escape: transcript containing `</script>` + `<img onerror=…>` round-trips inert through
   (a) esc(), (b) the inline-JSON serializer (`<` present, raw `</script>` absent).
6. hash-codec: bundle → fragment → bundle round-trip identical (Node CompressionStream).
7. hash-codec: tier-2 payload for golden bundle ≤ 1,500 chars; over-threshold bundle
   returns `{tooBig: true}` not a truncated link.
8. tier-2 payload NEVER contains a segment no claim cites (privacy rule, L11).
9. md writer: every finding line is followed by ≥1 blockquote receipt; unverified section
   present when dropped/uncorroborated exist.
10. export invariant: every Evidence.segment_id in bundle.claims exists in
    bundle.transcript segments (self-containment).
Manual demo gates (scripted into Phase 5's run-of-show): open tier-1 file with wifi OFF;
click-through of all 7 states; tier-2 link pasted into Slack and opened cold.

## 6. Time estimates (brief allots 5h; this plan: 5.5h with a named cut line)

| Slice | Est | Cut-safe? |
|---|---|---|
| view-model + escape + their tests (1–5) | 1.5h | NO — everything sits on it |
| render + interaction states (app mode) | 1.5h | NO — exit test lives here |
| audio seek + reverse highlight | 0.5h | degrade: seek only, no reverse |
| md/json writers + tests (9,10) | 0.5h | md cuttable, json is free |
| tier-1 share HTML | 0.75h | LAST thing cut (it's the deliverable per 02) |
| tier-2 fragment codec + threshold + tests (6–8) | 0.5h | first thing cut (L11 tier order) |
| slack/polish buffer | 0.25h | — |

Cut order if squeezed: tier-2 → reverse-highlight → md writer. Never cut: escaping tests.

> **Demo constraint (relayed from demo-plan agent, Aug 13 — binding once master plan
> approved):** the demo NEVER cuts (a) click→highlight→audio, (b) the uncorroborated
> bucket, (c) the visible injection line — those three carry ~70% of the score. The
> tier-1 static-HTML export is the designated Phase-3 de-risk if the full UI looks
> shaky by Friday noon. Cut order above already respects this.

## 7. Open questions — ALL RESOLVED by `technical-spec-core.md` rulings (Aug 13)

- Q1 **RESOLVED**: app mode = tiny local server (`src/server.js`, 127.0.0.1:4317, zero
  deps, Range/206 for audio). Built in Slice 1. The file-open path survives only as the
  tier-1 export.
- Q2 **RESOLVED**: coverage bands computed in gate.js; the UI renders
  `notes.coverage.band` verbatim and never recomputes (enforced by test).
- Q3 **RESOLVED — yes**: `blocked_injection` is a first-class 4th claim status with its
  own quarantine visual state (see the state table above). Built in Slice 1.

## 8. Post-reconciliation notes

- Claim shapes are `technical-spec-core.md` §2's: `claim.status` 4-state,
  `evidence.match_type` 5-state.
- `representation.md` governs summary anatomy for Slice 2+ rendering: 5 sections
  (Outcome / Next steps / Key takeaways / Pain points / Interests), 300–500-word cap,
  conditional sections omitted never "N/A" — this sets §3's markdown/HTML section order.
- Audio in the viewer is WAV/CBR with `preload="auto"` (F-34: the money moment must not
  seek to the wrong second).
