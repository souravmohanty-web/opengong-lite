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
  const utt = vm.uttById.get(c1.anchor.utterance_id);
  assert.ok(utt.text.includes(c1.anchor.quote), 'quote must be locatable in the cited utterance');
});

test('audit#7: anchors are id-keyed — reordered bundles still resolve', () => {
  const b = bundle();
  b.transcript.utterances.reverse();          // array index no longer equals id
  const vm = buildViewModel(b);
  const c1 = vm.claims.find((c) => c.id === 'c1');
  const utt = vm.uttById.get(c1.anchor.utterance_id);
  assert.equal(utt.id, 0);
  assert.ok(utt.text.includes(c1.anchor.quote));
});

test('audit#7: a claim citing an utterance missing from the bundle fails at load, not first click', () => {
  const b = bundle();
  b.claims[0].evidence[0].utterance_id = 99;
  assert.throws(() => buildViewModel(b), /self-contained/);
});

test('audit#3: hostile utterance id is rejected at the boundary', () => {
  const b = bundle();
  b.transcript.utterances[0].id = '0"><img src=x onerror=alert(1)>';
  assert.throws(() => buildViewModel(b), /integer/);
});

test('audit#5: status variance fails CLOSED — unknown status throws', () => {
  for (const bad of ['Blocked_Injection', 'blocked_injection ', 'VERIFIED', 'shipped']) {
    const b = bundle();
    b.claims[3].status = bad;
    assert.throws(() => buildViewModel(b), /closed enum/, `status ${JSON.stringify(bad)} must not render`);
  }
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
