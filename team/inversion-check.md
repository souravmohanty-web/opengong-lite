# Inversion check against the real-call finding (2026-08-14, pre-demo)

Context: a real mono call through the Railway deployment showed the harness can
invert its values: correct LLM summary demoted on quote fidelity, repair tries
returned placeholders, keyword templates shipped as "100% backed", and the email
composed template junk. Spec for her deployment: team/plans/analysis-screen-spec.md
and her repo's issue #14.

Checked OUR engine against the same four failure legs, evidence in hand:

1. Email junk path: CLOSED BY DESIGN. notes-view's EMAIL_SECTIONS excludes the
   tracker section, so keyword hits can never become email bullets. All-demoted
   LLM claims produce a withheld email (tested state), never a keyword recap.
2. Keyword hits as headline notes: NOT OURS. Trackers render as "Also mentioned"
   chips. Demoted LLM notes stay visible in "Not found in the call".
3. Per-note partial credit: already our model (per-claim statuses; coverage is
   run-level; the email is gated per-claim).
4. Repair prompt (live LLM path): OPEN. Our retry loop feeds gate failures back
   to the model, but the prompt has never been stress-tested on real mono ASR
   (demo runs cached). Adopt the spec's rule when wiring live repair: demand a
   verbatim copy of the line, forbid placeholder text, and prefer a demoted
   claim over a placeholder that anchors.

Render hygiene re-verified same day: no internal ids, sentinels, or enum names
in any built page under public/.
