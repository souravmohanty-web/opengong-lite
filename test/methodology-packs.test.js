import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPacks, validatePack, activePack } from '../src/methodology/packs.js';

test('all builtin packs load and validate', () => {
  const packs = loadPacks();
  assert.ok(packs.size >= 14, `expected >=14 packs, got ${packs.size}`);
  for (const id of ['meddic', 'meddpicc', 'bant', 'spin', 'sandler', 'challenger', 'gap', 'snap', 'solution', 'spiced', 'command-of-message', 'neat', 'champ', 'value-selling']) {
    assert.ok(packs.has(id), `missing pack ${id}`);
  }
});

test('meddpicc carries the canonical additions', () => {
  const p = loadPacks().get('meddpicc');
  const ids = p.traits.map((t) => t.id);
  assert.ok(ids.includes('paper_process'), 'MEDDPICC must include paper_process');
  assert.ok(ids.includes('competition'), 'MEDDPICC must include competition');
  assert.ok(ids.includes('implicate_pain'), 'MEDDPICC I is Implicate the Pain (Whyte canon)');
});

test('every trait has coaching and classifying questions', () => {
  for (const p of loadPacks().values()) {
    for (const t of p.traits) {
      assert.ok(t.classifying_questions.length >= 1, `${p.id}/${t.id} missing questions`);
      assert.ok(t.coaching.example_line.length > 0, `${p.id}/${t.id} missing example line`);
    }
  }
});

test('validatePack rejects broken packs', () => {
  assert.ok(validatePack({ id: 'BAD ID', traits: [] }).length > 0);
  assert.ok(validatePack({ id: 'ok', name: 'x', summary: 'y', traits: [{ id: 'a', name: 'A', weight: 99, definition: 'd', classifying_questions: ['q'], coaching: {} }] }).length > 0);
});

test('activePack resolves the settings.json methodology', () => {
  const pack = activePack();
  assert.equal(typeof pack.id, 'string');
});
