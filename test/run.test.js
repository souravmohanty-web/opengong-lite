import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildTranscript } from '../src/transcript.js';
import { buildViewModel } from '../src/viewer.js';
import { readJson, writeAtomic } from '../src/store.js';
import {
  runPipeline, openRun, closeRun, journalCall, sweep, formatFinalLine,
} from '../src/run.js';

function tmpRunsRoot() {
  return mkdtempSync(path.join(tmpdir(), 'opengong-runs-'));
}

const OBJECTIONS_DEF = {
  name: 'objections', version: '1.0.0', title: 'Objections', description: 'x', enabled: true,
  role: 'extraction', scope: 'call', evidence_required: true, prompt: 'List every objection.',
  output_schema: {
    type: 'object', additionalProperties: false, required: ['objections'],
    properties: {
      objections: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['evidence', 'category', 'text'],
          properties: {
            evidence: { type: 'array', items: { $ref: 'opengong://evidence' } },
            category: { type: 'string', enum: ['price', 'timing', 'authority', 'competitor', 'fit', 'trust'] },
            text: { type: 'string' },
          },
        },
      },
    },
  },
};

const SUMMARY_DEF = {
  name: 'summary', version: '1.0.0', title: 'Summary', description: 'x', enabled: true,
  role: 'extraction', scope: 'call', evidence_required: true, required_section: true, prompt: 'Summarize the call.',
  output_schema: {
    type: 'object', additionalProperties: false, required: ['sections'],
    properties: {
      sections: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['title', 'blocks'],
          properties: {
            title: { type: 'string', enum: ['Outcome', 'Next steps', 'Key takeaways', 'Pain points', 'Interests'] },
            blocks: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false, required: ['evidence', 'text'],
                properties: { evidence: { type: 'array', items: { $ref: 'opengong://evidence' } }, text: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
};

// Stereo probe transcript (research/00-api-probe/stereo_result.json), inlined
// so this suite has no dependency on that file's on-disk path or contents
// changing under it. Utterance 0 = rep intro, 1 = buyer price objection,
// 2 = rep next step (matches the real fixture 1:1 — see FINDINGS.md).
const RESULT = {
  words: [], speakers: 2, audio_seconds: 17,
  segments: [
    { id: 0, start: 0, end: 5.44, speaker: 'speaker_1', channel: 0, text: 'hi rahul thanks for taking the time today i wanted to walk you through how our dialer handles compliance' },
    { id: 1, start: 6.08, end: 12.16, speaker: 'speaker_2', channel: 1, text: 'honestly my main concern is pricing your competitor quoted as almost forty less last week' },
    { id: 2, start: 12.48, end: 16.88, speaker: 'speaker_1', channel: 0, text: 'that is fair let me show you the total cost picture including answering machine detection' },
  ],
};
const T = buildTranscript(RESULT);

function envelope(obj, { stopReason = 'end_turn', model = 'm' } = {}) {
  return { text: JSON.stringify(obj), stop_reason: stopReason, model, usage: { input_tokens: 800, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
}

function isObjectionsCall(messages) {
  return messages[0].content[0].text.includes(OBJECTIONS_DEF.prompt);
}

// ── happy path ────────────────────────────────────────────────────────────────

test('R-01 happy path: SHIPPED bundle + terminal run.json', async () => {
  const runsRoot = tmpRunsRoot();
  const callLlm = async ({ messages }) => (isObjectionsCall(messages)
    ? envelope({ objections: [{ evidence: [{ utterance_id: 1, quote: 'my main concern is pricing your competitor quoted as almost forty less last week' }], category: 'price', text: 'price objection' }] })
    : envelope({
      sections: [
        { title: 'Outcome', blocks: [{ evidence: [{ utterance_id: 0, quote: 'i wanted to walk you through how our dialer handles compliance' }], text: 'Rep walked the buyer through compliance handling.' }] },
        { title: 'Next steps', blocks: [{ evidence: [{ utterance_id: 2, quote: 'let me show you the total cost picture including answering machine detection' }], text: 'Rep to show total cost picture.' }] },
      ],
    }));

  const record = await runPipeline({ transcript: T, extractorDefs: [OBJECTIONS_DEF, SUMMARY_DEF], callId: 'happy', callLlm, runsRoot });

  assert.equal(record.status, 'COMPLETED');
  assert.equal(record.exit_reason, 'SHIPPED');
  assert.equal(record.exit_code, 0);
  assert.equal(record.coverage_stats.verified, 3);
  assert.equal(record.coverage_stats.attempted, 3);

  const bundlePath = path.join(runsRoot, record.run_id, 'bundle.json');
  assert.ok(existsSync(bundlePath));
  const bundle = readJson(bundlePath);
  const vm = buildViewModel(bundle); // must not throw — the bundle contract test
  assert.equal(vm.claims.length, 3);
  assert.equal(vm.coverage.band, 'SHIPPED');

  const runJson = readJson(path.join(runsRoot, record.run_id, 'run.json'));
  assert.equal(runJson.status, 'COMPLETED');
  assert.equal(runJson.exit_reason, 'SHIPPED');
  rmSync(runsRoot, { recursive: true, force: true });
});

// ── THE SLICE-1 EXIT TEST ────────────────────────────────────────────────────

test('R-02 planted fake quote -> PARTIAL_CLAIMS_DROPPED, claim lands in uncorroborated, rejected.json written', async () => {
  const runsRoot = tmpRunsRoot();
  const callLlm = async ({ messages }) => (isObjectionsCall(messages)
    ? envelope({
      objections: [
        { evidence: [{ utterance_id: 1, quote: 'my main concern is pricing your competitor quoted as almost forty less last week' }], category: 'price', text: 'price objection' },
        { evidence: [{ utterance_id: 1, quote: 'we will sign the contract this week no matter what' }], category: 'timing', text: 'planted fake commitment' },
      ],
    })
    : envelope({
      sections: [
        { title: 'Outcome', blocks: [{ evidence: [{ utterance_id: 0, quote: 'i wanted to walk you through how our dialer handles compliance' }], text: 'Outcome text.' }] },
        { title: 'Next steps', blocks: [{ evidence: [{ utterance_id: 2, quote: 'let me show you the total cost picture including answering machine detection' }], text: 'Next step text.' }] },
      ],
    }));

  const record = await runPipeline({ transcript: T, extractorDefs: [OBJECTIONS_DEF, SUMMARY_DEF], callId: 'fake-quote', callLlm, runsRoot });

  assert.equal(record.exit_reason, 'PARTIAL_CLAIMS_DROPPED');
  assert.equal(record.exit_class, 'PARTIAL');
  assert.equal(record.coverage_stats.uncorroborated, 1);
  assert.equal(record.coverage_stats.verified, 3);

  const rejectedPath = path.join(runsRoot, record.run_id, 'rejected.json');
  assert.ok(existsSync(rejectedPath), 'rejected.json must exist');
  const rejected = readJson(rejectedPath);
  assert.equal(rejected.claims.length, 1);
  assert.equal(rejected.claims[0].status, 'uncorroborated');
  assert.equal(rejected.claims[0].rejected_evidence[0].reason, 'not_found_in_transcript');

  const bundle = readJson(path.join(runsRoot, record.run_id, 'bundle.json'));
  const droppedClaim = bundle.claims.find((c) => c.status === 'uncorroborated');
  assert.ok(droppedClaim, 'the planted claim must still be present in the bundle, just demoted');
  const notesText = JSON.stringify(bundle.notes.sections);
  assert.ok(!notesText.includes('planted fake commitment'), 'demoted claim must never reach the notes body');

  const vm = buildViewModel(bundle);
  assert.ok(vm.claims.some((c) => c.status === 'uncorroborated'));
  rmSync(runsRoot, { recursive: true, force: true });
});

// ── extractor failure isolation ──────────────────────────────────────────────

test('R-03 one extractor fails twice on out-of-range ids -> PARTIAL_EXTRACTORS_FAILED, other extractor unaffected', async () => {
  const runsRoot = tmpRunsRoot();
  let objCalls = 0;
  const callLlm = async ({ messages }) => {
    if (isObjectionsCall(messages)) {
      objCalls += 1;
      return envelope({ objections: [{ evidence: [{ utterance_id: 99, quote: 'nope' }], category: 'price', text: 'bad' }] });
    }
    return envelope({
      sections: [
        { title: 'Outcome', blocks: [{ evidence: [{ utterance_id: 0, quote: 'i wanted to walk you through how our dialer handles compliance' }], text: 'Outcome text.' }] },
        { title: 'Next steps', blocks: [{ evidence: [{ utterance_id: 2, quote: 'let me show you the total cost picture including answering machine detection' }], text: 'Next step text.' }] },
      ],
    });
  };

  const record = await runPipeline({ transcript: T, extractorDefs: [OBJECTIONS_DEF, SUMMARY_DEF], callId: 'partial', callLlm, runsRoot });

  assert.equal(record.exit_reason, 'PARTIAL_EXTRACTORS_FAILED');
  assert.equal(objCalls, 3); // 1 initial + 2 repairs
  assert.equal(record.coverage_stats.attempted, 2); // only summary's 2 claims made it
  assert.equal(record.coverage_stats.verified, 2);
  rmSync(runsRoot, { recursive: true, force: true });
});

// ── budget governor ───────────────────────────────────────────────────────────

test('R-04 budget $0.001 -> BUDGET_EXCEEDED, zero fetches', async () => {
  const runsRoot = tmpRunsRoot();
  let calls = 0;
  const callLlm = async () => { calls += 1; throw new Error('must never be called'); };

  const record = await runPipeline({ transcript: T, extractorDefs: [OBJECTIONS_DEF, SUMMARY_DEF], callId: 'broke', budgetUsd: 0.001, callLlm, runsRoot });

  assert.equal(record.exit_reason, 'BUDGET_EXCEEDED');
  assert.equal(record.exit_code, 75);
  assert.equal(calls, 0);
  assert.equal(record.budget.spent_usd, 0);
  assert.ok(record.budget.decisions.length >= 1);
  assert.ok(record.context_ledger.every((e) => e.skipped === true));
  assert.ok(record.context_ledger.every((e) => typeof e.cost_avoided_usd === 'number' && e.cost_avoided_usd > 0));
  assert.ok(record.context_ledger.every((e) => e.decided_by === 'budget_degrade'));
  assert.equal(existsSync(path.join(runsRoot, record.run_id, 'bundle.json')), false);
  rmSync(runsRoot, { recursive: true, force: true });
});

// ── write-ahead ───────────────────────────────────────────────────────────────

test('R-05 write-ahead: run.json is RUNNING on disk before the first mock call resolves', async () => {
  const runsRoot = tmpRunsRoot();
  let sawRunningBeforeResolve = false;
  let resolveFirst;
  const gate = new Promise((r) => { resolveFirst = r; });

  const callLlm = async ({ messages }) => {
    // At the instant this call fires, run.json must already say RUNNING —
    // read it from disk right now, before we ever resolve.
    const dirs = existsSync(runsRoot) ? readdirSync(runsRoot) : [];
    if (dirs.length) {
      const record = readJson(path.join(runsRoot, dirs[0], 'run.json'));
      sawRunningBeforeResolve = record.status === 'RUNNING';
    }
    resolveFirst();
    return isObjectionsCall(messages)
      ? envelope({ objections: [] })
      : envelope({ sections: [{ title: 'Outcome', blocks: [{ evidence: [{ utterance_id: 0, quote: 'hi rahul' }], text: 'x' }] }] });
  };

  const promise = runPipeline({ transcript: T, extractorDefs: [OBJECTIONS_DEF, SUMMARY_DEF], callId: 'wa', callLlm, runsRoot });
  await gate;
  await promise;
  assert.equal(sawRunningBeforeResolve, true);
  rmSync(runsRoot, { recursive: true, force: true });
});

// ── kill-sim: sweep ───────────────────────────────────────────────────────────

test('R-06 sweep rewrites a stale RUNNING record to CRASHED, naming the last stage', async () => {
  const runsRoot = tmpRunsRoot();
  const ctx = openRun({ runsRoot, callId: 'kill-sim', budgetUsd: 1, extractorDefs: [OBJECTIONS_DEF] });
  ctx.record.current_stage = 'gate';
  writeAtomic(path.join(ctx.dir, 'run.json'), ctx.record);

  const staleNow = Date.now() + 10 * 60 * 1000; // 10 minutes later, well past the 5-minute stale threshold
  const swept = sweep(runsRoot, { now: staleNow, staleMs: 5 * 60 * 1000 });

  assert.deepEqual(swept, [ctx.runId]);
  const record = readJson(path.join(ctx.dir, 'run.json'));
  assert.equal(record.status, 'COMPLETED');
  assert.equal(record.exit_reason, 'CRASHED');
  assert.equal(record.crashed_stage, 'gate');
  rmSync(runsRoot, { recursive: true, force: true });
});

test('R-07 sweep leaves a fresh heartbeat alone', () => {
  const runsRoot = tmpRunsRoot();
  const ctx = openRun({ runsRoot, callId: 'fresh', budgetUsd: 1, extractorDefs: [] });
  const swept = sweep(runsRoot, { now: Date.now() + 1000, staleMs: 5 * 60 * 1000 });
  assert.deepEqual(swept, []);
  rmSync(runsRoot, { recursive: true, force: true });
});

test('R-08 closeRun is idempotent: first reason wins', async () => {
  const runsRoot = tmpRunsRoot();
  const ctx = openRun({ runsRoot, callId: 'idem', budgetUsd: 1, extractorDefs: [] });
  await closeRun(ctx, { exitReason: 'SHIPPED', exitClass: 'SHIPPED', exitCode: 0 });
  await closeRun(ctx, { exitReason: 'CRASHED', exitClass: 'FAILED', exitCode: 70 });
  const record = readJson(path.join(ctx.dir, 'run.json'));
  assert.equal(record.exit_reason, 'SHIPPED');
  rmSync(runsRoot, { recursive: true, force: true });
});

// ── context ledger / cache mechanics ─────────────────────────────────────────

test('R-09 context_ledger: first call of the run is cache write, later call missing cache_read is flagged CACHE_MISS_UNEXPECTED', async () => {
  const runsRoot = tmpRunsRoot();
  const ctx = openRun({ runsRoot, callId: 'ledger', budgetUsd: 1, extractorDefs: [OBJECTIONS_DEF, SUMMARY_DEF] });
  ctx.prefixHash = 'sha256:deadbeef';

  await journalCall(ctx, { extractor: 'objections', attempt: 1, repair: false, resp: { model: 'm', usage: { input_tokens: 800, output_tokens: 90, cache_creation_input_tokens: 700, cache_read_input_tokens: 0 } } });
  await journalCall(ctx, { extractor: 'summary', attempt: 1, repair: false, resp: { model: 'm', usage: { input_tokens: 800, output_tokens: 90, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });

  const record = readJson(path.join(ctx.dir, 'run.json'));
  assert.equal(record.context_ledger[0].cache_action, 'write');
  assert.equal(record.context_ledger[1].cache_action, 'miss_unexpected');
  assert.equal(record.context_ledger[1].cache_miss_unexpected, true);
  assert.equal(record.context_ledger[1].prefix_hash, 'sha256:deadbeef');
  assert.equal(record.cache_misses_unexpected, 1);
  assert.ok(record.context_ledger.every((e) => ['plan'].includes(e.decided_by)));
  rmSync(runsRoot, { recursive: true, force: true });
});

// ── CLI final line ───────────────────────────────────────────────────────────

test('R-10 formatFinalLine matches the spec\'s worked example shape', () => {
  const record = {
    run_id: 'r_abc', exit_reason: 'SHIPPED_WITH_CORRECTIONS', exit_code: 0,
    budget: { spent_usd: 0.063 },
    coverage_stats: { verified: 13, attempted: 14, segment_corrected: 1, blocked_injection: 1 },
  };
  const line = formatFinalLine(record, '79');
  assert.equal(line, 'run r_abc → SHIPPED_WITH_CORRECTIONS (13/14 verified, 1 corrected, 1 neutralized) in 79s, $0.063, exit 0');
});

test('R-11 formatFinalLine falls back gracefully for infra exits with no coverage stats', () => {
  const record = { run_id: 'r_xyz', exit_reason: 'BUDGET_EXCEEDED', exit_code: 75, budget: { spent_usd: 0 } };
  assert.equal(formatFinalLine(record, '0.0'), 'run r_xyz → BUDGET_EXCEEDED in 0.0s, $0.000, exit 75');
});

// ── bundle contract: all four claim.status states representable ─────────────

test('R-12 bundle produced by a run can represent all four claim.status states and always loads through buildViewModel', async () => {
  const runsRoot = tmpRunsRoot();
  const callLlm = async ({ messages }) => (isObjectionsCall(messages)
    ? envelope({
      objections: [
        { evidence: [{ utterance_id: 1, quote: 'my main concern is pricing your competitor quoted as almost forty less last week' }], category: 'price', text: 'price objection' },
        { evidence: [{ utterance_id: 1, quote: 'we will sign the contract this week no matter what' }], category: 'timing', text: 'planted fake commitment' },
      ],
    })
    : envelope({
      sections: [
        { title: 'Outcome', blocks: [{ evidence: [{ utterance_id: 0, quote: 'hi rahul thanks for taking' }], text: 'Outcome text.' }] },
        { title: 'Next steps', blocks: [{ evidence: [{ utterance_id: 2, quote: 'let me show you the total cost picture including answering machine detection' }], text: 'Next step text.' }] },
      ],
    }));
  const record = await runPipeline({ transcript: T, extractorDefs: [OBJECTIONS_DEF, SUMMARY_DEF], callId: 'shape', callLlm, runsRoot });
  const bundle = readJson(path.join(runsRoot, record.run_id, 'bundle.json'));
  const vm = buildViewModel(bundle); // must not throw
  const statuses = new Set(vm.claims.map((c) => c.status));
  assert.ok(statuses.has('verified'));
  assert.ok(statuses.has('uncorroborated'));
  rmSync(runsRoot, { recursive: true, force: true });
});
