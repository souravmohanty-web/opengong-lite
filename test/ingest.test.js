import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUpload, submitJob } from '../src/ingest.js';

test('upload validation rejects non-audio extensions', async () => {
  await assert.rejects(() => validateUpload('/tmp/evil.sh'), /unsupported audio type/);
  await assert.rejects(() => validateUpload('/tmp/noext'), /unsupported audio type/);
});

test('upload validation strips path traversal to basename', async () => {
  // ../../ prefixes never survive into the uploaded filename
  const { name } = await validateUpload(new URL('../research/00-api-probe/call.wav', import.meta.url).pathname);
  assert.equal(name, 'call.wav');
});

test('submitJob demands exactly one audio source', async () => {
  await assert.rejects(() => submitJob({}), /exactly one audio source/);
  await assert.rejects(() => submitJob({ filePath: 'a.wav', audioUrl: 'https://x' }), /exactly one audio source/);
});
