import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTranscript } from '../src/transcript.js';
import { classify429 } from '../src/pyai.js';
import { pollTimeoutMs, estimateAudioSeconds } from '../src/ingest.js';

// A-007: a long single-speaker stereo segment must never become one utterance.
function longStereoResult(wordCount = 90) {
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    words.push({ word: `w${i}`, start: i * 0.4, end: i * 0.4 + 0.3, channel: 0, speaker: 'speaker_1' });
  }
  // a second speaker replies AFTER, but appears FIRST in segments[] (order trap)
  const reply = { word: 'ok', start: wordCount * 0.4 + 1, end: wordCount * 0.4 + 1.2, channel: 1, speaker: 'speaker_2' };
  return {
    speakers: 2,
    audio_seconds: reply.end,
    words: [...words, reply],
    segments: [
      { id: 0, start: reply.start, end: reply.end, text: 'ok', speaker: 'speaker_2', channel: 1 },
      { id: 1, start: 0, end: words[words.length - 1].end, text: words.map((w) => w.word).join(' '), speaker: 'speaker_1', channel: 0 },
    ],
  };
}

test('A-007: stereo monologue segment splits at the 40-word cap', () => {
  const t = buildTranscript(longStereoResult(90));
  const mono = t.utterances.filter((u) => u.speaker === 'speaker_1');
  assert.ok(mono.length >= 3, `expected >=3 chunks, got ${mono.length}`);
  assert.ok(t.utterances.every((u) => u.text.split(' ').length <= 40));
  // no word lost across the split
  assert.equal(mono.map((u) => u.text).join(' '), longStereoResult(90).segments[1].text);
});

test('A-007: diarized utterances are time-sorted with sequential ids', () => {
  const t = buildTranscript(longStereoResult(90));
  const starts = t.utterances.map((u) => u.start);
  assert.deepEqual([...starts].sort((a, b) => a - b), starts, 'utterances must be sorted by start time');
  assert.deepEqual(t.utterances.map((u) => u.id), t.utterances.map((_, i) => i));
  // the reply comes last in time, so it must be last in the list despite being segments[0]
  assert.equal(t.utterances[t.utterances.length - 1].speaker, 'speaker_2');
});

test('429 discrimination: short Retry-After → jittered retry, absent/long → daily cap', () => {
  const r = classify429('5');
  assert.equal(r.action, 'retry');
  assert.ok(r.waitMs >= 5000 && r.waitMs <= 5500, `waitMs ${r.waitMs} outside 5000..5500`);
  assert.equal(classify429(null).action, 'daily_cap');
  assert.equal(classify429('3600').action, 'daily_cap');
  assert.equal(classify429('garbage').action, 'daily_cap');
});

test('poll timeout scales with estimated audio duration and has a floor', () => {
  assert.ok(pollTimeoutMs(0) >= 120_000);
  assert.ok(pollTimeoutMs(600) > pollTimeoutMs(60));
  assert.equal(pollTimeoutMs(600), 120_000 + 600 * 2000);
  // WAV byte-size estimate errs long (longer timeout = safe direction)
  assert.ok(estimateAudioSeconds(677_600) >= 21);
});
