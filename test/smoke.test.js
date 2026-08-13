import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSandboxKey } from '../src/keystore.js';
import { PyAiError, maskKey } from '../src/pyai.js';

test('sandbox keys are recognized by prefix', () => {
  assert.equal(isSandboxKey('pyai_test_abc123'), true);
  assert.equal(isSandboxKey('pyai_live_abc123'), false);
  assert.equal(isSandboxKey(undefined), false);
});

test('PyAiError carries a named exit and the problem body', () => {
  const err = new PyAiError('PYAI_DAILY_CAP', 'cap', { status: 429, request_id: 'req_1' });
  assert.equal(err.name, 'PYAI_DAILY_CAP');
  assert.equal(err.problem.request_id, 'req_1');
});

test('maskKey never reveals the middle of a key', () => {
  const masked = maskKey('pyai_test_0123456789abcdef');
  assert.equal(masked.includes('0123456789abcdef'), false);
  assert.equal(masked.endsWith('cdef'), true);
});
