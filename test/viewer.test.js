import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escapeHtml, formatTime, buildViewModel } from '../src/viewer.js';

const bundle = () =>
  JSON.parse(readFileSync(new URL('./fixtures/bundle.slice1.json', import.meta.url), 'utf8'));

test('escapeHtml neutralizes script breakout and attribute injection', () => {
  const out = escapeHtml('</script><img src=x onerror=alert(1)> "quoted" & <b>');
  assert.ok(!out.includes('</script>'));
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;'));
  assert.ok(out.includes('&quot;quoted&quot;'));
  assert.equal(escapeHtml(undefined), '');
});

test('formatTime renders mm:ss', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(75.4), '1:15');
});

test('verified claim resolves to a playable anchor with quote offsets', () => {
  const vm = buildViewModel(bundle());
  const c1 = vm.claims.find((c) => c.id === 'c1');
  assert.equal(c1.status, 'verified');
  assert.equal(c1.anchor.utterance_id, 0);
  assert.ok(c1.anchor.t_start > 0);
  const utt = vm.utterances[c1.anchor.utterance_id];
  assert.ok(utt.text.includes(c1.anchor.quote), 'quote must be locatable in the cited utterance');
});

test('uncorroborated claim is demoted: no anchor, nothing to play', () => {
  const vm = buildViewModel(bundle());
  const c3 = vm.claims.find((c) => c.status === 'uncorroborated');
  assert.equal(c3.anchor, null);
});

test('blocked_injection claims are quarantined and NEVER appear in notes body', () => {
  const vm = buildViewModel(bundle());
  assert.equal(vm.quarantine.length, 1);
  const blockedIds = new Set(vm.quarantine.map((c) => c.id));
  for (const section of vm.sections) {
    for (const block of section.blocks) {
      assert.ok(block.claim_ids.every((id) => !blockedIds.has(id)),
        'notes body must not reference a blocked_injection claim');
    }
  }
});

test('a notes block citing a blocked claim is a build error, not a render fallback', () => {
  const bad = bundle();
  bad.notes.sections[0].blocks[0].claim_ids.push('c4'); // c4 is blocked_injection
  assert.throws(() => buildViewModel(bad), /blocked_injection/);
});

test('coverage band is rendered verbatim, never recomputed', () => {
  const b = bundle();
  b.notes.coverage.band = 'SOME_FUTURE_BAND';
  const vm = buildViewModel(b);
  assert.equal(vm.coverage.band, 'SOME_FUTURE_BAND');
});
