import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystem, buildUser, buildRepair, checkRender } from './prompt.js';
import { loadExtractors, DEFAULT_SCHEMAS_DIR } from './registry.js';
import { callMessages } from './llm.js';
import { buildTranscript } from './transcript.js';
import { pLimit } from './limit.js';

// Extraction runner (technical-spec-core.md §extraction-runner). Registry ->
// prompt -> call -> tolerantParse (free) -> schema validate -> suppliedIds
// screen (whole-result reject, fixable, counts as a repair) -> capped repairs
// x2. Gate/injection/coverage grading live in src/gate.js + src/injection.js
// and are wired in by src/run.js — this module's job stops at "did the model
// return something honest-looking", not "was it true" (that's the gate's job,
// deliberately a separate concern per gate.js's own docstring).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_EXTRACTORS_DIR = path.join(__dirname, '..', 'extractors');
export const MAX_REPAIRS = 2; // research/03-harness.md Part 3: 1 free tolerant-parse + 2 aimed repairs

// ── tolerant parse (SAP/BAML-style, free — no repair spent) ────────────────

function stripCodeFence(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : text;
}

function stripPreamble(text) {
  const first = text.search(/[[{]/);
  if (first === -1) return text;
  const openChar = text[first];
  const closeChar = openChar === '{' ? '}' : ']';
  const last = text.lastIndexOf(closeChar);
  if (last === -1 || last < first) return text.slice(first);
  return text.slice(first, last + 1);
}

function stripTrailingCommas(text) {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

export function tolerantParse(raw) {
  const s0 = String(raw ?? '');
  const fenced = stripCodeFence(s0);
  const trimmed = stripPreamble(fenced);
  const candidates = [s0, fenced, trimmed, stripTrailingCommas(trimmed)];
  let lastErr;
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch (err) { lastErr = err; }
  }
  throw new Error(`tolerant parse failed on all candidates: ${lastErr?.message ?? 'unknown error'}`);
}

// ── minimal hand-rolled schema validator ────────────────────────────────────
// registry.js exports no runtime validator (only load-time portability lint),
// so this is the "write minimal" branch of the instruction. Covers exactly the
// JSON-Schema subset the portability lint allows through: type, enum,
// properties/required/additionalProperties on objects, items on arrays, and
// opengong:// $ref resolution (evidence is always $ref'd, never inlined).

function resolveRef(ref, schemasDir) {
  const name = ref.slice('opengong://'.length);
  const file = path.join(schemasDir, `${name}.json`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function matchesType(v, t) {
  if (t === 'integer') return typeof v === 'number' && Number.isInteger(v);
  if (t === 'number') return typeof v === 'number';
  if (t === 'string') return typeof v === 'string';
  if (t === 'boolean') return typeof v === 'boolean';
  if (t === 'null') return v === null;
  if (t === 'array') return Array.isArray(v);
  if (t === 'object') return v !== null && typeof v === 'object' && !Array.isArray(v);
  return true;
}

function walk(value, schema, atPath, errors, schemasDir) {
  if (schema.$ref) schema = resolveRef(schema.$ref, schemasDir);
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : null;
  if (types && !types.some((t) => matchesType(value, t))) {
    errors.push({ path: atPath, message: `${atPath}: expected type ${types.join('|')}, got ${typeOf(value)}` });
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ path: atPath, message: `${atPath}: value ${JSON.stringify(value)} not in enum [${schema.enum.join(', ')}]` });
    return;
  }
  if ((schema.type === 'object' || types?.includes('object')) && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push({ path: `${atPath}.${key}`, message: `${atPath}.${key}: required property missing` });
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) errors.push({ path: `${atPath}.${key}`, message: `${atPath}.${key}: unexpected property "${key}"` });
      }
    }
    for (const [key, subschema] of Object.entries(schema.properties ?? {})) {
      if (key in value) walk(value[key], subschema, `${atPath}.${key}`, errors, schemasDir);
    }
  }
  if ((schema.type === 'array' || types?.includes('array')) && Array.isArray(value) && schema.items) {
    value.forEach((item, i) => walk(item, schema.items, `${atPath}[${i}]`, errors, schemasDir));
  }
}

export function validateOutput(value, schema, { schemasDir = DEFAULT_SCHEMAS_DIR } = {}) {
  const errors = [];
  walk(value, schema, '$', errors, schemasDir);
  return { valid: errors.length === 0, errors };
}

// ── supplied-ID screen ───────────────────────────────────────────────────────
// Any cited utterance_id the model was never shown rejects the WHOLE response
// (technical-spec-core.md §extraction-runner: "ungrounded generation poisons
// all items"). Walks generically for any `evidence` array so it covers every
// extractor shape (objections[].evidence, sections[].blocks[].evidence, …)
// without per-extractor special-casing.

function findEvidenceArrays(node, atPath, out) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => findEvidenceArrays(item, `${atPath}[${i}]`, out));
  } else if (node && typeof node === 'object') {
    for (const [key, val] of Object.entries(node)) {
      if (key === 'evidence' && Array.isArray(val)) {
        val.forEach((ev, i) => out.push({ path: `${atPath}.evidence[${i}]`, ev }));
      } else {
        findEvidenceArrays(val, `${atPath}.${key}`, out);
      }
    }
  }
}

export function checkSuppliedIds(data, suppliedIds) {
  const found = [];
  findEvidenceArrays(data, '$', found);
  const bad = found.filter(({ ev }) => !suppliedIds.has(ev?.utterance_id));
  if (!bad.length) return { ok: true, errors: [], paths: [] };
  return {
    ok: false,
    paths: bad.map(({ path: p }) => `${p}.utterance_id`),
    errors: bad.map(({ path: p, ev }) =>
      `${p}.utterance_id: ${JSON.stringify(ev?.utterance_id)} was not shown to you — cite only utterance ids present in the transcript block`),
  };
}

// ── claim flattening ─────────────────────────────────────────────────────────
// Slice 1 ships exactly two extractor shapes; this is deliberately explicit
// rather than a generic walker, so a new extractor's shape gets a reviewed
// mapping instead of an accidental one. `section` feeds gate.js's coverage
// bands directly: REQUIRED_SECTIONS = ['summary','next_steps'] there, so
// "Next steps" blocks map to 'next_steps' and every other summary block maps
// to 'summary'; objections are their own (non-required) section.

const SECTION_KEY = { 'Next steps': 'next_steps' };

export function flattenClaims(extractorName, data) {
  // Deterministic tracker output (role:"tracker", below) is already fully-formed,
  // gate-ready claims — runTrackerExtractor built them directly in code instead
  // of mapping model output, so flattening them is the identity. Checked first
  // and by SHAPE (data.claims), not by name, so it covers every tracker's own
  // extractor name without a per-tracker mapping entry here.
  if (Array.isArray(data?.claims)) return data.claims;
  if (extractorName === 'objections') {
    return (data.objections ?? []).map((o, i) => ({
      id: `objections-${i}`,
      extractor: 'objections',
      section: 'objections',
      category: o.category,
      text: o.text,
      evidence: o.evidence ?? [],
    }));
  }
  if (extractorName === 'summary') {
    const claims = [];
    data.sections?.forEach((section, si) => {
      section.blocks?.forEach((block, bi) => {
        claims.push({
          id: `summary-${si}-${bi}`,
          extractor: 'summary',
          section: SECTION_KEY[section.title] ?? 'summary',
          title: section.title,
          text: block.text,
          evidence: block.evidence ?? [],
        });
      });
    });
    return claims;
  }
  throw new Error(`flattenClaims: no claim mapping defined for extractor "${extractorName}" (Slice 1 ships objections + summary only)`);
}

// ── deterministic tracker dispatch (role:"tracker") ──────────────────────────
// A tracker never touches the LLM: registry.js validates `keywords` as a
// non-empty array of strings, and this scans the canonical transcript for
// each one — zero tokens, zero dollars, 100% receipts by construction. Two
// design choices, made explicit:
//
//   WHOLE-WORD, not substring. A substring scan would let "call" fire inside
//   "aircall"/"recall" and inflate every tracker's hit rate with false
//   positives — whole-word keeps the match meaningful. `\p{L}\p{N}_` bounds
//   (Unicode-aware) so a hyphenated or accented neighbour doesn't count as
//   "inside the word".
//
//   The evidence quote is the utterance's FULL raw text, not just the matched
//   token. gate.js's stage-1 exact match has a floor (MIN_NORMALIZED_QUOTE,
//   F-3): a quote shorter than the floor only anchors when it equals the
//   WHOLE utterance verbatim. A short keyword ("gong", "jc") quoted alone
//   would fall under that floor whenever it sits mid-sentence and MISS every
//   stage (exact -> normalized -> whole-transcript rescue all require either
//   the floor or the whole-utterance exception) — the opposite of "verified
//   by construction". Quoting the whole utterance is still 100% verbatim
//   (never paraphrased, never trimmed to the keyword) and always satisfies
//   the whole-utterance exception, so it lands `exact` regardless of keyword
//   length — with zero changes needed to gate.js's fabrication guards.
const WORD_CHAR = String.raw`[\p{L}\p{N}_]`;
function wordBoundaryPattern(keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<!${WORD_CHAR})${escaped}(?!${WORD_CHAR})`, 'iu');
}

export function scanTrackerClaims(extractorDef, transcript) {
  const keywords = extractorDef.keywords ?? [];
  const claims = [];
  for (const u of transcript.utterances) {
    for (const keyword of keywords) {
      if (!wordBoundaryPattern(keyword).test(u.text)) continue;
      claims.push({
        id: `${extractorDef.name}-${u.id}-${keyword}`,
        extractor: extractorDef.name,
        section: extractorDef.name,
        text: `Tracker '${extractorDef.name}' matched: ${keyword}`,
        evidence: [{ utterance_id: u.id, quote: u.text }],
      });
    }
  }
  return claims;
}

// Same result envelope runExtractorCall returns for an LLM extractor
// (status/extractor/data/attempts/repairsUsed) so run.js's unmodified
// `flattenClaims(result.extractor, result.data)` loop needs no tracker-aware
// branch — the generic data.claims check above is what makes that work.
export function runTrackerExtractor(extractorDef, transcript) {
  return {
    status: 'ok',
    extractor: extractorDef.name,
    data: { claims: scanTrackerClaims(extractorDef, transcript) },
    attempts: 1,
    repairsUsed: 0,
  };
}

// ── per-extractor call + repair loop ────────────────────────────────────────
// callLlm: async ({ model, system, messages, schema }) -> { text, stop_reason,
// usage, model }. Injected so tests / --fixture mode never touch the network.

export async function runExtractorCall({
  extractorDef, systemBlocks, suppliedIds, model = 'claude-sonnet-5',
  callLlm, maxRepairs = MAX_REPAIRS, onCall,
} = {}) {
  const messages = [buildUser(extractorDef)];
  let attempt = 1;
  let repairsUsed = 0;

  while (true) {
    let resp;
    try {
      resp = await callLlm({ model, system: systemBlocks, messages, schema: extractorDef.output_schema });
    } catch (err) {
      // Transport/auth failures are contained here: one bad extractor call
      // must never take the whole run down (that's what PARTIAL_EXTRACTORS_
      // FAILED is for). run.js preflights ANTHROPIC_KEY_MISSING before any
      // spend, so in practice that name never reaches this catch for --live.
      return {
        status: 'failed', reason: err?.name ?? 'internal_error', extractor: extractorDef.name,
        attempts: attempt, repairsUsed, error: String(err?.message ?? err),
      };
    }
    onCall?.({ extractor: extractorDef.name, attempt, repair: attempt > 1, resp });

    // Truncation and refusal are their own exits — NEVER repaired (re-asking
    // with identical params fails identically; research/03-harness.md A1).
    if (resp.stop_reason === 'max_tokens') {
      return { status: 'failed', reason: 'truncated', extractor: extractorDef.name, attempts: attempt, repairsUsed };
    }
    if (resp.stop_reason === 'refusal') {
      return { status: 'failed', reason: 'refused', extractor: extractorDef.name, attempts: attempt, repairsUsed };
    }

    let parsed;
    let parseErr;
    try { parsed = tolerantParse(resp.text); } catch (err) { parseErr = err; }

    let errors = [];
    let offendingPaths = [];
    if (parseErr) {
      errors = [`response is not valid JSON: ${parseErr.message}`];
    } else {
      const v = validateOutput(parsed, extractorDef.output_schema);
      if (!v.valid) {
        errors = v.errors.map((e) => e.message);
        offendingPaths = v.errors.map((e) => e.path);
      } else {
        const idCheck = checkSuppliedIds(parsed, suppliedIds);
        if (!idCheck.ok) { errors = idCheck.errors; offendingPaths = idCheck.paths; }
      }
    }

    if (!errors.length) {
      return { status: 'ok', extractor: extractorDef.name, data: parsed, attempts: attempt, repairsUsed };
    }
    if (repairsUsed >= maxRepairs) {
      return {
        status: 'failed', reason: 'validation_exhausted', extractor: extractorDef.name,
        attempts: attempt, repairsUsed, errors,
      };
    }
    repairsUsed += 1;
    messages.push({ role: 'assistant', content: [{ type: 'text', text: resp.text }] });
    messages.push(buildRepair(errors, offendingPaths, resp.text));
    attempt += 1;
  }
}

// ── whole-run orchestration ──────────────────────────────────────────────────
// Serialize-first (token-optimization.md §cache-mechanics): fire extractor
// #1's FIRST call alone and await its response before anything else touches
// the wire. N parallel calls sharing an identical cached prefix ALL miss the
// cache and ALL pay the 1.25x write premium if fired simultaneously (measured
// -44%/call fix). Only extractor #1's very first HTTP call is serialized —
// its own repairs (if any) join the concurrency-limited fan-out below like
// every other extractor, since by then the cache write has already landed.

export async function runExtraction({
  transcript, extractors, glossaryEntries = [], model = 'claude-sonnet-5',
  callLlm, concurrency = 3, onCall,
} = {}) {
  const { blocks: systemBlocks, suppliedIds } = buildSystem(transcript, glossaryEntries);
  checkRender(transcript, { block: systemBlocks[1].text, suppliedIds });

  if (!extractors.length) return { results: [], systemBlocks, suppliedIds };

  // Tracker extractors (role:"tracker") are deterministic and never call
  // callLlm at all, so they must never be picked as the serialize-first
  // extractor below — that logic awaits callLlm's FIRST call to release the
  // fan-out gate, and a tracker never makes one (a tracker-first list would
  // hang forever waiting for a call that's never coming). Run every tracker
  // eagerly up front instead — cheap, synchronous, no cache-prefix concerns
  // since there is no HTTP call to cache — and gate only the LLM extractors.
  const trackerDefs = extractors.filter((e) => e.role === 'tracker');
  const llmDefs = extractors.filter((e) => e.role !== 'tracker');
  const trackerResults = trackerDefs.map((def) => runTrackerExtractor(def, transcript));

  if (!llmDefs.length) return { results: trackerResults, systemBlocks, suppliedIds };

  const [first, ...rest] = llmDefs;

  let releaseGate;
  const gate = new Promise((resolve) => { releaseGate = resolve; });
  let firstCallSeen = false;
  const gatedCallLlm = (args) => {
    const p = callLlm(args);
    if (!firstCallSeen) {
      firstCallSeen = true;
      p.then(releaseGate, releaseGate);
    }
    return p;
  };

  const firstPromise = runExtractorCall({ extractorDef: first, systemBlocks, suppliedIds, model, callLlm: gatedCallLlm, onCall });
  await gate; // extractor #1's first response has landed — cache write is done, safe to fan out

  const limit = pLimit(concurrency);
  const restPromises = rest.map((def) =>
    limit(() => runExtractorCall({ extractorDef: def, systemBlocks, suppliedIds, model, callLlm, onCall })));

  const settled = await Promise.allSettled([firstPromise, ...restPromises]);
  const llmResults = settled.map((s) => (s.status === 'fulfilled'
    ? s.value
    : { status: 'failed', reason: s.reason?.name ?? 'internal_error', error: String(s.reason?.message ?? s.reason) }));

  return { results: [...trackerResults, ...llmResults], systemBlocks, suppliedIds };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// node src/extract.js --fixture stereo   (canned LLM responses, no key needed)
// node src/extract.js --live --call-id <id> [--budget usd]

function parseArgs(argv) {
  const args = { fixture: null, live: false, budget: 1.0, callId: 'cli-run' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--fixture') args.fixture = argv[i += 1];
    else if (a === '--live') args.live = true;
    else if (a === '--budget') args.budget = Number(argv[i += 1]);
    else if (a === '--call-id') args.callId = argv[i += 1];
  }
  return args;
}

// Canned "ok" scenario over the real stereo probe fixture (research/00-api-
// probe/stereo_result.json): every quote is copied verbatim from the
// transcript it dispatches to by schema shape, so a `--fixture stereo` run
// exercises the whole real pipeline (registry -> prompt -> gate -> bundle)
// end to end with zero network and a genuine SHIPPED outcome.
function makeFixtureCallLlm() {
  const OBJECTIONS = JSON.stringify({
    objections: [{
      evidence: [{ utterance_id: 1, quote: 'my main concern is pricing your competitor quoted as almost forty less last week' }],
      category: 'price',
      text: 'my main concern is pricing your competitor quoted as almost forty less last week',
    }],
  });
  const SUMMARY = JSON.stringify({
    sections: [
      {
        title: 'Outcome',
        blocks: [{
          evidence: [{ utterance_id: 0, quote: 'i wanted to walk you through how our dialer handles compliance' }],
          text: 'Rep opened the call to walk the buyer through how the dialer handles compliance.',
        }],
      },
      {
        title: 'Next steps',
        blocks: [{
          evidence: [{ utterance_id: 2, quote: 'let me show you the total cost picture including answering machine detection' }],
          text: 'Rep to show the buyer the total cost picture, including answering machine detection.',
        }],
      },
    ],
  });
  let callsMade = 0;
  return async ({ messages }) => {
    const taskText = messages[0]?.content?.[0]?.text ?? '';
    const text = taskText.includes('"objections"') ? OBJECTIONS : SUMMARY;
    callsMade += 1;
    // First call of the run lands the cache write; every call after it is
    // read-expected — simulate that here so the demo ledger reads the way a
    // real serialize-first run does, instead of tripping the silent-miss
    // assertion on canned data that was never going to hit a real cache.
    const usage = callsMade === 1
      ? { input_tokens: 780, output_tokens: 140, cache_creation_input_tokens: 780, cache_read_input_tokens: 0 }
      : { input_tokens: 120, output_tokens: 140, cache_creation_input_tokens: 0, cache_read_input_tokens: 780 };
    return {
      text,
      stop_reason: 'end_turn',
      model: 'claude-sonnet-5-fixture',
      usage,
    };
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { runPipeline, formatFinalLine, DEFAULT_RUNS_ROOT } = await import('./run.js');

  const extractorRegistry = loadExtractors(DEFAULT_EXTRACTORS_DIR);
  const extractorDefs = Object.values(extractorRegistry).filter((e) => e.enabled);

  let transcript;
  if (args.fixture === 'stereo') {
    const probePath = path.join(__dirname, '..', 'research', '00-api-probe', 'stereo_result.json');
    const probe = JSON.parse(readFileSync(probePath, 'utf8'));
    transcript = buildTranscript(probe.result);
  } else {
    console.error('usage: node src/extract.js --fixture stereo | --live --call-id <id> [--budget usd]');
    process.exit(64);
  }

  let callLlm;
  if (args.live) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[ANTHROPIC_KEY_MISSING] set ANTHROPIC_API_KEY to run --live extraction');
      process.exit(64);
    }
    callLlm = (req) => callMessages(req);
  } else {
    callLlm = makeFixtureCallLlm();
  }

  const startedAt = Date.now();
  const record = await runPipeline({
    transcript, extractorDefs, callId: args.callId, budgetUsd: args.budget,
    callLlm, runsRoot: DEFAULT_RUNS_ROOT,
  });
  const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(formatFinalLine(record, elapsedS));
  process.exit(record.exit_code ?? 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(70); });
}
