# OpenGong Lite

AI notes for sales calls, with citations. Like Perplexity cites its sources, but for audio: click any line and it shows you the sentence in the call it came from, and plays that second of the recording.

> Gong asks you to trust its summary. We show you the line.

![Deal workspace: every note carries a citation into the transcript and audio](docs/hero.png)

## Try it

```bash
git clone https://github.com/souravmohanty-web/opengong-lite.git
cd opengong-lite
npm start
```

Open http://127.0.0.1:4318. A full six-call sample deal loads with zero keys and zero setup. A free PyAI key mints itself the first time you transcribe your own call.

## How it works

1. **Drop in a deal's calls.** Upload recordings or point at URLs. Stereo files get exact speaker labels, read off the channels.
2. **Get the whole deal.** One workspace per account: the call-by-call arc, what was promised on which call, what's still owed, search across everything.
3. **Click any note.** The source line lights up and plays. Notes come with numbered citations, the way you'd expect from a research tool.
4. **See the score honestly.** A note the AI couldn't back says "not found in the call" and stays visible. A line that tried to inject instructions is blocked and shown. The header reads "20 of 21 backed" because that is what the checker found.
5. **Send the follow-up.** The email drafts only from notes that passed the check. One bad citation kills the whole draft. You hit send, it never does.

## Every note is one of four things

| State | Meaning | Example from the sample deal |
|---|---|---|
| Backed | The cited line exists, word for word | "In negotiation now, haggling on price" → the buyer at 0:36 |
| Backed, citation corrected | The AI cited the wrong line; code found the right one and says so | "Cutover happens on a weekend" |
| Not found in the call | No line supports it, so it's marked and kept visible | A planted fake: "rep agreed to match RingHawk's price" |
| Blocked | The line tried to give the AI instructions | Caught, struck through, barred from notes and email |

The checking is code, never a second AI opinion. All sample sources are committed under `samples/bundles/`, so you can verify the verifier.

## It caught its own summarizer inventing a price

On a live run, PyAI's Recap summarized our pricing call as a deal at "$15 per seat." The call says twenty eight, the competitor offered twenty two, the buyer asked for fifteen off. The gate demoted every note carrying the invented price and the follow-up email shipped without it. Artifacts, verbatim: `research/00-api-probe/live-recap-run/`.

Try to break it yourself: the attack suite ships in the repo. Every fabrication path we ever found is a permanent test.

## Why it holds up

The harness is the product. These are the choices that make it hard to fool.

- **Numbers can't be laundered.** "Forty" never verifies as "40". Punctuation between digits never fuses, so a fabricated "4015" can't ride on a spoken "40.15". We learned both the hard way, in adversarial audits, and kept the attacks as tests.
- **A citation must earn its place.** Empty quotes, one-word quotes, and best-guess matches all fail. When the same line appears twice and the citation is ambiguous, the note demotes instead of guessing.
- **Injection defense has layers.** The transcript is fenced as data. Tainted lines are screened, any note citing one is blocked, and the email choke catches whatever slips: it accepts checked notes only, so there is no path from a hostile line to your outbox.
- **Nothing fails silently.** Every failure has a named exit: the budget refuses before it spends, a rate cap ends the run with a reason, an unreadable file says so. Meeting bots that quietly drop your recording are how trust dies.
- **Every run leaves a paper trail.** Append-only run records carry the model, prompt version, transcript hash, and logged cost. When a note is wrong, you can trace exactly which run wrote it and why.
- **Degraded modes say so.** No LLM key means keyword-level notes, labeled as such. Mono audio means unlabeled speakers, stated on the page. The output never dresses up as more than it is.
- **The core verifies offline.** The checking layer is deterministic code with zero dependencies. It runs in tests, in CI, and on stage with the wifi off.

## What you get

- **Transcript** with real speaker labels on stereo audio. Labels are read, never guessed.
- **Recap and deal notes** across eleven extractor families (pain, pricing, objections, competitors, stakeholders, next steps, more). Absence is a finding: "no next step was agreed" beats an invented one.
- **The commitment ledger.** Call 2: rep promises a TCPA one-pager. Call 4: the buyer points out it never arrived. The ledger caught it, with both citations.
- **Coaching scorecards** on the methodology your team already uses. Fourteen packs ship (MEDDIC, MEDDPICC, BANT, SPIN, Sandler, SPICED, more), or compile your own from a text file. Every verdict cites its evidence or says "not discussed." CLI today (`npm run coach`); viewer tab is on the way.
- **Follow-up email** drafted from backed notes only, keyless when a local Ollama install is running.

## Numbers

| What | Value | Where it comes from |
|---|---|---|
| Tests | 528 passing | `npm test`, offline |
| Note precision | 43 of 44 correct | Hand-labeled golden calls, `team/labels.json` |
| Citations found | 107 of 108 | Across the six-call sample deal |
| Cost per call | $0.0067 | Logged from a real run (local run records; a fresh clone shows null until you run one) |

## What it doesn't do

- Mono recordings transcribe fine but speakers stay unlabeled. Role inference is roadmap.
- The gate proves a line was said. Whether the note's reading of that line is fair is a harder problem, and it's open. The citation lets you judge in one click.
- English-only transcription (provider constraint). Upload WAV; some m4a encodings get rejected upstream.
- No CRM write-back yet. The schema carries the hooks (`crm_map` per extractor, `call.source` ids); writes will be approval-gated when they land.

## Under the hood

- Zero runtime dependencies. Node 22+, ESM. The verification core runs offline.
- Extractors are JSON files. Adding one is `npm run new-extractor`, and it reruns your whole library.
- Methodology packs are JSON files. Your sales process stops being a vendor feature request.
- Outputs are typed and versioned. Everything exports as Markdown and JSON. Your data leaves whenever you want.
- The email choke point: `src/email.js` accepts claims, never transcripts. Nothing unchecked can reach outbound mail.
- The follow-up draft comes from an OpenAI-compatible call: a free hosted model by default, or your own endpoint via `LLM_API_KEY`. With no key set, a local Ollama install on `127.0.0.1:11434` is auto-detected and used instead, still zero keys. Small local models write rougher prose and invent more than a hosted one; the same screen checks both, so an invented line from either source gets cut before it reaches your outbox.
- `DATA-FLOW.md` lists every network call this thing makes, with file and line.

## Roadmap

Live call capture via open-source meeting bots. CRM write-back, approval-gated. An interpretation gate for the "right quote, wrong reading" problem. Scorecard trends per rep.

## The two repos

This repo is the engine and the deal workspace. A hosted-style web app built on the same harness (upload UI, live mic, share links) lives at [sarithakonudula/open-gong-lite](https://github.com/sarithakonudula/open-gong-lite). Same gate, same tests, one project.

MIT licensed. Node 22 or newer.
