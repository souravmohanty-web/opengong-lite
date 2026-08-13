import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tolerantParse, validateOutput, checkSuppliedIds, flattenClaims, flattenExtraction,
  runExtractorCall, runExtraction, MAX_REPAIRS,
} from '../src/extract.js';
import { buildSystem } from '../src/prompt.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/llm/${name}`, import.meta.url), 'utf8'));
const T = JSON.parse(readFileSync(new URL('./fixtures/gate/transcript.pricing.json', import.meta.url), 'utf8'));

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

// ── tolerant parse ───────────────────────────────────────────────────────────

test('EX-01 tolerantParse handles fenced JSON with preamble/trailer and trailing commas', () => {
  const raw = load('malformed-fenced.json').content[0].text;
  const parsed = tolerantParse(raw);
  assert.equal(parsed.objections[0].category, 'price');
});

test('EX-02 tolerantParse parses plain JSON directly (no fence needed)', () => {
  assert.deepEqual(tolerantParse('{"a":1}'), { a: 1 });
});

test('EX-03 tolerantParse throws a descriptive error on genuinely broken input', () => {
  assert.throws(() => tolerantParse('not json at all {{{'), /tolerant parse failed/);
});

// ── schema validation ────────────────────────────────────────────────────────

test('EX-04 validateOutput accepts a well-formed objections payload', () => {
  const data = tolerantParse(load('ok.json').content[0].text);
  const v = validateOutput(data, OBJECTIONS_DEF.output_schema);
  assert.equal(v.valid, true, JSON.stringify(v.errors));
});

test('EX-05 validateOutput rejects a bad enum value with a path', () => {
  const v = validateOutput({ objections: [{ evidence: [], category: 'nonsense', text: 'x' }] }, OBJECTIONS_DEF.output_schema);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => e.path === '$.objections[0].category'));
});

// ── supplied-ID screen ───────────────────────────────────────────────────────

test('EX-06 checkSuppliedIds accepts ids inside the supplied set', () => {
  const data = tolerantParse(load('ok.json').content[0].text);
  const suppliedIds = new Set(T.utterances.map((u) => u.id));
  assert.equal(checkSuppliedIds(data, suppliedIds).ok, true);
});

test('EX-07 checkSuppliedIds rejects the WHOLE result when any cited id was never shown', () => {
  const data = tolerantParse(load('out-of-range-id.json').content[0].text);
  const suppliedIds = new Set(T.utterances.map((u) => u.id));
  const result = checkSuppliedIds(data, suppliedIds);
  assert.equal(result.ok, false);
  assert.ok(result.paths[0].includes('utterance_id'));
});

// ── claim flattening ─────────────────────────────────────────────────────────

test('EX-08 flattenClaims maps objections into gate-ready claims', () => {
  const data = tolerantParse(load('ok.json').content[0].text);
  const claims = flattenClaims('objections', data);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].section, 'objections');
  assert.equal(claims[0].evidence[0].utterance_id, 2);
});

test('EX-09 flattenClaims maps summary "Next steps" blocks to section next_steps', () => {
  const claims = flattenClaims('summary', {
    sections: [
      { title: 'Outcome', blocks: [{ evidence: [{ utterance_id: 0, quote: 'x' }], text: 'outcome text' }] },
      { title: 'Next steps', blocks: [{ evidence: [{ utterance_id: 3, quote: 'y' }], text: 'next step text' }] },
    ],
  });
  assert.equal(claims.find((c) => c.title === 'Outcome').section, 'summary');
  assert.equal(claims.find((c) => c.title === 'Next steps').section, 'next_steps');
});

// ── flattenExtraction: the full-registry superset (pipeline wiring) ─────────
// src/run.js's runPipeline dispatches through flattenExtraction (not the
// narrower flattenClaims above) so a full run can cover the whole enabled
// extractor registry, not just objections+summary. Fixtures are the REAL
// authored samples (samples/extractions/) — same shapes the offline harness
// already exercises end to end, so these mappings are proven against real
// data, not a hand-rolled shape that happens to satisfy the code.

const loadSample = (callId, name) =>
  JSON.parse(readFileSync(new URL(`../samples/extractions/${callId}/${name}.json`, import.meta.url), 'utf8'));

test('EX-19 flattenExtraction delegates objections/summary to flattenClaims (same output, one mapping)', () => {
  const data = tolerantParse(load('ok.json').content[0].text);
  assert.deepEqual(flattenExtraction('objections', data), flattenClaims('objections', data));
});

test('EX-20 flattenExtraction maps competitor_mentions, merging the switching_trigger quote as a second receipt', () => {
  const data = loadSample('03', 'competitors');
  const claims = flattenExtraction('competitors', data);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].extractor, 'competitors');
  assert.equal(claims[0].competitor, 'RingHawk');
  assert.equal(claims[0].evidence.length, 2, 'both the mention quote and the switching-trigger quote must carry as receipts');
});

test('EX-21 flattenExtraction maps pain_points, merging the quantified_impact quote', () => {
  const data = loadSample('01', 'pain');
  const claims = flattenExtraction('pain', data);
  assert.ok(claims.length >= 2);
  assert.ok(claims.every((c) => c.extractor === 'pain' && c.section === 'pain'));
  const dropCall = claims.find((c) => c.text.includes('mid-transfer'));
  assert.equal(dropCall.evidence.length, 2);
});

test('EX-22 flattenExtraction maps next_steps (owner/commitment/due carried through)', () => {
  const data = loadSample('01', 'next_steps');
  const claims = flattenExtraction('next_steps', data);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].owner, 'rep');
  assert.equal(claims[0].due, 'Thursday');
  assert.equal(claims[0].evidence.length, 2);
});

test('EX-23 flattenExtraction maps pricing_mentions', () => {
  const data = loadSample('03', 'pricing');
  const claims = flattenExtraction('pricing', data);
  assert.ok(claims.length >= 1);
  assert.ok(claims.every((c) => c.extractor === 'pricing'));
});

test('EX-24 flattenExtraction maps buying_stage derived-fact blocks into claims, one per cited fact', () => {
  const data = loadSample('01', 'buying_stage');
  const claims = flattenExtraction('buying_stage', data);
  // stage + urgency + trigger_event are all cited in the fixture -> 3 claims
  assert.equal(claims.length, 3);
  assert.ok(claims.every((c) => c.evidence.length >= 1));
});

test('EX-25 flattenExtraction never fabricates a claim for an "absent" derived fact (risk_flags.anomaly)', () => {
  const data = loadSample('01', 'risk_flags');
  const claims = flattenExtraction('risk_flags', data);
  // buyer_posture + transcript_quality are cited -> 2 claims; anomaly is basis:"absent" -> dropped, not stubbed
  assert.equal(claims.length, 2);
  assert.ok(!claims.some((c) => c.id === 'risk_flags-anomaly'), 'an absent basis must never produce a fabricated receipt');
});

test('EX-26 flattenExtraction maps stakeholders + threading', () => {
  const data = loadSample('01', 'stakeholders');
  const claims = flattenExtraction('stakeholders', data);
  assert.ok(claims.some((c) => c.extractor === 'stakeholders' && c.role_signal));
  assert.ok(claims.some((c) => c.id === 'stakeholders-threading'));
});

test('EX-27 flattenExtraction throws a named error for a genuinely unknown extractor', () => {
  assert.throws(() => flattenExtraction('mystery', {}), /no claim mapping defined/);
});

// ── per-extractor repair loop (the runner's core contract) ──────────────────

function sequencedCallLlm(envelopes) {
  let i = 0;
  return async () => {
    const env = envelopes[Math.min(i, envelopes.length - 1)];
    i += 1;
    const block = env.content.find((b) => b.type === 'text');
    return { text: block.text, stop_reason: env.stop_reason, usage: env.usage, model: env.model };
  };
}

test('EX-10 happy path: one call, no repairs, status ok', async () => {
  const { blocks } = buildSystem(T, []);
  const suppliedIds = new Set(T.utterances.map((u) => u.id));
  let calls = 0;
  const result = await runExtractorCall({
    extractorDef: OBJECTIONS_DEF, systemBlocks: blocks, suppliedIds,
    callLlm: sequencedCallLlm([load('ok.json')]),
    onCall: () => { calls += 1; },
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.repairsUsed, 0);
  assert.equal(calls, 1);
});

test('EX-11 out-of-range id: whole-result reject -> repair with offending path -> second response accepted', async () => {
  const { blocks } = buildSystem(T, []);
  const suppliedIds = new Set(T.utterances.map((u) => u.id));
  const seen = [];
  const result = await runExtractorCall({
    extractorDef: OBJECTIONS_DEF, systemBlocks: blocks, suppliedIds,
    callLlm: sequencedCallLlm([load('out-of-range-id.json'), load('out-of-range-id-repaired.json')]),
    onCall: (info) => seen.push(info),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.repairsUsed, 1);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].repair, true);
});

test('EX-12 out-of-range id twice: repairs exhausted -> extractor fails, reason validation_exhausted', async () => {
  const { blocks } = buildSystem(T, []);
  const suppliedIds = new Set(T.utterances.map((u) => u.id));
  const result = await runExtractorCall({
    extractorDef: OBJECTIONS_DEF, systemBlocks: blocks, suppliedIds,
    callLlm: sequencedCallLlm([load('out-of-range-id.json'), load('out-of-range-id.json'), load('out-of-range-id.json')]),
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'validation_exhausted');
  assert.equal(result.repairsUsed, MAX_REPAIRS);
  assert.equal(result.attempts, MAX_REPAIRS + 1);
});

test('EX-13 malformed fenced JSON parses tolerantly with zero repairs consumed', async () => {
  const { blocks } = buildSystem(T, []);
  const suppliedIds = new Set(T.utterances.map((u) => u.id));
  const result = await runExtractorCall({
    extractorDef: OBJECTIONS_DEF, systemBlocks: blocks, suppliedIds,
    callLlm: sequencedCallLlm([load('malformed-fenced.json')]),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.repairsUsed, 0);
});

test('EX-14 truncation (stop_reason max_tokens) is never repaired: one fetch, immediate failure', async () => {
  const { blocks } = buildSystem(T, []);
  const suppliedIds = new Set(T.utterances.map((u) => u.id));
  let calls = 0;
  const result = await runExtractorCall({
    extractorDef: OBJECTIONS_DEF, systemBlocks: blocks, suppliedIds,
    callLlm: sequencedCallLlm([load('truncated.json')]),
    onCall: () => { calls += 1; },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'truncated');
  assert.equal(calls, 1);
});

test('EX-15 refusal is never repaired: one fetch, immediate failure', async () => {
  const { blocks } = buildSystem(T, []);
  const suppliedIds = new Set(T.utterances.map((u) => u.id));
  let calls = 0;
  const result = await runExtractorCall({
    extractorDef: OBJECTIONS_DEF, systemBlocks: blocks, suppliedIds,
    callLlm: sequencedCallLlm([load('refusal.json')]),
    onCall: () => { calls += 1; },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'refused');
  assert.equal(calls, 1);
});

// ── whole-run orchestration: serialize-first + fan-out ───────────────────────

test('EX-16 runExtraction serializes extractor #1\'s first call before any other extractor fires', async () => {
  const order = [];
  const SUMMARY_DEF = { ...OBJECTIONS_DEF, name: 'summary', prompt: 'Summarize.', output_schema: { type: 'object', additionalProperties: false, required: ['sections'], properties: { sections: { type: 'array', items: { type: 'object' } } } } };
  const callLlm = async ({ system, messages }) => {
    const isObjections = messages[0].content[0].text.includes(OBJECTIONS_DEF.prompt);
    order.push(isObjections ? 'objections:start' : 'summary:start');
    await new Promise((r) => setTimeout(r, isObjections ? 15 : 0));
    order.push(isObjections ? 'objections:end' : 'summary:end');
    return isObjections
      ? { text: load('ok.json').content[0].text, stop_reason: 'end_turn', usage: load('ok.json').usage, model: 'm' }
      : { text: JSON.stringify({ sections: [] }), stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 1 }, model: 'm' };
  };
  const { results } = await runExtraction({ transcript: T, extractors: [OBJECTIONS_DEF, SUMMARY_DEF], callLlm, concurrency: 3 });
  assert.equal(results.length, 2);
  assert.equal(results[0].status, 'ok');
  assert.equal(results[1].status, 'ok');
  // extractor #1 (objections) must fully START AND FINISH its first HTTP call
  // before extractor #2 (summary) is ever dispatched.
  assert.deepEqual(order.slice(0, 2), ['objections:start', 'objections:end']);
});

test('EX-17 one extractor exhausting repairs does not affect the other', async () => {
  const SUMMARY_DEF = { ...OBJECTIONS_DEF, name: 'summary', prompt: 'Summarize.', output_schema: { type: 'object', additionalProperties: false, required: ['sections'], properties: { sections: { type: 'array', items: { type: 'object' } } } } };
  let objCalls = 0;
  const callLlm = async ({ messages }) => {
    const isObjections = messages[0].content[0].text.includes(OBJECTIONS_DEF.prompt);
    if (isObjections) {
      objCalls += 1;
      const env = load('out-of-range-id.json');
      return { text: env.content[0].text, stop_reason: env.stop_reason, usage: env.usage, model: env.model };
    }
    return { text: JSON.stringify({ sections: [] }), stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 1 }, model: 'm' };
  };
  const { results } = await runExtraction({ transcript: T, extractors: [OBJECTIONS_DEF, SUMMARY_DEF], callLlm, concurrency: 3 });
  const objResult = results.find((r) => r.extractor === 'objections' || r.reason);
  assert.equal(results.some((r) => r.status === 'failed' && r.reason === 'validation_exhausted'), true);
  assert.equal(results.some((r) => r.status === 'ok'), true, 'the other extractor must still ship');
  assert.equal(objCalls, MAX_REPAIRS + 1);
});
