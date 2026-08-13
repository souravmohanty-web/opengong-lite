# 05 — PostHog Craft: What Transfers to a 33-Hour, 4-Person, MIT Repo

Research date: 2026-08-13. Every claim below is cited to a live page or a file in a public PostHog repo.

Filter applied throughout: PostHog is ~100 people, 190k+ customers, a multi-product monorepo, and a public company handbook. Most of what they do is scale machinery. The test for inclusion here was: **can 4 people ship this artifact inside 33 hours, and does it move one of the judging criteria (product pull 30 / demo magnetism 25 / API gravity 20 / loop depth 15 / craft 10)?** Everything that failed that test is in the DO-NOT-COPY list at the bottom, with the reason.

---

## Top 10 transferable practices

---

### 1. Give sample data a fictional company with a coherent story, not lorem ipsum

**The PostHog practice.** PostHog's demo data is not random events. It is a simulated product called **Hedgebox** ("like Dropbox for hedgehogs") with a real domain (`https://hedgebox.net`), a real pricing ladder (`personal/free`, `personal/pro`, `business/standard`, `business/enterprise`), real named pages (`/pricing/`, `/files/`, `/account/billing/`), and a running narrative sub-plot: a sponsored YouTube landing page at `/mariustechtips/`, which exactly 4% of simulated people watch and arrive from with `utm_source=youtube`.

> "We've had a demo data generator simulating a product called Hedgebox (like Dropbox for hedgehogs) for a while now. It creates realistic event data with user profiles, behaviors, timezones, even includes features like a Marius Tech Tips sponsorship landing page and an A/B test on the signup flow."

**Sources**
- https://github.com/PostHog/posthog/blob/master/tools/hedgebox-dummy/README.md (quote above)
- https://github.com/PostHog/posthog/blob/master/products/demo/backend/logic/products/hedgebox/taxonomy.py (`SITE_URL = "https://hedgebox.net"`, `URL_MARIUS_TECH_TIPS`, plan enums, event taxonomy)
- https://github.com/PostHog/posthog/blob/master/products/demo/backend/logic/products/hedgebox/models.py (`self.watches_marius_tech_tips = self.cluster.random.random() < 0.04`)

**Why it works.** Every analytics feature they need to demo has something specific to *find*. A funnel isn't a funnel over `event_1 → event_2`; it's signup → upload → share, on a product you instantly understand. The sponsorship page exists so that channel attribution has a real story sitting in the data waiting to be discovered.

**How OpenGong Lite applies it (2 hours of writing, day 1).**

Ship **one fictional vendor selling to one fictional prospect across 5 calls**, committed as fixtures in `samples/`. Proposed cast (lock these in a single file, see practice 2):

| Role | Name | Detail that recurs |
|---|---|---|
| Vendor | **Palletize** | "Shopify for warehouses", inventory software for multi-location retail |
| Prospect | **Kettle & Fern** | 40-store specialty tea retailer, on spreadsheets + NetSuite |
| AE | Dana Whitfield | says "totally fair" before every reframe |
| Solutions eng | Marcus Oyelaran | joins call 2 only |
| Champion | Priya Raghunathan, VP Ops | found Palletize via an r/supplychain thread (our Marius Tech Tips analog: one call carries the attribution story) |
| Economic buyer | Tom Kessler, CFO | appears call 3, freezes budget between 3 and 4 |
| Security | Elena Moss, IT | call 2 only, raises SOC 2 + data residency |
| Competitor | **Stocktrim** | named in calls 1, 3, 4 with shifting sentiment |

Five-call arc, deliberately designed so cross-call features have something to find:

1. **Discovery** (Dana ↔ Priya). Pain established. Stocktrim mentioned neutrally ("we're looking at a few").
2. **Technical deep dive** (Marcus, Priya, Elena). Security objection. Three next-steps committed, **two of which never happen**, this is what makes the "unresolved next steps" view land in call 4.
3. **Pricing / multi-thread** (Dana, Priya, Tom). Price objection. Stocktrim now quoted as cheaper.
4. **The stall** (Dana ↔ Priya, short). Budget frozen. Priya references the call-2 commitments that were dropped. Stocktrim now ahead.
5. **Negotiation / close** (Dana, Priya, Tom). Procurement terms, discount, dated next steps.

Then add a 6th deliberately messy 90-second call with crosstalk and a half-audible sentence, so the demo can show the extractor **declining to cite** rather than hallucinating. That single fixture is worth more on the "craft 10%" axis than any polish.

**Demo payoff:** search "Stocktrim" returns 3 hits across 3 calls with a visible sentiment slope. That is the 30-second Show HN GIF.

---

### 2. Put every name, label, and constant in one taxonomy file

**The PostHog practice.** `taxonomy.py` holds nothing but constants: URLs, event names with inline property comments, group taxonomy, feature flag keys, and the hardcoded experiment conversion rates. Nothing else in the Hedgebox package hardcodes a string.

```python
EVENT_UPLOADED_FILE = "uploaded_file"  # Properties: file_type, file_size_b
EVENT_UPGRADED_PLAN = "upgraded_plan"  # Properties: previous_plan, new_plan
GROUP_TYPE_ACCOUNT = "account"  # Properties: name, industry, used_mb, file_count, plan, team_size
```

**Source:** https://github.com/PostHog/posthog/blob/master/products/demo/backend/logic/products/hedgebox/taxonomy.py

**How OpenGong Lite applies it (20 minutes).** One `samples/cast.json`: company names, person names, roles, competitor names, product names, deal amounts, dates. Every transcript fixture and every doc example references it. Consequence: when a judge asks "can I swap in my own company?", the answer is one file, and you can demo the swap live. Also stops the 4-person team from drifting into three different spellings of the prospect's name at hour 20.

---

### 3. Simulate *state*, not just a list of events

**The PostHog practice.** Each simulated person carries mutable state that evolves and causes downstream behavior: `affinity`, `_need` (0 = no need, 1 = desperate), `satisfaction`, `_churned`. Actions change the state; state changes the probability of the next action; people schedule `Effect`s onto *other* people (`lambda other: other.move_attribute("need", 0.05)`). Clusters are companies or social circles, and the company clusters share a business account.

**Sources**
- https://github.com/PostHog/posthog/blob/master/products/demo/backend/logic/products/hedgebox/models.py
- https://github.com/PostHog/posthog/blob/master/products/demo/backend/logic/matrix/matrix.py (`class Cluster(ABC)`: "A cluster of people, e.g. a company, but perhaps a group of friends.")

**How OpenGong Lite applies it (this is a writing discipline, not code).** Do NOT write 5 independent transcripts. Write a one-page `samples/DEAL-STATE.md` first: for each call, what is true entering the call and what changed leaving it (budget status, champion confidence, competitor position, open commitments). Then write each transcript *from* that state table. This is the entire difference between "5 sample calls" and "a deal you can follow", and it is what makes cross-call search, competitor tracking, and unresolved-next-steps demo as features rather than as string matching.

Cost: 30 minutes of planning that saves you from 5 transcripts that contradict each other at hour 28.

---

### 4. Ship the small fake app that produces the *hard* artifact

**The PostHog practice.** The Hedgebox generator could fabricate events but could not fabricate session recordings, because "session recordings need an actual app with actual user interactions to capture. Hedgebox never had one - until now." So they built `tools/hedgebox-dummy`, a small Next.js app with login, file management, pricing page, and the Marius Tech Tips landing page, purely so real recordings could be produced for demos.

**Source:** https://github.com/PostHog/posthog/blob/master/tools/hedgebox-dummy/README.md

**How OpenGong Lite applies it (90 minutes).** Our hard artifact is **audio**. If `samples/` only contains transcript JSON, the demo silently skips the entire upload → speech-API → transcript path, which is the path a Show HN reader will test first and the path most likely to be broken. Generate 5 short TTS audio files (two distinct voices per call, 60 to 120 seconds each, not full length) and commit them, or commit a `make samples` script that produces them. Then `npm run demo` exercises the real pipeline end to end with zero user input.

Second-order benefit for **API gravity**: the audio fixtures double as the integration-test corpus and as the "here's a curl you can run right now" example in the README.

---

### 5. Be aggressively honest about self-host vs hosted

**The PostHog practice.** PostHog leads self-hosting with a recommendation *against* it, publishes a hard scale ceiling, and states the non-guarantees plainly.

> "PostHog Cloud is far and away the best experience for the vast majority of our users."

> "We *do not* provide customer support or offer guarantees for open source deployments."

> "Open source deployments should scale to approximately 100k events per month, after which we recommend migrating to a PostHog Cloud."

And the deploy itself is one line, in the README, above the fold of that section:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/posthog/posthog/HEAD/bin/deploy-hobby)"
```

Their README also names the tiers explicitly as section headers: **"PostHog Cloud (Recommended)"** and **"Self-hosting the open-source hobby deploy (Advanced)"**, plus a separate `posthog-foss` repo for people who need "*absolutely 💯% FOSS*".

**Sources**
- https://posthog.com/docs/self-host
- https://github.com/PostHog/posthog/blob/master/README.md

**How OpenGong Lite applies it (30 minutes of README writing).** Our version of the same honesty, which is *inverted* from PostHog's (for us the app is local and the inference is remote, so the risk sits in the opposite place). Use their tier-naming trick with two named modes:

- **Local mode (default).** Your calls, your transcripts, your disk. Requires a PyAI API key. The audio leaves your machine once, to PyAI, for transcription.
- **Air-gapped mode (advanced).** Bring your own transcript JSON. Nothing leaves your machine. Extraction requires a local model; we don't ship one and we don't support it.

And copy the non-guarantee sentence structure verbatim in shape: "We do not provide support, uptime guarantees, or a hosted version. This is a hackathon build under MIT. Read `DATA-FLOW.md` before you upload anything you care about." Honesty about limitations is explicitly in their voice guide (practice 8) and it is the single cheapest credibility purchase available to us.

---

### 6. Declare extractors as data (`plugin.json` + one exported function), and ship a starter kit

**The PostHog practice.** A PostHog app is two files. A JSON manifest with metadata plus a **config schema array**, and an entry point exporting a single well-known function.

```json
{
    "name": "<TODO: your plugin name>",
    "url": "<TODO: Your Plugin URL here>",
    "description": "<TODO: Your Plugin description here>",
    "main": "index.js",
    "posthogVersion": ">= 1.25.0",
    "config": [
        { "markdown": "<TODO: your plugin config, remove if none>" },
        {
            "key": "greeting",
            "name": "What greeting would you like to use?",
            "type": "string",
            "default": "Hello World!",
            "required": false
        }
    ]
}
```

```js
// Example plugin method for modifying events
export function processEvent(event, { config }) {
    if (!event.properties) event.properties = {}
    event.properties['greeting'] = config.greeting
    return event
}
```

Config entry fields across their docs and real plugins: `key`, `name`, `type` (`string` | `choice` | `attachment` | `markdown`), `default`, `hint`, `required`, `secret` (write-only, for API keys), `choices`, `order`. Apps run as an **ordered chain**, output of one feeding the next. And the starter kit README is a literal checklist ending in "Search for `<TODO:`, make sure none are left!".

**Sources**
- https://github.com/PostHog/posthog-plugin-starter-kit (plugin.json, index.js, README)
- https://github.com/PostHog/posthog-schema-enforcer-plugin/blob/main/plugin.json (real-world manifest with `type: "attachment"`, `order`)
- https://posthog.com/tutorials/build-your-own-posthog-app (config entry shape, `secret`, ordered chain)

**How OpenGong Lite applies it (2 to 3 hours, and this is the whole API-gravity play, 20% of judging).**

`extractors/<name>/extractor.json` + `extractors/<name>/index.js`:

```json
{
  "name": "objections",
  "version": "0.1.0",
  "description": "Finds buyer objections and the exact line each was raised on.",
  "main": "index.js",
  "opengongVersion": ">= 0.1.0",
  "output": "objections",
  "config": [
    { "key": "minConfidence", "name": "Minimum confidence", "type": "string", "default": "0.6" },
    { "key": "categories", "name": "Objection categories", "type": "choice",
      "choices": ["price", "security", "timing", "competitor", "authority"], "default": "price" }
  ]
}
```

```js
// every extractor exports exactly one function
export async function extract(transcript, { config, llm, cite }) {
  // transcript: { callId, turns: [{ i, speaker, role, t, text }] }
  // cite(i) -> { line: i, speaker, t, text }  <- the citation contract, enforced here not in prompts
  return [{ type: 'price', summary: '...', citations: [cite(42), cite(45)] }]
}
```

Four decisions worth stealing exactly:
1. **Manifest is JSON, not code.** It can be listed, diffed, and rendered in the README table without executing anything.
2. **One exported function name** across all extractors. Registration is `readdir(extractors/)`, nothing else.
3. **`secret: true` field exists from hour one** even if unused, so an extractor that calls an external API has an obvious place for its key instead of an env var free-for-all.
4. **Ordered chain.** Number the extractors so `next-steps` can read `objections` output. This is the "loop depth" (15%) story: extractors compose.

Then ship the starter kit as `npx opengong new-extractor <name>`, scaffolding both files pre-filled with `<TODO:` markers and the same checklist README. A judge who can add a working extractor in 3 minutes is the entire API-gravity score.

---

### 7. One clear goal, PRs sized to a day, everything behind a flag

**The PostHog practice.** Their shipping handbook opens with the trade-off explicitly:

> "Any process is a balance between speed and control. If we have a long process that requires extensive QA and 10 approvals, we will never make mistakes because we will never release anything."

The rules that survive compression to 33 hours:

> "PRs should ideally be sized to be doable in one day, including code review and QA. If it's not, you should break it down into smaller chunks until it fits into a day."

> "It's always good to put new features behind feature flags. It's even better to develop partial features behind feature flags. As long as it's clear what needs to be done before a flag can be lifted, you can usually get the smallest bit of any new feature out in a day this way."

> "Remember that PRs can be reverted as easily as they can be merged. Don't be afraid to get stuff in early if it makes things better."

> "A single engineer should be accountable for a milestone."

Their goal criteria include **Homogenous**: "The goal should be all about achieving a single meaningful thing and not a collection of unconnected things (i.e. NOT 'Improve query performance and launch collaboration MVP')". And their culture page: "If given a choice, go live. If you can't go live, reduce the task size so you can."

**Sources**
- https://posthog.com/handbook/engineering/development-process
- https://posthog.com/handbook/company/culture
- https://posthog.com/handbook/company/small-teams ("A small team should *strictly* be between 2-6 people.")

**How OpenGong Lite applies it.** Compress "one day" to **one three-hour block**. Concretely:
- Four named owners, one surface each, no shared files: (a) ingest + speech API, (b) extractor runtime + registry, (c) UI + share link, (d) samples + README + launch post. PostHog's "single engineer accountable per milestone" is the anti-merge-conflict rule at this size.
- Any work item that can't merge to `main` inside 3 hours gets split. Merge to `main` continuously; no long-lived branches at 4-person scale.
- **Feature flags = environment variables**, nothing more: `OPENGONG_EXTRACTORS=objections,next-steps`, `OPENGONG_SHARE=off`. The risky features (share links, competitor extractor, anything touching the network) ship *disabled by default* and get flipped on for the demo. This gives you the revert-without-reverting property in a repo with no CI to speak of.
- The homogenous-goal rule is the scope guard: OpenGong Lite's single goal is **"every extracted claim cites the exact transcript line."** Anything that doesn't serve that gets cut at hour 20, not debated.

---

### 8. Write like you're explaining it to a smart friend, and be funny only when it's actually funny

**The PostHog practice.** Their voice guide is short and enforceable:

> Write as you would to "a smart friend, not a business associate you're trying to impress."

Principles: clear and simple, specific ("concrete nouns and real examples beat abstract claims"), direct, **honest including about limitations** ("developers trust honesty more than polish"), conversational. Banned: buzzwords (`leverage`, `streamline`, `robust`, `best-in-class`, `seamless`, `synergy`), hedges ("helps you to", "empowers teams to"), passive voice, feature-first headlines, and **emojis** ("they appear inauthentic"). On humor specifically: **"jokes requiring explanation fall flat; genuine, unexpected humor works better than wacky metaphors"** and "clear beats clever, and makes the genuine humor stand out."

The brand post is blunter about why it works: **"We aren't the best in the world at being polished, but we can be the best in the world at being ourselves."**

Their README craft matches: nav row of links under the logo, a demo video thumbnail as the first visual, one-line positioning header, benefit list with links, then a hidden easter egg at the very bottom: *"Hey! If you're reading this, you've proven yourself as a dedicated README reader. You might also make a great addition to our team."*

**Sources**
- https://posthog.com/handbook/brand/tone
- https://posthog.com/blog/brand
- https://github.com/PostHog/posthog/blob/master/README.md

**How OpenGong Lite applies it.**
- README opens with what it is in one sentence with a concrete noun: "Upload a sales call. Get a summary, objections, and next steps, where every single claim links to the transcript line it came from." Not "AI-powered revenue intelligence."
- **Zero emojis** in README, CLI output, and the HN post. This is the cheapest single tone decision and it is counter to every default LLM-drafted README.
- The humor budget is **one joke, at the end**, in PostHog's easter-egg position. Not sprinkled. A hedgehog-equivalent mascot is not available to us in 33 hours (see DO-NOT-COPY), so the wit has to live in the writing.
- Steal the "You'll hate PostHog if..." format directly (practice 10) as the honest-limitations section.

---

### 9. Treat the Show HN post as a designed artifact, and do the boring pre-launch hygiene

**The PostHog practice.** Their Launch HN in Feb 2020 shipped 4 weeks after they started writing code. The post structure:

1. Who we are + what it is in one line: *"James, Tim and Aaron here - we are building a self-hosted, open source Mixpanel/Amplitude style product."*
2. The problem, from their own experience (sending user data to third parties; *"Exporting data from these tools costs $manyK a month"*).
3. Concrete capability list (autocapture, labeling toolbar, API/SQL access, funnels, segmentation).
4. How we'll make money, stated up front.
5. Setup claim: *"platform and language agnostic, with a very simple setup."*
6. Explicit ask: *"We'd love to hear your feature requests."*

Their own retro on it is the useful part. Targets were set in advance (500 stars = happy, 700 = pleased, 1,000 = delighted; they got 800+ in a week and 200+ signups). The single tactical lesson they call out:

> "make sure you have tagged your repo appropriately – we had niche tags, and it was only once we changed them that we got discovered."

Top HN pushback was on **scaling architecture**, **the name**, and **feature parity with incumbents**. They engaged all three in-thread.

**Sources**
- https://news.ycombinator.com/item?id=22376732
- https://posthog.com/blog/after-the-hn-launch

**How OpenGong Lite applies it (60 to 90 minutes, owned by one person from hour 4, not hour 32).**
- Draft the Show HN post at **hour 4**, not hour 32. It doubles as the scope contract: if you can't write the sentence, you don't have the feature.
- Structure, following theirs: who + one-line ("an MIT-licensed, local-first Gong alternative that cites its sources"), the specific problem (call-intelligence tools require you to pipe every customer call into someone else's cloud, and the summaries can't be audited), the capability list, **how the money/hosting works** stated up front (the app is yours, the inference is hosted, here's the exact boundary), setup claim with a real time ("`npx opengong demo` runs on the 5 sample calls in about 60 seconds"), and the explicit ask.
- Pre-launch hygiene checklist, all cheap: GitHub **topics** set (`sales`, `transcription`, `llm`, `call-recording`, `self-hosted`, `mit-license`), a `LICENSE` file, description + website field filled, a demo GIF in the README, the share-link demo live at a URL a reader can click without installing.
- Pre-write answers to the three objections you *know* land in this category: **privacy** ("what leaves my machine" → point at DATA-FLOW.md, practice 10), **hallucination** ("every claim carries a line citation, and here's the messy call where it declines to cite"), and **why not just Whisper + a prompt** ("the extractor registry and the citation contract are the product"). PostHog answered their three in-thread; being ready to do the same in the first hour is most of the HN outcome.

---

### 10. Pick exactly one transparency artifact, and make it `DATA-FLOW.md`

**The PostHog practice.** PostHog's trust comes from publishing things companies normally hide, and their culture page names it directly:

> "Most of our communication happens publicly on GitHub, our roadmap is open for anyone to see, and our open-source handbook explains everything from how we hire and pay team members to how we email investors! We're committed to much more than just public code."

Three concrete artifacts:
- **Public roadmap** staged Concept & Alpha → Beta → GA, with the owning team named per item: https://posthog.com/roadmap
- **A page listing reasons not to buy them.** "You'll hate PostHog if..." / "15 reasons why PostHog might be *wrong* for you", framed with *"Warning: If you like the way most companies treat you, you might not like us."* Real entries, verbatim from source: *"You enjoy 'jumping on a quick call' with sales"*, *"You love needlessly wasting company money"*, *"You think your email is a good trade for that free whitepaper"* ("Please press Ctrl + W now, or ask your network administrator to close your window"), *"You give out your credit card details to strangers"*, *"You're desperate for commitment"*.
- **Explicit division of responsibility on data**, rather than a compliance-badge wall: *"It's your responsibility to decide what data you collect, if it complies with regulations, and communicate with your users. We provide tools and features to help you manage what's collected and store the collected data securely."*

**Sources**
- https://posthog.com/handbook/company/culture
- https://posthog.com/vibe-check and https://github.com/PostHog/posthog.com/blob/master/src/components/NoHatingAllowed/data.js (verbatim card copy)
- https://posthog.com/why
- https://posthog.com/docs/privacy

**The recommendation: build ONE, and it is `DATA-FLOW.md`.**

Privacy skepticism is the #1 objection for an OSS call-intelligence tool, and it is the one objection a README paragraph cannot close. A roadmap costs the same to write and closes nothing. Build this instead, at roughly 40 lines:

1. **A table with one row per network call your process can make.** Columns: what triggers it, exact destination host, what payload, what is retained where, and **the file + line in this repo that makes the call**. The line reference is what converts a claim into an audit.

| Trigger | Destination | Payload | Retention | Code |
|---|---|---|---|---|
| `upload` | `api.pyai.…` | raw audio bytes | per PyAI policy, link it | `src/speech.js:41` |
| `extract` | LLM endpoint | transcript text only, never audio | none by us | `src/llm.js:88` |
| everything else | none | | | |

2. **A "nothing else leaves" statement**, with the verification a skeptic can run themselves: `OPENGONG_OFFLINE=1 npm run demo` plus a one-liner showing zero outbound connections (`nettop`/`lsof`, or the fact that the offline path has no fetch import). Verifiable beats stated.

3. **A division-of-responsibility paragraph modelled on PostHog's privacy line**: recording consent, two-party consent laws, and what a shared link exposes are the user's call; we tell you exactly what the tool does and give you the switch.

4. **The honest-limitations block, in the "You'll hate OpenGong Lite if..." format.** Real candidates: you want speaker diarization we didn't train; you want it to work with zero API keys; you expect the LLM to be right about intent (it cites the line so you can check it, which means you have to check it); you wanted a hosted product with a login; you were hoping for a CRM integration.

That last block does double duty: it is a trust artifact *and* it is the funniest thing in the repo, which is the only place PostHog-style humor is safe for us (practice 8).

---

## DO-NOT-COPY

Practices that are correct for PostHog and would be cargo-culting at 4 people and 33 hours.

| PostHog practice | Source | Why not for us |
|---|---|---|
| **The Matrix simulation engine** (abstract `Cluster`/`Matrix`/`SimPerson`, `mimesis` providers, beta distributions, scheduled cross-person `Effect`s, seeded timezone-aware event streams) | [matrix.py](https://github.com/PostHog/posthog/blob/master/products/demo/backend/logic/matrix/matrix.py) | Thousands of lines to make data *statistically* plausible. We need 5 transcripts a human wrote in 2 hours. Copy the narrative discipline (practices 1 and 3), not the generator. Generated fake sales dialogue also reads as fake, which is the opposite of the goal. |
| **Eight simulated A/B experiments in demo data** with won/lost/inconclusive/stopped-early states | [hedgebox/matrix.py](https://github.com/PostHog/posthog/blob/master/products/demo/backend/logic/products/hedgebox/matrix.py) | Demo data richness should map 1:1 to features you shipped. We have no experiments feature. Every fixture that doesn't power a demo beat is dead weight the judge has to skip past. |
| **Two-week sprints, milestone setting, moonshot vs roofshot goal taxonomy, goal criteria rubric** | [development-process](https://posthog.com/handbook/engineering/development-process) | 33 hours is one sprint with one goal. Keep only "homogenous" (one goal) and "single owner", drop the ceremony. |
| **Tiered announcement taxonomy** (Tier 1/2/4), the Launch Plan GitHub template, "at least one customer story within 3 weeks", art requests, product page + pricing page + tutorial as launch gates, monthly Customer.io changelog broadcast | [product-announcements](https://posthog.com/handbook/marketing/product-announcements), [changelog handbook](https://posthog.com/handbook/engineering/posthog-com/changelog) | This is a marketing org's release process. We have one launch surface (Show HN) and one artifact (the README). Copy the *post structure* (practice 9), not the program. |
| **Public roadmap page** with stages, owning teams, and waitlists | https://posthog.com/roadmap | We have no teams, no next quarter, and no credibility to promise against. A promise-shaped artifact from a hackathon repo reads as vapor. A 6-line "Not built yet, PRs welcome" README section does the same job honestly. |
| **Incident process**: `/incident` Slack command, Minor/Major/Critical severities, incident lead role, on-call rotation, status page updates | [incidents handbook](https://posthog.com/handbook/engineering/incidents) | We run nothing in production for anyone. |
| **Feature ownership matrix** mapping every feature to an owning engineer/team | [feature-ownership](https://posthog.com/handbook/engineering/feature-ownership) | Four people can hold this in their heads. Write it in Slack, not in a doc. |
| **A real feature-flag service** for the risky-features practice | [development-process](https://posthog.com/handbook/engineering/development-process) | Adopt the *behavior* (ship partial work disabled) with env vars. Adding a flag system to a minimal-deps Node repo contradicts our own stack constraint. |
| **`posthog-foss` mirror repo + the `ee/` directory license split** | [README](https://github.com/PostHog/posthog/blob/master/README.md) | Dual-licensing exists because they have a paid product to protect. We are MIT-only, one repo, one LICENSE file. Any licensing complexity is a Show HN liability, not an asset. |
| **Plugin sandboxing + "submit your plugin for security review" + a plugin server** | [starter kit README](https://github.com/PostHog/posthog-plugin-starter-kit) | They sandbox because they execute third-party code in *their* cloud. Our extractors are local files the user chose to install. The correct 33-hour move is one honest sentence in the README ("extractors run in your Node process with your permissions; read one before you install it"), not a VM. |
| **The monorepo README that defers everything to sub-package READMEs** (posthog-js lists 15 packages and shows no install command) | https://github.com/PostHog/posthog-js | Right for a monorepo, wrong for us. Our single README must contain a copy-pasteable install and a runnable command above the fold. Match the *main* posthog README, not posthog-js. |
| **The hedgehog mascot and custom illustration system** | [How not to be boring](https://posthog.com/blog/brand) | Their own rule kills the imitation: forced humor and jokes that need explaining fall flat, and PostHog's brand works because it's *theirs* ("the best in the world at being ourselves"). A borrowed mascot from a team with zero art hours reads as cringe. Put the personality in the writing and in the "You'll hate this if..." block instead. |
| **Chasing star-count targets** (500/700/1,000) | [after-the-HN-launch](https://posthog.com/blog/after-the-hn-launch) | Fine for a company measuring a launch. Our judging weights product pull and demo magnetism at 55%. Optimize the 30-second demo path and the first-run experience; stars are a lagging indicator we won't see before judging. |

---

## The single highest-leverage item on this page

If only one thing from this document gets built: **practice 1 + 3 together** (the Palletize / Kettle & Fern five-call deal arc with a written state table). It is 2.5 hours of writing with no code risk, and it is the input to demo magnetism (25%), product pull (30%), and loop depth (15%) simultaneously. Sample data is the only asset that makes *every other feature* look better without touching any of them.
