// Native Ollama auto-detection (native fetch, zero deps, Node >= 22).
//
// The email-draft LLM tier ladder (owned by src/template-email.js) is: a
// configured endpoint wins outright and this file is never even called; only
// when there is no LLM_API_KEY do we ask localhost once, on a short clock, and
// any answer short of a clean tag list falls straight through to the
// cached/offline path exactly as if Ollama did not exist. detectOllama() never
// throws and never leaves a caller waiting past its timeout: no server, a
// refused connection, a slow reply, an empty install, or a malformed response
// are all the same outcome — null, "nothing here."

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT_MS = 500;

// Preference order for which installed model drafts the email when more than
// one is pulled. Small local models are uneven at following the citation
// rules, so this is a bias toward the families that have behaved best in
// practice, not a claim that any of them matches a hosted frontier model.
const MODEL_PREFERENCE = [
  /^llama3\.1\b/i,
  /^llama3\.2\b/i,
  /^qwen/i,
  /^mistral/i,
];

function tagNames(payload) {
  const models = Array.isArray(payload?.models) ? payload.models : [];
  return models.map((m) => String(m?.name ?? m?.model ?? '').trim()).filter(Boolean);
}

// Exported for its own tests: given the tag names Ollama reports installed,
// which one does the email draft use. First preference-list match wins; with
// no match, the first installed tag; with nothing installed, null.
export function pickModel(names) {
  for (const pattern of MODEL_PREFERENCE) {
    const hit = names.find((n) => pattern.test(n));
    if (hit) return hit;
  }
  return names[0] ?? null;
}

// One GET against Ollama's own tag list, one short timeout, and a promise that
// never rejects: every failure mode (no server at that port, connection
// refused, timeout, non-200, unparseable body, an install with zero models)
// resolves to null. Callers read null as "not here, use the next tier."
//
// opts.fetchImpl and opts.timeoutMs exist for tests: a real detection run
// necessarily makes a real loopback network call, but nothing under test/
// should ever need Ollama actually running to exercise this path.
export async function detectOllama(opts = {}) {
  const env = opts.env ?? (typeof process !== 'undefined' ? process.env : {}) ?? {};
  const baseURL = String(opts.baseURL ?? OLLAMA_BASE_URL).replace(/\/+$/, '');
  const doFetch = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;

  const canAbort = typeof AbortController !== 'undefined';
  const controller = canAbort ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await doFetch(`${baseURL}/api/tags`, { signal: controller?.signal });
    if (!res || !res.ok) return null;
    const payload = await res.json();
    const names = tagNames(payload);
    const model = (typeof env.LLM_MODEL === 'string' && env.LLM_MODEL.trim())
      ? env.LLM_MODEL.trim()
      : pickModel(names);
    if (!model) return null;
    return { baseURL: `${baseURL}/v1`, model, source: 'ollama-local' };
  } catch {
    // No server, connection refused, aborted on timeout, bad JSON: all quiet.
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
