import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCallData,
  buildVoiceCandidates,
  filterEnVoices,
  speakWithFallback,
  isUpstreamError,
  mixStereoTracks,
  encodeWavStereo,
  decodeWav,
} from '../scripts/lib/tts.mjs';
import { parseArgs } from '../scripts/generate-samples.mjs';
import { PyAiError } from '../src/pyai.js';

// ── fixtures ─────────────────────────────────────────────────────────────

// A mono 16-bit PCM WAV of `text.length` samples at a fixed sample rate —
// deterministic, in-memory, no network. Distinct fill value lets tests assert
// the RIGHT bytes end up on the RIGHT channel after mixing.
function fakeMonoWav({ numSamples, sampleRate = 24000, fill = 1 }) {
  const data = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) data.writeInt16LE(fill, i * 2);
  return { data, sampleRate, numChannels: 1, bitsPerSample: 16 };
}

function segFor(turn, opts = {}) {
  const fill = turn.speaker === 'rep' ? 1000 : -1000;
  return fakeMonoWav({ numSamples: turn.text.length, fill, ...opts });
}

// ── turn-parser (samples/calls/NN-*.json structured format) ────────────────

describe('parseCallData', () => {
  const validJson = {
    call: 1,
    title: 'Discovery — Brightsmile x CallForge',
    planted: ['pain: after-hours bookings lost', 'competitor: ringhawk active_user'],
    lines: [
      { speaker: 'rep', text: 'Hey Rahul, Maya from CallForge.' },
      { speaker: 'prospect', text: 'No problem, go ahead.' },
      { speaker: 'rep', text: "Let's dig in." },
    ],
  };

  test('parses call id (zero-padded), title, planted, and turns in order', () => {
    const parsed = parseCallData(validJson);
    assert.equal(parsed.callId, '01');
    assert.equal(parsed.title, 'Discovery — Brightsmile x CallForge');
    assert.deepEqual(parsed.planted, ['pain: after-hours bookings lost', 'competitor: ringhawk active_user']);
    assert.deepEqual(parsed.turns, [
      { speaker: 'rep', text: 'Hey Rahul, Maya from CallForge.' },
      { speaker: 'prospect', text: 'No problem, go ahead.' },
      { speaker: 'rep', text: "Let's dig in." },
    ]);
  });

  test('accepts a JSON string, not just a parsed object', () => {
    const parsed = parseCallData(JSON.stringify(validJson));
    assert.equal(parsed.callId, '01');
    assert.equal(parsed.turns.length, 3);
  });

  test('zero-pads single-digit call numbers, leaves double digits alone', () => {
    assert.equal(parseCallData({ ...validJson, call: 6 }).callId, '06');
    assert.equal(parseCallData({ ...validJson, call: 12 }).callId, '12');
  });

  test('defaults planted to [] when absent', () => {
    const { planted, ...rest } = validJson;
    assert.deepEqual(parseCallData(rest).planted, []);
  });

  test('rejects a missing/non-integer "call" field', () => {
    assert.throws(() => parseCallData({ ...validJson, call: 'one' }));
    assert.throws(() => parseCallData({ ...validJson, call: undefined }));
  });

  test('rejects missing or empty "lines"', () => {
    assert.throws(() => parseCallData({ ...validJson, lines: [] }));
    assert.throws(() => parseCallData({ ...validJson, lines: undefined }));
  });

  test('rejects a line with a speaker other than rep/prospect', () => {
    assert.throws(() => parseCallData({ ...validJson, lines: [{ speaker: 'narrator', text: 'hi' }] }));
  });

  test('rejects a line with empty text', () => {
    assert.throws(() => parseCallData({ ...validJson, lines: [{ speaker: 'rep', text: '   ' }] }));
  });
});

// ── voice candidate selection ───────────────────────────────────────────

describe('buildVoiceCandidates / filterEnVoices', () => {
  const catalog = [
    { voice_id: 'stock_zed_en_us', language: 'en', gender: 'M' },
    { voice_id: 'stock_amos_en_us', language: 'en', gender: 'M' }, // known-flaky, must be excluded
    { voice_id: 'stock_arjun_en_in', language: 'en', gender: 'M' },
    { voice_id: 'stock_amelia_en_gb', language: 'en', gender: 'F' },
    { voice_id: 'stock_priya_en_in', language: 'en', gender: 'F' },
    { voice_id: 'stock_alejandro_es', language: 'es', gender: 'M' }, // non-en, excluded
  ];

  test('filterEnVoices keeps only en + drops the known-flaky id', () => {
    const en = filterEnVoices(catalog);
    assert.deepEqual(
      en.map((v) => v.voice_id).sort(),
      ['stock_amelia_en_gb', 'stock_arjun_en_in', 'stock_priya_en_in', 'stock_zed_en_us'],
    );
  });

  test('buildVoiceCandidates splits gendered, sorted, distinct lists', () => {
    const { rep, prospect } = buildVoiceCandidates(catalog);
    assert.deepEqual(rep, ['stock_arjun_en_in', 'stock_zed_en_us']); // sorted, flaky excluded
    assert.deepEqual(prospect, ['stock_amelia_en_gb', 'stock_priya_en_in']);
    assert.equal(new Set([...rep, ...prospect]).size, rep.length + prospect.length, 'rep/prospect voices are distinct');
  });

  test('throws if a gender has no usable en voice', () => {
    assert.throws(() => buildVoiceCandidates([{ voice_id: 'stock_x_en_us', language: 'en', gender: 'M' }]));
  });
});

// ── voice fallback walk ─────────────────────────────────────────────────

describe('speakWithFallback / isUpstreamError', () => {
  function upstreamErr() {
    return new PyAiError('PYAI_REQUEST_FAILED', '/audio/speech -> 502', { status: 502, detail: 'upstream_error: unavailable' });
  }

  test('walks to the next candidate on an upstream error and remembers it', async () => {
    const calls = [];
    const speak = async (text, voiceId) => {
      calls.push(voiceId);
      if (voiceId === 'bad') throw upstreamErr();
      return { data: Buffer.alloc(2), sampleRate: 24000, numChannels: 1, bitsPerSample: 16 };
    };
    const result = await speakWithFallback({ text: 'hi', candidates: ['bad', 'good'], startIndex: 0, speak });
    assert.equal(result.voiceId, 'good');
    assert.equal(result.voiceIndex, 1);
    assert.deepEqual(calls, ['bad', 'good']);
  });

  test('does NOT fall back on a non-upstream error (e.g. auth/budget) — rethrows immediately', async () => {
    const authErr = new PyAiError('PYAI_AUTH_FAILED', 'key rejected', { status: 401 });
    const speak = async () => { throw authErr; };
    await assert.rejects(
      speakWithFallback({ text: 'hi', candidates: ['a', 'b'], startIndex: 0, speak }),
      (err) => err === authErr,
    );
  });

  test('throws once every candidate is exhausted', async () => {
    const speak = async () => { throw upstreamErr(); };
    await assert.rejects(speakWithFallback({ text: 'hi', candidates: ['a', 'b'], startIndex: 0, speak }));
  });

  test('isUpstreamError is false for a plain 401/402', () => {
    assert.equal(isUpstreamError(new PyAiError('PYAI_AUTH_FAILED', 'x', { status: 401 })), false);
    assert.equal(isUpstreamError(new PyAiError('PYAI_REQUEST_FAILED', 'x', { status: 402 })), false);
  });
});

// ── the stereo mixer (core of this task) ────────────────────────────────

describe('mixStereoTracks — stereo mixer', () => {
  test('two turns (rep then prospect): correct channel assignment + time alignment', () => {
    const turns = [
      { speaker: 'rep', text: 'aaa' },      // 3 samples of audio on LEFT
      { speaker: 'prospect', text: 'bb' },  // 2 samples of audio on RIGHT
    ];
    const segments = turns.map((t) => segFor(t));
    const mixed = mixStereoTracks(turns, segments);

    // time alignment: both tracks are the same total length
    assert.equal(mixed.left.length, mixed.right.length);
    assert.equal(mixed.left.length, (3 + 2) * 2); // 5 samples * 2 bytes

    // rep turn (first 3 samples): LEFT is real audio (1000), RIGHT is silence (0)
    for (let i = 0; i < 3; i++) {
      assert.equal(mixed.left.readInt16LE(i * 2), 1000, `left sample ${i} should be rep audio`);
      assert.equal(mixed.right.readInt16LE(i * 2), 0, `right sample ${i} should be silent during rep's turn`);
    }
    // prospect turn (next 2 samples): LEFT is silence, RIGHT is real audio (-1000)
    for (let i = 3; i < 5; i++) {
      assert.equal(mixed.left.readInt16LE(i * 2), 0, `left sample ${i} should be silent during prospect's turn`);
      assert.equal(mixed.right.readInt16LE(i * 2), -1000, `right sample ${i} should be prospect audio`);
    }
  });

  test('alternating multi-turn call stays time-aligned and correctly channeled throughout', () => {
    const turns = [
      { speaker: 'rep', text: 'aa' },
      { speaker: 'prospect', text: 'b' },
      { speaker: 'rep', text: 'cccc' },
      { speaker: 'prospect', text: 'ddd' },
    ];
    const segments = turns.map((t) => segFor(t));
    const mixed = mixStereoTracks(turns, segments);
    const totalSamples = turns.reduce((n, t) => n + t.text.length, 0);
    assert.equal(mixed.left.length, totalSamples * 2);
    assert.equal(mixed.right.length, totalSamples * 2);

    let cursor = 0;
    for (const turn of turns) {
      const n = turn.text.length;
      for (let i = cursor; i < cursor + n; i++) {
        const leftVal = mixed.left.readInt16LE(i * 2);
        const rightVal = mixed.right.readInt16LE(i * 2);
        if (turn.speaker === 'rep') {
          assert.equal(leftVal, 1000);
          assert.equal(rightVal, 0);
        } else {
          assert.equal(leftVal, 0);
          assert.equal(rightVal, -1000);
        }
      }
      cursor += n;
    }
  });

  test('two consecutive same-speaker turns still stay aligned (no gaps assumed between turns)', () => {
    const turns = [
      { speaker: 'rep', text: 'aa' },
      { speaker: 'rep', text: 'bbb' },
    ];
    const segments = turns.map((t) => segFor(t));
    const mixed = mixStereoTracks(turns, segments);
    assert.equal(mixed.left.length, mixed.right.length);
    assert.equal(mixed.right.length, 5 * 2);
    // right channel is silence for the whole span (prospect never spoke)
    for (let i = 0; i < 5; i++) assert.equal(mixed.right.readInt16LE(i * 2), 0);
  });

  test('computes ttsSeconds from total sample count / sampleRate', () => {
    const turns = [{ speaker: 'rep', text: 'aaaa' }, { speaker: 'prospect', text: 'bb' }]; // 6 samples
    const segments = turns.map((t) => segFor(t, { sampleRate: 24000 }));
    const mixed = mixStereoTracks(turns, segments);
    assert.equal(mixed.ttsSeconds, 6 / 24000);
  });

  test('throws on unknown speaker label', () => {
    const turns = [{ speaker: 'narrator', text: 'x' }];
    assert.throws(() => mixStereoTracks(turns, [segFor({ speaker: 'rep', text: 'x' })]));
  });

  test('throws on sample-rate mismatch across turns', () => {
    const turns = [{ speaker: 'rep', text: 'x' }, { speaker: 'prospect', text: 'y' }];
    const segments = [segFor(turns[0], { sampleRate: 24000 }), segFor(turns[1], { sampleRate: 16000 })];
    assert.throws(() => mixStereoTracks(turns, segments));
  });

  test('throws on turns/segments length mismatch', () => {
    assert.throws(() => mixStereoTracks([{ speaker: 'rep', text: 'x' }], []));
  });
});

// ── WAV encode/decode round trip ────────────────────────────────────────

describe('encodeWavStereo / decodeWav', () => {
  test('round-trips header fields and interleaved PCM data', () => {
    const left = Buffer.alloc(6); // 3 samples
    const right = Buffer.alloc(6);
    for (let i = 0; i < 3; i++) {
      left.writeInt16LE(100 + i, i * 2);
      right.writeInt16LE(-100 - i, i * 2);
    }
    const wav = encodeWavStereo({ sampleRate: 24000, left, right });
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');

    const decoded = decodeWav(wav);
    assert.equal(decoded.numChannels, 2);
    assert.equal(decoded.sampleRate, 24000);
    assert.equal(decoded.bitsPerSample, 16);
    assert.equal(decoded.data.length, 12); // 3 samples * 2 channels * 2 bytes

    // interleaved: L0 R0 L1 R1 L2 R2
    for (let i = 0; i < 3; i++) {
      assert.equal(decoded.data.readInt16LE(i * 4), 100 + i);
      assert.equal(decoded.data.readInt16LE(i * 4 + 2), -100 - i);
    }
  });

  test('rejects mismatched channel lengths', () => {
    assert.throws(() => encodeWavStereo({ sampleRate: 24000, left: Buffer.alloc(4), right: Buffer.alloc(2) }));
  });

  test('decodeWav rejects a non-RIFF buffer', () => {
    assert.throws(() => decodeWav(Buffer.from('not a wav file, just text')));
  });

  test('full pipeline: parseCallData -> mix -> encode -> decode preserves per-speaker channel', () => {
    const { turns } = parseCallData({ call: 1, lines: [{ speaker: 'rep', text: 'hi' }, { speaker: 'prospect', text: 'yo' }] });
    const segments = turns.map((t) => segFor(t));
    const mixed = mixStereoTracks(turns, segments);
    const wav = encodeWavStereo(mixed);
    const decoded = decodeWav(wav);
    assert.equal(decoded.numChannels, 2);
    // rep's 2 samples (channel 0 / left) should be 1000, prospect's 2 (channel 1 / right) -1000
    for (let i = 0; i < 2; i++) assert.equal(decoded.data.readInt16LE(i * 4), 1000);
    for (let i = 2; i < 4; i++) assert.equal(decoded.data.readInt16LE(i * 4 + 2), -1000);
  });
});

// ── CLI helpers ──────────────────────────────────────────────────────────

describe('CLI helpers', () => {
  test('parseArgs reads --force and --dry-run flags independently', () => {
    assert.deepEqual(parseArgs([]), { force: false, dryRun: false });
    assert.deepEqual(parseArgs(['--force']), { force: true, dryRun: false });
    assert.deepEqual(parseArgs(['--dry-run']), { force: false, dryRun: true });
    assert.deepEqual(parseArgs(['--force', '--dry-run']), { force: true, dryRun: true });
  });
});

// ── live round trip — OFF by default, no network in the normal test run ──
// Set OG_LIVE_TTS_TEST=1 to exercise one real /audio/speech call against the
// live PyAI key (near-zero spend: a two-word utterance).

describe('live round trip (env-gated)', () => {
  test(
    'speak() returns a real 24kHz mono WAV for a short line',
    { skip: process.env.OG_LIVE_TTS_TEST !== '1' ? 'set OG_LIVE_TTS_TEST=1 to run against the live API' : false },
    async () => {
      const { pyaiFetch } = await import('../src/pyai.js');
      const res = await pyaiFetch('/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'pyai-voice', voice: 'stock_arjun_en_in', input: 'hi', response_format: 'wav' }),
      });
      const decoded = decodeWav(Buffer.from(await res.arrayBuffer()));
      assert.equal(decoded.numChannels, 1);
      assert.equal(decoded.sampleRate, 24000);
      assert.ok(decoded.data.length > 0);
    },
  );
});
