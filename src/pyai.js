import { loadKey, saveKey, isSandboxKey } from './keystore.js';

const BASE = process.env.PYAI_BASE_URL ?? 'https://api.pyai.com/v1';

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

const FETCH_TIMEOUT_MS = 30_000;

// 429s are ambiguous: a short Retry-After is transient throttling; absent or
// long means the sandbox daily cap — retrying that would spin until midnight.
export function classify429(retryAfter) {
  const seconds = Number(retryAfter);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) {
    return { action: 'daily_cap' };
  }
  return { action: 'retry', waitMs: seconds * 1000 + Math.floor(Math.random() * 250) };
}

function withTimeout(signal) {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function mintSandboxKey() {
  const res = await fetch(`${BASE}/sandbox/keys`, { method: 'POST', signal: withTimeout() });
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

// Authed fetch. On 401 with a pyai_test_* key, re-mint once and retry (L14):
// sandbox keys expire ~7 days and week-2 cloners must not get a dead key.
export async function pyaiFetch(path, options = {}, { remint = true, retries429 = 2 } = {}) {
  const { key } = await ensureKey();
  const headers = { ...options.headers, Authorization: `Bearer ${key}` };
  const res = await fetch(`${BASE}${path}`, { ...options, headers, signal: withTimeout(options.signal) });

  if (res.status === 401 && remint && isSandboxKey(key) && !process.env.PYAI_API_KEY) {
    await mintSandboxKey();
    return pyaiFetch(path, options, { remint: false, retries429 });
  }
  if (res.status === 401) {
    throw new PyAiError('PYAI_AUTH_FAILED', 'PyAI key rejected (set PYAI_API_KEY or delete sandbox.pyai_key to re-mint)', await problemFrom(res));
  }
  if (res.status === 429) {
    const verdict = classify429(res.headers.get('retry-after'));
    if (verdict.action === 'retry' && retries429 > 0) {
      await new Promise((r) => setTimeout(r, verdict.waitMs));
      return pyaiFetch(path, options, { remint, retries429: retries429 - 1 });
    }
    throw new PyAiError('PYAI_DAILY_CAP', 'PyAI sandbox daily cap reached — resets daily; cached fixtures still work offline', await problemFrom(res));
  }
  if (!res.ok) {
    const problem = await problemFrom(res);
    throw new PyAiError('PYAI_REQUEST_FAILED', `${path} → ${res.status}${problem.request_id ? ` (request_id ${problem.request_id})` : ''}`, problem);
  }
  return res;
}

export function maskKey(key) {
  return key ? `${key.slice(0, 10)}…${key.slice(-4)}` : '(none)';
}
