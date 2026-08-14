# Docs Benchmark: OpenGong Lite vs the Best-Documented OSS Repos

Date: 2026-08-14. Method: fetched the live READMEs of 7 gold-standard repos
(PostHog, Supabase, Bun, tldraw, Excalidraw, Zod, Cal.com; Vite as a control),
built the rubric from what they actually do, then scored both our repos
hands-on. Prior internal research (`research/04-repo-craft.md`,
`research/05-posthog-craft.md`) covers the adjacent Show HN corpus
(screenpipe, ollama, Meetily, Hyprnote) and is cited where it converges.
This file is the report only. Nothing was edited, nothing committed.

Caveat: the Cal.com main-branch README fetched as the community "Cal.diy"
variant. Structural observations (badges, screenshot-first, deploy buttons,
contributor mosaic) hold either way.

---

## 1. The rubric, built from observation

14 criteria. Each exists because at least one gold repo does it visibly well.

| # | Criterion | Who models it best (evidence) |
|---|---|---|
| R1 | One-liner naming the job + differentiator in the first two lines | Zod: "TypeScript-first schema validation with static type inference". tldraw: "Build infinite canvas apps in React". |
| R2 | Proof visual before prose (real product screenshot early) | Cal.com: booking-screen shot immediately after the description. Supabase: dashboard shot before the architecture section. |
| R3 | Badge row as functional trust signals (license, runtime, CI, community) | Cal.com: 6 badges (MIT, stars, commit activity, Docker pulls, help-wanted, CoC). Zod: CI, license, downloads, Discord, stars. |
| R4 | Copy-paste run path inside the first ~20 lines, real URL, real command | Bun: `curl -fsSL https://bun.com/install | bash` right after the pitch. PostHog: one-line hobby deploy. tldraw: `npm i tldraw` + minimal component under "Quick start". Supabase and Vite fail this (docs-site redirect only). |
| R5 | Output shown before mechanism explained | Zod: `// => returns { username: "billie", xp: 100 }` before any error-handling prose. |
| R6 | Motion: GIF/video of the core interaction | Weak across the gold 7 (PostHog has a video thumbnail; the rest are static). The adjacent corpus is stronger: screenpipe and plandex lead with demo video before any prose block (research/04 §1). |
| R7 | Nav row to deeper docs from the top | PostHog: Docs / Changelog / Bug report links in a nav row under the logo. |
| R8 | Community and adoption proof | tldraw: "powers canvas experiences in products from Google, Shopify, BlackRock" + 30 companies. Excalidraw: adopter list + sponsor avatars. Cal.com: contrib.rocks mosaic. |
| R9 | Competitor handling via positioning sentence, no attack | Bun: "a drop-in replacement for Node.js". Supabase: "Firebase-like developer experience using open source tools". Show HN corpus goes further and names the incumbent in the title (Whispering vs Superwhisper, research/04 §5). |
| R10 | Honest scoping before the reader trips on it | tldraw: "Production use requires a license key" stated upfront. Meetily: pre-release + supported-OS badges above the fold. PostHog: "You'll hate PostHog if..." page. |
| R11 | Extension/ecosystem story with a starter path | Supabase: 13-language client-library matrix. Bun: README as a guides hub. PostHog: plugin starter kit ending in "Search for `<TODO:`". |
| R12 | A signature move nobody else has | PostHog: open company handbook + the dedicated-reader easter egg. Vite: audio pronunciation link. Cal.com fork: "No Open Core split" licensing section. |
| R13 | Docs beyond README: CONTRIBUTING, SECURITY, issue templates, changelog | Cal.com: CONTRIBUTING referenced repeatedly, CoC badge. tldraw: CONTRIBUTING.md linked. Notably, SECURITY.md was absent or unlinked in nearly all 7. |
| R14 | Zero-install try path (hosted demo or deploy button) | Excalidraw: excalidraw.com link in the hero. Cal.com: 4 one-click deploy buttons (Gitpod, Railway, Northflank, Vercel). |

---

## 2. Scorecard

### 2a. Primary: `/Users/souravm/Projects/opengong-lite` (README.md + surrounding)

Audiences: (J) hackathon judge skimming on a projector Friday, (H) Show HN
reader deciding in 30 seconds whether to clone.

| # | Verdict | Evidence |
|---|---|---|
| R1 | **strong** | README:3-5. The Perplexity analogy plus "Gong asks you to trust its summary. We show you the line." Names the job, the differentiator, and the incumbent in 3 lines. |
| R2 | **strong** | README:7, `docs/hero.png` is the real deal workspace (Brightsmile, "20 of 21 notes trace to the call. 1 held back."), consistent with the prose at line 14. |
| R3 | **gap** | Zero badges. MIT is never stated anywhere in README.md (only LICENSE + package.json). No Node version, no test count, no offline claim in badge form. Research/04 §5 flags burying the license as a known HN objection. |
| R4 | **gap** | README:20 is `git clone <repo>`, a placeholder that breaks copy-paste, the one thing all gold repos get right. Position is fine (line 17-24, screen 1-2) but sits below "How it works" where ollama/screenpipe put the command first. |
| R5 | **strong** | The four-states table (README:27-35) and the live fabrication story (README:37-41) both land before "Under the hood". Output first, mechanism later. |
| R6 | **gap** | Static PNG only. The core interaction is temporal: click a note, the line lights, the audio plays. A still image cannot show the product's one magic moment. No GIF, no video anywhere in the repo. |
| R7 | **gap** | DATA-FLOW.md is mentioned once at README:86, bottom of "Under the hood". SECURITY.md, `methodologies/README.md`, `samples/DEAL-STATE.md` are never linked from the README at all. |
| R8 | **adequate by design** | No adoption proof, correctly: repo is pre-launch and research/04 §5 documents the Hyprnote logo-overstatement backlash. Nothing fabricated. Right call, scored adequate only because the rubric row exists. |
| R9 | **strong** | Gong named in the blockquote (README:5), category anchored by the Perplexity analogy. Matches the Show HN title formula from research/04 §5. |
| R10 | **strong** | "What it doesn't do" (README:74-77) covers mono, interpretation gap, English-only, no CRM. DATA-FLOW.md has the full "You'll hate this if..." block (lines 95-113). |
| R11 | **adequate** | README:82-83 mentions `npm run new-extractor` and pack-as-JSON, one line each. No CONTRIBUTING.md, no starter walkthrough, no checklist. The extension story is real in code and thin in docs. |
| R12 | **strong** | DATA-FLOW.md as a line-cited network audit, "verify the verifier" (README:35), the attack-suite invitation (README:41). See section 4. |
| R13 | **gap** | SECURITY.md exists (good, most gold repos lack it). But: no CONTRIBUTING.md, `.github/` holds only ci.yml, no issue templates, no PR template, no changelog. |
| R14 | **gap** | No hosted demo, no deploy button. The colleague repo has a full Railway path; ours has none. |

**Consistency defects found hands-on (these outrank any rubric row):**

1. **DATA-FLOW.md is stale against `src/`.** Commit `c0bec7b` made key
   minting fully lazy and removed the boot-time reachability call. But
   DATA-FLOW row 4 still claims `npm start` calls `GET /v1/voices` at
   `src/index.js:13` (line 13 is now an fs import; `grep -rn "v1/voices" src/`
   returns nothing), row 1 still describes minting at cold start, and the
   "Turn it off" section (lines 90-93) still asserts "`npm start` ... 
   unconditionally mints/loads a PyAI key and calls `GET /v1/voices` ... every
   time it runs." The document's own contract (lines 4-5) says a mismatch is a
   bug in the document. It also now contradicts README:24 ("zero keys and zero
   setup"). The SCORECARD auto-check counts rows vs fetch sites, which is why
   it did not catch a behavioral change at an unchanged call site.
2. **START-HERE.md:53 is stale**: "`README.md` | Internal team README ...
   **not** the public launch README, which doesn't exist yet." The public
   README has existed since `f21e2dc`. A judge who opens START-HERE (the file
   literally named start here) gets told the README they just read is internal.

### 2b. Secondary: colleague-build clone (branch `gate-hardening`)

| # | Verdict | Evidence |
|---|---|---|
| R1 | strong | "**Gong's job, free.**" (line 3). Best first line of either repo. |
| R2 | strong | `public/screenshot.png` at line 16 with a captioned real sample. |
| R3 | gap | No badges; MIT never stated in the README (LICENSE file exists). |
| R4 | adequate | Real clone URL (line 86), but "Setup" starts at line 85, roughly three screens down. Violates the ~15-line rule every fast-adoption repo follows (research/04 §1). |
| R5 | strong | The ASCII "What a checked note looks like" block (lines 31-48) shows backed / not found in the call / blocked as literal output before any mechanism. Renders on a projector, in a gist, and in an HN comment. |
| R6 | gap | Static screenshot only. |
| R7 | gap | DATA-FLOW.md named once at line 158; `/how` route partially compensates in-app. |
| R8 | adequate by design | Same pre-launch posture. |
| R9 | strong | "People pay Gong $1,400 a seat for this. Ours is a git clone." (line 211) plus a Fireflies displacement sample. |
| R10 | strong | "You'll hate this if" appears at line 22, higher than in our README. |
| R11 | adequate | Env fallback + LLM swap documented; no contributor path. |
| R12 | strong | The "Demo script (90 seconds)" section (lines 199-211). No gold repo has one; for a hackathon it is exactly the right artifact. |
| R13 | gap | Same as primary. |
| R14 | adequate | Full Railway deploy section with variables table and healthcheck. |

Cross-repo flag for Sourav: the two READMEs disagree on Node floor (22 vs 20)
and point at different clone targets. If judges see both on Friday, one line
in each README naming the other ("the app entry lives at X, the harness and
methodology engine at Y") prevents the "which repo is the project" question.

---

## 3. Ranked optimizations

Impact scored for (J) Friday judges and (H) the Show HN reader.

### Do before Friday

**1. Re-verify DATA-FLOW.md against current `src/` and fix rows 1 and 4 plus
the "Turn it off" section.** Fix: row 4 either gets deleted or rewritten as
"first transcription, lazy" with the current call site; the "Turn it off"
paragraph flips to say `npm start` is zero-network at boot and the sandbox key
mints on first transcription; bump the "Verified against the code on" date.
Reference: the document's own opening contract, which is the whole reason the
artifact works. Effort: 30 min. Impact: J medium (only if a judge opens it),
H **critical**. The first HN commenter who greps `src/` for `v1/voices` and
finds the audit trail wrong takes the entire credibility story down with it,
and this doc is the credibility story. Follow-up (post-Friday): extend the
SCORECARD auto-check so a claim like "boot calls X" is asserted against code,
because the row-count gate passed while the behavior changed.

**2. Put the real clone URL in README:20.** `git clone <repo>` cannot be
copy-pasted. Every one of the 7 gold repos has a runnable literal command.
Effort: 2 min once the GitHub URL exists (placeholder day-of if needed, but it
must be real before any judge sees the repo). Impact: J high, H critical.

**3. Record a 10-15 second GIF of the magic moment and place it directly
under the hero image (between README:7 and README:9).** Content: cursor
clicks a note, the transcript line lights, audio plays (waveform or
highlighted word movement makes the playback visible without sound). Reference:
screenpipe and plandex lead with motion before prose (research/04 §1); this is
the one rubric row where the adjacent corpus beats the gold 7, and our product
is unusually motion-shaped. Effort: 45-60 min (screen record `npm start`,
trim, `gifski` or similar, commit under `docs/`). Impact: J **highest**
(demo magnetism on a projector even before the live demo starts), H high
(the 30-second decision is made on this asset).

**4. Move "Try it" (README:17-24) above "How it works" (README:9-15).**
Reference: ollama, screenpipe, plandex all place the runnable command before
the feature list; research/04 takeaway 1 says this exact thing and the README
currently inverts it. Effort: 5 min. Impact: J medium, H high.

**5. Add a fact row under the tagline.** Suggested copy (voice-checked):

    MIT. Node 22+. Zero runtime dependencies. 409 tests, offline. The demo needs no keys.

Plain text or committed SVG shields, never remote shields.io images: the
Friday demo may run without wifi and remote badges would render as broken
boxes on the projector. Reference: Meetily's honest-scoping badges and Zod's
"2kb core, zero dependencies" upfront. Effort: 20 min. Impact: J medium,
H high (MIT visibility is a documented HN objection, research/04 §5).

**6. Write the 90-second demo script for the primary repo.** Steal the
structure from colleague-build README lines 199-211 wholesale: numbered
beats, which sample to click, which note to point at, the closing line.
Location: `team/` (it is run-of-show, non-public). Effort: 20 min. Impact:
J **high** (it is the difference between a demo and a wander), H none.

**7. Fix START-HERE.md:53.** One-line edit: the README row now says public
launch README, live. Effort: 5 min. Impact: J medium (judges poking the repo
tree hit the contradiction), H low.

### Do before public launch

**8. Add a nav row under the blockquote (between README:5 and README:7).**
Suggested copy:

    Try it · What leaves your machine · Security · Coach packs · The sample deal

linking to `#try-it`, `DATA-FLOW.md`, `SECURITY.md`, `methodologies/README.md`,
`samples/DEAL-STATE.md`. Reference: PostHog's Docs/Changelog/Bug-report nav
row under the logo. Effort: 10 min. Impact: J low, H high. DATA-FLOW.md is
the best pre-emption asset in the repo and it is currently buried at line 86.

**9. CONTRIBUTING.md built around "add an extractor in 3 minutes."** Walk
`npm run new-extractor` end to end, then the methodology-pack compile path
(`npm run coach -- compile`), then the taskboard/protocol pointer for humans.
End with PostHog's starter-kit trick: a literal checklist closing with
"Search for `<TODO:`, make sure none are left." Reference: PostHog
plugin-starter-kit (research/05 practice 6). Effort: 1-2 h. Impact: J low,
H **high** (this is the API-gravity axis, and the repo's best story after the
gate itself).

**10. Issue templates, including one nobody else has: the fabrication
report.** `.github/ISSUE_TEMPLATE/` with a standard bug form plus a
`fabrication-report.md` asking for: the quote, the call or sample, the state
the checker returned, expected state. This converts README:41 ("Try to break
it yourself") from a dare into a funnel, and every submission is a new
permanent test by the repo's own rule. Reference: Cal.com's community-file
completeness, with a twist that is ours. Effort: 45 min. Impact: J none,
H medium-high (it also signals the attack suite is genuinely open).

**11. Adopt the colleague's ASCII checked-note block into the primary
README, between the four-states table (README:35) and the fabrication story
(README:37).** The table tells; the block shows literal output with the
backed / not found in the call / blocked labels inline. It renders in
terminals, HN comments, and RSS where the PNG does not. Effort: 30 min
(regenerate from our own sample deal so the content matches Brightsmile).
Impact: J medium, H high.

**12. Ship a zero-install try path.** Cheapest version: the Tier-1 export
already produces a single self-contained HTML file with viewer, styles, and
bundle inlined (DATA-FLOW.md lines 64-67). Publish one export of the
Brightsmile deal at a static URL and link it in the hero: "See the sample
deal in your browser." Alternative or additional: a Railway/Vercel deploy
button like the colleague repo already documents. Reference: Excalidraw's
excalidraw.com hero link, Cal.com's four deploy buttons. Effort: 1-3 h.
Impact: J low (local demo covers it), H **high** (most HN readers never
clone; the ones who click decide in the browser).

**13. Repo hygiene at flip-public.** GitHub topics (`sales`, `transcription`,
`llm`, `self-hosted`, `mit-license`, `call-recording`), description field,
website field, social-preview image set to `docs/hero.png`. Reference:
PostHog's own launch retro: "make sure you have tagged your repo
appropriately" (research/05 practice 9). Effort: 15 min. Impact: J none,
H medium (discovery after the thread dies).

**14. Skip for now: changelog.** No gold repo of the 7 surfaces one
prominently, and a pre-1.0 hackathon changelog reads as ceremony. Revisit at
first tagged release.

---

## 4. Where our docs already beat the gold standard

Judged honestly against all 7 fetched READMEs.

**1. The four-states citation table (README:27-35).** No gold repo presents
its own failure modes as a first-class table on the first screen. Zod shows
happy-path outputs; nobody shows the taxonomy of how their output can be
wrong and what the user sees then. "Backed, citation corrected" and "not
found in the call" as named, visible states is a documentation move the gold
standard does not have.

**2. The live self-incrimination story (README:37-41).** "It caught its own
summarizer inventing a price," with the verbatim artifacts committed at
`research/00-api-probe/live-recap-run/`. Gold repos publish benchmarks that
flatter them; none publish a reproducible record of their own upstream
component fabricating data and the system catching it. This is the single
most HN-proof paragraph in the repo. The colleague README has the same story
told well (lines 58-69); keep both.

**3. DATA-FLOW.md as a line-cited network audit.** PostHog's transparency
runs on policy pages; Supabase links terms. Nobody in the gold set ships a
per-call-site audit table with file and line, an "endpoints named in the
codebase but not actually called" section, and a standing invitation to open
an issue if the doc drifts from `src/`. This exceeds even what research/05
proposed. The honest caveat: it has drifted, today, exactly once (section 2a
defect 1), and its one failure mode is staleness. Fix 1 restores it; wiring
the claim-level check into CI keeps it the best document in the repo.

Honorable mention: the Numbers table (README:63-71) carries a provenance
column ("where it comes from"), including the admission that a fresh clone
shows null cost until you run one. Bun ships a "fast" badge; we ship the
receipt. That is the house style working.
