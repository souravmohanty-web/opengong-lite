import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildTranscript } from '../src/transcript.js';
import { classify429, interruptibleSleep, PyAiError } from '../src/pyai.js';
import { uploadTimeoutMs } from '../src/ingest.js';
import { createApp, startServer, DEFAULTS, parseRange } from '../src/server.js';

// ── audit #6: the 40-word cap must hold without matchable words[] ───────────

test('audit#6: long segment with EMPTY words[] still splits at the cap', () => {
  const text = Array.from({ length: 120 }, (_, i) => `w${i}`).join(' ');
  const t = buildTranscript({
    speakers: 2,
    words: [],
    segments: [
      { id: 0, start: 0, end: 240, text, speaker: 'speaker_1', channel: 0 },
      { id: 1, start: 241, end: 242, text: 'ok', speaker: 'speaker_2', channel: 1 },
    ],
  });
  const chunks = t.utterances.filter((u) => u.speaker === 'speaker_1');
  assert.equal(chunks.length, 3);
  assert.ok(t.utterances.every((u) => u.text.split(' ').length <= 40));
  assert.equal(chunks.map((u) => u.text).join(' '), text, 'no word lost');
  assert.ok(chunks[1].start > chunks[0].start, 'interpolated times must advance');
});

test('audit#6: case-mismatched speaker labels (SPEAKER_1 vs speaker_1) still match words', () => {
  const words = Array.from({ length: 90 }, (_, i) =>
    ({ word: `w${i}`, start: i, end: i + 0.5, speaker: 'SPEAKER_1', channel: 0 }));
  const t = buildTranscript({
    speakers: 2,
    words,
    segments: [
      { id: 0, start: 0, end: 90, text: words.map((w) => w.word).join(' '), speaker: 'speaker_1', channel: 0 },
      { id: 1, start: 91, end: 92, text: 'ok', speaker: 'speaker_2', channel: 1 },
    ],
  });
  const chunks = t.utterances.filter((u) => sameSpk(u.speaker, 'speaker_1'));
  assert.ok(chunks.length >= 3, 'word-based split must engage despite label case mismatch');
  function sameSpk(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }
});

// ── audit: Retry-After variants ─────────────────────────────────────────────

test('classify429 boundaries: 60 retries, 61 is the cap', () => {
  assert.equal(classify429('60').action, 'retry');
  assert.equal(classify429('61').action, 'daily_cap');
});

test('classify429 parses HTTP-date Retry-After', () => {
  const soon = new Date(Date.now() + 30_000).toUTCString();
  const past = new Date(Date.now() - 30_000).toUTCString();
  const far = new Date(Date.now() + 3_600_000).toUTCString();
  assert.equal(classify429(soon).action, 'retry');
  assert.equal(classify429(past).action, 'daily_cap');
  assert.equal(classify429(far).action, 'daily_cap');
});

// ── audit #8: backoff sleep must be signal-aware ────────────────────────────

test('audit#8: interruptibleSleep aborts promptly, as a named exit', async () => {
  const ac = new AbortController();
  const started = Date.now();
  setTimeout(() => ac.abort(), 100);
  await assert.rejects(
    () => interruptibleSleep(5_000, ac.signal),
    (err) => err instanceof PyAiError && err.name === 'PYAI_ABORTED',
  );
  assert.ok(Date.now() - started < 1_000, 'abort must cut the sleep short');
});

// ── audit #9: upload budget scales with size ────────────────────────────────

test('audit#9: upload timeout scales with payload size', () => {
  assert.ok(uploadTimeoutMs(0) >= 60_000);
  assert.ok(uploadTimeoutMs(50 * 1024 * 1024) > uploadTimeoutMs(1024 * 1024));
});

// ── audit: RFC suffix ranges ────────────────────────────────────────────────

test('parseRange: suffix form means the LAST n bytes', () => {
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=900-', 1000), { start: 900, end: 999 });
  assert.equal(parseRange('bytes=-0', 1000).invalid, true);
  assert.equal(parseRange('bytes=1000-', 1000).invalid, true);
  assert.equal(parseRange(null, 1000), null);
});

// ── audit #1/#2: one bad request must never kill the server ─────────────────

const tmp = mkdtempSync(join(tmpdir(), 'og-server-test-'));
const dirAsAudio = join(tmp, 'not-audio.wav');
mkdirSync(dirAsAudio);

function listen(paths) {
  return new Promise((resolve) => {
    const server = startServer(paths, { port: 0 });
    server.on('listening', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('audit#1: missing bundle → 500, process survives, next request fine', async () => {
  const { server, base } = await listen({ ...DEFAULTS, bundlePath: join(tmp, 'nope.json') });
  after(() => server.close());
  const bad = await fetch(`${base}/bundle.json`);
  assert.equal(bad.status, 500);
  const ok = await fetch(`${base}/`);
  assert.equal(ok.status, 200, 'server must still answer after a failed request');
});

test('audit#2: stream error (audio path is a directory) → survives', async () => {
  const { server, base } = await listen({ ...DEFAULTS, audioPath: dirAsAudio });
  after(() => server.close());
  const res = await fetch(`${base}/audio.wav`).catch(() => ({ status: 'destroyed' }));
  assert.notEqual(res.status, 200);
  const ok = await fetch(`${base}/`);
  assert.equal(ok.status, 200, 'server must still answer after a stream failure');
});

test('suffix range served correctly end-to-end', async () => {
  const { server, base } = await listen(DEFAULTS);
  after(() => server.close());
  const res = await fetch(`${base}/audio.wav`, { headers: { Range: 'bytes=-100' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-length'), '100');
  assert.match(res.headers.get('content-range'), /^bytes 677500-677599\/677600$/);
  const out = await fetch(`${base}/audio.wav`, { headers: { Range: 'bytes=999999999-' } });
  assert.equal(out.status, 416);
});
