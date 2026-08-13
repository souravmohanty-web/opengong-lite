import { loadKey, saveKey, isSandboxKey } from './keystore.js';

const BASE = process.env.PYAI_BASE_URL ?? 'https://api.pyai.com/v1';
const DEFAULT_BUDGET_MS = 30_000;

// Named exits (L13/L14): callers switch on .name, never parse messages.
export class PyAiError extends Error {
  constructor(name, message, problem) {
    super(message);
    this.name = name;
    this.problem = problem; // RFC-7807 body incl. request_id, when present
  }
}

async function problemFrom(res) {
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, ...body };
}

// 429s are ambiguous: a short Retry-After is transient throttling; absent or
// long means the sandbox daily cap — retrying that would spin until midnight.
// Retry-After may be delta-seconds OR an HTTP-date (RFC 9110).
export function classify429(retryAfter) {
  let seconds = Number(retryAfter);
  if (!Number.isFinite(seconds) && typeof retryAfter === 'string') {
    const when = Date.parse(retryAfter);
    if (!Number.isNaN(when)) seconds = Math.ceil((when - Date.now()) / 1000);
  }
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) {
    return { action: 'daily_cap' };
  }
  return { action: 'retry', waitMs: seconds * 1000 + Math.floor(Math.random() * 250) };
}

// A backoff sleep that a caller's AbortSignal can cut short (audit #8) —
// SIGINT must not wait out a 60s Retry-After.
export function interruptibleSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new PyAiError('PYAI_ABORTED', 'aborted before backoff'));
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new PyAiError('PYAI_ABORTED', 'aborted during backoff')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    function cleanup() { signal?.removeEventListener('abort', onAbort); }
  });
}

function attemptSignal(signal, remainingMs) {
  const timeout = AbortSignal.timeout(remainingMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function mintSandboxKey() {
  let res;
  try {
    res = await fetch(`${BASE}/sandbox/keys`, { method: 'POST', signal: attemptSignal(undefined, DEFAULT_BUDGET_MS) });
  } catch (err) {
    throw namedNetworkError(err, '/sandbox/keys');
  }
  if (!res.ok) {
    throw new PyAiError('PYAI_MINT_FAILED', `key mint failed (${res.status})`, await problemFrom(res));
  }
  const data = await res.json();
  const record = {
    key: data.key ?? data.api_key,
    minted_at: new Date().toISOString(),
    expires_at: data.expires_at ?? null,
    scopes: data.scopes ?? null,
  };
  saveKey(record);
  return record;
}

export async function ensureKey() {
  return loadKey() ?? { ...(await mintSandboxKey()), source: 'minted' };
}

function namedNetworkError(err, path) {
  if (err instanceof PyAiError) return err;
  if (err.name === 'TimeoutError') return new PyAiError('PYAI_TIMEOUT', `${path} timed out`);
  if (err.name === 'AbortError') return new PyAiError('PYAI_ABORTED', `${path} aborted by caller`);
  return err;
}

// Authed fetch with a TOTAL-elapsed budget (audit #8: per-attempt timeouts that
// re-arm across retries let one call run for minutes). On 401 with a
// pyai_test_* key, re-mint once and retry (L14). 429 retries wait only if the
// wait fits inside the remaining budget.
export async function pyaiFetch(path, options = {}, { remint = true } = {}) {
  const budgetMs = options.timeoutMs ?? DEFAULT_BUDGET_MS;
  const deadline = Date.now() + budgetMs;
  let remintsLeft = remint ? 1 : 0;
  let retries429 = 2;

  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new PyAiError('PYAI_TIMEOUT', `${path} exceeded ${budgetMs}ms budget`);
    }
    const { key } = await ensureKey();
    const headers = { ...options.headers, Authorization: `Bearer ${key}` };
    let res;
    try {
      res = await fetch(`${BASE}${path}`, { ...options, headers, signal: attemptSignal(options.signal, remaining) });
    } catch (err) {
      throw namedNetworkError(err, path);
    }

    if (res.status === 401 && remintsLeft > 0 && isSandboxKey(key) && !process.env.PYAI_API_KEY) {
      remintsLeft -= 1;
      await mintSandboxKey();
      continue;
    }
    if (res.status === 401) {
      throw new PyAiError('PYAI_AUTH_FAILED', 'PyAI key rejected (set PYAI_API_KEY or delete sandbox.pyai_key to re-mint)', await problemFrom(res));
    }
    if (res.status === 429) {
      const verdict = classify429(res.headers.get('retry-after'));
      if (verdict.action === 'retry' && retries429 > 0 && verdict.waitMs < deadline - Date.now()) {
        retries429 -= 1;
        await interruptibleSleep(verdict.waitMs, options.signal);
        continue;
      }
      throw new PyAiError('PYAI_DAILY_CAP', 'PyAI sandbox daily cap reached — resets daily; cached fixtures still work offline', await problemFrom(res));
    }
    if (!res.ok) {
      const problem = await problemFrom(res);
      throw new PyAiError('PYAI_REQUEST_FAILED', `${path} → ${res.status}${problem.request_id ? ` (request_id ${problem.request_id})` : ''}`, problem);
    }
    return res;
  }
}

export function maskKey(key) {
  return key ? `${key.slice(0, 10)}…${key.slice(-4)}` : '(none)';
}
