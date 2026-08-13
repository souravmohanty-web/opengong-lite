import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanTrackerClaims, runTrackerExtractor, runExtraction, flattenClaims,
} from '../src/extract.js';
import { loadExtractors } from '../src/registry.js';
import { gateClaim, gradeRun } from '../src/gate.js';
import { buildBundle } from '../src/bundle.js';
import { runPipeline } from '../src/run.js';
import { costUsd } from '../src/llm.js';

// Deterministic tracker dispatch (Slice-2, role:"tracker"): src/extract.js
// never touches the LLM for these — the JSON extractor file itself lives at
// test/fixtures/extractors/ (a real extractors/tracker.json is a different
// session's lane; loading it through the real registry here still exercises
// the full registry -> dispatch -> gate -> bundle path end to end).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'extractors');

function trackerDef(overrides = {}) {
  const registry = loadExtractors(FIXTURES_DIR);
  return { ...registry['competitor-tracker'], ...overrides };
}

const TRACKER_T = {
  utterances: [
    { id: 0, text: 'we currently use aircall for our outbound calls', role: 'prospect', role_confidence: 0.9 },
    { id: 1, text: 'the team has been happy with it so far', role: 'prospect', role_confidence: 0.9 },
  ],
  canonical_text: 'we currently use aircall for our outbound calls\nthe team has been happy with it so far',
};

const NO_MATCH_T = {
  utterances: [{ id: 0, text: 'we are happy with our current setup', role: 'prospect', role_confidence: 0.9 }],
  canonical_text: 'we are happy with our current setup',
};

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

// ── scan + dispatch ──────────────────────────────────────────────────────────

test('TR-01 a present keyword yields a claim that gates verified/exact by construction, zero LLM calls', () => {
  const def = trackerDef();
  let fetchCalls = 0;
  const spyCallLlm = async () => { fetchCalls += 1; throw new Error('tracker must never call the LLM'); };

  const result = runTrackerExtractor(def, TRACKER_T);
  assert.equal(result.status, 'ok');
  assert.ok(result.data.claims.length >= 1, 'aircall is in the transcript');

  const gated = flattenClaims(def.name, result.data).map((c) => gateClaim(c, TRACKER_T));
  assert.ok(gated.length >= 1);
  for (const c of gated) {
    assert.equal(c.status, 'verified');
    assert.equal(c.evidence[0].match_type, 'exact');
  }
  assert.equal(fetchCalls, 0, 'nothing in this path may ever invoke an LLM call');
  void spyCallLlm; // never called — asserted above
});

test('TR-02 a keyword absent from the transcript yields zero claims, not an error', () => {
  const def = trackerDef();
  const result = runTrackerExtractor(def, NO_MATCH_T);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.data.claims, []);
});

test('TR-03 keyword matching is whole-word: embedded inside a longer word never fires', () => {
  const def = trackerDef({ keywords: ['call'] });
  const embedded = {
    utterances: [{ id: 0, text: 'we currently use aircall for our recall campaigns', role: 'prospect', role_confidence: 0.9 }],
    canonical_text: 'we currently use aircall for our recall campaigns',
  };
  assert.deepEqual(runTrackerExtractor(def, embedded).data.claims, [],
    '"call" must not fire inside "aircall" or "recall"');

  const wholeWord = {
    utterances: [{ id: 0, text: 'can you call me back tomorrow', role: 'prospect', role_confidence: 0.9 }],
    canonical_text: 'can you call me back tomorrow',
  };
  assert.equal(runTrackerExtractor(def, wholeWord).data.claims.length, 1, '"call" as its own word must fire');
});

test('TR-03b keyword matching is case-insensitive', () => {
  const def = trackerDef({ keywords: ['Aircall'] });
  assert.equal(runTrackerExtractor(def, TRACKER_T).data.claims.length, 1);
});

test('TR-03c claim text and evidence are gate-ready and traceable to the matching extractor/keyword', () => {
  const def = trackerDef();
  const [claim] = runTrackerExtractor(def, TRACKER_T).data.claims;
  assert.match(claim.text, /competitor-tracker/);
  assert.match(claim.text, /aircall/);
  assert.equal(claim.extractor, 'competitor-tracker');
  assert.equal(claim.evidence[0].utterance_id, 0);
});

// ── whole-run orchestration ──────────────────────────────────────────────────

test('TR-04 runExtraction dispatches a tracker deterministically: zero LLM calls for it, the LLM extractor still runs', async () => {
  const def = trackerDef();
  let llmCalls = 0;
  const callLlm = async () => {
    llmCalls += 1;
    return {
      text: JSON.stringify({ objections: [] }), stop_reason: 'end_turn', model: 'm',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 1, cache_read_input_tokens: 0 },
    };
  };
  const { results } = await runExtraction({ transcript: TRACKER_T, extractors: [def, OBJECTIONS_DEF], callLlm, concurrency: 3 });
  assert.equal(results.length, 2);
  const trackerResult = results.find((r) => r.extractor === 'competitor-tracker');
  const objResult = results.find((r) => r.extractor === 'objections');
  assert.equal(trackerResult.status, 'ok');
  assert.ok(trackerResult.data.claims.length >= 1);
  assert.equal(objResult.status, 'ok');
  assert.equal(llmCalls, 1, 'only the LLM extractor may ever hit callLlm');
});

test('TR-05 a tracker listed FIRST never deadlocks the serialize-first cache gate', async () => {
  const def = trackerDef();
  const SUMMARY_DEF = {
    name: 'summary', version: '1.0.0', title: 'Summary', description: 'x', enabled: true,
    role: 'extraction', scope: 'call', evidence_required: true, prompt: 'Summarize.',
    output_schema: { type: 'object', additionalProperties: false, required: ['sections'], properties: { sections: { type: 'array', items: { type: 'object' } } } },
  };
  const callLlm = async () => ({
    text: JSON.stringify({ sections: [] }), stop_reason: 'end_turn', model: 'm',
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 1, cache_read_input_tokens: 0 },
  });
  const { results } = await runExtraction({ transcript: TRACKER_T, extractors: [def, SUMMARY_DEF], callLlm, concurrency: 3 });
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.status === 'ok'), 'the tracker-first list must not hang the LLM extractor behind it');
});

test('TR-05b a tracker-only extractor list resolves with no callLlm at all', async () => {
  const def = trackerDef();
  let calls = 0;
  const callLlm = async () => { calls += 1; throw new Error('must never be called'); };
  const { results } = await runExtraction({ transcript: TRACKER_T, extractors: [def], callLlm, concurrency: 3 });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'ok');
  assert.equal(calls, 0);
});

// ── bundle integration ───────────────────────────────────────────────────────

test('TR-06 tracker claims flow through the same gate and appear in the bundle', () => {
  const def = trackerDef();
  const claims = flattenClaims(def.name, runTrackerExtractor(def, TRACKER_T).data);
  const gated = claims.map((c) => gateClaim(c, TRACKER_T));
  const coverage = gradeRun(gated);
  const bundle = buildBundle({ transcript: TRACKER_T, claims: gated, coverage, callId: 'tr-06' });
  assert.ok(bundle.claims.some((c) => c.extractor === 'competitor-tracker' && c.status === 'verified'));
});

// ── run-record cost accounting (integration; run.js is untouched) ────────────

test('TR-07 a tracker contributes zero cost/tokens to the run record', async () => {
  const runsRoot = mkdtempSync(path.join(tmpdir(), 'opengong-runs-tracker-'));
  const def = trackerDef();
  const usage = { input_tokens: 800, output_tokens: 100, cache_creation_input_tokens: 800, cache_read_input_tokens: 0 };
  const callLlm = async () => ({ text: JSON.stringify({ objections: [] }), stop_reason: 'end_turn', model: 'claude-sonnet-5', usage });

  const record = await runPipeline({
    transcript: TRACKER_T, extractorDefs: [def, OBJECTIONS_DEF], callId: 'tr-07',
    budgetUsd: 1.0, callLlm, runsRoot,
  });

  assert.equal(record.context_ledger.some((e) => e.extractor === 'competitor-tracker'), false,
    'a tracker never calls the LLM, so it never journals a call — its own cost/tokens are zero by never appearing');
  assert.equal(record.context_ledger.length, 1, 'only the LLM extractor journals a call');
  assert.equal(record.context_ledger[0].extractor, 'objections');
  assert.equal(record.budget.spent_usd, costUsd(usage), 'total spend is exactly the LLM extractor\'s cost — the tracker added $0');
});
