# Q&A prep (demo day)

One rule, from the run-of-show: every answer names the file that proves it, and
"I don't know, and here's where that unknown is tracked" beats bluffing.
Answers below are written to be spoken. Two to four sentences, then stop talking.

## The three you will definitely get

**"How do you know it's not hallucinating?"**
We don't trust it not to. That's the design. Every claim must cite a line, code
checks the line exists, and a claim with no line stays on screen marked "not
found in the call." You watched it refuse one live. And it caught PyAI's own
summarizer inventing a $15 price; the artifacts are committed in the repo.

**"Isn't this just a wrapper on the PyAI API?"**
The API call is ten lines. The other several thousand lines are the part Gong
charges for: the gate that verifies claims, the ledger that tracks promises
across calls, scorecards on 14 methodologies, and an email choke that
structurally can't cite an unverified claim. Anyone can hit an STT endpoint.
The moat is what happens to the output before a human relies on it.

**"How is this different from Fireflies or Fathom?"**
Two ways you can check live: our summary shows its own misses, theirs can't be
wrong on their own page. And our workspace tracks whether the promise made on
call 2 actually happened on call 4. Also it's open source and your recordings
stay your files.

## Director-of-engineering questions

**"Walk me through what happens when the check fails."**
Four states, all visible: verified ships with its citation; a wrong citation
gets corrected by code and labeled; no supporting line means the claim stays on
screen, marked; a line that tries to instruct the model is struck out and
barred from notes and email. Downstream features consume verified claims only.
No feature has a tunnel around the gate.

**"Why deterministic code instead of a judge model?"**
A second model can be fooled the same way the first one was, and you can't
write a regression test for its opinion. Our checker is plain code: it runs
offline, it's in CI, and every trick that ever beat it is a permanent test.
528 in the engine repo, 312 in the app, both green today.

**"What's the hardest bug the gate caught?"**
Empty-quote laundering. JavaScript's includes("") returns true, so an empty
quote could prove anything. Second place: "4015" assembled from a spoken
"40.15" by stripping punctuation. Both are permanent tests now.

**"What breaks first in production?"**
The injection screen. It's best effort; a novel phrasing will get through it.
That's why it isn't the last line: the choke and the visible blocked states
contain what it misses. Second: mono real-world audio. Speakers stay unlabeled
and the page says so, which is honest but not satisfying.

**"How does it scale? / What about cost?"**
$0.0067 per call, and that number is read from a real run record, with a test
that fails if anyone hardcodes it. The gate is O(claims x lines), pure code,
no model call. The budget governor caps each run and refuses before it spends.

**"Is the transcript accurate? The names look mangled."**
Look at the receipts: "Dr. Mehta" renders as "doctor meta", "RingHawk" as
"ring hog". We don't silently fix the evidence, because that would put words
in the prospect's mouth. Claim text gets a glossary pass; the receipt stays
exactly what the machine heard. That's the point of a receipt.

**"Determinism? Same call, same notes?"**
Not at the model layer, and nobody can promise that honestly. Answerable at
the system layer: stamped, append-only run records with the transcript hash
and prompt version, so any note traces to the exact run that wrote it.

**"Why didn't you use the Citations API?"**
It 400s when combined with structured outputs, so we rebuilt the contract:
the model returns quote plus segment id, our code does the anchoring. That's
in research/00-api-probe, with the probe results.

## Product and business questions

**"Who actually switches to this?"**
A team paying Gong $1,400 a seat for what is, after the call, three questions:
what happened, what did they push back on, what do I owe them. Or a team on
Fireflies' free tier that has been burned once by an invented note in front
of a customer.

**"Why two repos?"**
One project, two surfaces. The engine repo is the harness and methodology
system; the app repo is the product a stranger can run: upload, search,
scorecards, CRM write-back. Same gate, same tests on both sides.

**"Where does PyAI make money on this?"**
Every real transcription burns Hear and Recap minutes. The demo is cached and
burns nothing, deliberately, so a judge can run it keyless. The week-0 feature
is a watch folder pointed at where Zoom drops recordings, which makes burn
passive per rep per day.

**"What would you build with another week?"**
Live capture via an open source meeting-bot webhook (ingest already accepts an
audioUrl; that's the shape a Recall or Vexa webhook drops in unchanged),
approval-gated HubSpot write-back in the engine repo, and the interpretation
gate for right-quote-wrong-reading. In that order.

## Concede without blinking (the honest-gap list)

Say these plainly. Conceding fast reads as strength.

- **Live meeting capture / bots:** not built. Sybill's CTO said in-house bots
  could take a year; they bought Recall.ai instead. Same call for us. Roadmap.
- **Video, ask-anything chat, integration breadth:** they beat us today.
- **Interpretation:** the gate proves the line was said. Whether the note reads
  that line fairly is unchecked, and we say so in the README. The citation
  makes the human check a one-click job instead of a re-listen.
- **English-only:** upstream constraint, stated in limitations.
- **Hinglish / code-switching:** tracked, named unknown. Nobody glossed it.
- **Hyphens can cost an honest note its citation:** we bias toward false
  negatives on purpose. We'd rather lose a true note than certify a fake one.

## The closing move for any hostile question

Don't defend. Point: "Click it. The line either exists or it doesn't."
The product's whole argument is that trust should be checkable; every answer
that ends in a click is a better answer than a paragraph.
