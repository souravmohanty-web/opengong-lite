import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tier1Html, inlineJson } from '../src/export.js';

const bundle = () =>
  JSON.parse(readFileSync(new URL('./fixtures/bundle.slice1.json', import.meta.url), 'utf8'));

function extractInlineBundle(html) {
  const m = /<script type="application\/json" id="og-data">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'export must contain the inline og-data block');
  return m[1];
}

test('tier-1 export round-trips the bundle exactly', () => {
  const b = bundle();
  const inlined = extractInlineBundle(tier1Html(b));
  assert.deepEqual(JSON.parse(inlined), b);
});

test('a transcript speaking "</script>" cannot break out of the inline JSON', () => {
  const b = bundle();
  b.transcript.utterances[1].text += ' </script><script>alert(1)</script>';
  const html = tier1Html(b);
  const inlined = extractInlineBundle(html);
  assert.ok(!inlined.includes('<'), 'every < in the payload must be escaped');
  assert.ok(inlined.includes('\\u003c'), 'escaping must be the \\u003c form');
  assert.deepEqual(JSON.parse(inlined), b, 'escaping must not corrupt the data');
});

test('export is self-contained: no server references, CSP present', () => {
  const html = tier1Html(bundle());
  assert.ok(!html.includes('src="/viewer.js"'), 'no external script reference');
  assert.ok(html.includes('Content-Security-Policy'), 'CSP belt-and-suspenders');
  assert.ok(html.includes('id="og-data"'));
});

test('an invalid bundle fails at EXPORT time, not at open time', () => {
  const b = bundle();
  b.notes.sections[0].blocks[0].claim_ids.push('c4'); // cites a blocked_injection claim
  assert.throws(() => tier1Html(b), /blocked_injection/);
});

test('inlineJson escapes every < including inside keys', () => {
  const out = inlineJson({ '<k': '<v>', arr: ['</script>'] });
  assert.ok(!out.includes('<'));
  assert.deepEqual(JSON.parse(out), { '<k': '<v>', arr: ['</script>'] });
});

test('A-007 residual: mono bundle path — giant no-words segment splits (regression home)', async () => {
  const { buildTranscript } = await import('../src/transcript.js');
  const text = Array.from({ length: 120 }, (_, i) => `m${i}`).join(' ');
  const t = buildTranscript({ speakers: 1, words: [], segments: [{ id: 0, start: 0, end: 300, text, speaker: null }] });
  assert.equal(t.mode, 'mono');
  assert.equal(t.utterances.length, 3);
  assert.ok(t.utterances.every((u) => u.text.split(' ').length <= 40));
  assert.equal(t.utterances.map((u) => u.text).join(' '), text);
});
