import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTranscript } from '../src/transcript.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../research/00-api-probe/${name}`, import.meta.url), 'utf8'));

test('stereo golden: segments become speaker-labeled utterances', () => {
  const { result } = fixture('stereo_result.json');
  const t = buildTranscript(result);

  assert.equal(t.mode, 'diarized');
  assert.equal(t.speakers, 2);
  assert.equal(t.utterances.length, 3);
  assert.deepEqual(t.utterances.map((u) => u.speaker), ['speaker_1', 'speaker_2', 'speaker_1']);
  assert.deepEqual(t.utterances.map((u) => u.channel), [0, 1, 0]);
  // words-join reproduces the segment text exactly
  assert.equal(t.utterances[1].text, 'honestly my main concern is pricing your competitor quoted as almost forty less last week');
  // no invented speaker names, roles left for extraction
  assert.ok(t.utterances.every((u) => u.role === null));
});

test('mono golden: our utterance layer splits the single coarse segment', () => {
  const { result } = fixture('batch_result.json');
  const t = buildTranscript(result);

  assert.equal(t.mode, 'mono');
  assert.equal(result.segments.length, 1); // API gave one giant segment
  assert.ok(t.utterances.length > 1, 'hard max-length split must apply (no >0.6s pauses in this fixture)');
  assert.ok(t.utterances.every((u) => u.text.split(' ').length <= 40));
  assert.ok(t.utterances.every((u) => u.speaker === null), 'never invent speakers on mono');
  // utterances tile the word stream: no word lost
  assert.equal(t.utterances.map((u) => u.text).join(' '), result.words.map((w) => w.word).join(' '));
});

test('canonical text comes from words/segments, never result.text (F-21)', () => {
  const { result } = fixture('batch_result.json');
  const t = buildTranscript(result);
  // the same response renders "40" in result.text but "forty" in words/segments
  assert.match(result.text, /almost 40 less/);
  assert.match(t.canonical_text, /almost forty less/);
  assert.doesNotMatch(t.canonical_text, /almost 40 less/);
});

test('tts mono golden: two voices in mono stay one un-attributed stream', () => {
  const { result } = fixture('tts_diar_result.json');
  const t = buildTranscript(result);
  assert.equal(t.mode, 'mono');
  assert.ok(t.utterances.every((u) => u.speaker === null));
});

test('transcript hash is stable and mode-independent of display concerns', () => {
  const { result } = fixture('stereo_result.json');
  assert.equal(buildTranscript(result).transcript_hash, buildTranscript(result).transcript_hash);
  assert.match(buildTranscript(result).transcript_hash, /^sha256:[0-9a-f]{64}$/);
});
