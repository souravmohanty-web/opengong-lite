# 04 — Repo Craft: README, 5-Minute Setup, Security, Sample Data, Show HN Objections

Research for OpenGong Lite (MIT, 33-hour hackathon build, public launch on Show HN / Product Hunt / X).
Idiom to match: Node.js ≥ 22, minimal deps, native `fetch`, `.env.example`, `npm start` (per `atomsai/pyai-examples` conventions).

---

## 1. README anatomy of winners

Studied: screenpipe, Meetily (Zackriya-Solutions), ollama, plandex, whisperX, Hyprnote/OWhisper family. Pattern held across all of them — the first 3 screens are near-identical in sequence even though the products differ wildly:

**Screen 1 (above the fold):**
1. Logo/wordmark image, centered.
2. A badge row — but the *kind* of badges signals maturity level, not vanity:
   - Trust badges: license (MIT), stars, a "Trendshift"/YC-style credibility badge if earned.
   - Community badges: Discord, X/Twitter, Reddit — social proof that it's alive.
   - Meetily also front-loads Pre-Release + supported-OS badges, which is honest scoping (sets expectations before install).
3. One-line tagline directly under the title, second person or plain declarative, no jargon:
   - screenpipe: *"screenpipe remembers how you actually work"*
   - ollama: *"Start building with open models."*
4. A hero visual — demo video/GIF or screenshot — appears **before** any prose block longer than 2 sentences. screenpipe and plandex both lead with an embedded video thumbnail; Meetily leads with feature screenshots woven into "Why Meetily?"

**Screen 2:**
- The install/quickstart command block — always a fenced code block, always copy-pasteable, always **before** the features list in the repos with the fastest adoption (ollama, screenpipe, plandex). Meetily is the outlier — it makes users read a "Why Meetily?" objection-preemption section (privacy risk stats: $4.4M breach cost, GDPR fines, recording-consent case counts) *before* installation, because its core value prop **is** the privacy argument, not the feature.
- Command style favors a single line: `curl -fsSL .../install.sh | sh` (ollama, plandex) or `npx <tool> record` (screenpipe). Multi-platform tools (Meetily) fall back to platform-specific blocks (Windows/.exe, macOS/.dmg, Linux/build-from-source) because there's no single npm/curl story for a desktop Rust app.

**Screen 3:**
- Feature list, usually as bullets grouped under sub-headers, each backed by a small screenshot/GIF, not a wall of text.
- First troubleshooting/FAQ signal appears here or just after — Meetily interleaves objection-handling ("PRO tier," "Enterprise tier," GPU acceleration) directly into feature call-outs rather than a separate FAQ block.

**Cross-repo takeaways:**
- No repo makes you scroll past more than ~15 lines before hitting a runnable command.
- Demo GIF/video is placed *before* the reader has committed to reading prose — it's the pitch, not a reward for reading.
- Badges are functional trust signals (license, OS support, pre-release status), not just decoration.
- The tagline is never a feature list — it's the one-sentence value prop.

Sources:
- https://github.com/screenpipe/screenpipe/blob/main/README.md
- https://github.com/Zackriya-Solutions/meetily/blob/main/README.md
- https://github.com/ollama/ollama/blob/main/README.md
- https://github.com/plandex-ai/plandex/blob/main/README.md
- https://github.com/m-bain/whisperX

---

## 2. Five-minute-setup engineering

Patterns that repeatedly kill setup friction, drawn from the repos above plus the PyAI examples idiom:

1. **Single command bootstrap.** ollama and plandex both reduce install to one `curl | sh` line; screenpipe reduces it to one `npx` line. The PyAI examples convention (`atomsai/pyai-examples`) is: clone → `cp .env.example .env` → fill in → `npm start`. That's the idiom OpenGong Lite should match exactly, since the judge/other team already expects it.
2. **Auto `.env` creation, not just a template.** `.env.example` committed, `.env` gitignored, and the app should refuse to run with a clear, specific error naming the missing var — not a stack trace. (Hyprnote got dinged for the opposite: a raw `EmptyToken` error when `AXIOM_TOKEN` was blank — see §5.)
3. **First-run auto-provisioning of the API key is the single highest-leverage move here.** PyAI's own sandbox-key flow is the concrete precedent:
   ```bash
   curl -sS -X POST https://api.pyai.com/v1/sandbox/keys \
     | python -c 'import json,sys; print(json.load(sys.stdin)["api_key"])'
   ```
   returning a `pyai_test_…` key, no signup/email/card, bounded by daily caps. OpenGong Lite's `npm start` should replicate this in Node: on first run, check for `PYAI_API_KEY` in `.env`; if absent, `POST /v1/sandbox/keys` with native `fetch`, write the returned key into `.env` automatically, and print what happened (not just silently mutate a file — trust matters).
4. **Prerequisite checks with friendly errors, not crashes.** Node ≥ 22 is a hard PyAI-examples requirement precisely because it removes the need for third-party deps (`fetch`, `--env-file`, `ws` all native) — but that only helps if the tool *checks* the running Node version first and prints "Node 22+ required, you have 18.x, upgrade with nvm" instead of a `SyntaxError` three files deep.
5. **A `doctor`/self-test command.** Not present as a named convention in any repo studied directly (npm's own `npm doctor` is the closest canonical example — checks git/node executability, registry reachability, node_modules writability, cache integrity, and prints remediation). No AI-tool repo in this study shipped a bespoke `doctor` command, which is a gap OpenGong Lite can differentiate on: `npm run doctor` should check Node version, `.env` presence + required keys, sandbox key validity (one live ping), and sample-data presence, printing a green/red checklist.
6. **Bundled sample data so the demo needs zero setup** — covered in depth in §4, but the setup-friction angle is: the *first* thing `npm start` does should be able to run end-to-end against the bundled sample call, before the user has uploaded anything or connected anything real. That's the difference between "5 minutes to install" and "5 minutes to see it work."

**Exact command sequence recommended for OpenGong Lite:**
```bash
git clone https://github.com/<org>/opengong-lite.git
cd opengong-lite
cp .env.example .env          # sandbox key auto-fills on first run if left blank
npm install
npm start                     # doctor checks -> mints sandbox key if missing -> loads sample call -> opens localhost
```
Target: 4 commands, under 5 minutes on a cold machine with only Node 22 pre-installed. `npm start` internally: (a) run doctor checks, (b) auto-mint `PYAI_API_KEY` via `POST /v1/sandbox/keys` if unset, (c) seed sample data if `data/` is empty, (d) start server, (e) print the localhost URL.

Sources:
- https://docs.pyai.com/quickstart
- https://github.com/atomsai/pyai-examples
- https://docs.npmjs.com/cli/v11/commands/npm-doctor/
- https://github.com/ollama/ollama/blob/main/README.md
- https://github.com/plandex-ai/plandex/blob/main/README.md

---

## 3. Security hygiene for a public AI repo

**`.env` handling**
- `.env` always gitignored from commit #1 (not added later — a `.env` that was ever committed stays in git history even after a later `.gitignore` add; needs `git filter-repo`/BFG if it happens).
- `.env.example` committed with placeholder values only (`PYAI_API_KEY=` blank or `pyai_test_xxx` placeholder, never a real key).
- Never log the key value, even at debug level — log "PYAI_API_KEY: set (pyai_test_***last4)" style masking if you must log presence.

**Secret scanning**
- `gitleaks` is the de facto standard. Minimal GitHub Actions wiring (personal/non-org repos need no license key):
  ```yaml
  name: gitleaks
  on: [pull_request, push, workflow_dispatch]
  jobs:
    scan:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v6
          with: { fetch-depth: 0 }
        - uses: gitleaks/gitleaks-action@v3
          env:
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  ```
  Ship a `.gitleaks.toml` allowlist for the sandbox-key placeholder pattern (`pyai_test_`) so scanning doesn't false-positive on the documented example key format in the README.

**Uploaded audio file safety** (OpenGong Lite will accept user-uploaded call audio):
- **Path traversal**: never build the storage path from user-supplied filenames directly. Generate a server-side UUID filename; store the original name only as metadata. Resolve the final path and assert it's still inside the intended base directory before any filesystem write.
- **Size caps**: enforce a hard limit (e.g. 25–50MB for a call recording) checked incrementally during streaming upload, not after full buffering — abort early rather than let a multi-GB file exhaust memory/disk.
- **MIME/type validation**: validate by sniffing actual file bytes (magic-number check), not just the extension or client-supplied `Content-Type` header, which is trivially spoofable. Reject anything that isn't a recognized audio container (wav/mp3/m4a/ogg).
- **Never execute or transcode uploaded files with a shell-out that includes user-controlled filename strings** — a classic injection vector if `ffmpeg` is shelled out to with unsanitized paths.

**SECURITY.md**
- Minimal viable version: supported versions table (for a hackathon repo, just "main branch"), a private disclosure channel (email or GitHub Security Advisories — not a public issue), and an explicit statement that the sandbox API key is rate-limited/non-production so accidental exposure is low-severity by design (a genuinely useful hackathon-specific reassurance: "our sandbox keys mint for free and cap daily — losing one isn't a big deal, but don't commit your production key").

**License header / MIT boilerplate**
- Root `LICENSE` file with the standard MIT text, copyright line updated to current year + author/org.
- No per-file header required for MIT (unlike Apache-2.0) — MIT is conventionally applied at the repo root only. Don't over-engineer this; adding per-file boilerplate headers is more likely to look copy-pasted/uncanny to HN reviewers than it is to look diligent.

**What public repos get flagged for in week 1** (pattern across the sources reviewed, especially the Hyprnote thread — see §5):
1. Privacy-claim vs. reality mismatch — a repo that says "nothing leaves your machine" while shipping default-on telemetry (Sentry/PostHog/Axiom) gets called out hard and fast. If OpenGong Lite ships any analytics, it must be opt-in and disclosed in the same breath as the privacy claim, never contradicted by it.
2. A required env var that isn't actually required for the demo path throwing a raw stack trace/error code instead of a plain-English message.
3. Committed secrets or leftover `.env` in an early commit (the #1 mechanical flag — gitleaks CI catches this before a human does, which is the point of running it from commit #1).
4. Misleading social proof (logos, "trusted by" claims) — a credibility hit, not a security one, but shows up in the same "week 1 scrutiny" bucket for hackathon-launched repos and is worth avoiding in the README.

Sources:
- https://github.com/marketplace/actions/gitleaks
- https://github.com/gitleaks/gitleaks-action
- https://owasp.org/www-community/attacks/Path_Traversal
- https://portswigger.net/web-security/file-path-traversal
- https://news.ycombinator.com/item?id=44725306 (Hyprnote — telemetry-vs-privacy-claim objection)

---

## 4. Sample data plan

**Legal precedent for shipping demo call data:**
- `gwenshap/sales-transcripts` on Hugging Face ships fully **synthetic, LLM-generated** sales conversations for five fictional companies, built explicitly as demo data for a sales-assistant example app — this is the closest direct precedent for "fake sales calls shipped as OSS demo fixtures" and confirms the pattern is normalized: generate the dialogue with an LLM, attach a permissive license, ship as text (or optionally as TTS audio) fixtures. https://huggingface.co/datasets/gwenshap/sales-transcripts
- Academic precedent for text→TTS synthetic call pipelines: TeleAntiFraud-28k converts LLM-generated conversational text into dual-channel audio via the open-source ChatTTS model; a fraud-detection paper (arXiv 2606.28002) does the same with GPT-2-generated transcripts converted via multi-speaker xTTS into two-speaker call recordings. Same recipe, different domain — confirms "LLM script + open TTS voice = legally clean synthetic call audio" is an established research pattern, not a novel legal risk.
- Real recorded calls are the thing to avoid entirely for a public demo repo — even with consent, releasing real customer/prospect voices under MIT is a reputational and possibly regulatory risk (see Meetily's own README leading with GDPR fine figures as their pitch). Never ship real audio, ever, including "anonymized" real calls — voice itself is the PII.

**Recommended plan for OpenGong Lite sample data:**
1. Write 3–5 short (2–4 minute) fictional sales-call **scripts** with an LLM — two-speaker (rep + prospect), covering a spread of call outcomes (discovery, objection-handling, close, no-show reschedule) so the demo shows range.
2. Synthesize each script to audio with an open-source multi-speaker TTS model (e.g. Kokoro, Piper, or Chatterbox — all MIT/Apache-licensed per this research) using two distinct voices per call for the two speakers, OR ship as text-only transcripts with timestamps if the hackathon timeline doesn't allow TTS generation — a working demo on text-only sample data with an "upload your own audio to transcribe" path is a legitimate fallback and should not block the ship.
3. License the sample-data folder explicitly (a `data/README.md` or `data/LICENSE` stating "synthetic, LLM-generated, no real persons, CC0/MIT") so a reviewer never has to wonder if it's a real leaked call.
4. Name companies/people fictitiously and generically (avoid anything resembling a real company name — the same instinct that keeps AtomsAI benchmarking against implementation consultancies, not real product names, applies here: don't let a "TechCorp calls Globex" fixture accidentally collide with a real trademark).
5. `npm start` seeds this sample set automatically into the demo on first run (see §2) — this is what makes "sample data included so the demo needs zero setup" true rather than aspirational.

Sources:
- https://huggingface.co/datasets/gwenshap/sales-transcripts
- https://arxiv.org/pdf/2503.24115 (TeleAntiFraud-28k, ChatTTS pipeline)
- https://arxiv.org/pdf/2606.28002 (GPT-2 script + xTTS two-speaker synthesis)

---

## 5. Show HN craft for this category — objections to pre-empt

Reviewed threads: **Launch HN: Hyprnote (YC S25) — open-source AI meeting notetaker** (news.ycombinator.com/item?id=44725306), **Show HN: OWhisper — Ollama for realtime speech-to-text** (item?id=44901853), **Show HN: Whispering — open-source alternative to Superwhisper** (item?id=44510624), plus title-pattern scan of adjacent Whisper/transcription Show HN posts.

**Title formula observed:**
`Show HN: <Name> – <what it does>, <one differentiator clause>` — e.g. *"Show HN: Whispering – Open-source, local-first dictation you can trust"*, *"Show HN: Whispering – An open-source alternative to Superwhisper"*. The differentiator clause is almost always one of: open-source, local-first, free/no-subscription, or "alternative to [known paid tool]." For OpenGong Lite the natural formula is: **"Show HN: OpenGong Lite – an open-source Gong, self-hostable, five-minute setup."** Naming the category-defining competitor (Gong) directly in the differentiator clause is the established pattern (Whispering names Superwhisper explicitly) and should not be softened.

**What top comments praised:**
- Speed/responsiveness of local inference ("it's fast and really impressive").
- Genuine local-first privacy when it's actually true and not contradicted elsewhere in the same repo.
- Smooth, low-friction install ("nice & smooth" installation was specifically called out as a compliment on Hyprnote).
- Filling a standards gap (OWhisper's Deepgram-API-compatible realtime interface was praised because "there's not a lot of it").

**What top comments attacked — direct pre-emption list for OpenGong Lite's README/FAQ:**

| Objection raised in real threads | Pre-emption for OpenGong Lite |
|---|---|
| Privacy claim contradicted by default-on telemetry (Hyprnote: "no data ever leaves your machine" vs. bundled Sentry/PostHog/Axiom) | State exactly what leaves the machine: audio → PyAI API for transcription (name it plainly), nothing else. No telemetry by default. If any analytics exist, make them explicitly opt-in and say so in the same sentence as any privacy claim. |
| A blank/missing env var throws a raw error code instead of a clear message ("EmptyToken" on Hyprnote) | The `doctor`/first-run check must name the exact missing var and the exact fix, never surface a raw exception. |
| Speaker diarization missing = "show stopper" for multi-person calls (Hyprnote: entire 30-person meeting collapsed into one speaker) | If OpenGong Lite doesn't do full diarization for v1, say so explicitly in the README under "Known Limitations" rather than let a reviewer discover it live — an honest limitations section reads as credible, not weak. |
| Misleading social proof / "logo plays" (Hyprnote founders admitted overstating customer logos) | Don't put customer/company logos on the README at all for a 33-hour hackathon repo — it will read as fabricated and this exact tactic was called out and the founders had to publicly walk it back. |
| Consent/legal requirements for recording calls, jurisdiction-dependent | Add one explicit line: recording consent/two-party-consent laws are the user's responsibility, OpenGong Lite doesn't record calls itself, it transcribes/analyzes audio you provide. |
| Restrictive license kills adoption ("GPL makes it dead in the water for using at work") | MIT is already the right call here — state it prominently in the badge row, first line of README, and don't bury it. |
| Setup/documentation buried, hard to find ("I would want such information accessible without having to go hunt for it") | Put the exact quickstart command block above the fold, not behind a "click through the docs" link. |
| Not actually local/self-hosted despite branding as such ("Ollama for X" backlash — implies fully local, but calls out to a hosted Deepgram-compatible API) | Be precise about what's local vs. hosted: OpenGong Lite is self-hosted app + hosted PyAI inference API — say this plainly rather than implying full local-only operation, since the sandbox-key flow is inherently a hosted-API dependency. |

**Net framing recommendation:** OpenGong Lite's honest pitch is "open-source, self-hosted call-intelligence app with a hosted inference API you can swap out" — not "fully local/private," since it depends on the PyAI sandbox API. Claiming full privacy when a cloud call happens is exactly the failure mode that got Hyprnote's top comment thread. Be precise instead: self-hostable app, MIT, your data stored on your own infra, transcription/analysis calls go to PyAI (name it), swappable for self-hosted Whisper if a user wants zero-cloud.

Sources:
- https://news.ycombinator.com/item?id=44725306
- https://news.ycombinator.com/item?id=44901853
- https://news.ycombinator.com/item?id=44510624
- https://news.ycombinator.com/item?id=44942731

---

## README skeleton for OpenGong Lite

```markdown
<p align="center"><img src="docs/logo.svg" width="120" alt="OpenGong Lite logo" /></p>
<h1 align="center">OpenGong Lite</h1>
<p align="center"><b>An open-source Gong. Self-hosted, MIT-licensed, five-minute setup.</b></p>

<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green"></a>
  <img alt="Node >= 22" src="https://img.shields.io/badge/node-%3E%3D22-brightgreen">
  <a href="#security">gitleaks: passing</a>
</p>

<p align="center"><img src="docs/demo.gif" width="720" alt="OpenGong Lite demo: upload a call, see transcript + talk-time + insights in under 30s" /></p>

## What it does
Upload a sales call recording (or use the bundled sample). Get a transcript, speaker talk-time split,
and AI-generated call insights — in your own repo, on your own infra.

## Quickstart (5 minutes, zero signup)
\`\`\`bash
git clone https://github.com/<org>/opengong-lite.git
cd opengong-lite
cp .env.example .env
npm install
npm start
\`\`\`
`npm start` runs a doctor check, mints a free sandbox API key automatically if `.env` is blank,
loads the bundled sample call, and opens http://localhost:3000 — no PyAI account, no card, no email.

## What's local, what's hosted
- **Local**: the app, your audio files, your database — all on your machine/infra.
- **Hosted**: transcription + insight generation calls the PyAI API (sandbox key auto-provisioned; swap
  in your own key or a self-hosted model for zero-cloud operation — see [docs/self-hosted.md]).
We say this plainly because "local-first" claims that quietly call a cloud API are the #1 thing this
category gets called out for.

## Sample data
`data/sample-calls/` ships 5 fictional, LLM-generated sales-call scripts (synthetic voices, no real
people, no real company). Zero setup needed to see the product work. See `data/README.md` for the license.

## Known limitations (v1)
- Diarization: best-effort, may misattribute overlapping speech.
- Two-party consent for recording real calls is your responsibility — OpenGong Lite doesn't record; it
  processes audio you provide.

## Security
- Secrets never leave `.env` (gitignored from commit 1); `.env.example` has no live keys.
- gitleaks runs in CI on every push/PR.
- Uploaded audio: size-capped, magic-byte MIME validation, UUID-based storage paths (no path traversal).
- See [SECURITY.md] for disclosure.

## License
MIT — see [LICENSE](LICENSE).
```

---

## Top 5 takeaways

1. **Winning READMEs put a runnable command and a demo GIF/video above the fold, in that order, before any features prose** — screenpipe, ollama, and plandex all do this; Meetily is the one exception, and only because privacy-risk framing *is* its whole pitch.
2. **The single highest-leverage 5-minute-setup move is auto-provisioning the sandbox API key inside `npm start`** using PyAI's real `POST /v1/sandbox/keys` (no signup/card/email) — write the key into `.env` automatically and tell the user what happened; this is the difference between a "quickstart" and an actual 5-minute setup another team can run cold.
3. **The Hyprnote Launch HN thread is a direct playbook of what NOT to do**: don't claim local/private while shipping default telemetry, don't show fake/overstated customer logos, don't let missing env vars throw raw errors, don't skip a stated diarization limitation — all four were called out publicly and the founders had to walk them back live in the thread.
4. **Synthetic, LLM-generated sample call data is a normalized and legally safe pattern** — `gwenshap/sales-transcripts` on Hugging Face and academic TTS-pipeline papers (ChatTTS, xTTS) confirm "LLM script + open TTS voice" is the established way to ship demo call audio; never ship real recorded calls, even anonymized.
5. **OpenGong Lite's honest positioning is "self-hosted app + hosted PyAI inference," not "fully local/private"** — naming this precisely in the README pre-empts the exact objection ("Ollama for X" backlash, Hyprnote's telemetry callout) that sank credibility in comparable launches; MIT license and Gong-as-named-competitor in the title both match what actually works in this category's Show HN title formula.

Full findings, README skeleton, security checklist, and objection table: `/Users/souravm/Projects/opengong-lite/research/04-repo-craft.md`
