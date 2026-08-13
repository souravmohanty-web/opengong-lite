import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gateClaim, gradeRun } from '../src/gate.js';
import { pyaiFetch, PyAiError } from '../src/pyai.js';

// SCORECARD 2.7 — the honest degradation ladder (master-plan.md §2.7): mono
// audio gets inferred roles LABELED as inferred (never invented, never
// silently treated as ground truth); noisy audio gets its lower coverage
// SAID OUT LOUD (the band, never hidden); non-English gets a clear,
// distinguishable refusal. "Never silent garbage" is the pass bar for all
// three, and each sub-case below is graded against a real code path (the
// interpretation gate's low_role_confidence flag, gradeRun's coverage bands,
// and src/pyai.js's named-error classification), not a hand-rolled stand-in.

const DIR = new URL('./fixtures/scorecard/pp-2.7-degradation/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8'));
const EXPECTED = load('expected.json');

// ── mono: low role_confidence demotes, never ships as silent ground truth ──

test('SC-2.7-mono a mono call\'s LLM-inferred role demotes via low_role_confidence, status still ships (never blocked, never silent)', () => {
  const transcript = load(EXPECTED.mono.transcript);
  const claims = load(EXPECTED.mono.claims);
  assert.equal(transcript.mode, 'mono', 'this sub-case must actually be a mono transcript');
  const utterance = transcript.utterances.find((u) => typeof u.role_confidence === 'number' && u.role_confidence < 0.75);
  assert.ok(utterance, 'fixture must plant a low-confidence (inferred) role utterance');

  const gated = gateClaim(claims[0], transcript);
  assert.equal(gated.status, EXPECTED.mono.expect_status);
  assert.deepEqual(gated.context_flags.map((f) => f.flag), [EXPECTED.mono.expect_flag]);
  assert.equal(gated.interpretation_confidence, EXPECTED.mono.expect_interpretation_confidence,
    'an inferred role must visibly demote confidence, never read as high');
});

// ── noisy: the coverage band says the degradation out loud ─────────────────

test('SC-2.7-noisy a choppy call\'s low corroboration ratio bands as PARTIAL_LOW_COVERAGE, not silently SHIPPED', () => {
  const transcript = load(EXPECTED.noisy.transcript);
  const claims = load(EXPECTED.noisy.claims);
  const gated = claims.map((c) => gateClaim(c, transcript));
  const run = gradeRun(gated);

  assert.equal(run.band, EXPECTED.noisy.expect_band);
  assert.ok(run.ratio < EXPECTED.noisy.expect_ratio_below, `ratio ${run.ratio} must read the degradation, not paper over it`);
  // and the one real line still gates clean — degradation must not fabricate OR discard the truth
  const realClaim = gated.find((c) => c.id === 'noisy-summary-1');
  assert.equal(realClaim.status, 'verified');
});

// ── non-English: a clear, named, non-silent refusal ─────────────────────────

test('SC-2.7-non-english a non-English (rejected) call surfaces a clear named error, never a silent crash or garbage transcript', async () => {
  const problem = load(EXPECTED.non_english.problem_fixture);
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.PYAI_API_KEY;
  process.env.PYAI_API_KEY = 'test-key-scorecard-fixture-only';
  globalThis.fetch = async () => new Response(JSON.stringify(problem), {
    status: problem.status, headers: { 'content-type': 'application/json' },
  });
  try {
    await assert.rejects(
      () => pyaiFetch('/transcription/jobs/job_scorecard_fixture', {}),
      (err) => {
        assert.ok(err instanceof PyAiError, 'must be the named error class, not a raw/unknown throw');
        assert.equal(err.name, EXPECTED.non_english.expect_error_name);
        assert.equal(err.problem?.title, problem.title, 'the underlying reason must be preserved, not swallowed');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) process.env.PYAI_API_KEY = originalKey; else delete process.env.PYAI_API_KEY;
  }
});
