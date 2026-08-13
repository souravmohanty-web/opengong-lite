import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { pyaiFetch, PyAiError } from './pyai.js';
import { buildTranscript } from './transcript.js';

// Ingest (L1): upload → batch job → poll → canonical transcript.
// The sync endpoint is a toy; batch jobs API only.

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.webm']);
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export async function validateUpload(filePath) {
  const name = basename(filePath); // strips any traversal; we never echo raw paths
  if (!AUDIO_EXTENSIONS.has(extname(name).toLowerCase())) {
    throw new PyAiError('UPLOAD_REJECTED', `unsupported audio type: ${extname(name) || '(none)'}`);
  }
  const { size } = await stat(filePath);
  if (size > MAX_UPLOAD_BYTES) {
    throw new PyAiError('UPLOAD_REJECTED', `file exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB cap`);
  }
  return { name, size };
}

export async function submitJob({ filePath, audioUrl }) {
  if (!filePath === !audioUrl) {
    throw new PyAiError('UPLOAD_REJECTED', 'exactly one audio source required: filePath or audioUrl');
  }
  const form = new FormData();
  form.set('model', 'pyai-hear');
  if (filePath) {
    const { name } = await validateUpload(filePath);
    form.set('file', await openAsBlob(filePath), name);
  } else {
    form.set('audio_url', audioUrl);
  }
  const res = await pyaiFetch('/transcription/jobs', { method: 'POST', body: form });
  return res.json(); // { job_id, status: 'queued' }
}

// Timeout scales with how much audio the job has to chew through; the byte
// estimate deliberately errs long (longer timeout is the safe direction).
export function estimateAudioSeconds(bytes) {
  return Math.ceil(bytes / 16_000);
}

export function pollTimeoutMs(estimatedAudioSeconds = 0) {
  return 120_000 + estimatedAudioSeconds * 2000;
}

export async function pollJob(jobId, { intervalMs = 2000, timeoutMs = pollTimeoutMs() } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await pyaiFetch(`/transcription/jobs/${jobId}`);
    const job = await res.json();
    if (job.status === 'completed') return job;
    if (job.status === 'failed' || job.status === 'error') {
      throw new PyAiError('PYAI_JOB_FAILED', `job ${jobId} failed`, job);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new PyAiError('PYAI_JOB_TIMEOUT', `job ${jobId} still not done after ${timeoutMs / 1000}s`);
}

export async function ingest(source) {
  let estimatedSeconds = 0;
  if (source.filePath) {
    const { size } = await stat(source.filePath);
    estimatedSeconds = estimateAudioSeconds(size);
  }
  const { job_id } = await submitJob(source);
  const job = await pollJob(job_id, { timeoutMs: pollTimeoutMs(estimatedSeconds) });
  return { job_id, transcript: buildTranscript(job.result) };
}

// CLI: node src/ingest.js <audio-file>  → canonical transcript JSON on stdout
if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('usage: node src/ingest.js <audio-file>');
    process.exit(2);
  }
  ingest({ filePath })
    .then(({ job_id, transcript }) => {
      console.error(`job ${job_id} → ${transcript.mode}, ${transcript.utterances.length} utterances, ${transcript.speakers} speaker(s)`);
      console.log(JSON.stringify(transcript, null, 2));
    })
    .catch((err) => {
      console.error(err instanceof PyAiError ? `[${err.name}] ${err.message}` : err);
      process.exit(1);
    });
}
