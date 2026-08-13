// Pure helpers for the sample-call generation pipeline (Slice 3 content):
// samples/calls/NN-*.json → real stereo audio + real PyAI transcripts.
// Everything here is synchronous/deterministic except speakWithFallback's
// injected `speak` callback — that split is what lets the mixer + parser +
// fallback-walk get unit-tested with zero network (test/generate-samples.test.js).
//
// Ground truth this file builds on (do not relearn):
//   research/00-api-probe/FINDINGS.md addendum 11 — diarization is CHANNEL-based:
//     stereo, one speaker per channel, submitted to /v1/transcription/jobs, is the
//     only path that produces real speaker-split segments. Mono never splits.
//   research/00-api-probe/FINDINGS.md addendum 9 — per-voice TTS availability is
//     flaky (upstream_error); sample generation needs a fallback voice walk.
//   research/00-api-probe/FINDINGS.md addendum 13 — async job params are
//     `channel`, `diarize` (NOT `diarization`), `numerals`.

// ── script parsing (samples/calls/NN-*.json → structured turns) ────────────

// Interface (content team's structured format, superseding the earlier
// Rep:/Prospect: markdown draft — see team/SYNC.md format-change note):
//   { call: int, title: string, planted: [string, ...], lines: [{speaker, text}, ...] }
// speaker is exactly "rep" or "prospect" already — no text parsing needed,
// just validation. callId is the zero-padded call number ("1" -> "01"),
// matching the source filenames (01-discovery.json, …, 06-messy.json).
export function parseCallData(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Number.isInteger(data?.call)) {
    throw new Error('parseCallData: missing/non-integer "call" field');
  }
  if (!Array.isArray(data?.lines) || data.lines.length === 0) {
    throw new Error(`parseCallData: call ${data.call} has no "lines"`);
  }
  const turns = data.lines.map((line, i) => {
    if (line?.speaker !== 'rep' && line?.speaker !== 'prospect') {
      throw new Error(`parseCallData: call ${data.call} line ${i} — speaker must be "rep" or "prospect", got ${JSON.stringify(line?.speaker)}`);
    }
    const text = String(line?.text ?? '').trim();
    if (!text) throw new Error(`parseCallData: call ${data.call} line ${i} — empty text`);
    return { speaker: line.speaker, text };
  });
  return {
    callId: String(data.call).padStart(2, '0'),
    title: data.title ?? null,
    planted: Array.isArray(data.planted) ? data.planted : [],
    turns,
  };
}

// ── voice catalog selection (GET /v1/voices → gendered candidate lists) ────

// research/00 addendum 9: at least one stock voice has been observed flaky
// (upstream_error). Named here so it's never picked as a PRIMARY voice; the
// fallback walk below still protects against voices that go flaky later.
export const KNOWN_FLAKY_VOICES = new Set(['stock_amos_en_us']);

export function filterEnVoices(voiceCatalog) {
  return (voiceCatalog ?? []).filter(
    (v) => v?.language === 'en' && v?.voice_id && !KNOWN_FLAKY_VOICES.has(v.voice_id),
  );
}

// rep gets the male candidate list, prospect the female one (gendered +
// distinct by construction) — each list is itself the fallback walk order.
export function buildVoiceCandidates(voiceCatalog) {
  const en = filterEnVoices(voiceCatalog)
    .slice()
    .sort((a, b) => a.voice_id.localeCompare(b.voice_id));
  const rep = en.filter((v) => v.gender === 'M').map((v) => v.voice_id);
  const prospect = en.filter((v) => v.gender === 'F').map((v) => v.voice_id);
  if (rep.length === 0 || prospect.length === 0) {
    throw new Error('voice catalog has no usable en/M or en/F voice (after excluding known-flaky ids)');
  }
  return { rep, prospect };
}

// ── voice fallback walk (research/00 addendum 9) ────────────────────────────

// Treat 5xx and any body mentioning upstream_error/unavailable as a voice-side
// fault worth walking past. Anything else (auth, budget, daily cap, 4xx
// input errors) is real and must propagate, not get masked by a voice swap.
export function isUpstreamError(err) {
  const status = err?.problem?.status;
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  const blob = `${JSON.stringify(err?.problem ?? {})} ${err?.message ?? ''}`.toLowerCase();
  return blob.includes('upstream_error') || blob.includes('unavailable');
}

// speak(text, voiceId) -> Promise<{ data, sampleRate, numChannels, bitsPerSample }>
// Starts at candidates[startIndex] (caller remembers the last-good index per
// speaker across turns, so a fallback sticks instead of re-trying the bad
// voice every turn) and walks forward on isUpstreamError until success or the
// list is exhausted.
export async function speakWithFallback({ text, candidates, startIndex = 0, speak }) {
  let idx = startIndex;
  if (idx >= candidates.length) throw new Error('speakWithFallback: startIndex past end of candidates');
  for (;;) {
    const voiceId = candidates[idx];
    try {
      const seg = await speak(text, voiceId);
      return { ...seg, voiceId, voiceIndex: idx };
    } catch (err) {
      const hasNext = idx < candidates.length - 1;
      if (isUpstreamError(err) && hasNext) {
        idx += 1;
        continue;
      }
      throw err;
    }
  }
}

// ── WAV: minimal RIFF/PCM decode + stereo encode (zero deps) ───────────────

export function decodeWav(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('decodeWav: not a RIFF/WAVE buffer');
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(body),
        numChannels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        byteRate: buffer.readUInt32LE(body + 8),
        blockAlign: buffer.readUInt16LE(body + 12),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (chunkId === 'data') {
      data = buffer.subarray(body, body + chunkSize);
    }
    offset = body + chunkSize + (chunkSize % 2); // chunks are padded to even size
  }
  if (!fmt) throw new Error('decodeWav: missing fmt chunk');
  if (!data) throw new Error('decodeWav: missing data chunk');
  return { ...fmt, data };
}

// left/right: raw PCM Buffers for two MONO tracks of equal byte length
// (mixStereoTracks below guarantees this). Byte-copies sample-width chunks,
// so it's correct for any bitsPerSample without interpreting sample values.
export function encodeWavStereo({ sampleRate, left, right, bitsPerSample = 16 }) {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new Error('encodeWavStereo: bad sampleRate');
  if (left.length !== right.length) {
    throw new Error(`encodeWavStereo: channel length mismatch — left=${left.length} right=${right.length}`);
  }
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = left.length / bytesPerSample;
  if (!Number.isInteger(numSamples)) throw new Error('encodeWavStereo: buffer length not aligned to sample size');
  const numChannels = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const srcOff = i * bytesPerSample;
    const dstOff = 44 + i * blockAlign;
    left.copy(buf, dstOff, srcOff, srcOff + bytesPerSample);
    right.copy(buf, dstOff + bytesPerSample, srcOff, srcOff + bytesPerSample);
  }
  return buf;
}

// ── the stereo mixer: turns + per-turn TTS segments → two time-aligned mono tracks ──

// turns[i] = { speaker: 'rep'|'prospect', text }; segments[i] = the decoded
// mono WAV for that turn ({ data, sampleRate, numChannels, bitsPerSample }).
// Rep speaks -> left gets the real audio, right gets equal-length silence
// (zero-filled = silence for signed PCM), and vice versa for Prospect — so
// left.length === right.length always (time alignment) and encodeWavStereo's
// equal-length requirement is satisfied by construction.
export function mixStereoTracks(turns, segments) {
  if (turns.length !== segments.length) throw new Error('mixStereoTracks: turns/segments length mismatch');
  if (turns.length === 0) throw new Error('mixStereoTracks: no turns to mix');
  const sampleRate = segments[0].sampleRate;
  const bitsPerSample = segments[0].bitsPerSample ?? 16;
  const bytesPerSample = bitsPerSample / 8;
  const leftChunks = [];
  const rightChunks = [];
  let ttsSamples = 0;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const seg = segments[i];
    if (seg.sampleRate !== sampleRate) {
      throw new Error(`mixStereoTracks: sample rate mismatch at turn ${i} (${seg.sampleRate} vs ${sampleRate})`);
    }
    if ((seg.numChannels ?? 1) !== 1) {
      throw new Error(`mixStereoTracks: turn ${i} TTS segment is not mono (numChannels=${seg.numChannels})`);
    }
    const silence = Buffer.alloc(seg.data.length); // Buffer.alloc zero-fills
    if (turn.speaker === 'rep') {
      leftChunks.push(seg.data);
      rightChunks.push(silence);
    } else if (turn.speaker === 'prospect') {
      leftChunks.push(silence);
      rightChunks.push(seg.data);
    } else {
      throw new Error(`mixStereoTracks: turn ${i} has unknown speaker "${turn.speaker}"`);
    }
    ttsSamples += seg.data.length / bytesPerSample;
  }
  return {
    left: Buffer.concat(leftChunks),
    right: Buffer.concat(rightChunks),
    sampleRate,
    bitsPerSample,
    ttsSeconds: ttsSamples / sampleRate,
  };
}
