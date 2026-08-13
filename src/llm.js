// Raw-fetch Anthropic /v1/messages client (technical-spec-core.md §model-calls).
// Mirrors src/pyai.js's shape (named-exit errors, injectable fetch, AbortSignal
// composition, signal-aware backoff sleeps) but is its own module: extraction
// spend is a different budget axis from transcription spend, and a bug in one
// vendor's client must never be able to take the other down with it.
//
// Hard rules from the spec, enforced here and NOWHERE ELSE:
//   - NEVER send temperature/top_p/top_k — Sonnet 5 400s on any of them.
//   - `thinking` is always set EXPLICITLY (omitted = adaptive = silently eats
//     max_tokens headroom).
//   - Structured output goes through `output_config.format` (json_schema);
//     this is incompatible with Anthropic Citations (400) — the citation
//     contract is rebuilt ourselves in src/gate.js instead.

const BASE = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
export const DEFAULT_MAX_TOKENS = 8000; // spec: "8000 headroom"

// Sonnet 5 intro pricing ($2/$10 per M tok — token-optimization.md §Numbers).
// Cache write = 1.25x input (finding #3); cache read = 0.1x input (finding #4).
export const PRICE_PER_TOKEN = {
  input: 2 / 1_000_000,
  output: 10 / 1_000_000,
  cache_write: (2 / 1_000_000) * 1.25,
  cache_read: (2 / 1_000_000) * 0.1,
};

export class LlmError extends Error {
  constructor(name, message, extra = {}) {
    super(message);
    this.name = name;
    Object.assign(this, extra);
  }
}

const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 413]);
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const TRANSPORT_MAX_ATTEMPTS = 4; // spec: "transport retry (4, full jitter, Retry-After floor)"

function normalizeUsage(u = {}) {
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  };
}

// Anthropic reports input_tokens/cache_creation_input_tokens/cache_read_input_tokens
// as three DISJOINT buckets of the same request (not overlapping) — see the usage
// object in the /v1/messages response. Cost is the sum of all four buckets.
export function costUsd(usage) {
  const u = normalizeUsage(usage);
  return u.input_tokens * PRICE_PER_TOKEN.input
    + u.cache_creation_input_tokens * PRICE_PER_TOKEN.cache_write
    + u.cache_read_input_tokens * PRICE_PER_TOKEN.cache_read
    + u.output_tokens * PRICE_PER_TOKEN.output;
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

// AWS full-jitter: sleep = random(0, min(cap, base * 2**attempt)).
function fullJitterMs(attempt, baseMs, capMs) {
  const cap = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * cap);
}

// Retry-After is a FLOOR ("earlier retries will fail"), not a target: jitter
// only ever pushes the wait UP from it, never below.
function retryAfterMs(res) {
  const header = res.headers?.get?.('retry-after');
  if (!header) return 0;
  let seconds = Number(header);
  if (!Number.isFinite(seconds)) {
    const when = Date.parse(header);
    seconds = Number.isNaN(when) ? 0 : Math.max(0, (when - Date.now()) / 1000);
  }
  return Math.max(0, seconds * 1000);
}

// Signal-aware sleep — a caller's AbortSignal must be able to cut a backoff
// short (mirrors pyai.js's interruptibleSleep) rather than spinning out a
// multi-second wait after the run has already been cancelled.
function sleepSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (ms <= 0) return resolve();
    if (signal?.aborted) return reject(new LlmError('ANTHROPIC_ABORTED', 'aborted before backoff'));
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(new LlmError('ANTHROPIC_ABORTED', 'aborted during backoff')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    function cleanup() { signal?.removeEventListener('abort', onAbort); }
  });
}

function composeSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

// callMessages — one /v1/messages call incl. its own transport retry loop.
// `system` is prompt.js's `blocks` array (blockA discipline+glossary, blockB
// transcript w/ cache_control) passed straight through, untouched.
export async function callMessages({
  model,
  system,
  messages,
  schema,
  schemaName = 'extraction_output',
  maxTokens = DEFAULT_MAX_TOKENS,
  apiKey = process.env.ANTHROPIC_API_KEY,
  fetchImpl = fetch,
  signal,
  timeoutMs = 60_000,
  retryBaseMs = 1000,
  retryCapMs = 16_000,
} = {}) {
  if (!apiKey) {
    throw new LlmError('ANTHROPIC_KEY_MISSING', 'ANTHROPIC_API_KEY is not set (required for --live extraction)');
  }

  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
    thinking: { type: 'disabled' }, // explicit — never omitted (spec: adaptive silently eats max_tokens)
    output_config: { format: { type: 'json_schema', schema, name: schemaName } },
    // NEVER temperature / top_p / top_k here — Sonnet 5 400s on any of them.
  };

  let attempt = 0;
  while (true) {
    attempt += 1;
    let res;
    try {
      res = await fetchImpl(`${BASE}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: composeSignal(signal, timeoutMs),
      });
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if (err?.name === 'TimeoutError') throw new LlmError('ANTHROPIC_TIMEOUT', `messages call timed out after ${timeoutMs}ms`);
      if (err?.name === 'AbortError') throw new LlmError('ANTHROPIC_ABORTED', 'messages call aborted by caller');
      if (attempt < TRANSPORT_MAX_ATTEMPTS) {
        await sleepSignal(fullJitterMs(attempt, retryBaseMs, retryCapMs), signal);
        continue;
      }
      throw new LlmError('ANTHROPIC_REQUEST_FAILED', `network error after ${attempt} attempts: ${err.message}`);
    }

    if (!res.ok) {
      const status = res.status;
      if (NON_RETRYABLE_STATUS.has(status)) {
        const problem = await safeJson(res);
        const name = status === 401 || status === 403 ? 'ANTHROPIC_AUTH_FAILED'
          : status === 413 ? 'ANTHROPIC_PAYLOAD_TOO_LARGE'
          : 'ANTHROPIC_BAD_REQUEST';
        throw new LlmError(name, `messages → ${status}`, { problem });
      }
      if (attempt < TRANSPORT_MAX_ATTEMPTS && RETRYABLE_STATUS.has(status)) {
        const wait = Math.max(retryAfterMs(res), fullJitterMs(attempt, retryBaseMs, retryCapMs));
        await sleepSignal(wait, signal);
        continue;
      }
      const problem = await safeJson(res);
      throw new LlmError('ANTHROPIC_REQUEST_FAILED', `messages → ${status} after ${attempt} attempts`, { problem });
    }

    const data = await res.json();
    const textBlock = (data.content ?? []).find((b) => b.type === 'text');
    return {
      text: textBlock?.text ?? '',
      stop_reason: data.stop_reason ?? null,
      usage: normalizeUsage(data.usage),
      model: data.model ?? model,
      raw: data,
    };
  }
}
