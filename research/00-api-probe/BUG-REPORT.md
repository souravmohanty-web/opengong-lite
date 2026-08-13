# PyAI API — Bug Report

**Date:** 2026-08-13
**Context:** First-party QA during the PyAI hackathon (SaaS Labs). Probed `https://api.pyai.com/v1`
with the live-tier key at `opengong-lite/.env` (`PYAI_API_KEY`, redacted below as `$KEY`
throughout — never printed in full in this doc or in the commands that produced it).
**Scope of this pass:** a small number of read-only / benign-validation live calls, cross-checked
against the published spec (`https://api.pyai.com/openapi.json`, v1.5.0) and against evidence
already committed in this repo (`research/00-api-probe/FINDINGS.md`, `audit/audit-log.md`,
`audit/unlearn.md`). No load testing, no destructive calls, no key minting, no TTS generation —
per rules of engagement.

---

## New findings

### N1 — Three incompatible error envelope shapes live on the same API, with three different (or absent) request-ID conventions
**Severity: High** (API-quality / debuggability — any client or support workflow that expects one error shape or one request-id header breaks on at least one of these three families)

The spec itself documents two error schemas (`Problem` = RFC 7807 `application/problem+json` for
control-plane 400/404/409; `Error` = OpenAI-style `{"error":{...}}` for gateway 401/402/403/429).
Live testing found a **third**, undocumented shape, and the two documented ones each carry a
**different request-id header name/format**:

| Case | Endpoint | Status | Body | Content-Type | Request-ID header |
|---|---|---|---|---|---|
| Bad auth | `GET /v1/me` w/ malformed `Authorization: Bearer …` | 401 | `{"error":{"code":"invalid_api_key","message":"Invalid API key.","type":"invalid_request_error"}}` | `application/json` | `x-request-id: 0dc34ee6-6a78-…` (raw UUID) |
| Empty body | `POST /v1/transcription/jobs` `{}` | 400 | `{"type":"…/problems/invalid_request","title":"Bad Request","status":400,"detail":"…","request_id":"req_4447e87fa9d01c763868a701"}` | `application/problem+json` | `x-pyai-request-id: req_4447e87fa9d01c763868a701` |
| Bad job id | `GET /v1/transcription/jobs/job_doesnotexist12345` | 404 | `{"type":"…/problems/not_found",...,"request_id":"req_9afcdaa93e044e8c1be3c2f7"}` | `application/problem+json` | `x-pyai-request-id: req_9afcdaa93e044e8c1be3c2f7` |
| Wrong method | `GET /v1/audio/transcriptions` (POST-only route) | 405 | `{"error":"Method Not Allowed","service":"hear"}` | `application/json` | **none at all** (no `x-request-id`, no `x-pyai-request-id`, no `request_id` field in body) |

The 405 body doesn't even match the spec's own `Error` schema — `error` is a bare **string**, not
the required `{message, type?, code?, param?}` object. So this is a genuine third shape, not a
minor variant of the other two.

Also: the 401's `code` value, `"invalid_api_key"`, is **not in the OpenAPI spec's own published
`ErrorCode` enum** (`invalid_request_error, invalid_agent_id, unauthorized, forbidden,
origin_not_allowed, credit_exhausted, key_budget_exceeded, insufficient_quota,
rate_limit_exceeded, concurrency_limit_exceeded, daily_cap_exceeded`) — the spec's own
`Unauthorized` response doc says `code: unauthorized`. The implementation has drifted from its
own contract.

**Expected:** one consistent problem/error envelope (or, at minimum, the two documented families
consistently applied) with a single request-id header name present on every error, including 405s.
**Actual:** three shapes, two request-id header conventions, one route with no request-id at all,
and an undocumented error code.
**Repro:**
```
curl -H "Authorization: Bearer garbage" https://api.pyai.com/v1/me                              # 401, x-request-id (uuid)
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{}' \
     https://api.pyai.com/v1/transcription/jobs                                                  # 400, x-pyai-request-id (req_…)
curl -H "Authorization: Bearer $KEY" https://api.pyai.com/v1/audio/transcriptions                # 405, no request-id at all
```

### N2 — Internal service codename leaked in a response header
**Severity: Low-Med** (info hygiene)

The 405 response above (`GET /v1/audio/transcriptions`) carries `x-aiva-service: hear`. No other
endpoint tested emits this header (successful calls instead carry `x-pyai-contract-version`), and
"aiva" does not appear anywhere in the public docs or OpenAPI spec — it looks like an internal
product/service codename leaking onto an external error path.
**Repro:** `curl -i -H "Authorization: Bearer $KEY" https://api.pyai.com/v1/audio/transcriptions`
→ look for `x-aiva-service` in the response headers.

### N3 — Misleading validation message on the "neither source provided" case
**Severity: Med** (correctness of error copy)

`POST /v1/transcription/jobs` with a genuinely empty body (`{}` — neither `audio_url` nor a file)
returns `400` with `detail: "exactly one audio source required: provide 'audio_url' OR an
upload, not both"`. The **"not both"** phrasing is written for the two-sources-provided case, but
the API reuses the identical string for the zero-sources-provided case too — so the message
actively points a debugging client in the wrong direction (it says "not both" when the real
problem is "you gave neither").
**Repro:** `curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{}' https://api.pyai.com/v1/transcription/jobs` → 400, `detail` reads as if two sources were sent.

### N4 — OpenAPI spec's own JSON-body schema for job creation contradicts its own prose
**Severity: Low** (docs/spec authoring bug, not a runtime bug)

`POST /v1/transcription/jobs`'s description says "provide **exactly one** source: `audio_url` …
or a multipart upload," but the `application/json` request body schema declares
`"required": ["audio_url"]` unconditionally — i.e. the spec's own machine-readable schema for the
JSON path doesn't encode the OR-with-multipart relationship (multipart is a separate schema
block, so a spec-driven client generator validating only the JSON variant would treat `audio_url`
as always mandatory, which is consistent with N3's empty-body 400 but is not what the prose
promises for callers who read only the description).
**Repro:** inspect `https://api.pyai.com/openapi.json` → `paths./v1/transcription/jobs.post.requestBody.content."application/json".schema.required`.

---

## Confirmed known bugs

Each was already established with committed evidence in this repo. Re-confirmed via that evidence
this session rather than re-run live, since the live repro would either duplicate an existing
fixture at no new information (items 2, 3, 6) or requires an action explicitly forbidden by this
session's rules of engagement (items 1, 4, 5: no TTS generation, no key minting).

### K1 — Console "Speak" preset mints the wrong scope name (`speak:synthesize` vs `voice:synthesize`)
**Severity: Med.** Evidence: `research/00-api-probe/FINDINGS.md` item 16 — console emits
`speak:synthesize`, API rejects it; the real scope is `voice:synthesize` (403 body: "Key lacks
required scope 'voice:synthesize'"). Note: this session's `GET /v1/me` on the current live key
shows `voice:synthesize` IS now present in its scope list — the specific key from the earlier
probe has since been rescoped correctly, but the underlying **console UI preset bug** (it still
offers/emits the wrong scope name when minting) was not re-tested here (out of reach without
minting a new key, which the rules of engagement forbid).

### K2 — Sync endpoint silently ignores `response_format` / `timestamp_granularities` / `diarize`
**Severity: Med.** Evidence: `research/00-api-probe/FINDINGS.md` item 3 and `audit/unlearn.md`
U-16 — live `POST /v1/audio/transcriptions` returns bare `{text, duration}` regardless of
`response_format=verbose_json`, and regardless of `diarize`/`timestamp_granularities[]`, which
aren't even declared params on this endpoint per the spec (`components.schemas.Transcription` is
`{text, model}` — so live behavior disagrees with the *spec's* declared shape too: `duration` in
practice vs `model` on paper).

### K3 — `result.text` and `segments[]`/`words[]` render numbers differently in the same response
**Severity: High** (correctness — this is a receipts-integrity bug for any consumer that quotes
`result.text` and verifies against word-level data). Evidence: `research/00-api-probe/batch_result.json`
/ `batch_result2.json` (top-level `text` says "...quoted us almost **40** less...", the `words[]`
token at that timestamp is `"forty"`), `audit/audit-log.md` F-21, `audit/unlearn.md` U-15.

### K4 — Sandbox key-mint endpoint (`POST /v1/sandbox/keys`) returns 500 / 429 without `Retry-After`
**Severity: Med.** Carried forward from the task brief as already-known; **not independently
re-verified this session** — the rules of engagement explicitly forbid minting new keys, and this
bug is specific to that endpoint. Flagged rather than silently dropped (no "pre-existing without
receipts" claim made — this is reported as unverified-this-session, not confirmed-this-session).
Worth noting: the spec's own `RateLimited` response component *documents* a `Retry-After` header
as expected on every 429 — if the reported behavior is accurate, it's a spec-conformance bug, not
just a UX nice-to-have.

### K5 — Per-voice TTS `upstream_error` ("Speech synthesis is unavailable")
**Severity: Low-Med.** Evidence: `research/00-api-probe/FINDINGS.md` item 9 — `stock_amos_en_us`
failed twice with `upstream_error` while other voices worked; per-voice availability is flaky.
**Not re-tested this session** — rules of engagement forbid generating TTS.

### K6 — Speaker labels are 1-based (`"speaker_1"`) vs the spec-derived doc example's 0-based (`"speaker_0"`)
**Severity: Low** (docs/UX — silent off-by-one for anyone coding against the doc example).
Evidence: `audit/audit-log.md` F-22, `audit/unlearn.md` U-16, fixture
`research/00-api-probe/stereo_result.json`.

---

## Rules-of-engagement compliance note

Total live requests this session: 6 (`GET /v1/me` ×2 — one authed, one bad-auth; `GET
/v1/openapi.json`; `POST /v1/transcription/jobs` with `{}`; `GET
/v1/transcription/jobs/{bad-id}`; `GET /v1/audio/transcriptions`). All read-only or
zero/near-zero-cost validation calls, serialized with pauses, far under the 20 rps / 10
concurrency limit. No deletes, no config/settings/`recap:configure`/`trace:configure` writes, no
key minting, no TTS synthesis, no load testing. Key never printed in full in any output.
