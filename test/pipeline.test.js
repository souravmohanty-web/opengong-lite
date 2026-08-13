import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildTranscript } from '../src/transcript.js';
import { readJson } from '../src/store.js';
import { loadExtractors, DEFAULT_SCHEMAS_DIR } from '../src/registry.js';
import { DEFAULT_EXTRACTORS_DIR } from '../src/extract.js';
import { EXTRACTION_MODES, DETERMINISTIC_NOTE } from '../src/fallback.js';
import {
  resolveSource, runFromTranscript, ingestAndRun,
} from '../scripts/pipeline.mjs';

// The end-to-end command this proves: ingest -> buildTranscript -> extraction
// (real LLM or keyless fallback) -> gate + injection screen -> buildBundle ->
// composeEmail. Every stage is the REAL module (src/gate.js, src/injection.js,
// src/bundle.js, src/email.js) — nothing here reimplements verification.

function tmpRunsRoot() {
  return mkdtempSync(path.join(tmpdir(), 'opengong-pipeline-'));
}

// Real 3-utterance stereo shape (mirrors test/run.test.js's fixture): rep
// intro (compliance/dialer), buyer price objection naming RingHawk, rep
// next step. Deliberately hits multiple extractors/tracker.json keywords
// ("compliance", "dialer", "pricing", "competitor", "ringhawk", "answering
// machine detection") so the deterministic fallback has real work to do.
const RAW_RESULT = {
  words: [], speakers: 2, audio_seconds: 17,
  segments: [
    { id: 0, start: 0, end: 5.44, speaker: 'speaker_1', channel: 0, text: 'hi rahul thanks for taking the time today i wanted to walk you through how our dialer handles compliance' },
    { id: 1, start: 6.08, end: 12.16, speaker: 'speaker_2', channel: 1, text: 'honestly my main concern is pricing your competitor quoted ringhawk as almost forty less last week' },
    { id: 2, start: 12.48, end: 16.88, speaker: 'speaker_1', channel: 0, text: 'that is fair let me show you the total cost picture including answering machine detection' },
  ],
};
const T = buildTranscript(RAW_RESULT);

// ── resolveSource ─────────────────────────────────────────────────────────────

test('PIPE-01 resolveSource: http(s) becomes audioUrl, everything else an absolute filePath', () => {
  assert.deepEqual(resolveSource('https://example.com/call.wav'), { audioUrl: 'https://example.com/call.wav' });
  assert.deepEqual(resolveSource('http://example.com/call.wav'), { audioUrl: 'http://example.com/call.wav' });
  const local = resolveSource('samples/audio/call-01.wav');
  assert.ok(path.isAbsolute(local.filePath));
  assert.ok(local.filePath.endsWith(path.join('samples', 'audio', 'call-01.wav')));
});

test('PIPE-02 resolveSource rejects a missing argument', () => {
  assert.throws(() => resolveSource(undefined), /usage:/);
});

// ── (b) + (c): keyless fallback -> deterministic tracker claims, honestly
// labeled, and still gate-verified ───────────────────────────────────────────

test('PIPE-03 no ANTHROPIC_API_KEY: deterministic-trackers-only, every claim from the tracker family, honestly labeled everywhere', async () => {
  const runsRoot = tmpRunsRoot();
  const { record, plan, bundle, email } = await runFromTranscript({
    transcript: T, callId: 'keyless-call', runsRoot, env: {}, // no key anywhere in this env
  });

  // mode selection is honest and named
  assert.equal(plan.mode, EXTRACTION_MODES.DETERMINISTIC_TRACKERS_ONLY);
  assert.equal(plan.note, DETERMINISTIC_NOTE);
  assert.ok(plan.extractorsSkipped.length >= 6, 'every LLM extractor family must be named as skipped, not silently dropped');
  assert.ok(!plan.extractorsSkipped.includes('tracker'), 'the tracker itself is never "skipped" — it is what ran');

  // never fabricated: deterministic mode produces ONLY tracker claims
  assert.ok(bundle.claims.length > 0, 'the tracker family must produce something without a key — that is the whole point of the fallback');
  assert.ok(bundle.claims.every((c) => c.extractor === 'tracker'), 'deterministic mode must never produce a non-tracker claim');

  // the honesty label reaches every artifact a human or downstream system reads
  assert.equal(bundle.provenance.extraction_mode, EXTRACTION_MODES.DETERMINISTIC_TRACKERS_ONLY);
  assert.equal(bundle.provenance.extraction_note, DETERMINISTIC_NOTE);
  const runJson = readJson(path.join(runsRoot, record.run_id, 'run.json'));
  assert.equal(runJson.extraction_mode, EXTRACTION_MODES.DETERMINISTIC_TRACKERS_ONLY);
  assert.equal(runJson.extraction_note, DETERMINISTIC_NOTE);
  assert.ok(runJson.extractors_skipped_no_key.length >= 6);
  assert.ok(!runJson.extractors_skipped_no_key.includes('tracker'));

  // (c) the deterministic output still passes the REAL gate, not a rubber stamp:
  // tracker claims quote the whole utterance verbatim, so every one verifies.
  assert.ok(bundle.claims.every((c) => c.status === 'verified'), 'deterministic claims must still be gate-verified, not waved through');
  assert.equal(record.exit_reason, 'SHIPPED');

  // composeEmail ran from the bundle's gated claims (not the transcript) and
  // only cites claims that are actually in the bundle as verified.
  assert.ok(email);
  assert.ok(email.bullets.length > 0);
  for (const b of email.bullets) {
    assert.ok(bundle.claims.some((c) => c.id === b.claim_id && c.status === 'verified'));
  }
  assert.equal(email.cut, 0);

  const emailOnDisk = readJson(path.join(runsRoot, record.run_id, 'email.json'));
  assert.deepEqual(emailOnDisk, email);

  rmSync(runsRoot, { recursive: true, force: true });
});

test('PIPE-04 deterministic fallback never calls an LLM (callLlmOverride, if passed, must be untouched)', async () => {
  const runsRoot = tmpRunsRoot();
  let calls = 0;
  const callLlmOverride = async () => { calls += 1; throw new Error('the keyless path must never call an LLM'); };
  const { plan } = await runFromTranscript({
    transcript: T, callId: 'keyless-no-call', runsRoot, env: {}, callLlmOverride,
  });
  assert.equal(plan.mode, EXTRACTION_MODES.DETERMINISTIC_TRACKERS_ONLY);
  assert.equal(calls, 0);
  rmSync(runsRoot, { recursive: true, force: true });
});

// ── (a) full chain, LLM mode: extraction -> gate -> bundle -> email ─────────

function makeSubsetCallLlm(defs) {
  const OBJECTIONS_JSON = JSON.stringify({
    objections: [{
      evidence: [{ utterance_id: 1, quote: 'honestly my main concern is pricing your competitor quoted ringhawk as almost forty less last week' }],
      text: 'honestly my main concern is pricing your competitor quoted ringhawk as almost forty less last week',
      category: 'price',
      handling: 'addressed',
      objection_status: 'left_open',
      rep_response: null,
    }],
  });
  const SUMMARY_JSON = JSON.stringify({
    sections: [
      { title: 'Outcome', blocks: [{ evidence: [{ utterance_id: 0, quote: 'i wanted to walk you through how our dialer handles compliance' }], text: 'Rep walked the buyer through compliance handling.' }] },
      { title: 'Next steps', blocks: [{ evidence: [{ utterance_id: 2, quote: 'let me show you the total cost picture including answering machine detection' }], text: 'Rep to show the total cost picture.' }] },
    ],
  });
  const bySchema = new Map();
  for (const def of defs) {
    if (def.role === 'tracker') continue;
    const text = def.name === 'objections' ? OBJECTIONS_JSON
      : def.name === 'summary' ? SUMMARY_JSON
        : null;
    if (!text) throw new Error(`test fixture has no canned response for extractor "${def.name}"`);
    bySchema.set(JSON.stringify(def.output_schema), text);
  }
  return async ({ schema }) => {
    const text = bySchema.get(JSON.stringify(schema));
    if (!text) throw new Error('no canned response for this schema — unexpected extractor in the test subset');
    return {
      text, stop_reason: 'end_turn', model: 'fixture',
      usage: { input_tokens: 500, output_tokens: 100, cache_creation_input_tokens: 500, cache_read_input_tokens: 0 },
    };
  };
}

test('PIPE-05 full chain with ANTHROPIC_API_KEY present: real extraction path, gate-verified bundle + composed email', async () => {
  const runsRoot = tmpRunsRoot();
  const registry = loadExtractors(DEFAULT_EXTRACTORS_DIR, { schemasDir: DEFAULT_SCHEMAS_DIR });
  const subset = ['objections', 'summary', 'tracker'].map((n) => registry[n]);
  const callLlmOverride = makeSubsetCallLlm(subset);

  const { record, plan, bundle, email } = await runFromTranscript({
    transcript: T, callId: 'llm-call', runsRoot,
    env: { ANTHROPIC_API_KEY: 'sk-ant-test-fixture-key' },
    extractorDefsOverride: subset, callLlmOverride,
  });

  assert.equal(plan.mode, EXTRACTION_MODES.LLM);
  assert.equal(plan.extractorsSkipped.length, 0);
  assert.equal(bundle.provenance.extraction_mode, EXTRACTION_MODES.LLM);
  assert.equal(bundle.provenance.extraction_note, undefined, 'a real-LLM run must never carry the keyless-fallback note');

  const extractors = new Set(bundle.claims.map((c) => c.extractor));
  assert.ok(extractors.has('objections'));
  assert.ok(extractors.has('summary'));
  assert.ok(extractors.has('tracker'));
  assert.ok(bundle.claims.every((c) => c.status === 'verified'), 'every quote in this fixture is copied verbatim from the transcript');
  assert.equal(record.exit_reason, 'SHIPPED');

  assert.ok(email);
  assert.ok(email.bullets.length > 0);
  assert.equal(email.cut, 0);

  rmSync(runsRoot, { recursive: true, force: true });
});

// ── ingest wiring: the piece that was missing — ingestAndRun actually calls
// the injected ingest function, then runs the SAME chain proven above ───────

test('PIPE-06 ingestAndRun wires ingest() -> the full chain: a fixture-backed ingestFn (standing in for submitJob+pollJob) produces a bundle + email with zero network', async () => {
  const runsRoot = tmpRunsRoot();
  const fixtureRaw = JSON.parse(
    readFileSync(new URL('../research/00-api-probe/stereo_result.json', import.meta.url), 'utf8'),
  );
  let ingestCalls = 0;
  let seenSource;
  const ingestFn = async (source) => {
    ingestCalls += 1;
    seenSource = source;
    // Stands in for src/ingest.js's real submitJob -> pollJob round trip:
    // same return shape ({ job_id, transcript }), built from a committed
    // fixture instead of a live PyAI call.
    return { job_id: 'job_fixture_001', transcript: buildTranscript(fixtureRaw.result) };
  };

  const { job_id, record, plan, bundle, email } = await ingestAndRun({
    source: { filePath: '/tmp/does-not-need-to-exist.wav' },
    callId: 'wired-call', runsRoot, env: {}, ingestFn,
  });

  assert.equal(ingestCalls, 1);
  assert.deepEqual(seenSource, { filePath: '/tmp/does-not-need-to-exist.wav' });
  assert.equal(job_id, 'job_fixture_001');
  assert.equal(plan.mode, EXTRACTION_MODES.DETERMINISTIC_TRACKERS_ONLY); // no key in env
  assert.ok(bundle.claims.length > 0);
  assert.ok(bundle.claims.every((c) => c.extractor === 'tracker'));
  assert.equal(record.exit_reason, 'SHIPPED');
  assert.ok(email.bullets.length > 0);

  rmSync(runsRoot, { recursive: true, force: true });
});

test('PIPE-07 a run with nothing verifiable (no tracker hits, no key) still ships an honest empty result — never fabricates a claim', async () => {
  const runsRoot = tmpRunsRoot();
  const quiet = buildTranscript({
    words: [], speakers: 1, audio_seconds: 3,
    segments: [{ id: 0, start: 0, end: 2, speaker: 'speaker_1', channel: 0, text: 'good morning everyone' }],
  });
  const { bundle, email, record } = await runFromTranscript({
    transcript: quiet, callId: 'quiet-call', runsRoot, env: {},
  });
  assert.equal(bundle.claims.length, 0, 'no tracker keyword hit -> zero claims, never invented');
  assert.equal(bundle.provenance.extraction_mode, EXTRACTION_MODES.DETERMINISTIC_TRACKERS_ONLY);
  assert.equal(email.bullets.length, 0);
  assert.ok(['SHIPPED', 'PARTIAL_LOW_COVERAGE'].includes(record.exit_reason));
  rmSync(runsRoot, { recursive: true, force: true });
});
