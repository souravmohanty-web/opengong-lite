#!/usr/bin/env node
// Sample-call generation pipeline (Slice 3): samples/calls/NN-*.json scripts →
// real stereo audio (PyAI Speak) → real PyAI transcripts (PyAI Hear, batch
// jobs, channel diarization) → samples/audio/call-NN.wav + samples/transcripts/NN.raw.json,
// ready for extraction (buildTranscript() in src/transcript.js consumes the
// saved raw job response's `.result`).
//
// Interface this expects from samples/calls/NN-*.json (content team's
// structured format — see team/SYNC.md format-change note):
//   { call: int, title: string, planted: [string, ...],
//     lines: [{ speaker: "rep"|"prospect", text: string }, ...] }
// See scripts/lib/tts.mjs#parseCallData.
//
// Deliberately fully SERIAL (one TTS call at a time, one call-file at a time):
// well under the 20rps/10-concurrency cap (research/00 addendum 15), and it
// keeps the per-speaker voice-fallback index (research/00 addendum 9) from
// racing across concurrently in-flight turns. "serialize or small-pool" is
// explicitly the sanctioned choice, not a shortcut.
//
// Named exits (mirrors src/pyai.js's named-error convention):
//   0  success
//   1  a PyAI/script error that isn't budget/daily-cap (see stderr for [NAME])
//   3  PYAI_BUDGET_EXCEEDED — 402, the $10 live-key cap was hit
//   4  PYAI_DAILY_CAP — 429s exhausted a retryable window (sandbox daily cap)

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pyaiFetch, PyAiError } from '../src/pyai.js';
import { pollJob } from '../src/ingest.js';
import {
  parseCallData,
  buildVoiceCandidates,
  speakWithFallback,
  mixStereoTracks,
  encodeWavStereo,
  decodeWav,
} from './lib/tts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
export const SAMPLES_DIR = path.join(ROOT, 'samples');
export const CALLS_DIR = path.join(SAMPLES_DIR, 'calls');
export const AUDIO_DIR = path.join(SAMPLES_DIR, 'audio');
export const TRANSCRIPTS_DIR = path.join(SAMPLES_DIR, 'transcripts');

// A short two-line call, one turn per speaker — used only by --dry-run to
// prove the full round trip (Speak → mix → stereo WAV → Hear job → poll)
// against the live API on near-zero text, per the build brief's spend cap.
const DRY_RUN_CALL = {
  call: 0,
  title: 'dry-run',
  planted: [],
  lines: [
    { speaker: 'rep', text: 'Hi, quick test.' },
    { speaker: 'prospect', text: 'Copy that.' },
  ],
};

export function parseArgs(argv) {
  return { force: argv.includes('--force'), dryRun: argv.includes('--dry-run') };
}

async function loadVoiceCandidates() {
  const res = await pyaiFetch('/voices');
  const data = await res.json();
  return buildVoiceCandidates(data.data ?? []);
}

async function speak(text, voiceId) {
  const res = await pyaiFetch('/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'pyai-voice', voice: voiceId, input: text, response_format: 'wav' }),
  });
  return decodeWav(Buffer.from(await res.arrayBuffer()));
}

// Synthesizes every turn in order, in place, tracking each speaker's current
// working voice index across turns (a fallback sticks, per addendum 9).
async function synthesizeCall(turns, candidates) {
  const voiceIdx = { rep: 0, prospect: 0 };
  const usedVoices = { rep: null, prospect: null };
  const segments = [];
  for (const turn of turns) {
    const role = turn.speaker;
    const result = await speakWithFallback({
      text: turn.text,
      candidates: candidates[role],
      startIndex: voiceIdx[role],
      speak,
    });
    voiceIdx[role] = result.voiceIndex;
    usedVoices[role] = result.voiceId;
    segments.push(result);
  }
  return { segments, usedVoices };
}

// research/00 addendum 11/13: channel + diarize (NOT "diarization") is the
// param that actually splits speakers; numerals folds spoken numbers to
// digits in the transcript text.
async function submitAndTranscribe(wavBuffer) {
  const form = new FormData();
  form.set('model', 'pyai-hear-telephony');
  form.set('channel', 'true');
  form.set('diarize', 'true');
  form.set('numerals', 'true');
  form.set('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'call.wav');
  const submitRes = await pyaiFetch('/transcription/jobs', { method: 'POST', body: form });
  const { job_id } = await submitRes.json();
  return pollJob(job_id);
}

async function synthesizeAndTranscribe(callData) {
  const { callId, turns } = callData;
  const candidates = await loadVoiceCandidates();
  const { segments, usedVoices } = await synthesizeCall(turns, candidates);
  const mixed = mixStereoTracks(turns, segments); // rep=left(0), prospect=right(1)
  const wav = encodeWavStereo(mixed);
  const job = await submitAndTranscribe(wav);
  return {
    callId,
    wav,
    job,
    ttsSeconds: mixed.ttsSeconds,
    hearSeconds: job.result?.audio_seconds ?? null,
    speakers: job.result?.speakers ?? null,
    usedVoices,
  };
}

async function processCall(filePath, { force }) {
  const filename = path.basename(filePath);
  const raw = await readFile(filePath, 'utf8');
  const callData = parseCallData(raw);
  const { callId } = callData;
  const audioPath = path.join(AUDIO_DIR, `call-${callId}.wav`);
  const transcriptPath = path.join(TRANSCRIPTS_DIR, `${callId}.raw.json`);
  if (!force && existsSync(audioPath) && existsSync(transcriptPath)) {
    return { callId, skipped: true };
  }

  const result = await synthesizeAndTranscribe(callData);

  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(audioPath, result.wav);
  await mkdir(TRANSCRIPTS_DIR, { recursive: true });
  await writeFile(transcriptPath, JSON.stringify(result.job, null, 2));

  return {
    callId,
    skipped: false,
    filename,
    ttsSeconds: result.ttsSeconds,
    hearSeconds: result.hearSeconds,
    speakers: result.speakers,
    usedVoices: result.usedVoices,
  };
}

function handleFatal(err, label) {
  if (err instanceof PyAiError) {
    const status = err.problem?.status;
    if (status === 402) {
      console.error(`[${label}] PYAI_BUDGET_EXCEEDED — ${err.message}`);
      process.exit(3);
    }
    if (err.name === 'PYAI_DAILY_CAP') {
      console.error(`[${label}] ${err.name} — ${err.message}`);
      process.exit(4);
    }
    console.error(`[${label}] [${err.name}] ${err.message}`);
    process.exit(1);
  }
  console.error(`[${label}] ${err?.stack || err}`);
  process.exit(1);
}

async function runDryRun() {
  console.error('[dry-run] proving Speak -> stereo mix -> Hear round trip on one short line per speaker');
  const callData = parseCallData(DRY_RUN_CALL);
  const result = await synthesizeAndTranscribe(callData);

  await mkdir(AUDIO_DIR, { recursive: true });
  const audioPath = path.join(AUDIO_DIR, '_dry-run.wav');
  await writeFile(audioPath, result.wav);

  await mkdir(TRANSCRIPTS_DIR, { recursive: true });
  const transcriptPath = path.join(TRANSCRIPTS_DIR, '_dry-run.raw.json');
  await writeFile(transcriptPath, JSON.stringify(result.job, null, 2));

  console.error(
    `[dry-run] OK — voices=${JSON.stringify(result.usedVoices)} tts=${result.ttsSeconds.toFixed(2)}s ` +
    `hear=${(result.hearSeconds ?? 0).toFixed(2)}s speakers=${result.speakers}`,
  );
  console.error(`[dry-run] wrote ${audioPath}`);
  console.error(`[dry-run] wrote ${transcriptPath}`);
}

async function main() {
  const { force, dryRun } = parseArgs(process.argv.slice(2));
  if (dryRun) {
    await runDryRun();
    return;
  }

  const entries = await readdir(CALLS_DIR).catch(() => []);
  const files = entries
    .filter((f) => /\.json$/i.test(f))
    .sort()
    .map((f) => path.join(CALLS_DIR, f));

  if (files.length === 0) {
    console.error(`no samples/calls/*.json files found in ${CALLS_DIR} — nothing to generate yet`);
    return;
  }

  let totalTts = 0;
  let totalHear = 0;
  let done = 0;
  let skipped = 0;
  for (const file of files) {
    const label = path.basename(file);
    let result;
    try {
      result = await processCall(file, { force });
    } catch (err) {
      handleFatal(err, label);
      return; // unreachable (handleFatal exits), keeps linters happy
    }
    if (result.skipped) {
      skipped += 1;
      console.error(`[skip] call-${result.callId} (${label}) — audio+transcript already exist (--force to redo)`);
      continue;
    }
    done += 1;
    totalTts += result.ttsSeconds;
    totalHear += result.hearSeconds ?? 0;
    console.error(
      `[done] call-${result.callId} (${label}) -> call-${result.callId}.wav — tts=${result.ttsSeconds.toFixed(2)}s ` +
      `hear=${(result.hearSeconds ?? 0).toFixed(2)}s speakers=${result.speakers} voices=${JSON.stringify(result.usedVoices)}`,
    );
  }

  console.error(
    `\n${done} generated, ${skipped} skipped. ` +
    `TOTAL TTS seconds: ${totalTts.toFixed(2)} · TOTAL Hear seconds: ${totalHear.toFixed(2)}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
