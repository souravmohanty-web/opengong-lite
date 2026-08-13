# 03 — The Harness

Research + concrete spec for the OpenGong Lite reliability harness.

**Pipeline:** audio upload → STT + diarization → parallel LLM extraction (summary, objections, intent, next steps, follow-up email) → cited notes where every claim points at an exact transcript segment.

**Why this doc exists:** the judging deck names the harness as the moat. Seven required parts, loop depth = 15% of score, dedicated Harness trophy. Everything below is derived from a shipped open-source project or a vendor spec, not invented.

**The Iron Law of this harness:**

```
NO CLAIM SHIPS WITHOUT A VERIFIED TRANSCRIPT SPAN, AND NO RUN ENDS WITHOUT A NAMED REASON
```

**A note on the STT vendor.** The brief says "PyAI API". The only STT/diarization API matching that shorthand is **pyannoteAI** (`docs.pyannote.ai`) — async job model, `POST https://api.pyannote.ai/v1/diarize`, `precision-2` diarization plus Parakeet-tdt-0.6b-v3 or `whisper-large-v3-turbo` for text, returning word-level and turn-level segments shaped `{start, end, text, speaker}`. Limits: **1 GiB / 24 h** per diarization job, **80 req/min (Developer) → 500 req/min (Enterprise)**, ~100 languages, **job results deleted after 24 h**. ([STT orchestration tutorial](https://docs.pyannote.ai/tutorials/speech-to-text-diarization), [FAQs](https://docs.pyannote.ai/support/faqs)) The capability registry (Part 5) keeps this swappable — if "PyAI" turns out to be a different vendor, only `capabilities.json` changes, no code.

---

# Section A — Research findings

## A1. Structured output enforcement — "bad JSON never ships"

Four distinct strategies exist in the wild. They are **not** substitutes — production pipelines stack them in cost order: prevent → repair in-process → one aimed reask → stop.

### Strategy 1 — Constrain generation so invalid output is unrepresentable

- **Anthropic Structured Outputs** is real and shipped. `{"output_config": {"format": {"type": "json_schema", "schema": {...}}}}`, plus strict tool use via `"strict": true` on a tool's `input_schema`. The parameter migrated from top-level `output_format` to `output_config.format`, and **no beta header is required with the new shape** (the old `output_format` + `structured-outputs-2025-11-13` header still work during transition). Genuine constrained decoding: the schema is compiled to a grammar, and **compiled grammars are cached 24 h** (a schema change invalidates). Unsupported keywords **error at request time**, before generation. ([platform.claude.com structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs))
- **OpenAI Structured Outputs**: `response_format: {type: "json_schema", json_schema: {strict: true, ...}}` — *"will always generate responses that adhere to your supplied JSON Schema"*. Every property must be in `required`, `additionalProperties: false` on every object, root must be an object, and `allOf`/`not`/`if`/`then`/`else` are unsupported. Refusals arrive as a distinct refusal message, not as schema-conformant output — you must branch on it. ([OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs))
- **outlines** (dottxt-ai): JSON Schema → regex → FSM, with an index mapping each state to the token ids that keep the string in the language; every other logit is set to `-inf` before softmax. Per-token cost is an O(1) dict lookup after a one-time per-schema compile. ([repo](https://github.com/dottxt-ai/outlines), [arXiv:2307.09702](https://arxiv.org/abs/2307.09702)) **The catch for us**: outlines splits into `SteerableGenerator` (real masking, needs logits — transformers/vLLM/llama.cpp) and `BlackBoxGenerator` (`from_anthropic`, `from_openai`, …) which **masks nothing** and just forwards the schema to the provider. "Works with any model" is API uniformity, not uniform enforcement.

**Three limits of constrained decoding that shape our design:**

1. **Truncation defeats the guarantee.** Hitting `max_tokens` mid-object yields invalid JSON despite the grammar. Constrained decoding constrains the *attempt*, not the length. `finish_reason === 'length'` therefore needs its own branch — reasking with identical params is guaranteed to fail identically. The fix is a bigger limit or a split extraction, never a retry.
2. **The SDKs silently downgrade your schema.** Anthropic's Python/TS helpers strip unsupported constraints, move the constraint text into `description`, inject `additionalProperties: false`, then **validate the response against your original schema client-side**. So a `minimum: 100` is enforced post-hoc, not by the decoder — and post-hoc enforcement can fail, so a repair path is still required. Anthropic does not support numeric constraints, string length constraints, recursive schemas, or `minItems` beyond `0|1`; OpenAI's subset differs. **Do not assume schema portability between the two.**
3. **Grammar enforcement covers structure, never semantics.** A schema-valid object can still contain a fabricated quote. That is precisely why Part 2 exists as a separate gate — no amount of structured-output tech substitutes for it.

### Strategy 2 — Tolerant parsing of near-miss output (free, do it first)

**BAML's Schema-Aligned Parsing (SAP)** is a Rust error-correcting parser that treats the schema as the grammar and computes a **least-cost edit** from raw model text to a conformant value — explicitly framed as edit distance, justified by Postel's Law. Typical correction runs in **under 10 ms**, so it is free relative to a retry round-trip. It recovers: markdown fences, preamble/postamble prose, chain-of-thought wrapped around the payload, trailing commas, unquoted strings, unescaped chars, missing brackets/colons, misnamed keys, a single value where an array was expected, and partial/streaming objects. ([boundaryml.com/blog/schema-aligned-parsing](https://boundaryml.com/blog/schema-aligned-parsing))

Their Berkeley Function Calling Leaderboard numbers (n=1000/model) are the reason to take this seriously rather than treating it as a hack:

| Model | Native function calling | AST parser | SAP |
|---|---|---|---|
| GPT-4o-mini | 19.8% | 51.8% | **92.4%** |
| Claude 3 Haiku | 57.3% | 82.6% | **91.7%** |
| GPT-4o | 87.4% | 82.1% | **93%** |
| Claude 3.5 Sonnet | 78.1% | 93.8% | **94.4%** |

Their objection to constrained generation is worth recording as the counter-argument: grammars are *"virtually impossible to maintain long term"* and require a model that accepts them. On failure they raise `BamlValidationError` carrying `raw_output`, `message`, `prompt`, and `detailed_message` (the full chain of failed attempts) — a good template for what our failure record must preserve. ([error handling](https://docs.boundaryml.com/guide/baml-basics/error-handling))

### Strategy 3 — Validate, then re-ask with the validator's own error text

This is the **instructor** pattern and the one we copy. ([docs](https://python.useinstructor.com/concepts/retrying/), [v2/core/retry.py](https://github.com/567-labs/instructor/blob/main/instructor/v2/core/retry.py))

- `max_retries` counts retries *after* the initial attempt, and the **Python default is `1`** — i.e. 2 total attempts. **instructor-js defaults to `MAX_RETRIES_DEFAULT = 0`.** Nobody ships 5.
- The retryable set is deliberately narrow: `_RETRYABLE_PARSE_ERRORS = (ValidationError, json.JSONDecodeError, AsyncValidationError, ResponseParsingError)`. Transport errors re-raise immediately rather than being reasked — reasking a 429 is nonsense.
- The retry **mutates the kwargs** (`kwargs = handlers.reask_handler(...)`) and then re-raises into tenacity, which re-invokes with the enriched message list.
- **The literal feedback strings** (worth copying almost verbatim, because the shape is load-bearing):
  - tools mode → a `role: "tool"` message per tool call: `"Validation Error found:\n{exception}\nRecall the function correctly, fix the errors"`
  - JSON/MD_JSON mode → `"Correct your JSON ONLY RESPONSE, based on the following errors:\n{exception}"`
  - Anthropic → replays the assistant turn, then returns a `tool_result` with `is_error: True` **for every** `tool_use` id (emitting only one breaks parallel tools with a 400)
- **The exception is `str()`-ed into the message**, so what the model sees is Pydantic's own rendering with field paths and error types (`age → Input should be a valid integer [type=int_type]`). A bare "invalid output" would not repair anything. The JS side uses `fromZodError` from `zod-validation-error` for the same reason — raw `ZodError.issues` JSON is noisier for the model than a flattened path-prefixed message.
- The bad output is **echoed back as the assistant turn** so the model sees what it produced.
- On exhaustion: `InstructorRetryException` carrying `n_attempts`, `last_completion`, `total_usage`, `create_kwargs`, and `failed_attempts` (a list of `(attempt_number, exception, completion)`), rendered into the traceback as `<failed_attempts><generation number=…>`. **This is the shape of a good failure record.**
- Newer instructor adds an **orthogonal token budget** alongside the attempt cap: `token_budget=2_000` raises `TokenBudgetExceeded`, checked after a validation failure and before preparing the next request. Two independent caps, not one — exactly the Part 3 × Part 7 interaction.

**Vercel AI SDK** is the cleanest published statement of the capped-repair control flow, and it caps at **exactly one** repair, structurally:

```ts
export type RepairTextFunction = (options: {
  text: string; error: JSONParseError | TypeValidationError;
}) => Promise<string | null>;   // null = give up, rethrow the ORIGINAL error
```
The repair path is gated on `JSONParseError | TypeValidationError` only; on repair it calls the **non-repairing** parse function, so repair depth is capped by structure with no counter to get wrong. ([repair-text.ts](https://github.com/vercel/ai/blob/main/packages/ai/src/generate-object/repair-text.ts), [parse-and-validate-object-result.ts](https://github.com/vercel/ai/blob/main/packages/ai/src/generate-object/parse-and-validate-object-result.ts)) `NoObjectGeneratedError` carries `text`, `cause`, `usage`, `finishReason`, and has **three distinct messages that are your triage key**: "the model did not return a response" / "could not parse the response" / "response did not match schema". ([error docs](https://ai-sdk.dev/docs/reference/ai-sdk-errors/ai-no-object-generated-error))

**Guardrails AI** generalises the response to a policy enum, `OnFailAction`: `reask`, `fix`, `filter`, `refrain`, `noop`, `exception`, `fix_reask`; `num_reasks` caps the loop. ([docs](https://www.guardrailsai.com/docs/concepts/validator_on_fail_actions)) This enum is the single most useful artifact in the whole research pass — it is the vocabulary for Part 2's gates.

### Strategy 4 — Cap low, and know why

There is no rigorous published study fixing the number at 2–3. What exists is convergent library defaults (instructor Python 1, instructor-js 0, AI SDK structurally 1, BAML 0) and a failure-mode argument, and the argument is the better one:

1. **Structural failures are deterministic.** If the prompt reliably causes output that fails validation, retrying reproduces the same failure. Two identical failures is strong evidence the failure is structural, so the marginal value of attempt #3 is near zero *conditional on* #1 and #2 failing.
2. **The dangerous outcome is not exhaustion — it is succeeding on attempt 2 or 3 with output that passes validation but is subtly wrong.** The pipeline logs success, bad data flows downstream, and the corruption surfaces much later. **More retries increase exposure to this**, which inverts the "retries are cheap, why not" intuition. ([The LLM Retry Loop That Looks Like Progress](https://pithycyborg.substack.com/p/the-llm-retry-loop-that-looks-like))
3. Agent-harness evidence on raising a retry budget from 5x to 20x: success keeps improving with sharp diminishing returns and ~8x runtime, *"rendering it impractical for real-world deployment."*

**Our cap: SAP-style tolerant parse (free) + 2 aimed repairs = 3 total attempts per extractor**, with a separate token budget on top. Then the extractor is marked failed and the run degrades to PARTIAL rather than dying.

## A2. Citation grounding — verifying a quote really exists

### The gold standard, and what it actually guarantees

**Anthropic's Citations** chunks plain text into sentences and returns `cited_text` alongside a location object — `char_location` (`start_char_index`/`end_char_index`, 0-indexed, end exclusive), `page_location`, `content_block_location`, or `search_result_location`. ([platform.claude.com/citations](https://platform.claude.com/docs/en/build-with-claude/citations))

The docs never claim citations "cannot be hallucinated." What they say is more precise, and more useful:

> "Internally, **the model outputs citations in a standardized format that are then parsed into cited text and document location indices.** The `cited_text` field is provided for convenience and does not count toward output tokens."

> "Because the API parses citations into the response formats described in the following sections and extracts `cited_text` directly, citations are **guaranteed to contain valid pointers to the provided documents**."

And the machine-checkable invariant, from the search-results doc: `cited_text` *"Equals the contents of `content[start_block_index:end_block_index]` joined together"*, with *"The text block is the minimal citable unit: Claude cites whole blocks, not substrings within a block."*

**That is the whole architectural lesson: the model never emits the quote text. It emits a location, and the server slices.** A pointer can be *wrong* (an irrelevant sentence cited) but it cannot be *fabricated* — there is no generation path for the quote string. Replicate that architecture and the verification gate collapses into a bounds check.

**The blocker that decides our design:** citations are **incompatible with structured outputs** — enabling both returns a **400**, because *"citations require interleaving citation blocks with text output, which is incompatible with the strict JSON schema constraints of structured outputs."* For a tool whose output is structured call notes, that forces a choice, and the choice is clear: **build the same contract ourselves with segment IDs**, keep the JSON, and add roughly 80 lines of code.

### Our cheapest reliable gate (the verdict)

**Layer 0 — segment IDs, not quote strings. This is the gate.** A diarized transcript already arrives as turns with speaker and `start`/`end`. Number them and render them into the prompt:

```
[S17] (04:31) Customer: we've been getting spam-flagged on outbound for about three weeks now
```

Every claim must carry `evidence_segment_ids: [17, 18]`. Verification is then:

```python
evidence = " ".join(transcript[i].text for i in claim.evidence_segment_ids)
```

**An integer bounds check.** Zero string matching, zero normalization, zero false negatives, zero latency — and timestamps come free, so every claim in the UI is click-to-play. This is exactly Anthropic's custom-content contract ("the text block is the minimal citable unit") rebuilt locally.

**Why segment IDs and not model-returned char offsets:** LLMs are bad at counting characters, so char offsets into a 40-minute transcript will be wrong far more often than small integers will. Segment IDs are 2–3 digit numbers **printed in the context** — visible tokens the model copies, not arithmetic it performs. If sub-turn character precision is needed, derive it harness-side, never from the model.

**Layer 1 — normalized exact containment, scoped to the cited segments.** Only needed for sub-turn phrase highlighting. Run the normalization below on both sides, then `quote_norm in segment_norm`. **Scope to the cited segments ±1 neighbour, never the whole transcript** — whole-transcript search manufactures spurious matches for short quotes.

Exact matching on *raw* text is not a gate, it is a rejection machine: models append trailing periods, expand contractions, drop fillers, and a quote crossing a turn boundary picks up the rendered `[S17] Agent:` prefix. **The normalization layer is what makes exact matching viable at all.**

Normalization pipeline (applied identically to both sides):
1. `unicodedata.normalize("NFKC", s)`
2. Fold typographic variants: `' ' ‚ ‛ → '`, `" " „ ‟ → "`, `– — ‒ → -`, `… → ...`, ` `/`​` → space/removed
3. Strip control chars (Unicode `Cc`, except `\n`)
4. Collapse whitespace runs → single space, strip
5. `str.casefold()` — not `.lower()`
6. **Fallback tier only:** strip terminal punctuation from both ends of the quote
7. **Do NOT normalize digits or number words.** Folding "twenty five" ↔ "25" is exactly where a verification gate silently launders a wrong figure. **For call intelligence, wrong numbers are the expensive failure.**

Build a `norm_idx → raw_idx` array during step 4 so a hit at `norm[i:j]` maps back to `raw[...]` and then to a timestamp. ~15 lines, and it is the difference between "verified" and "verified and clickable."

**Layer 2 — bounded fuzzy fallback.** Use `rapidfuzz.fuzz.partial_ratio_alignment`, **not** `partial_ratio` — it returns offsets, so a fuzzy pass still yields exact highlight positions:

```
>>> fuzz.partial_ratio_alignment("a certain string", "cetain")
ScoreAlignment(score=83.33, src_start=2, src_end=8, dest_start=0, dest_end=6)
```
([rapidfuzz docs](https://rapidfuzz.github.io/RapidFuzz/Usage/fuzz.html), [fuzz_py.py](https://github.com/rapidfuzz/RapidFuzz/blob/main/src/rapidfuzz/fuzz_py.py))

- **≥95** → accept, label "verified"
- **90–95** → accept, label **"approximate match"** with a different badge — do not launder this as exact
- **<90** → fail

Two mandatory guards, both learned from the failure mode rather than from a paper:
- **Minimum length: ≥40 normalized chars or ≥8 tokens** before fuzzy is permitted. `partial_ratio` saturates toward 100 for short needles in long haystacks — a 4-word quote "matches" almost anything.
- **Length-ratio guard: `0.8 ≤ len(matched_span)/len(quote) ≤ 1.25`.** `partial_ratio` will happily match a substring of your substring.

**Published thresholds converge on 90.** The RAG-citations writeup uses `>90 partial_ratio` for post-generation verification ([dev.to](https://dev.to/experilearning/unlocking-advanced-rag-citations-and-attributions-59lk)); Guardrails' `ExtractiveSummary` examples use `threshold=90` ([hub](https://guardrailsai.com/hub/validator/aryn/extractive_summary)); a registry-bound extraction pipeline uses a 3-tier ladder (exact → whitespace-normalized → numeric-token → fuzzy sliding window) and reports **90.12% of evidence-bearing rows verified as verbatim substrings** at population scale, routing failures to a human "red zone" ([arXiv 2606.00994](https://arxiv.org/pdf/2606.00994)).

**And there is a transcript-specific validation of exactly this design.** TimeStampEval ran RapidFuzz partial-ratio pre-narrowing over a 2,772-sentence transcript before any LLM verification: latency **16.1s → 8.1s**, cost per correct answer **$0.0547 → $0.0045** (10–87×), accuracy **+4 to +50pp**. Their recipe, verbatim: *"for verbatim quotes, skip LLMs entirely; for fuzzy matches, pre-narrow with traditional fuzzing then verify with an LLM on just the relevant snippet."* ([arXiv 2511.11594](https://arxiv.org/html/2511.11594v1))

### Why NLI stays off the blocking path

| Model | Footprint | Speed | Accuracy |
|---|---|---|---|
| [HHEM-2.1-Open](https://huggingface.co/vectara/hallucination_evaluation_model) | FLAN-T5-Base, 0.1B, **<600 MB RAM fp32**, Apache 2.0 | ~1.5s / 2k tokens **on CPU** | AggreFact-SOTA balanced acc **76.55%** (GPT-4: 73.78%); RAGTruth-Summ 64.42% |
| [MiniCheck-FT5](https://github.com/Liyan06/MiniCheck) | 770M | >500 docs/min on an A6000 | GPT-4-level, **>400× cheaper**; notably finds claim decomposition is *not* needed |
| [Bespoke-MiniCheck-7B](https://huggingface.co/bespokelabs/Bespoke-MiniCheck-7B) | 7B | ~200ms on GPU | SOTA; beats Claude 3.5 Sonnet at this task |
| SAFE / FActScore | agentic, Google-Search-backed | — | wrong tool — verifies against open-world knowledge, not one private transcript |

HHEM-2.1-Open is the only realistic no-GPU option. **But 64–77% balanced accuracy means roughly one verdict in three is wrong on hard cases.** Blocking a customer-facing note on a 70%-accurate judge generates more false rejections than it prevents hallucinations, and it burns the remaining hours on threshold tuning. **Run it async, store the score as a confidence badge, use it to sort a review queue and tune the prompt. Never to block.**

**What none of this catches:** the right segment cited for the wrong claim. That is a *relevance* failure, not a *fabrication* failure, and no string method catches it. **Say so in the demo.** That is correct scoping, not a gap — and pretending otherwise is the exact dishonesty the harness exists to prevent.

### The prompting order that makes the gate cheap to pass

Ask for the evidence **before** the assertion, and put the transcript at the top. Anthropic's guidance is explicit on both:

> "**Ground responses in quotes:** For long document tasks, ask Claude to quote relevant parts of the documents first before carrying out its task."

> "**Put longform data at the top:** ... Queries at the end can improve response quality by **up to 30 percent** in tests, especially with complex, multidocument inputs."
([prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices))

And the retraction rule, which is our gate stated as a prompt:

> "Verify with citations: ... have Claude verify each claim by finding a supporting quote after it generates a response. **If it can't find a quote, it must retract the claim.**"
([reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations))

Our schema enforces the order structurally, since JSON key order under a constrained-decoding grammar *is* generation order:

```json
{"evidence_segment_ids": [17, 18], "quote": "...", "claim": "..."}
```

Evidence first, claim second — so the claim is generated *conditioned on* evidence already committed to. The same doc is honest about the ceiling: *"while these techniques significantly reduce hallucinations, they don't eliminate them entirely."* Which is why the prompt is not the gate; the gate is the gate.

### PII

Vendor-side (AssemblyAI PII Redaction: 20+ entity types, transcript + audio redaction, beep or silence, redacted audio English/Spanish only — [docs](https://www.assemblyai.com/docs/guardrails/redact-pii-from-transcripts)) or self-hosted ([Microsoft Presidio](https://microsoft.github.io/presidio/), 50+ entity types, 49 languages, warns *"no guarantee Presidio will find all sensitive information"*). **Order matters: redact only after citation offsets are resolved, or every offset shifts.** Redaction is a rendering-time transform applied to both the transcript and the quote, so the gate still runs on the unredacted text.

## A3. Budget governors, run records, failure invariants

### Budgets

- **LiteLLM** is the clearest OSS precedent: `max_budget` (USD) and `budget_duration` (`1s|1m|1h|1d|1mo`) at key / user / team / global scope; exceeding it raises `BudgetExceededError` and the proxy returns 429. ([Budgets & Rate Limits](https://docs.litellm.ai/docs/proxy/users)) Worth noting the reported bugs — global `budget_duration` silently ignored, org spend never resetting ([#31292](https://github.com/BerriAI/litellm/issues/31292), [#25495](https://github.com/BerriAI/litellm/issues/25495)) — a reminder that a budget you never reset is a footgun. Ours is **per-job**, created fresh each run, so there is nothing to reset.
- **promptfoo** has a first-class `cost` assertion — *"checks if the cost of the LLM call is below a specified threshold"*, in dollars, alongside `latency`. ([deterministic assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/)) But note what it is: an assertion that fails the test **after** the money is spent. There is no `--max-cost` flag. Good framing (budget as a checked threshold, not a log line), insufficient mechanism — which is exactly why our governor checks *before* the call.
- **promptfoo's two-tier timeout is the pattern to copy directly**: `PROMPTFOO_EVAL_TIMEOUT_MS` (per request) vs `PROMPTFOO_MAX_EVAL_TIME_MS` (whole eval), plus `maxConcurrency` (default 4), `delay`, `timeoutMs`, `maxEvalTimeMs`. ([troubleshooting](https://www.promptfoo.dev/docs/usage/troubleshooting/), [config reference](https://www.promptfoo.dev/docs/configuration/reference/)) The docs do *not* publish what happens to partial results when the overall timeout fires — that ambiguity is itself the lesson: **state your own contract explicitly.**
- **Agent frameworks cap iterations, not money**, but the cap is always a **typed error**, never a silent truncation: LangGraph `recursion_limit` (**default 25**) → `GraphRecursionError` ([docs](https://docs.langchain.com/oss/python/langgraph/errors/GRAPH_RECURSION_LIMIT)); LangChain `AgentExecutor(max_iterations=, max_execution_time=)`; OpenAI Agents SDK `max_turns` → `MaxTurnsExceeded` ([docs](https://openai.github.io/openai-agents-python/running_agents/)).
- **The degrade-on-exhaustion hook is real prior art.** LangChain's `early_stopping_method` distinguishes `"force"` (stop, return a stub) from `"generate"` (one final bounded call to produce a usable answer) ([#16263](https://github.com/langchain-ai/langchain/issues/16263)); the OpenAI Agents SDK lets you register `error_handlers={"max_turns": ...}` returning a `RunErrorHandlerResult` with a real `final_output` instead of throwing. Budget exhaustion should produce a **usable partial**, not only an exception.
- **Estimate before you spend.** Anthropic's `POST /v1/messages/count_tokens` takes the same payload shape as `/v1/messages`, is **free to call**, and has **rate limits separate from message creation** — so pre-checking never eats inference quota. It returns an estimate that may differ slightly from billed input tokens. ([token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)) `tiktoken` is the local equivalent for OpenAI ([cookbook](https://developers.openai.com/cookbook/examples/how_to_count_tokens_with_tiktoken)). Input tokens are countable exactly; output tokens are not — so the pre-flight inequality uses your own `max_tokens` as worst case: `est_input × input_rate + max_tokens × output_rate ≤ remaining_budget`. That makes the ceiling **provable** before spending.
- **Never derive recorded cost from a framework callback.** LangChain's `get_openai_callback` misses tokens for LCEL chains invoked via `.stream()` ([#13430](https://github.com/langchain-ai/langchain/issues/13430)) and `UsageMetadataCallbackHandler` has a reported miscount ([#30678](https://github.com/langchain-ai/langchain/issues/30678)). Read `usage` off the raw provider response.

### Run records

- **dbt `run_results.json`** is the best citable manifest schema ([docs](https://docs.getdbt.com/reference/artifacts/run-results-json), [v6 schema](https://schemas.getdbt.com/dbt/run-results/v6.json)): top level `metadata`, `results[]`, `elapsed_time`, `args`; `metadata` carries `invocation_id`, `invocation_started_at`, `generated_at`, `dbt_version`, `env`; each result has `status`, `timing[]` (`{name, started_at, completed_at}` with named phases like `compile`/`execute`), `thread_id`, `execution_time`, `adapter_response`, `message`, `failures`, `unique_id`. **The detail most hand-rolled manifests miss: the node status enum is `success | error | skipped | partial success | no-op`.** `partial success` is first-class. That is exactly the status a run needs when STT succeeded and 3 of 5 extractors ran before the budget hit. `failures` (integer|null) is deliberately separate from `message` (human string) — a count you can assert on vs. prose you can read.
- **promptfoo's result file** shows the other half: **cost is recorded per response, per result, *and* per prompt aggregate** — never only rolled up. `tokenUsage` is `{prompt, completion, cached, total, numRequests}`. ([real committed artifact](https://github.com/promptfoo/promptfoo/blob/main/examples/simple-cli/output.json))
- **OpenTelemetry GenAI semantic conventions** give the per-call field names ([repo](https://github.com/open-telemetry/semantic-conventions-genai) — note they moved out of the main semconv repo and are still status *Development*): `gen_ai.operation.name` (Required), `gen_ai.provider.name` (Required), `gen_ai.request.model` (Conditionally Required), `error.type` (Conditionally Required on error — **Stable**, must be low-cardinality, fallback `_OTHER`), `gen_ai.response.model` (the *actual* served model, often ≠ requested), `gen_ai.response.finish_reasons`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.request.max_tokens`. Span name SHOULD be `{gen_ai.operation.name} {gen_ai.request.model}`. One spec rule worth honouring: *"When systems report both used tokens and billable tokens, instrumentation MUST report billable tokens."*
- **Temporal `RetryPolicy`** gives the retry vocabulary and the published defaults: `initial_interval` **1s**, `backoff_coefficient` **2.0**, `maximum_interval` **100 × initial**, `maximum_attempts` **0 = unlimited**, `non_retryable_error_types` empty. ([docs](https://docs.temporal.io/encyclopedia/retry-policies)) Two transplantable invariants: `maximum_attempts: 0` meaning unlimited is a footgun — always set an explicit integer — and `non_retryable_error_types` is the mechanism that stops budget burning on a 400/415.
- **Temporal's status enum** also carries `PAUSED(8)`, and splits open (RUNNING, PAUSED) from closed. **`TIMED_OUT` being a distinct terminal status from `FAILED` is precisely what makes "hung silently" distinguishable from "errored."**

### Never hang, never lose the record

- **Write-ahead record**: write `run.json` with `status: RUNNING`, the run id, and the *planned* budget **before the first API call**, `fsync` it, then update at each step boundary. A process killed at any instant leaves a record that says what it was doing. **The absence of a terminal status is itself the record.**
- **Deadlines compose.** `AbortSignal.timeout(ms)` aborts with a **`TimeoutError` DOMException**, distinct from the `AbortError` a manual `controller.abort()` produces — that distinction is free exit-reason classification ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)). `AbortSignal.any([perCall, jobDeadline, userCancel])` nests per-request timeouts inside a whole-job deadline ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static)). An un-aborted fetch is how "no silent hangs" gets violated.
- **The signal handlers have a footgun that must be handled.** Per [Node process docs](https://nodejs.org/api/process.html#signal-events): installing a `SIGINT`/`SIGTERM` listener **removes the default handler**, so Node no longer exits on its own — you must call `process.exit()` yourself or the CLI hangs, a hang introduced by the very code meant to prevent hangs. Default exit codes are `128 + signum` (SIGINT 130, SIGTERM 143). `process.on('exit')` is **synchronous-only** — the final write must be `fs.writeFileSync`. `beforeExit` allows async work but is not emitted for `process.exit()` or uncaught exceptions, so it cannot be the only net. `SIGKILL`/`SIGSTOP` cannot have listeners at all.
- **Sweeper**: because nothing in-process survives `kill -9`, a record still `RUNNING` with a heartbeat older than N minutes is swept to `CRASHED`. This is the layer that makes the invariant total.

## A4. Safe parallelism

- **Concurrency cap**: `p-limit` (`const limit = pLimit(4); await Promise.allSettled(tasks.map(t => limit(t)))`). `limit.concurrency` is a **settable** property, so concurrency can be retuned at runtime; `limit.activeCount`/`pendingCount` give introspection. ([p-limit](https://github.com/sindresorhus/p-limit)) Use `p-queue` instead when you need rate-*limit* shaping, not just concurrency: `new PQueue({concurrency: 8, interval: 60_000, intervalCap: 500})` expresses "8 in flight, 500/min" in one object, which maps straight onto a provider RPM limit. It also has per-task `timeout`, `priority`, `.onIdle()`. ([p-queue](https://github.com/sindresorhus/p-queue))
- **`Promise.allSettled`, never `Promise.all`.** `Promise.all` rejects on the first failure and abandons results you already paid for. MDN names the rule outright: use `allSettled` when tasks "are not dependent on one another to complete successfully, or you'd always like to know the result of each promise." The `{status:'fulfilled', value} | {status:'rejected', reason}` array is **index-aligned**, which is exactly what a PARTIAL exit and a resumable manifest need. ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)) Note `p-map` with `stopOnError: false` gets you all-settled semantics but throws an `AggregateError` — you lose the index→outcome mapping, so it is the wrong shape here. ([p-map](https://github.com/sindresorhus/p-map))
- **Python equivalent, with a trap.** `asyncio.gather()`'s default `return_exceptions=False` propagates the first exception but the docs are explicit that the other awaitables **"won't be cancelled and will continue to run"** — fail-fast does not stop the spend, it just discards it. Use `return_exceptions=True` and `isinstance(r, BaseException)` per index. ([asyncio-task](https://docs.python.org/3/library/asyncio-task.html)) For the cap, prefer `asyncio.BoundedSemaphore` over `Semaphore` (raises on release/acquire imbalance instead of silently inflating concurrency) or `anyio.CapacityLimiter`, whose `total_tokens` is settable at runtime for backing off after 429s. ([asyncio-sync](https://docs.python.org/3/library/asyncio-sync.html), [anyio](https://anyio.readthedocs.io/en/stable/synchronization.html))
- **Serialized writes need two different mechanisms, not one.** (a) *Lost update*: two workers read the manifest, each adds a record, the second write erases the first. Nothing is corrupt on disk — the data is silently gone. Only **serialization** fixes this: `new PQueue({concurrency: 1})` as the single writer actor. (b) *Torn write*: a naive `writeFile` truncates then writes, so a crash or a concurrent reader sees invalid JSON. Only **atomicity** fixes this: temp-then-rename, packaged as [`write-file-atomic`](https://github.com/npm/write-file-atomic) (maintained under the npm org, used by the npm CLI itself; temp name is `filename + "." + murmurhex(__filename, pid, ++invocations)` so it is multi-process-safe, and the temp file must sit in the same directory because `rename(2)` is only atomic within a filesystem). Add [`proper-lockfile`](https://github.com/moxystudio/node-proper-lockfile) (atomic `mkdir` strategy + mtime heartbeat, `stale` default 10s) only if a second process can touch the manifest.
- **Idempotency**: key every unit of work by a content hash — `sha256(model + prompt + all params + transcript_hash)`. Four rules taken from the sources:
  1. **Cache the outcome, not just successes** — Stripe saves "the resulting status code and body of the first request... *regardless of whether it succeeds or fails*". ([Stripe](https://docs.stripe.com/api/idempotent_requests))
  2. **Same key + different params must be an error, not a silent replay** — Stripe's idempotency layer "compares incoming parameters to those of the original request and errors if they're not the same".
  3. **Never cache errors.** promptfoo is explicit: *"Error responses are not cached to allow for retry attempts."* Cache a transient 429 and you have created a permanent poisoned result. ([promptfoo caching](https://www.promptfoo.dev/docs/configuration/caching/))
  4. **Hash the full param set**, including temperature and response schema — promptfoo's key includes provider config for exactly this reason; LiteLLM's default key is `model + messages + temperature + logit_bias`. ([LiteLLM caching](https://docs.litellm.ai/docs/caching/all_caches))

  This also makes **stage checkpointing** free: STT output is keyed by the audio hash, so retrying extraction never re-pays for transcription, and "resume after crash" needs no special-case code — re-run and let the cache absorb completed work.
- **Rate limits under fan-out.** Correct precedence is `Retry-After` **first**, backoff second. Anthropic's header table states plainly that `retry-after` is the seconds to wait and **"Earlier retries will fail"**; its limiter is a **token bucket** — "continuously replenished... rather than being reset at fixed intervals" — so pacing beats bursting, and there are separate **acceleration limits** that punish a sharp usage increase, arguing for *ramping* concurrency up rather than opening at full fan-out. ([Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)) OpenAI says to treat `Retry-After` as a minimum and "add a small random delay so multiple clients don't retry at the same time." ([OpenAI rate limits](https://developers.openai.com/api/docs/guides/rate-limits))

  When there is no header, use **full jitter**: `sleep = random(0, min(cap, base * 2**attempt))`. AWS's measurements: full and decorrelated jitter both substantially beat un-jittered backoff on client work and server load; equal jitter (`base*2**n/2 + random(0, base*2**n/2)`) takes "much longer". Full jitter is the default because it is stateless and does the least total work. ([AWS](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/))

  **Why jitter is specifically a fan-out problem:** N calls fired together get 429'd together; un-jittered backoff makes all N sleep the *identical* duration and retry in the *same* instant, so the herd re-forms perfectly at 2×, 4×, 8× base delay forever. **Footgun: `p-retry`'s `randomize` option defaults to `false`.** ([p-retry](https://github.com/sindresorhus/p-retry))
- **Feed the rate-limit headers back into the cap.** `x-ratelimit-remaining-*` / `anthropic-ratelimit-*-remaining` should adjust `limit.concurrency` so you throttle *before* getting 429s rather than only reacting after.

## A5. Capability registry

The closest existing design to "models.json: which model for extraction vs email drafting vs repair" is **Continue's role-based model list**. Each entry declares `roles:` from `chat, edit, apply, autocomplete, embed, rerank, summarize` (default when omitted: `[chat, edit, apply, summarize]`), so a model is selected *by the job it does*, not by a string hardcoded at the call site. Two further details worth stealing: **role-conditional option blocks** (chat-role entries take `baseSystemMessage`; embed-role entries take `maxChunkSize`/`maxBatchSize`) and a `capabilities` array (`tool_use`, `image_input`) that **overrides autodetection** — detect by default, allow a manual override for proxied endpoints where detection fails. ([Continue model roles](https://docs.continue.dev/customize/model-roles), [config.yaml reference](https://docs.continue.dev/reference))

Continue's `apply` role deserves a special note: it is *a separate, cheaper model whose only job is mechanically applying another model's output*. That is a shipped precedent for a dedicated **repair** model in an LLM pipeline.

Supporting precedents:
- **aider** splits `--model` / `--weak-model` ("commit messages and chat history summarization") / `--editor-model`, and — the real lesson — keeps **behaviour and capability metadata in two different files**: `.aider.model.settings.yml` vs `.aider.model.metadata.json` ("context window and costs for unknown models"), resolved through a cascade home → repo root → cwd → explicit flag. Its per-model keys include capability declarations like `use_temperature: false` and `accepts_settings: [reasoning_effort]`. ([aider advanced model settings](https://aider.chat/docs/config/adv-model-settings.html), [options](https://aider.chat/docs/config/options.html))
- **promptfoo** `providers:` uses opaque id strings (`openai:gpt-4o`, `anthropic:messages:claude-3`) with `id`, `label` (decouples display identity from the model id, so you can A/B the same model at two temperatures), `config` (temperature, max_tokens, `response_format` which may be a `file://` schema, and cost overrides `inputCost`/`outputCost`), and `delay` for crude per-provider pacing at the registry level. ([config reference](https://www.promptfoo.dev/docs/configuration/reference/))
- **LiteLLM Router**: `model_name` is an **alias**, not a model — many deployments share one alias and call sites reference only the alias. That indirection is the whole point of a registry: call sites name a *job*, config decides what it resolves to today. Rate limits live per-deployment as registry data (`rpm`, `tpm`, `weight`), alongside `allowed_fails` (default 3) and `cooldown_time` (default 5s). ([routing](https://docs.litellm.ai/docs/routing))
- **LiteLLM's fallbacks are typed by failure class** — `fallbacks`, `context_window_fallbacks`, `content_policy_fallbacks`, `default_fallbacks`. ([reliability](https://docs.litellm.ai/docs/proxy/reliability)) This is the sharpest idea in the whole registry section: a context-window overflow should fall back to a *bigger* model, a content-policy refusal to a *different* one, a transient error to any peer. One flat fallback list conflates three different remedies.
- **Vercel AI Gateway** nests model fallbacks inside provider routing (`providerOptions.gateway.models[]` × `order`/`only`/`sort`), and — the part to copy — returns a **`modelAttempts` array** recording every attempt with `canonicalSlug`, `modelId`, `attemptNumber`, `provider`, `success`, `responseTimeMs`, `error`, `statusCode`. **Logging which model actually served each item is what makes a fallback chain debuggable after the fact.** ([model fallbacks](https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks), [provider options](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options))
- **LiteLLM's `model_prices_and_context_window.json`** is *the* citable artifact for capability metadata as data ([file](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)). Use its field names verbatim so our registry can be seeded from and diffed against it: `supports_response_schema` (not "supports_json_schema"), `supports_function_calling` (plus `supports_parallel_function_calling`), `supports_prompt_caching`, `supports_vision`, `max_input_tokens` / `max_output_tokens` (**`max_tokens` is explicitly marked LEGACY — do not key off it**), `input_cost_per_token` / `output_cost_per_token` (per token, not per 1M), `mode` (`chat | embedding | audio_transcription | rerank | …`), `litellm_provider`, and `deprecation_date`. Three conventions worth adopting: booleans are **optional-by-omission** (missing means false, entries stay small); `mode` is a coarse type tag gating which fields are meaningful; and the file **documents its own schema in-band** via a `sample_spec` entry, so the schema cannot drift from the data.

## A6. Named exits — prior art

- **`sysexits.h`** (4.3BSD, still the CLI convention): `EX_USAGE 64`, `EX_DATAERR 65`, `EX_NOINPUT 66`, `EX_SOFTWARE 70`, `EX_TEMPFAIL 75`. The design idea: *"the caller of the process can get a rough estimation about the failure class without looking up the source code."* ([man7](https://www.man7.org/linux//man-pages/man3/sysexits.h.3head.html)) Every named exit maps to one of these so `echo $?` means something.
- **Temporal `WorkflowExecutionStatus`**: `UNSPECIFIED 0, RUNNING 1, COMPLETED 2, FAILED 3, CANCELED 4, TERMINATED 5, CONTINUED_AS_NEW 6, TIMED_OUT 7`. ([workflow.proto](https://github.com/temporalio/api/blob/master/temporal/api/enums/v1/workflow.proto)) Two lessons: `RUNNING` lives in the same enum as the terminal states, and `TIMED_OUT` is separate from `FAILED` — a deadline is not a bug.
- **GitHub Actions** splits `status` (queued / in_progress / completed) from `conclusion` (success, failure, cancelled, skipped, neutral, timed_out, stale, action_required). ([community #70540](https://github.com/orgs/community/discussions/70540)) We copy the split exactly: `status` + `exit_reason`.

Nothing in the OSS meeting-intelligence space ships a grounded-citation gate — Meetily and friends stop at transcription plus summarization. ([Meetily](https://dev.to/zackriya/how-to-transcribe-summarize-meetings-locally-with-meetily-the-best-self-hosted-open-source-ai-dmk), [ALIGNMEET](https://arxiv.org/pdf/2205.05433)) The gate is the differentiator, not a commodity.

## A7. Audio and STT failure research

Sources: [AssemblyAI, *Speech-to-Text API Edge Cases*](https://www.assemblyai.com/blog/speech-to-text-api-edge-cases); [Google Cloud STT troubleshooting](https://docs.cloud.google.com/speech-to-text/docs/troubleshooting); Whisper hallucination literature.

- **Silence returns HTTP 200 with an empty or hallucinated transcript.** A success status is not success. AssemblyAI's own advice: *"Verify the audio actually contains speech by checking file properties and waveform analysis."*
- **Whisper hallucinates on silence and non-speech, confidently.** Under masking, Whisper-small produced 51,000+ insertions of which **86% were repetition loops** ([arXiv 2501.11378](https://arxiv.org/pdf/2501.11378)). The built-in filter does not save you: hallucinated segments often carry *high* average logprob and *low* `no_speech_prob`, so they pass the threshold ([arXiv 2606.07473](https://arxiv.org/pdf/2606.07473)). **We need our own degenerate-output detector** — vendor confidence fields are insufficient.
- **Retryable vs non-retryable is a hard split.** Retryable: `429` (honour `Retry-After`), `500`, `503`, timeouts. Non-retryable: `400`, `401`, `413 Payload Too Large`, `415 Unsupported Media Type`.
- **Rate limits are sliding-window**, not per-minute-boundary. AssemblyAI's stated pattern is 1s → 2s → 4s → 8s with jitter "to prevent synchronized retries".
- **Long files**: chunk on sentence boundaries, **30 minutes max per chunk**, else you get hard cutoffs or degraded accuracy in the tail.
- **Code-switching is an accuracy cliff, not a bug**: monolingual-trained ASR underperforms by **~42% WER** on code-switched Hinglish ([HiACC corpus](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12329218/)). We surface it as a confidence level, we do not pretend to fix it.
- **`ffprobe`/`ffmpeg` preflight is free and catches most input problems.** `ffprobe` validates container/codec/stream presence/duration before you spend anything; `ffmpeg -af silencedetect` logs when volume stays below a noise floor longer than a minimum duration (default 2s). ([silencedetect](http://underpop.online.fr/f/ffmpeg/help/silencedetect.htm.gz), [ffprobe as preflight](https://www.ffmpeg-micro.com/learn/ffprobe))
- **pyannoteAI's most common input error** is *"Could not load audio"* — caused by a URL that is not a direct link or is not publicly accessible. ([FAQs](https://docs.pyannote.ai/support/faqs)) Non-retryable; it is a config error dressed as a network error.

---

# Section B — The harness spec

## Shared artifact: `runs/<run_id>/run.json`

Every part below reads or writes this file. Shape modelled on dbt `run_results.json` with OTel GenAI field names for per-call usage.

```jsonc
{
  "schema_version": "1",
  "run_id": "r_2026...",             // ULID, sortable
  "idempotency_key": "sha256(audio)+sha256(config)",
  "status": "RUNNING",                // RUNNING | COMPLETED  (GitHub Actions split)
  "exit_reason": null,                // one of the named exits, set once, never mutated
  "exit_class": null,                 // SHIPPED | PARTIAL | FAILED | DEADLINE
  "exit_code": null,                  // sysexits-mapped int
  "started_at": "...", "completed_at": null,
  "heartbeat_at": "...",              // sweeper reads this
  "elapsed_time": null,
  "budget": {
    "limit_usd": 2.00, "limit_tokens": 400000, "deadline_ms": 900000,
    "spent_usd": 0.31, "spent_tokens": 61240, "elapsed_ms": 48120,
    "decisions": [ {"at":"...", "action":"DEGRADE", "why":"projected 2.4 > 2.0 usd"} ]
  },
  "input": {
    "filename": "...", "bytes": 0, "sha256": "...",
    "probe": {"codec":"aac","duration_s":4210,"channels":2,"sample_rate":44100},
    "preflight": {"speech_ratio": 0.71, "silence_spans": 12, "verdict": "OK"}
  },
  // status enum copied from dbt: success | error | skipped | partial success | no-op
  "stages": [
    { "name": "preflight",  "status": "success", "started_at": "...", "completed_at": "...",
      "execution_time": 0.9, "attempts": 1, "message": null, "failures": 0 },
    { "name": "stt",        "status": "partial success", "attempts": 2,
      "provider": "pyannoteai", "job_id": "...", "chunks": 3, "chunks_ok": 2 },
    { "name": "extract.objections", "status": "error", "attempts": 3,
      "gen_ai.request.model": "extract-strong",      // the ROLE's configured model
      "gen_ai.response.model": "claude-...-20260501", // what actually served it
      "gen_ai.usage.input_tokens": 18422, "gen_ai.usage.output_tokens": 812,
      "gen_ai.response.finish_reasons": ["end_turn"],
      "error.type": "SchemaValidationError",          // low cardinality, fallback "_OTHER"
      "message": "objections[2].quote: required",
      "failed_attempts": [ {"attempt_number": 2, "exception": "...", "completion": "..."} ] }
  ],
  "gates": [
    { "name": "citation", "checked": 41, "passed_exact": 36, "passed_fuzzy": 3,
      "failed": 2, "on_fail": "filter", "blocked_run": false }
  ],
  "artifacts": {
    "transcript": "transcript.json", "notes": "notes.json",
    "rejected_claims": "rejected.json", "log": "run.log"
  }
}
```

---

## Part 1 — One named loop

**Chosen pattern:** a single `runJob()` whose every code path returns a `RunOutcome`, with the two-field terminal state split (`status` + `exit_reason`) and a `sysexits`-mapped process exit code.

**Derived from:** GitHub Actions `status`/`conclusion` split ([#70540](https://github.com/orgs/community/discussions/70540)); Temporal `WorkflowExecutionStatus` ([workflow.proto](https://github.com/temporalio/api/blob/master/temporal/api/enums/v1/workflow.proto)); `sysexits.h` ([man7](https://www.man7.org/linux//man-pages/man3/sysexits.h.3head.html)).

**Design.**

```
function runJob(input, config):
  ctx = openRun(input, config)          # write-ahead: run.json status=RUNNING
  try:
    outcome = pipeline(ctx)             # the ONLY place a reason is minted
  catch BudgetExceeded as e:  outcome = exit(BUDGET_EXCEEDED, e)
  catch DeadlineExceeded as e:outcome = exit(DEADLINE_EXCEEDED, e)
  catch Canceled:             outcome = exit(CANCELED)
  catch any as e:             outcome = exit(INTERNAL_ERROR, e)
  finally:
    closeRun(ctx, outcome ?? exit(INTERNAL_ERROR, "no outcome minted"))
  return outcome

# closeRun is idempotent and always writes:
#   status=COMPLETED, exit_reason, exit_class, exit_code, completed_at, elapsed_time
```

Rules that make it "one loop" rather than scattered returns:
1. `exit_reason` is written **once**. `closeRun` refuses to overwrite a set reason (first reason wins — the root cause, not the last symptom).
2. No function other than `pipeline` and the `catch` arms may mint a reason. Stages return typed results; only the loop converts them to an exit.
3. The CLI prints exactly one final line: `run r_… → PARTIAL_EXTRACTORS_FAILED (2/5 extractors failed) in 118s, $0.41, exit 70`.

**Exit taxonomy** (`exit_class` in parentheses, then `sysexits` code, then what's left behind):

| Exit reason | Class | Code | Left behind |
|---|---|---|---|
| `SHIPPED` | SHIPPED | 0 | transcript.json, notes.json (all claims verified), run.json |
| `SHIPPED_WITH_FUZZY_CITATIONS` | SHIPPED | 0 | as above; notes mark fuzzy-verified claims; `gates.passed_fuzzy > 0` |
| `PARTIAL_EXTRACTORS_FAILED` | PARTIAL | 70 | transcript + notes for the extractors that succeeded; failed ones named in `stages[].error.type` |
| `PARTIAL_CLAIMS_DROPPED` | PARTIAL | 70 | notes.json minus unproven claims; **rejected.json** with each dropped claim + why |
| `PARTIAL_TRANSCRIPT` | PARTIAL | 70 | transcript.json with `coverage < 1.0` and gap spans listed; notes flagged as built on partial audio |
| `GATE_BLOCKED_UNPROVEN_CLAIMS` | FAILED | 65 | transcript.json, rejected.json, **no notes.json** — nothing unproven ever reaches disk as a deliverable |
| `BUDGET_EXCEEDED` | FAILED | 75 | everything completed before the stop, plus `budget.decisions` showing the projection that triggered it |
| `DEADLINE_EXCEEDED` | DEADLINE | 75 | partial artifacts + the stage that was in flight |
| `INPUT_INVALID_AUDIO` | FAILED | 65 | run.json with `input.probe` ffprobe output and the specific violation |
| `INPUT_UNSUPPORTED_TYPE` | FAILED | 65 | run.json with detected mime/codec vs. registry's allowed list |
| `INPUT_NO_SPEECH` | FAILED | 65 | run.json with `preflight.speech_ratio` and silence spans; no STT spend at all |
| `STT_FAILED` | FAILED | 70 | run.json with provider job id, HTTP status, attempts, last error |
| `STT_RATE_LIMITED` | FAILED | 75 | attempt log with each `Retry-After` honoured; retryable, safe to resume by idempotency key |
| `CONFIG_INVALID` | FAILED | 64 | validation errors against `capabilities.json` schema; **fails before any spend** |
| `CANCELED` | FAILED | 130 | whatever completed; `status=COMPLETED, exit_reason=CANCELED` |
| `CRASHED` | FAILED | 70 | written by the sweeper when heartbeat goes stale; last stage in flight is named |
| `INTERNAL_ERROR` | FAILED | 70 | stack trace in run.log, `error.type` in run.json |

**Corner cases covered:** every abnormal termination in Section C ends at exactly one row of this table; SIGKILL is covered by `CRASHED` via the sweeper.

---

## Part 2 — Blocking gates

**Chosen pattern:** a `Gate` interface with a Guardrails-style `on_fail` policy per gate, and a citation gate built as *segment-id bounds check → normalized containment → guarded fuzzy fallback*, replicating Anthropic Citations' architecture — **the model emits a location, the harness does the slicing.**

**Derived from:** Anthropic Citations' location-not-text contract and the "minimal citable unit" rule ([docs](https://platform.claude.com/docs/en/build-with-claude/citations)); Guardrails AI `OnFailAction` (`reask|fix|filter|refrain|noop|exception|fix_reask`, `num_reasks`) ([docs](https://www.guardrailsai.com/docs/concepts/validator_on_fail_actions)); RapidFuzz `partial_ratio_alignment` ([docs](https://rapidfuzz.github.io/RapidFuzz/Usage/fuzz.html)); the transcript-specific pre-narrowing result in [TimeStampEval](https://arxiv.org/html/2511.11594v1).

Note: **there is no exact-quote/verbatim-substring validator in the Guardrails Hub** — everything grounding-related there is embedding-cosine (`ProvenanceEmbeddings`, `threshold=0.8` cosine *distance*, lower is stricter) or LLM-judge (`ProvenanceLLM`, `top_k=3`). We write our own; it is about 60 lines. The one directly reusable idea from the Hub is `ExtractedSummarySentencesMatch`'s documented programmatic fix: **"Remove any sentences that can not be verified."**

**Design.**

```
Gate = { name, check(payload, ctx) -> Pass | Fail(reason, fixable?), on_fail }

GATES = [
  {schema,     on_fail: "reask"},      # -> Part 3, capped at 2
  {citation,   on_fail: "filter"},     # drop the unproven claim, keep the rest
  {coverage,   on_fail: "exception"},  # a hollowed-out document is not a deliverable
  {pii,        on_fail: "fix"},        # redact at render time, after offsets resolve
  {degenerate, on_fail: "exception"},  # repetition-loop transcript
]

def citation_check(claim, transcript):
  # LAYER 0 — the actual gate. An integer bounds check.
  ids = claim.evidence_segment_ids
  if not ids or not set(ids) <= transcript.ids:  return Fail("unknown_segment")
  if not claim.quote:                            return Pass("segment_only")  # still proven

  # LAYER 1 — sub-turn highlighting only. Scoped to cited segments +/- 1 neighbour,
  # NEVER the whole transcript (short quotes get spurious whole-transcript hits).
  src, idxmap = norm(transcript.window(ids, pad=1))
  q, _        = norm(claim.quote)
  if q in src:                                   return Pass("exact", offsets(q, src, idxmap))

  # LAYER 2 — fuzzy, with both guards mandatory
  if len(q) < 40 or tokens(q) < 8:               return Fail("quote_too_short_for_fuzzy")
  m = partial_ratio_alignment(q, src, score_cutoff=90)
  if m is None:                                  return Fail("not_found_in_source")
  span = m.src_end - m.src_start
  if not (0.8 <= span/len(q) <= 1.25):           return Fail("length_ratio_guard")
  return Pass("exact" if m.score >= 95 else "approximate",
              offsets_from(m, idxmap))           # fuzzy still yields highlight offsets

def norm(s) -> (normalized, norm_idx_to_raw_idx):
  # NFKC -> fold typographic variants -> strip Cc -> collapse ws -> casefold
  # NEVER fold digits or number words. Wrong numbers are the expensive failure.
```

**The blocking rule.** `filter` removes the claim and appends it to `rejected.json` with the failure reason — **nothing unproven ever renders**. Then:

- **`reask` at most once, whole-note, and only if >20% of claims failed.** A high failure rate signals a bad *generation*, not bad quotes; rewriting individual quotes wastes calls.
- **`coverage` decides whether the survivor is honest.** If >40% of claims in a section were dropped, or any *required* section (summary, next steps) has zero verified claims, the gate raises and the run exits `GATE_BLOCKED_UNPROVEN_CLAIMS` with no `notes.json`. Partial truth ships; a hollowed-out document does not.
- **Never `noop`** on a customer-facing note.
- **`exception` in CI/eval only**, so a prompt regression fails the build instead of reaching a rep.
- **Surface per-note coverage** (`verified_claims / total_claims`) as a single number on the artifact. That number *is* the demo. The published comparable to benchmark against is 90.12% ([arXiv 2606.00994](https://arxiv.org/pdf/2606.00994)).

**Rationalization table** (the excuses this gate exists to refuse):

| Excuse | Reality |
|---|---|
| "the quote is basically right, just paraphrased" | paraphrase is exactly what the gate catches; a 90 cutoff already absorbs real transcription noise |
| "the model is usually accurate here" | usually is not a gate |
| "let it through and flag it in the UI" | a flag is not a block; unproven claims never render |
| "the follow-up email doesn't need citations" | the email asserts facts about the call; every factual sentence carries claim ids or it is cut |
| "no claims survived, ship the empty doc" | that's `GATE_BLOCKED_UNPROVEN_CLAIMS`, not a deliverable |
| "drop the min-length guard, short quotes are fine" | `partial_ratio` saturates toward 100 for short needles; a 4-word quote matches almost anything |
| "normalize '25' and 'twenty five' so more quotes pass" | that is the gate laundering a wrong figure. Numbers are the expensive failure in call intel |
| "just run HHEM and block on it, it's more rigorous" | 64–77% balanced accuracy blocks more true claims than it catches false ones |
| "search the whole transcript, the model got the segment wrong" | whole-transcript search manufactures matches; a wrong segment id IS the failure |

**Corner cases covered:** paraphrased quote; quote straddling a speaker turn (±1 neighbour window); invented segment id (Layer 0); short quote gaming containment (min-length + length-ratio guards); substring-of-a-substring matches; transcript with repeated identical lines (segment ids disambiguate, which pure string search cannot); post-redaction offset drift (gate runs pre-redaction); rendered `[S17] Agent:` prefixes leaking into a cross-turn quote (normalization + windowing).

---

## Part 3 — Bounded aimed retry

**Chosen pattern:** instructor-style **aimed** repair — the validation error text is appended to the message list so the retry is corrective, not a re-roll — with a Temporal-shaped retry policy and AWS full-jitter backoff for transport errors. Two distinct retry families, never confused.

**Derived from:** instructor's reask handlers, narrow `_RETRYABLE_PARSE_ERRORS`, and `InstructorRetryException` ([retry.py](https://github.com/567-labs/instructor/blob/main/instructor/v2/core/retry.py), [docs](https://python.useinstructor.com/concepts/retrying/)); Vercel AI SDK's structurally-capped single repair ([repair-text.ts](https://github.com/vercel/ai/blob/main/packages/ai/src/generate-object/repair-text.ts)); BAML SAP tolerant parsing ([blog](https://boundaryml.com/blog/schema-aligned-parsing)); Temporal `RetryPolicy` incl. `non_retryable_error_types` ([docs](https://docs.temporal.io/encyclopedia/retry-policies)); AWS full jitter ([blog](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)).

**Design.** Two policies, declared in `capabilities.json`, never hardcoded:

```jsonc
"retry": {
  "transport": {                       // 429/500/503/timeout — blind is fine, aim is impossible
    "maximum_attempts": 4,             // NEVER 0 — Temporal's 0 means unlimited
    "initial_interval_ms": 1000, "backoff_coefficient": 2.0, "maximum_interval_ms": 16000,
    "jitter": "full",                  // sleep = random(0, min(cap, base * 2**attempt))
    "respect_retry_after": true,       // header is a FLOOR: "earlier retries will fail"
    "non_retryable_error_types": ["400","401","403","413","415","AudioLoadFailed"]
  },
  "semantic": {                        // schema / gate failures — must be aimed
    "maximum_attempts": 2,             // after 1 free tolerant-parse
    "backoff_coefficient": 1.0,        // no wait; the model isn't rate limited, it's wrong
    "carry_reason": true
  }
}
```

```
def call_with_repair(spec, ctx):
  raw, meta = provider.call(spec)                 # constrained decoding on if supports_response_schema
  if meta.finish_reason == "length":              # TRUNCATION IS NOT A SCHEMA FAILURE
      raise Truncated(spec)                       # reasking with same params fails identically
  obj = tolerant_parse(raw)                       # BAML/SAP-style: fences, trailing commas — FREE
  attempts = [Attempt(1, None, raw)]
  for n in 2 .. policy.semantic.maximum_attempts + 1:
    verdict = run_gates(obj, ctx)
    if verdict.ok: return obj
    if not verdict.fixable: break                 # narrow retryable set; anything else fails now
    ctx.budget.charge_or_raise(estimate(spec))    # a repair is a purchase; the governor votes
    spec.messages += [
      assistant(raw),                             # echo the bad output back — it must SEE it
      user(REPAIR_PROMPT.format(
            errors = str(verdict.errors),         # LITERAL validator/gate text, field paths intact
            offending = verdict.offending_paths,  # e.g. objections[2].quote
            rule = "quotes must appear verbatim in the cited segments"))
    ]
    raw, meta = provider.call(spec); obj = tolerant_parse(raw)
    attempts.append(Attempt(n, verdict.errors, raw))
  raise ExtractorFailed(spec.name, n_attempts=len(attempts),
                        failed_attempts=attempts, last_completion=raw)
```

**Only two things get retried, and they are retried differently.** The `transport` policy is blind (you cannot aim at a 503) and waits with jitter; the `semantic` policy is aimed (the error text is the aim) and does not wait, because the model is not rate-limited, it is wrong. Conflating them produces the two classic bugs: sleeping 8 seconds before re-asking a schema question, and re-asking a 429.

**Non-retryable is enumerated, not inferred.** `400/401/403/413/415/AudioLoadFailed` never retry. Anything outside `_RETRYABLE_PARSE_ERRORS`-equivalent (JSON parse error, schema validation error, gate failure) never reasks. Truncation gets its own branch entirely.

**Why the cap is 2.** Two arguments, and the second is the important one. (a) A model shown its own error twice and still failing is in a stable wrong basin; every further attempt is full price for the same wrong answer. (b) **The dangerous outcome is not exhaustion — it is passing on attempt 3 with output that satisfies the schema but is subtly wrong.** More retries increase exposure to silent corruption. On exhaustion the harness **degrades, it does not die**: the extractor is marked failed, `failed_attempts` is preserved in the run record (instructor's shape), and the run continues toward `PARTIAL_EXTRACTORS_FAILED`. A repair is also refused outright if the governor projects it would breach the budget, which converts a retry into `BUDGET_EXCEEDED` rather than an overspend.

**Corner cases covered:** malformed JSON; missing required field; hallucinated quote (the repair prompt names the exact claim and the rule); truncation on a long call (own branch, no wasted retry); STT 429 storms (full jitter + `Retry-After` floor); 415/413 never retried; every retry is idempotency-keyed so a resumed run does not re-pay for STT.

---

## Part 4 — Failure invariant

**Chosen pattern:** write-ahead run record + guaranteed terminal write + heartbeat sweeper + universal abort signals. "Every job leaves a record" is enforced structurally, not by discipline.

**Derived from:** dbt `run_results.json` field names ([docs](https://docs.getdbt.com/reference/artifacts/run-results-json)); OTel GenAI attributes ([spec](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md)); Temporal's terminal-status model; `write-file-atomic` ([repo](https://github.com/npm/write-file-atomic)).

**Design — four guarantees, each with its mechanism:**

1. **A record exists before any money is spent.** `openRun()` writes `run.json` with `status: RUNNING`, the idempotency key, and the *planned* budget, then `fsync`s — all *before* preflight. If the process dies one millisecond later there is still a record naming the input. **The absence of a terminal status is itself the record**, read as "crashed mid-run", never as "no record".
2. **A terminal record is always written.** `closeRun()` runs in `finally`, and is also wired to `SIGINT`, `SIGTERM`, `uncaughtExceptionMonitor`, `unhandledRejection`. It is idempotent and refuses to overwrite an already-set `exit_reason`. **Two Node footguns handled explicitly** ([process docs](https://nodejs.org/api/process.html#signal-events)): installing a SIGINT/SIGTERM listener removes Node's default handler, so our handler must call `process.exit(130/143)` itself or the CLI hangs; and `process.on('exit')` is synchronous-only, so the last-resort write is `fs.writeFileSync`, never a promise.
3. **No silent hangs.** Every network call takes `AbortSignal.any([AbortSignal.timeout(per_call_ms), ctx.deadlineSignal, ctx.cancelSignal])` — three composed deadlines, per-request inside per-stage inside per-job, the shape promptfoo splits into `PROMPTFOO_EVAL_TIMEOUT_MS` vs `PROMPTFOO_MAX_EVAL_TIME_MS`. A call with no signal is a lint error in this codebase. Classification is free: `TimeoutError` → `DEADLINE_EXCEEDED`, `AbortError` → `CANCELED`. STT polling carries its own max-poll-duration, so a pyannoteAI job that never leaves `running` exits `DEADLINE_EXCEEDED`, not a spinner.
4. **SIGKILL and power loss are covered.** Nothing in-process survives `kill -9`, so `heartbeat_at` is stamped every 10s and a `runs/` sweeper (run at CLI start and by the UI) rewrites any record that is `RUNNING` with a heartbeat older than 5 minutes to `status: COMPLETED, exit_reason: CRASHED`, naming the last in-flight stage. **There is no state in which a run is permanently "in progress".**

**No surprise bills** is part of this invariant, not only of Part 7: every provider call is journalled to `stages[]` with `gen_ai.usage.*` *as it returns*, so the record reflects money already spent even if the process dies before finishing. A crashed run still tells you what it cost.

**Corner cases covered:** SIGKILL/OOM/laptop lid; STT job that never completes; hung fetch; process killed mid-fan-out (each settled extractor already journalled); duplicate submission (same idempotency key resumes rather than re-pays).

---

## Part 5 — Capability registry

**Chosen pattern:** a single `capabilities.json` with **role-based** model selection plus per-model capability and price metadata, so the code says `registry.for("extract.objections")` and never names a model.

**Derived from:** Continue `models[].roles` ([docs](https://docs.continue.dev/customize/model-roles)); aider's main/weak/editor model split ([docs](https://aider.chat/docs/config/adv-model-settings.html)); LiteLLM `model_list` + `fallbacks` ([docs](https://docs.litellm.ai/docs/routing)) and `model_prices_and_context_window.json` for capability metadata ([file](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)); promptfoo provider id strings ([docs](https://www.promptfoo.dev/docs/providers/)).

```jsonc
{
  "schema_version": "1",
  "providers": {
    "anthropic": { "env": "ANTHROPIC_API_KEY", "base_url": null },
    "pyannoteai": { "env": "PYANNOTEAI_API_KEY",
                    "limits": {"max_bytes": 1073741824, "max_duration_s": 86400,
                               "req_per_min": 80, "result_ttl_h": 24},
                    "formats": ["mp3","wav","m4a","ogg","flac"] }
  },
  // field names copied verbatim from LiteLLM model_prices_and_context_window.json
  // so this file can be seeded from / diffed against it
  "models": [
    { "id": "extract-strong", "provider": "anthropic", "model": "claude-sonnet-...",
      "mode": "chat",
      "roles": ["extract.summary","extract.objections","extract.intent","extract.next_steps"],
      "supports_response_schema": true, "supports_function_calling": true,
      "max_input_tokens": 200000, "max_output_tokens": 8192,
      "input_cost_per_token": 0.000003, "output_cost_per_token": 0.000015,
      "params": {"temperature": 0, "max_tokens": 4096} },
    { "id": "extract-long", "provider": "anthropic", "model": "claude-...-1m",
      "roles": [], "max_input_tokens": 1000000 },      // context-window fallback only
    { "id": "draft", "provider": "anthropic", "model": "claude-...",
      "roles": ["draft.email"], "params": {"temperature": 0.4} },
    { "id": "repair-cheap", "provider": "anthropic", "model": "claude-haiku-...",
      "roles": ["repair","classify.language"], "params": {"temperature": 0} }
  ],
  // fallbacks are TYPED BY FAILURE CLASS (LiteLLM). One flat list conflates
  // three different remedies: bigger model / different model / any peer.
  "roles": {
    "extract.objections": { "model": "extract-strong",
                            "fallbacks": ["repair-cheap"],
                            "context_window_fallbacks": ["extract-long"],
                            "content_policy_fallbacks": [],
                            "budget_share": 0.15, "timeout_ms": 90000, "optional": false },
    "draft.email":        { "model": "draft", "fallbacks": [],
                            "budget_share": 0.10, "optional": true }
  },
  "stt": { "primary": "pyannoteai", "fallbacks": [], "chunk_minutes": 25, "diarize": true },
  "retry": { /* Part 3 */ },
  "budget": { "limit_usd": 2.0, "limit_tokens": 400000, "deadline_ms": 900000 },
  "gates": { "citation": { "fuzzy_cutoff": 90, "exact_label_cutoff": 95,
                           "min_quote_chars": 40, "min_quote_tokens": 8,
                           "length_ratio": [0.8, 1.25], "neighbour_pad": 1,
                           "on_fail": "filter" },
             "coverage": { "max_dropped_ratio": 0.4, "reask_if_failed_over": 0.2,
                           "required_sections": ["summary","next_steps"] } }
}
```

Rules: the registry is **validated against a JSON Schema at startup**; a bad registry exits `CONFIG_INVALID` (code 64) before any spend. `supports_response_schema` decides whether Part 1's structured-output path uses constrained decoding or falls back to tolerant-parse + repair. `input_cost_per_token` is what lets Part 7 price a call *before* making it. Adding a new extractor is a new role entry plus a prompt file — no code change. Swapping the STT vendor is one `stt.primary` edit.

**Corner cases covered:** vendor swap if "PyAI" is not pyannoteAI; per-provider limits (1 GiB / 24 h) enforced at preflight from config, not from a magic number in code; models that don't support schemas; a demo-day outage handled by `fallbacks`.

---

## Part 6 — Safe parallelism

**Chosen pattern:** `p-limit` fan-out over `Promise.allSettled`, with **all writes funnelled through a single-writer queue** and atomic temp-then-rename, and every unit keyed for idempotency.

**Derived from:** [p-limit](https://github.com/sindresorhus/p-limit) / [p-queue](https://github.com/sindresorhus/p-queue); [MDN `Promise.allSettled`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled); [write-file-atomic](https://github.com/npm/write-file-atomic); [Stripe idempotency keys](https://docs.stripe.com/api/idempotent_requests); AWS full jitter.

```
limit  = pLimit(config.concurrency)          # default 4, below the 80 req/min floor
writer = new PQueue({concurrency: 1})        # the ONLY thing that touches run.json

results = await Promise.allSettled(
  roles.map(role => limit(async () => {
    const key = sha256(role + model + promptHash + transcriptHash)
    if (cache.has(key)) return cache.get(key)          # retries are free
    ctx.budget.reserve(role)                           # reserve BEFORE firing (see Part 7)
    const r = await callWithRepair(role, ctx)          # Part 3
    cache.set(key, r)
    await writer.add(() => journalStage(role, r))      # serialized, atomic
    return r
  }))
)

ok     = results.filter(r => r.status === 'fulfilled')
failed = results.filter(r => r.status === 'rejected')
# ok.length == roles.length  -> continue to gates
# 0 < ok.length < roles.length -> PARTIAL_EXTRACTORS_FAILED (still gate + ship what passed)
# ok.length == 0 -> FAILED
```

`journalStage` writes `run.json.tmp` (same directory — `rename(2)` is only atomic within a filesystem) then `fs.rename`, the technique `write-file-atomic` packages. The single-writer queue and the atomic write solve **two different problems**: the queue prevents the *lost update* (two workers read-modify-write and one record silently vanishes — nothing looks corrupt, the data is just gone), the rename prevents the *torn file*. Neither substitutes for the other.

**Cache rules, enforced:** errors are never cached (a cached 429 is a permanent poisoned result); the key includes every param including temperature and the response schema; and the same key with different params is an **error, not a silent replay** (Stripe's rule).

**Ordering constraint:** extraction fans out (independent), but **the email draft is serialized after** the extractors, because it consumes their verified claims. The DAG is `preflight → stt → [5 extractors in parallel] → citation gate → email draft → gate → render`.

**Corner cases covered:** corrupt `run.json` from concurrent writes; 429 storms from simultaneous fan-out (concurrency cap + jitter); one extractor failing without killing the other four; a resumed run not re-paying for cached calls; duplicate uploads of the same audio.

---

## Part 7 — Budget governor

**Chosen pattern:** a per-job three-axis governor (USD / tokens / wall-clock) that is **consulted before each call, not audited after**, using registry prices to project cost, with a documented degrade ladder before it stops.

**Derived from:** LiteLLM `max_budget` + `BudgetExceededError` ([docs](https://docs.litellm.ai/docs/proxy/users)); promptfoo's `cost` assertion as a first-class threshold ([docs](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/)); LangGraph `recursion_limit` → typed `GraphRecursionError` ([docs](https://langchain-ai.github.io/langgraph/troubleshooting/errors/GRAPH_RECURSION_LIMIT/)); LiteLLM price table for pre-call pricing ([file](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)).

```
class Governor:
  limits = {usd, tokens, deadline_ms}
  spent  = {usd, tokens};  reserved = {usd, tokens};  started_at

  def project(role, prompt):
    m = registry.model_for(role)
    in_tok  = count_tokens(prompt)                      # tiktoken / count_tokens endpoint
    out_tok = m.params.max_tokens
    return in_tok*m.input_cost_per_token + out_tok*m.output_cost_per_token

  def reserve(role, prompt):
    cost = project(role, prompt)
    if now() - started_at > limits.deadline_ms:  raise DeadlineExceeded(role)
    if spent.usd + reserved.usd + cost > limits.usd:
        if (alt := registry.cheaper_fallback(role)) and affordable(alt):
            log_decision("DEGRADE", role, alt); return alt        # ladder rung 1
        if role.optional:
            log_decision("SKIP", role);        raise SkipRole(role) # ladder rung 2
        raise BudgetExceeded(role, projected=cost)                 # rung 3: stop
    reserved.usd += cost
    return registry.model_for(role)

  def settle(role, usage):   # OTel field names straight from the response
    spent.usd += price(usage); spent.tokens += usage.input + usage.output
    release_reservation(role)
```

**Pre-flight gate is where the real money is.** Before a single API call, preflight computes `duration_s` from `ffprobe` and prices the STT job. A 3-hour recording that would blow the cap exits `BUDGET_EXCEEDED` **having spent nothing**, and tells the user the number. This is the only design that honours "no surprise bills" — post-hoc accounting cannot.

Output tokens cannot be counted in advance, so the projection uses **our own `max_tokens` as the worst case** — which is what makes the ceiling provable rather than hopeful. Both the estimate and the actual are recorded, so drift is visible in the run record. Input counting is free: Anthropic's `count_tokens` costs nothing and has rate limits separate from inference, so pre-checking never eats quota.

**Degrade ladder** (each rung logged to `budget.decisions[]` with the projection that caused it):
1. **Downgrade the model** for the role via `fallbacks`.
2. **Skip optional roles** (email draft first, then intent) and mark `PARTIAL_EXTRACTORS_FAILED`.
3. **Stop** with `BUDGET_EXCEEDED`, keeping every artifact produced so far.

This is the `early_stopping_method: "force"` posture from LangChain and the `error_handlers={"max_turns": ...}` hook from the OpenAI Agents SDK: budget exhaustion produces a **usable partial**, not only an exception.

**Deadline is a peer of money, not an afterthought.** `deadline_ms` produces one `AbortSignal` shared by every call in the run; the governor also refuses to *start* a call it projects cannot finish before the deadline, which stops the classic "fire a 90s call with 10s left" waste. `TimeoutError` vs `AbortError` classifies the exit for free. Exiting on time is `DEADLINE_EXCEEDED` — its own exit class, because a deadline is a decision, not a bug. And since the hackathon itself has a deadline, `DEADLINE_EXCEEDED` shipping partial cited notes is a **demonstrably better demo** than a hang.

**Corner cases covered:** 3-hour audio file priced before upload; runaway repair loops (each repair is a purchase the governor must approve); demo-day latency spike; token limits on a 90-minute transcript exceeding the model context window (caught at `project()` when `in_tok > max_input_tokens`, triggering map-reduce chunking rather than a 400).

---

# Section C — Corner cases the harness must handle

Grouped by where they are caught. Every row lands on a named exit.

## C1. Input and file layer (caught in preflight, before any spend)

| # | Corner case | Detection | Handling | Exit if fatal |
|---|---|---|---|---|
| 1 | **File > 1 hr** (up to pyannoteAI's 24 h ceiling) | `ffprobe` `duration_s` | price it against the budget; chunk STT at 25 min on silence boundaries (AssemblyAI: 30 min max, sentence boundaries) | `BUDGET_EXCEEDED` if unaffordable |
| 2 | **File exceeds vendor limits** (>1 GiB or >24 h) | probe vs. `providers.pyannoteai.limits` from the registry | reject with the specific number, suggest re-encode | `INPUT_INVALID_AUDIO` |
| 3 | **Corrupted / truncated file** | `ffprobe` non-zero exit, missing audio stream, or duration mismatch vs. container | never uploaded | `INPUT_INVALID_AUDIO` |
| 4 | **Wrong file type** (video, PDF renamed to .mp3, zero-byte) | magic-byte sniff + `ffprobe` codec vs. registry `formats` | if it is a container with an audio stream, offer to extract; else reject. Never retried (415 class) | `INPUT_UNSUPPORTED_TYPE` |
| 5 | **Silent or near-silent audio** | `ffmpeg -af silencedetect`; `speech_ratio = 1 - silence/duration`; reject below 0.05 | **zero STT spend** — this is the highest-value preflight check | `INPUT_NO_SPEECH` |
| 6 | **Music-only / non-speech** | low speech_ratio is a weak signal here; caught post-STT by the degenerate-output detector (repetition loops, near-zero unique tokens, no diarized turns) | discard transcript, do not run extractors | `INPUT_NO_SPEECH` |
| 7 | **Audio URL not publicly reachable** (pyannoteAI's most common error) | vendor returns "Could not load audio" | classified **non-retryable**; it is a config error, not a network error | `STT_FAILED` |
| 8 | **Duplicate upload of the same call** | `sha256(audio)` idempotency key | resume/return the existing run instead of re-paying | — (returns prior outcome) |

## C2. STT layer

| # | Corner case | Detection | Handling | Exit if fatal |
|---|---|---|---|---|
| 9 | **Rate limits (429)** | HTTP 429 + `Retry-After` | transport retry policy: honour `Retry-After`, else full jitter 1→2→4→8s, max 4 attempts; global concurrency cap keeps us under 80 req/min | `STT_RATE_LIMITED` |
| 10 | **Partial transcription** (some chunks succeed) | per-chunk status; `coverage = ok_chunks/total` | proceed on partial transcript **with the gaps recorded**; every extractor prompt is told which time ranges are missing so it does not assert over them | `PARTIAL_TRANSCRIPT` |
| 11 | **STT job never completes** | poll deadline exceeded | abort the poll, do not spin | `DEADLINE_EXCEEDED` |
| 12 | **Whisper repetition-loop hallucination** | degenerate detector: any n-gram repeated >N times, or unique-token ratio below threshold, on a segment | drop the segment, mark the span as unusable; if >50% of the transcript is degenerate, treat as no-speech | `INPUT_NO_SPEECH` |
| 13 | **Single-speaker audio** (voicemail, monologue, one-sided recording) | diarization returns 1 speaker | **not an error.** Objections/next-steps extractors are told there is no counterparty; sections legitimately come back empty. An empty objections list with zero claims is a valid result, not a failed extractor | — |
| 14 | **Heavy crosstalk / overlap** | pyannoteAI attributes overlapping speech, but turn boundaries get noisy; detect via high overlap ratio | lower confidence badge on the run; **widen the citation gate's neighbour window** (crosstalk splits quotes across turns) rather than loosening the fuzzy threshold | — |
| 15 | **Non-English / Hinglish code-switching** | language field from STT + a cheap classify pass | expect ~42% WER degradation; surface a "low transcript confidence" banner; **keep the citation gate at exact-match** — the quote must match the *transcript* verbatim, which is still true even if the transcript mis-hears the audio. Notes are in English; quotes stay in the original language, never translated (translation would break verbatim matching) | — |
| 16 | **Results TTL** (pyannoteAI deletes job results after 24 h) | job age | fetch and persist the transcript locally immediately on completion; never re-fetch later | — |

## C3. Extraction and gate layer

| # | Corner case | Handling |
|---|---|---|
| 17 | **Transcript exceeds model context window** | governor catches `in_tok > max_input_tokens` at `project()`; map-reduce: extract per chunk, then merge, with segment ids preserved through the merge so citations survive |
| 18 | **Malformed JSON from an extractor** | constrained decoding first; then tolerant parse; then 2 aimed repairs; then that extractor fails → `PARTIAL_EXTRACTORS_FAILED` |
| 19 | **Hallucinated quote** | citation gate `filter`; the claim goes to `rejected.json` |
| 20 | **Quote real but paraphrased** | fails 90-cutoff `partial_ratio` → filtered. This is the case the gate exists for |
| 21 | **Quote spans two speaker turns** | containment runs against a ±1-segment window, so cross-turn quotes match; the rendered `[S17] Agent:` prefix is stripped by normalization |
| 21a | **Wanting both Anthropic Citations and structured outputs** | **not possible — enabling both returns 400.** We take structured outputs and rebuild the citation contract with segment IDs. Decided once, up front, not discovered at hour 20 |
| 22 | **Two identical sentences in the transcript** | segment ids disambiguate; pure substring search would attribute to the wrong moment |
| 23 | **Model returns a valid quote but an unrelated claim** | not caught by v1 (string gate can't judge entailment). Mitigated by quote-then-claim generation order; logged as the known v2 NLI upgrade. **Stated honestly rather than papered over** |
| 24 | **All claims in a required section dropped** | `coverage` gate raises → `GATE_BLOCKED_UNPROVEN_CLAIMS`, no notes written |
| 25 | **Genuinely empty result** (no objections on a happy call) | zero claims is valid; distinguished from "all claims dropped" by `checked == 0` vs `failed == checked` |
| 26 | **Follow-up email asserts uncited facts** | the email is generated *from verified claims only*, and every factual sentence carries claim ids; sentences without ids are cut before render |
| 27 | **PII in the transcript** | redaction runs at **render** time, after offsets resolve, on both transcript and quotes; `--redact` flag; entity types from the registry |
| 28 | **Repair loop turns expensive** | each repair is priced and approved by the governor; refused repairs become `BUDGET_EXCEEDED`, not a silent overspend |
| 28a | **Response truncated at `max_tokens` mid-object** | `finish_reason: "length"` gets its own branch — **not** a schema failure. Reasking with identical params fails identically. Raise the limit once or split the extraction; never burn a repair on it |
| 28b | **Provider silently downgraded the schema** | Anthropic SDK helpers strip unsupported constraints and validate client-side; so client-side constraint failures are expected and route to the normal repair path rather than being treated as impossible |

## C4. Process and run layer

| # | Corner case | Handling |
|---|---|---|
| 29 | **SIGINT / SIGTERM** | handler stamps `CANCELED`, flushes the record |
| 30 | **SIGKILL / OOM / power loss** | heartbeat sweeper rewrites stale `RUNNING` → `CRASHED`, naming the in-flight stage |
| 31 | **Concurrent writes to `run.json`** | single-writer queue + temp-then-rename |
| 32 | **Bad `capabilities.json`** | schema-validated at startup → `CONFIG_INVALID` (64) before any spend |
| 33 | **Missing API key** | same startup validation; `CONFIG_INVALID`, never a mid-run 401 |
| 33a | **Cache poisoning by a cached error** | errors are never cached; only successful outcomes are. A transient 429 must not become a permanent result |
| 33b | **Same idempotency key, different params** | hard error, never a silent replay (Stripe's rule) — otherwise a prompt edit silently serves stale output |
| 34 | **Provider outage on demo day** | registry `fallbacks` per role (typed by failure class); if none, the extractor fails and the run degrades to PARTIAL rather than dying. Every attempt is journalled with the model that actually served it, AI-Gateway `modelAttempts` style, so a fallback chain is debuggable after the fact |
| 34a | **Signal handler causes the hang it was meant to prevent** | installing a SIGINT listener removes Node's default handler; ours calls `process.exit(130)` explicitly, and the last-resort write is `writeFileSync` because `process.on('exit')` is synchronous-only |
| 35 | **Hackathon clock** | `deadline_ms` is a real budget axis; `DEADLINE_EXCEEDED` ships partial cited notes, which demos better than a hang |

---

# Section D — Build order for 33 hours

**One structural decision to make in hour 0, before any code:** Anthropic Citations and structured outputs are mutually exclusive (400 on both). We take **structured outputs + our own segment-ID contract**, harness-side bounds check, `partial_ratio_alignment` for highlight offsets. Same unhallucinatable-quote guarantee, JSON preserved, ~80 lines. Discovering this at hour 20 would cost the build.

The harness is scored, so it gets built first and the features hang off it.

1. **h0–h2** — `capabilities.json` + schema validation + `run.json` write-ahead/close (Parts 1, 4, 5). Nothing else works without the record.
2. **h2–h4** — governor + preflight (`ffprobe`/`silencedetect`) pricing (Part 7). This is also the highest-value corner-case coverage per hour.
3. **h4–h7** — STT stage with chunking, transport retry, idempotency cache (Parts 3, 6).
4. **h7–h11** — extractor fan-out with `p-limit`/`allSettled`, structured outputs, tolerant parse, aimed repair (Parts 3, 6).
5. **h11–h15** — citation gate + coverage gate + `rejected.json` (Part 2). **The demo centrepiece.**
6. **h15+** — email drafting, render, UI.

**Demo the harness, not the happy path.** Three runs side by side: a clean call → `SHIPPED`; a silent file → `INPUT_NO_SPEECH` with zero spend; a call run with a deliberately loosened prompt → `PARTIAL_CLAIMS_DROPPED` with `rejected.json` open on screen showing exactly which sentences were refused and why. That third run is the whole pitch.
