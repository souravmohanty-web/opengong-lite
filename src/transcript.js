import { createHash } from 'node:crypto';

// Canonical transcript builder (L1–L4). Pure: job result in, transcript out.
// Canonical text is joined from segments[]/words[] — NEVER result.text, which
// normalizes numbers differently in the same response ("40" vs "forty", F-21).

const PAUSE_GAP_S = 0.6;   // mono utterance split on silence (L3)
const MAX_UTT_WORDS = 40;  // hard max-length split (L3)

export function buildTranscript(result) {
  const diarized = (result.speakers ?? 1) >= 2
    && (result.segments ?? []).some((s) => s.speaker != null);
  const utterances = diarized
    ? diarizedUtterances(result)
    : monoUtterances(result);

  const canonical_text = utterances.map((u) => u.text).join('\n');
  return {
    mode: diarized ? 'diarized' : 'mono',
    speakers: result.speakers ?? 1,
    audio_seconds: result.audio_seconds ?? null,
    utterances,
    canonical_text,
    transcript_hash: 'sha256:' + createHash('sha256').update(canonical_text).digest('hex'),
  };
}

// Stereo happy path: API segments are speaker-labeled (channel-based
// diarization) and provide the boundaries — but a segment is not automatically
// an utterance: a long monologue segment still splits at the word cap (A-007),
// and segments can arrive out of time order, so the final list is time-sorted
// with ids reassigned.
function diarizedUtterances(result) {
  const words = result.words ?? [];
  const utterances = [];
  for (const seg of result.segments ?? []) {
    const segWords = words.filter((w) =>
      (w.speaker ?? null) === (seg.speaker ?? null)
      && w.start >= seg.start && w.end <= seg.end);
    const base = {
      speaker: seg.speaker ?? null,
      channel: seg.channel ?? null,
      role: null,             // Rep/Prospect inference is the extraction phase's job
      role_confidence: null,
    };
    if (!segWords.length) {
      utterances.push({ ...base, start: seg.start, end: seg.end, text: seg.text });
      continue;
    }
    for (let i = 0; i < segWords.length; i += MAX_UTT_WORDS) {
      const chunk = segWords.slice(i, i + MAX_UTT_WORDS);
      utterances.push({
        ...base,
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        text: joinWords(chunk),
      });
    }
  }
  utterances.sort((a, b) => a.start - b.start);
  return utterances.map((u, i) => ({ id: i, ...u }));
}

// Mono degraded path (L3): the API returns one coarse segment, so we build our
// own utterance layer from words[] — split on pause gap, plus a hard length cap.
// No speaker labels are invented here; roles arrive later with confidence.
function monoUtterances(result) {
  const words = result.words ?? [];
  if (!words.length) {
    return (result.segments ?? []).map((seg, i) => ({
      id: i, start: seg.start, end: seg.end,
      speaker: null, channel: null, role: null, role_confidence: null,
      text: seg.text,
    }));
  }

  const groups = [];
  let current = [];
  for (const word of words) {
    const prev = current[current.length - 1];
    if (current.length && (word.start - prev.end > PAUSE_GAP_S || current.length >= MAX_UTT_WORDS)) {
      groups.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length) groups.push(current);

  return groups.map((group, i) => ({
    id: i,
    start: group[0].start,
    end: group[group.length - 1].end,
    speaker: null,
    channel: null,
    role: null,
    role_confidence: null,
    text: joinWords(group),
  }));
}

function joinWords(words) {
  return words.map((w) => w.word).join(' ');
}
