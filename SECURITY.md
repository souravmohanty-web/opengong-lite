# Security

## Reporting

Open a private security advisory on this repository (preferred) or email the
maintainers. Please do not open public issues for vulnerabilities.

## Scope notes

- This app is self-hosted; inference is hosted (PyAI speech, Anthropic extraction).
  Every network call the app can make is enumerated in DATA-FLOW.md.
- API keys are never logged. The PyAI sandbox key is stored in `sandbox.pyai_key`
  (gitignored); the Anthropic key is read from the environment only.
- Transcripts are untrusted input: the notes/share viewer HTML-escapes everything,
  and follow-up drafts are generated only from citation-gate-passed claims.
- CI runs gitleaks on every push.
