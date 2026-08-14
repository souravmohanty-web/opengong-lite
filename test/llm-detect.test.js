// Native Ollama auto-detection — all offline. Every case injects its own
// fetchImpl (or none at all), so nothing here ever touches a real socket, and
// none of it needs Ollama actually installed or running.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectOllama, pickModel } from '../src/llm-detect.js';

const tagsResponse = (names) => ({
  ok: true,
  json: async () => ({ models: names.map((name) => ({ name })) }),
});

// ── pickModel: which installed tag drafts the email ─────────────────────────

test('pickModel prefers the family list in order over an arbitrary tag', () => {
  assert.equal(pickModel(['gemma2:9b', 'llama3.1:8b', 'mistral:7b']), 'llama3.1:8b');
  assert.equal(pickModel(['gemma2:9b', 'llama3.2:3b', 'mistral:7b']), 'llama3.2:3b');
  assert.equal(pickModel(['gemma2:9b', 'qwen2.5:7b']), 'qwen2.5:7b');
  assert.equal(pickModel(['gemma2:9b', 'mistral:7b']), 'mistral:7b');
});

test('pickModel prefers llama3.1 over llama3.2 when both are installed', () => {
  assert.equal(pickModel(['llama3.2:3b', 'llama3.1:8b']), 'llama3.1:8b');
});

test('pickModel falls back to the first installed tag when nothing on the list matches', () => {
  assert.equal(pickModel(['gemma2:9b', 'phi3:14b']), 'gemma2:9b');
});

test('pickModel returns null on an empty install', () => {
  assert.equal(pickModel([]), null);
});

// ── detectOllama: the probe itself ───────────────────────────────────────────

test('a real answer returns the OpenAI-compatible base URL, a picked model, and its source', async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/tags');
    return tagsResponse(['llama3.2:3b', 'mistral:7b']);
  };
  const out = await detectOllama({ fetchImpl, env: {} });
  assert.deepEqual(out, { baseURL: 'http://127.0.0.1:11434/v1', model: 'llama3.2:3b', source: 'ollama-local' });
});

test('LLM_MODEL overrides the auto-pick even when other tags are installed', async () => {
  const fetchImpl = async () => tagsResponse(['llama3.2:3b', 'mistral:7b']);
  const out = await detectOllama({ fetchImpl, env: { LLM_MODEL: 'my-custom-tag' } });
  assert.equal(out.model, 'my-custom-tag');
});

test('no server (connection refused) degrades to null, never throws', async () => {
  const fetchImpl = async () => { throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { code: 'ECONNREFUSED' }); };
  await assert.doesNotReject(async () => {
    const out = await detectOllama({ fetchImpl, env: {} });
    assert.equal(out, null);
  });
});

test('a trailing slash on a custom baseURL is trimmed the same way completeWithOpenAI trims LLM_BASE_URL', async () => {
  let seenUrl = null;
  const fetchImpl = async (url) => { seenUrl = url; return tagsResponse(['llama3.1:8b']); };
  const out = await detectOllama({ fetchImpl, env: {}, baseURL: 'http://127.0.0.1:11434/' });
  assert.equal(seenUrl, 'http://127.0.0.1:11434/api/tags');
  assert.equal(out.baseURL, 'http://127.0.0.1:11434/v1');
});

test('a non-200 response degrades to null', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  assert.equal(await detectOllama({ fetchImpl, env: {} }), null);
});

test('an install with zero models degrades to null', async () => {
  const fetchImpl = async () => tagsResponse([]);
  assert.equal(await detectOllama({ fetchImpl, env: {} }), null);
});

test('malformed JSON degrades to null, not a thrown error', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } });
  assert.equal(await detectOllama({ fetchImpl, env: {} }), null);
});

test('a response shaped without a models array degrades to null', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ unexpected: true }) });
  assert.equal(await detectOllama({ fetchImpl, env: {} }), null);
});

test('a slow reply is aborted at the timeout and degrades to null, never hangs the caller', async () => {
  const fetchImpl = (url, { signal } = {}) => new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    // Never resolves on its own within the test's patience: only the abort
    // (fired by detectOllama's own timeout) ends this promise.
  });
  const started = Date.now();
  const out = await detectOllama({ fetchImpl, env: {}, timeoutMs: 20 });
  assert.equal(out, null);
  assert.ok(Date.now() - started < 500, 'the probe must not slow the caller past its own timeout');
});
