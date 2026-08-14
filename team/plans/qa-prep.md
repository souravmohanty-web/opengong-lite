# Q&A prep (demo day)

The room built PyAI. Judges know the API better than we do, so every answer
about it must be precise, generous, and backed by an artifact in the repo.
Rule from the run-of-show: name the file that proves it. "I don't know, and
here's where that unknown is tracked" beats bluffing. Answers are written to
be spoken: two to four sentences, then stop.

## The delicate one, get this right

**"You're saying our Recap hallucinates?"**
Every summarizer in the world invents sometimes, including the best ones.
What we built is the reason that stops mattering: a gate that catches it
before a rep relies on it. On our pricing call Recap fused a discount ask into
"$15 per seat"; the gate held it back and the email shipped clean. We kept the
artifacts in `research/00-api-probe/live-recap-run/` because an app that can
prove its own output is the strongest ad PyAI can have. That's the pitch:
PyAI plus a gate is something Gong can't say.

**"So why use Recap at all?"**
Recap is doing the hard part: it turns 86 seconds of audio into structured
notes in one call, and most of them verify. We'd rather ship Recap plus a
checker than rebuild summarization badly. The gate makes Recap's output
CRM-grade.

## PyAI usage questions (they will ask, they built it)

**"Which PyAI products did you use and how?"**
Hear for transcription, batch, with speaker labels read off the stereo
channels. Recap for call notes, checked by our gate. The sandbox key mints
itself on first transcription and remints once on a 401. Cost logged per run:
$0.0067 for a real call, read from the run record, never hardcoded.

**"What feedback do you have for the API team?"**
Four concrete items, all in `research/00-api-probe/FINDINGS.md`. Citations
and structured outputs 400 when combined, so we rebuilt claim anchoring
ourselves: model returns quote plus segment id, our code anchors it. Some m4a
encodings get rejected as unreadable, WAV always works. The sandbox scopes
don't reach Recap configuration, we worked around it. And the Recap
fabrication case is documented verbatim, which is the most useful bug report
we can give that team.

**"Why not Omni or the other products?"**
Scope discipline. This product's job is what happens after a recorded call,
and Hear plus Recap covers it. Omni is a live-conversation surface; when live
capture lands on the roadmap, that's its entry point.

**"Does this actually burn minutes?"** (API gravity)
The judge demo is cached on purpose so it runs keyless. Every real call burns
Hear and Recap. The week-0 feature is a watch folder pointed at where Zoom
drops recordings, so ingestion stops being a decision someone makes and burn
becomes per rep per day. Fork-and-extend is the same story: every extractor
someone adds runs through the same pipeline.

## The rubric questions

**"Would a stranger switch to this tomorrow?"** (product pull)
The person who switches this week is on Fireflies' free tier and has been
burned by an invented note in front of a customer. The person who switches
this quarter is paying Gong $1,400 a seat for what is, after the call, three
questions: what happened, what did they push back on, what do I owe them.
The ledger and the receipts answer those with proof.

**"Do the gates actually block bad output?"** (loop depth)
You watched both refusals live: the planted fake stayed on screen marked, and
the injection line was struck out. Underneath: verbatim matching, digits never
fold ("forty" is not "40"), quotes under 15 characters anchor nothing,
ambiguity demotes instead of guessing, and the email choke rejects a whole
draft over one unproven citation. Every attack that ever worked is a
permanent test: 528 in the engine, 312 in the app, green today.

**"Would we be proud of this code in public?"** (craft)
It's public now. MIT, green CI, zero runtime dependencies in the engine,
DATA-FLOW.md naming every network call with file and line, and a README
whose numbers are computed from artifacts with tests that fail if they drift.

**"What ships in week 1 if you win?"**
The repo is launch-ready today: public, MIT, self-minting key, sample deal,
five-minute setup. Week 0 is the watch folder, the click-to-line GIF, and the
Show HN post, which is already half-drafted by the demo script. The
side-by-side against Fireflies writes itself: their page can't show its own
misses.

## Director-of-engineering technicals

**"Walk me through a failed check."**
Four states, all visible: verified ships with its citation; a wrong citation
gets corrected by code and labeled; no supporting line stays on screen,
marked; a line that instructs the model is struck out and barred from notes
and email. Everything downstream, scorecards, ledger, digest, email, consumes
verified claims only. No feature has a tunnel around the gate.

**"Why deterministic code instead of a judge model?"**
A second model can be fooled the same way the first one was, and you can't
write a regression test for an opinion. The checker is plain code: offline,
in CI, and every trick that beat it is a permanent test.

**"Hardest bug the gate caught?"**
Empty-quote laundering: JavaScript's includes("") is always true, so an empty
quote could prove anything. Runner-up: "4015" assembled from a spoken "40.15"
by stripping punctuation. Both closed forever in the test suite.

**"What breaks first in production?"**
The injection screen. It's best effort and a novel phrasing will get through,
which is exactly why it isn't the last line: the email choke and the visible
blocked states contain what it misses. Second: real-world mono audio, where
speakers stay unlabeled and the page says so.

**"The transcripts show mangled names. Hiding that?"**
The opposite. "Dr. Mehta" renders as "doctor meta" in the receipt because we
don't silently fix evidence; that would put words in the prospect's mouth.
Claim text gets a glossary pass, the receipt stays verbatim. That's what
makes it a receipt.

**"Same call twice, same notes?"**
Not at the model layer, and nobody can promise that honestly. Answered at the
system layer: append-only run records with transcript hash and prompt version,
so any note traces to the run that wrote it.

## Concede without blinking

- Live meeting capture: not built. `src/ingest.js` already accepts an
  audioUrl, which is the exact shape a meeting-bot webhook drops in. Roadmap.
- Video, chat-over-calls, integration breadth: the incumbents beat us today.
- Interpretation: the gate proves the line was said; whether the note reads it
  fairly is unchecked, and the README says so. The citation makes the human
  check one click instead of a re-listen.
- Hinglish and code-switching: tracked, named unknown.
- Hyphens can cost an honest note its citation. Biased toward false negatives
  on purpose: better to lose a true note than certify a fake one.

## The closing move

For any hostile question, don't defend, point: "Click it. The line either
exists or it doesn't." Every answer that ends in a click beats a paragraph.
