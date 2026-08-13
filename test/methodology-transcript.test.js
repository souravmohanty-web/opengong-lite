import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTranscript, speakerLabelsFound, renderForPrompt } from '../src/methodology/transcript.js';

const sample = readFileSync(new URL('../samples/methodology/call-discovery.txt', import.meta.url), 'utf8');

test('labeled text parses to segments with roles', () => {
  const t = parseTranscript(sample);
  assert.equal(t.segments.length, 12);
  assert.equal(t.segments[0].speaker, 'Sourav');
  assert.equal(t.segments[1].speaker, 'Maya');
  assert.match(t.segments[1].text, /front desk misses too many calls/);
  assert.equal(t.segments[1].role, 'Head of Patient Services, Brightsmile');
  assert.ok(speakerLabelsFound(t));
});

test('header/comment lines are skipped', () => {
  const t = parseTranscript('# a header\nA (Rep): hello there\nB: hi');
  assert.equal(t.segments.length, 2);
});

test('continuation lines append to previous speaker', () => {
  const t = parseTranscript('A (Rep): first part\nand the continuation\nB: reply');
  assert.equal(t.segments.length, 2);
  assert.match(t.segments[0].text, /first part and the continuation/);
});

test('canonical JSON input passes through', () => {
  const t = parseTranscript(JSON.stringify({ segments: [{ speaker: 'A', text: 'x' }, { speaker: 'B', text: 'y' }] }));
  assert.equal(t.segments.length, 2);
  assert.equal(t.segments[1].id, 1);
});

test('renderForPrompt numbers every line', () => {
  const t = parseTranscript(sample);
  const rendered = renderForPrompt(t);
  assert.match(rendered, /^\[0\] Sourav/);
  assert.match(rendered, /\[11\] Maya/);
});
