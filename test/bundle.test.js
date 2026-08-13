import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBundle } from '../src/bundle.js';
import { gateClaim, gradeRun } from '../src/gate.js';

// call.source (CRM-plumbing recommendation): every emitted bundle carries the
// full set of CRM source-identity slots on call.source, even when nothing is
// known yet (today's upload/URL ingest path) — so "the schema carries CRM
// source IDs, populated when you connect a CRM" is literally true of the
// shape shipped today, not a promise about a future one.

const SOURCE_KEYS = [
  'system', 'external_call_id', 'external_contact_id',
  'external_account_id', 'external_deal_id', 'occurred_at', 'direction',
];

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/gate/${name}`, import.meta.url), 'utf8'));
const T = load('transcript.pricing.json');
const CLEAN = load('claims.clean.json');

function minimalBundleArgs(extra = {}) {
  const gated = CLEAN.map((c) => gateClaim(c, T));
  const coverage = gradeRun(gated);
  return { transcript: T, claims: gated, coverage, callId: 'bn-call', ...extra };
}

test('BN-01 upload/URL ingest (no CRM adapter): call.source exists with all 7 keys, all null', () => {
  const bundle = buildBundle(minimalBundleArgs());
  assert.ok(bundle.call.source, 'call.source must exist even with no CRM adapter wired');
  assert.deepEqual(Object.keys(bundle.call.source).sort(), [...SOURCE_KEYS].sort());
  for (const key of SOURCE_KEYS) {
    assert.equal(bundle.call.source[key], null, `call.source.${key} must default to null, not be omitted or invented`);
  }
});

test('BN-02 a CRM adapter supplying partial source ids is merged over the empty defaults, never dropping the untouched slots', () => {
  const bundle = buildBundle(minimalBundleArgs({
    source: { system: 'hubspot', external_call_id: 'call_9182', external_contact_id: 'contact_44' },
  }));
  assert.equal(bundle.call.source.system, 'hubspot');
  assert.equal(bundle.call.source.external_call_id, 'call_9182');
  assert.equal(bundle.call.source.external_contact_id, 'contact_44');
  // slots the adapter didn't provide stay honestly null — never fabricated
  assert.equal(bundle.call.source.external_account_id, null);
  assert.equal(bundle.call.source.external_deal_id, null);
  assert.equal(bundle.call.source.occurred_at, null);
  assert.equal(bundle.call.source.direction, null);
  assert.deepEqual(Object.keys(bundle.call.source).sort(), [...SOURCE_KEYS].sort(), 'a CRM adapter can never add keys beyond the declared shape');
});

test('BN-03 buildBundle never mutates its inputs when composing call.source', () => {
  const args = minimalBundleArgs({ source: { system: 'salesforce' } });
  const before = structuredClone(args.source);
  buildBundle(args);
  assert.deepEqual(args.source, before);
});
