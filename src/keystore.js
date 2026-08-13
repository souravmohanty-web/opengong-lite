import { readFileSync, writeFileSync } from 'node:fs';

// Env var wins; the minted-key file is the fallback. `*.pyai_key` is gitignored.
const KEY_FILE = new URL('../sandbox.pyai_key', import.meta.url);

export function loadKey() {
  if (process.env.PYAI_API_KEY) {
    return { key: process.env.PYAI_API_KEY, source: 'env' };
  }
  try {
    const stored = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
    return { ...stored, source: 'file' };
  } catch {
    return null;
  }
}

export function saveKey(record) {
  writeFileSync(KEY_FILE, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
}

export function isSandboxKey(key) {
  return typeof key === 'string' && key.startsWith('pyai_test_');
}
