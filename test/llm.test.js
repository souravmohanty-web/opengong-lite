import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callMessages, LlmError, costUsd, PRICE_PER_TOKEN } from '../src/llm.js';

const OK_RESPONSE = {
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '{"ok":true}' }],
  usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 0 },
};

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('L-01 throws ANTHROPIC_KEY_MISSING with no apiKey and no env var, before any fetch', async () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  let calls = 0;
  try {
    await assert.rejects(
      () => callMessages({ model: 'claude-sonnet-5', system: [], messages: [], schema: {}, fetchImpl: async () => { calls += 1; } }),
      (err) => err instanceof LlmError && err.name === 'ANTHROPIC_KEY_MISSING',
    );
  } finally {
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
  }
  assert.equal(calls, 0, 'must not fetch at all when the key is missing');
});

test('L-02 request body: thinking disabled, output_config.format json_schema, NEVER temperature/top_p/top_k', async () => {
  let captured;
  await callMessages({
    model: 'claude-sonnet-5', system: [{ type: 'text', text: 'sys' }], messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    schema: { type: 'object' }, apiKey: 'test-key',
    fetchImpl: async (url, opts) => { captured = { url, opts }; return jsonResponse(OK_RESPONSE); },
  });
  assert.equal(captured.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(captured.opts.headers['x-api-key'], 'test-key');
  assert.equal(captured.opts.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(captured.opts.body);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.deepEqual(body.output_config.format.schema, { type: 'object' });
  assert.equal('temperature' in body, false);
  assert.equal('top_p' in body, false);
  assert.equal('top_k' in body, false);
});

test('L-03 usage extraction is normalized from the response envelope', async () => {
  const resp = await callMessages({
    model: 'claude-sonnet-5', system: [], messages: [], schema: {}, apiKey: 'k',
    fetchImpl: async () => jsonResponse(OK_RESPONSE),
  });
  assert.deepEqual(resp.usage, { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 0 });
  assert.equal(resp.text, '{"ok":true}');
  assert.equal(resp.stop_reason, 'end_turn');
});

test('L-04 non-retryable 400/401/403/413 throw immediately, exactly one fetch', async () => {
  for (const [status, name] of [[400, 'ANTHROPIC_BAD_REQUEST'], [401, 'ANTHROPIC_AUTH_FAILED'], [403, 'ANTHROPIC_AUTH_FAILED'], [413, 'ANTHROPIC_PAYLOAD_TOO_LARGE']]) {
    let calls = 0;
    await assert.rejects(
      () => callMessages({
        model: 'm', system: [], messages: [], schema: {}, apiKey: 'k',
        fetchImpl: async () => { calls += 1; return jsonResponse({ error: 'bad' }, { status }); },
      }),
      (err) => err instanceof LlmError && err.name === name,
    );
    assert.equal(calls, 1, `status ${status} must not retry`);
  }
});

test('L-05 transport retry: 500 retries up to 4 total attempts then throws ANTHROPIC_REQUEST_FAILED', async () => {
  let calls = 0;
  await assert.rejects(
    () => callMessages({
      model: 'm', system: [], messages: [], schema: {}, apiKey: 'k', retryBaseMs: 1, retryCapMs: 2,
      fetchImpl: async () => { calls += 1; return jsonResponse({ error: 'oops' }, { status: 500 }); },
    }),
    (err) => err instanceof LlmError && err.name === 'ANTHROPIC_REQUEST_FAILED',
  );
  assert.equal(calls, 4);
});

test('L-06 transport retry succeeds after transient 503s', async () => {
  let calls = 0;
  const resp = await callMessages({
    model: 'm', system: [], messages: [], schema: {}, apiKey: 'k', retryBaseMs: 1, retryCapMs: 2,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) return jsonResponse({ error: 'unavailable' }, { status: 503 });
      return jsonResponse(OK_RESPONSE);
    },
  });
  assert.equal(calls, 3);
  assert.equal(resp.text, '{"ok":true}');
});

test('L-07 Retry-After is honoured as a floor on 429', async () => {
  let calls = 0;
  const start = Date.now();
  await callMessages({
    model: 'm', system: [], messages: [], schema: {}, apiKey: 'k', retryBaseMs: 1, retryCapMs: 2,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: 'slow down' }, { status: 429, headers: { 'retry-after': '0.05' } });
      return jsonResponse(OK_RESPONSE);
    },
  });
  assert.equal(calls, 2);
  assert.ok(Date.now() - start >= 45, 'must wait at least the Retry-After floor (allowing small scheduling slack)');
});

test('L-08 AbortSignal.any composition: caller signal cuts a backoff sleep short', async () => {
  const controller = new AbortController();
  let calls = 0;
  const promise = callMessages({
    model: 'm', system: [], messages: [], schema: {}, apiKey: 'k', retryBaseMs: 10_000, retryCapMs: 10_000,
    signal: controller.signal,
    fetchImpl: async () => { calls += 1; return jsonResponse({ error: 'oops' }, { status: 500 }); },
  });
  await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  await assert.rejects(promise, (err) => err instanceof LlmError && err.name === 'ANTHROPIC_ABORTED');
  assert.equal(calls, 1, 'must abort during the backoff wait, not after a full 10s sleep');
});

test('L-09 costUsd sums all four usage buckets at the documented rates', () => {
  const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 };
  const cost = costUsd(usage);
  const expected = PRICE_PER_TOKEN.input * 1e6 + PRICE_PER_TOKEN.output * 1e6 + PRICE_PER_TOKEN.cache_write * 1e6 + PRICE_PER_TOKEN.cache_read * 1e6;
  assert.ok(Math.abs(cost - expected) < 1e-9);
});
