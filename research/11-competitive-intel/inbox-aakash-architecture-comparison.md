# opengong-lite vs. Sybill vs. Open-Source Stacks — Architecture Comparison
*2026-08-13. Compares the locked decisions in build-plan.md against Sybill's reconstructed
architecture (no public eng blog — assembled from their API/MCP docs, Recall.ai case study,
trust center, job posts) and the open-source field (Vexa, Meetily, + OSS sweep).*

---

## 1. The headline finding: our exact lane is empty

The OSS sweep confirms **no open-source project positions itself as a Gong-style sales
conversation-intelligence platform** (deal insights, CRM sync, talk analytics). The ecosystem
splits cleanly into two camps, and neither touches the CRM:

| Camp | Projects | What they stop at |
|---|---|---|
| Local note-takers | Meetily (29K★), Anarlog/Hyprnote (9K★), Amurex (2.9K★) | Transcript + summary on your machine |
| Bot/transcription APIs | Vexa (2.7K★), Attendee (~700★), Speaches (3.6K★) | Transcript delivery |

**The sales-action layer on top is a genuine gap** — which is precisely what opengong-lite is.
Pitch line upgrade: *"20K+ stars of open-source tooling can transcribe your sales calls.
Zero of it updates your CRM or fulfills what the rep promised. That's us."*

## 2. Side-by-side

| Dimension | **opengong-lite (planned)** | **Sybill** ($14.5M, ~500 teams) | **Vexa** (OSS, 2.7K★) | **Meetily** (OSS, 29K★) |
|---|---|---|---|---|
| Ingestion | Paste/upload transcript + deal picker; Vexa later | **Recall.ai** (outsourced bots for Zoom/Meet/Teams) + botless desktop recorder + HubSpot dialer | Own bots: 1 ephemeral Chromium/Playwright container per meeting | Local device audio (ScreenCaptureKit/WASAPI); no bots, no platform APIs |
| ASR | None (transcripts arrive labeled) | Undisclosed vendor; in-house-tuned diarization claimed | Whisper (faster-whisper); hosted STT or self-host GPU; speaker-attributed | whisper.cpp / NVIDIA Parakeet, fully local |
| LLM layer | Anthropic API, tool-use structured output, grounding rule | **RAG over commercial GPT-family models** (deal-level context to curb hallucination); no proprietary base model | n/a (agents domain optional) | Pluggable: Ollama local, Claude/Groq/OpenRouter cloud |
| CRM write-back | Fixed `ai_*` deal properties + email engagement + note; approval-gated | **Deepest in class**: auto-scans CRM schema, suggests mappings, per-field prompts learned from last 30 deals, **confidence thresholds + low-confidence review queue** | None | None (no integrations at all in OSS edition) |
| Email | Draft + Copy + Gmail deep-link; log to HubSpot; never sends | **Same!** Drafts hand off to rep's Gmail/Outlook client; style learned from CRM email corpus or 3 uploaded samples; template DSL (`<>` AI instructions + `#VARIABLES`) | n/a | n/a |
| Processing model | Synchronous request per transcript | **Batch/async post-call** (no real-time product); async polling on agent queries | Real-time first-class (WebSocket live transcripts + `meeting.completed` webhook) | Real-time local transcription |
| Storage | **None — HubSpot is the DB** (notes + properties) | MongoDB (Atlas) on AWS | Postgres + Redis + MinIO | Local SQLite |
| Stack | Next.js on Vercel | Python/FastAPI, AWS-primary | Python/FastAPI services + TS/Playwright bot + Next.js UI | Tauri (Rust) + Next.js, C++ whisper |
| Human-in-the-loop | Review screen, grounded-in panel | Preview window, admin-controlled writable fields, confidence routing | n/a | n/a |

## 3. What the comparison validates in build-plan.md

1. **Don't build a recorder** — Sybill itself gave up on in-house bots: their CTO says building
   Meet/Teams bots "could've taken upwards of a year," so they migrated to Recall.ai (tripled TAM,
   +$50K MRR in a month). A funded 60-person company outsources ingestion; a hackathon team
   certainly should. Vexa is our open-source Recall.ai when we're ready.
2. **Draft + deep-link, don't send** — Sybill, at Series A scale, *also* hands drafts off to the
   rep's email client rather than sending. Our scope-review call is their production architecture,
   not a shortcut. Say this to judges if asked.
3. **RAG + commercial LLM + grounding** is the industry answer — Sybill runs RAG over GPT-family
   models with deal-level context "to reduce hallucination." Our context-assembler + grounding-rule
   + sources-array design is the same shape, one call instead of a pipeline.
4. **Batch post-call is fine** — Sybill has no real-time in-call product at all. Our synchronous
   analyze-on-upload is the same processing model at demo scale. Real-time is a Vexa-powered
   roadmap item, not a gap.
5. **Speaker-labeled input format is the right dodge** — diarization is genuinely hard: Sybill
   claims in-house-tuned models; Meetily gates diarization to its *paid* PRO tier (not in the
   29K-star OSS edition!). Our `Name (Role):` transcript format sidesteps the single hardest ML
   problem in the space. When we adopt Vexa, its speaker attribution slots straight in.

## 4. What's worth stealing

- **Sybill's confidence-gated review queue** (their best idea): each CRM write carries a
  confidence; low-confidence entries route to review instead of writing. Hackathon-cheap version:
  have the extraction schema emit `confidence` per commitment/field and render low-confidence
  items in amber on the Review screen ("check this one"). One schema field + one CSS class.
- **Sybill's "append, don't replace"** default for CRM notes — we already write notes additively;
  keep it that way, never overwrite human-entered fields.
- **Sybill's style-matching direction** (learn from past emails; min 3 samples) — roadmap, not
  hackathon. Our simpler tone knob is enough for demo.
- **Vexa's webhook contract** (`meeting.completed` + REST transcript fetch) — design our
  `/api/analyze` input so a Vexa webhook payload could feed it unchanged. Costs nothing now,
  makes the "live capture" roadmap slide honest.
- **Meetily's telemetry posture** (PostHog opt-in, off by default, documented in
  PRIVACY_POLICY.md) — if we ever add analytics, copy this; it's the credible open-source stance.

## 5. Where we consciously diverge (and why it's fine)

| Divergence | Their choice | Ours | Verdict |
|---|---|---|---|
| Datastore | Sybill: MongoDB; Meetily: SQLite; Vexa: Postgres+Redis | None (HubSpot as DB) | Fine for demo; also *is* the pitch ("your CRM is the source of truth"). Revisit only if we need cross-deal analytics (Flow 4 territory). |
| Backend language | Python/FastAPI everywhere | Next.js API routes | Fine — we have no ML serving; we're an orchestration layer over two APIs. |
| Emotion/video AI | Sybill's founding differentiator (in-house CV on participant video) | Absent | Correct cut — massive ML investment, and Sybill itself has repositioned toward CRM automation as the wedge. Don't chase it. |
| Async job queue | Sybill batch pipeline; Vexa Redis streams | Synchronous request | Fine at demo scale (1 transcript at a time). Post-hackathon: one queue in front of `/api/analyze`. |
| Compliance posture | Sybill: SOC2/ISO/SafeBase trust center | None | Out of scope; the self-hosted story is our answer ("your infra, your compliance"). |

## 6. Post-hackathon reference architecture (one paragraph)

Vexa (self-hosted, Apache-2.0 — bots + speaker-attributed live transcripts + `meeting.completed`
webhook) → opengong-lite action layer (extraction + HubSpot context assembly + grounded generation
+ confidence-gated review) → HubSpot write-backs. This is architecturally identical to Sybill
(Recall.ai → RAG pipeline → CRM write-back with review queue) with every proprietary component
swapped for open source — which is exactly the positioning: *Sybill's architecture, Gong's target,
zero lock-in.*

## 7. Source notes

- Sybill has **no engineering blog**; reconstruction from api.sybill.ai docs (alpha REST + MCP),
  recall.ai/customers/sybill (CTO quotes), trust.sybill.ai (AWS/GCP/MongoDB subprocessors),
  TechCrunch Series A coverage (RAG-on-GPT), help-center email-pipeline docs, job postings.
  Undisclosed: ASR vendor, LLM vendor, queue/orchestration internals.
- Vexa: repo v0.12 after a large v0.10 rearchitecture (bot now self-contained per container;
  docs drift reported in issues). Hosted: $0.30/hr bot + $0.20/hr STT; $12/mo individual tier.
  Self-host: 8 vCPU/16GB, GPU only for self-hosted Whisper.
- Meetily: current app is pure Tauri/Rust (Python backend archived); 29K★ but 344 open issues /
  130 open PRs and diarization + exports gated to paid PRO — popularity ≠ completeness.
  Its "fully local" claim holds only when summarization uses Ollama/self-hosted endpoints;
  cloud LLM configs send full transcripts out (consistent with our earlier refuted-claim finding).
- Full agent reports with all URLs available in session task outputs.
