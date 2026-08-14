// deal-server: route defaulting + HTTP Range parsing (audio seek support for
// the play-from-here reveal). Pure helpers, no socket bound.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePath, parseRange, DEFAULT_PUBLIC_DIR } from '../src/deal-server.mjs';

test('root path serves the deal workspace (the landing is the deal, not a call list)', () => {
  const full = resolvePath(DEFAULT_PUBLIC_DIR, '/');
  assert.ok(full.endsWith('/public/index.html'), `root -> ${full}`);
});

test('resolvePath never escapes the public dir', () => {
  // normalize + leading-../ strip keeps us inside publicDir; the result is
  // either null or a path under publicDir, never /etc/passwd
  const p = resolvePath(DEFAULT_PUBLIC_DIR, '/../../etc/passwd');
  assert.ok(p === null || p.startsWith(DEFAULT_PUBLIC_DIR));
});

test('parseRange handles a normal start-end range (inclusive)', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=100-199', 1000), { start: 100, end: 199 });
});

test('parseRange handles an open-ended range (start-)', () => {
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
});

test('parseRange handles a suffix range (last N bytes)', () => {
  assert.deepEqual(parseRange('bytes=-200', 1000), { start: 800, end: 999 });
});

test('parseRange clamps an end past the file size', () => {
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 });
});

test('parseRange returns null for absent, malformed, or unsatisfiable ranges', () => {
  assert.equal(parseRange(undefined, 1000), null);
  assert.equal(parseRange('', 1000), null);
  assert.equal(parseRange('rows=0-9', 1000), null);
  assert.equal(parseRange('bytes=abc-def', 1000), null);
  assert.equal(parseRange('bytes=2000-2999', 1000), null); // start past EOF
  assert.equal(parseRange('bytes=-0', 1000), null);        // zero-length suffix
});
