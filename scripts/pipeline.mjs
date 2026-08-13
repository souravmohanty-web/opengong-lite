#!/usr/bin/env node
// ONE end-to-end command: audio in, receipts bundle + follow-up email out.
//
//   node scripts/pipeline.mjs <audio-file-or-url> [--call-id ID] [--budget USD]
//   npm run pipeline -- <audio-file-or-url>
//
// The full chain, wired for real (this is the piece that was missing — every
// stage below existed and was tested in isolation, but ingest.js was never
// actually connected to a full run before this file):
//
//   ingest (src/ingest.js submitJob -> pollJob -> buildTranscript)
//     -> extraction, mode chosen by src/fallback.js:
//          ANTHROPIC_API_KEY set -> real LLM extraction (src/extract.js
//            runExtraction, the same path node src/extract.js --live takes)
//          no key -> DETERMINISTIC extraction: tracker family only
//            (src/extract.js scanTrackerClaims via role:"tracker" — zero AI,
//            zero spend, 100% receipt-verifiable by construction). Honestly
//            labeled: bundle.provenance.extraction_mode +
//            run.json's extraction_mode/extraction_note/
//            extractors_skipped_no_key name exactly what did NOT run.
//     -> injection screen + per-claim gate + coverage grade (src/run.js
//        runPipeline: src/injection.js + src/gate.js, unchanged)
//     -> buildBundle (src/bundle.js, reused verbatim)
//     -> composeEmail + screenDraft (src/email.js, reused verbatim) from the
//        bundle's gated claims — never from the transcript (choke point).
//
// A Recap tier (the colleague build's D4 chain has ingest -> extraction ->
// recap -> ...) is deliberately NOT implemented: this sandbox has no recap
// scope and probing one bills real money. TODO seam: src/fallback.js's
// module docstring names exactly where a 'recap' role would slot in, between
// the LLM and deterministic tiers. Nothing here calls it or pretends it runs.
//
// Live ingest (the Hear leg) needs a working PyAI key — see README "Try it".
// This script never mocks that leg for a real run; ingestFn is only ever
// swapped for a committed fixture inside test/pipeline.test.js.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingest } from '../src/ingest.js';
import { PyAiError } from '../src/pyai.js';
import { DEFAULT_EXTRACTORS_DIR } from '../src/extract.js';
import { loadExtractors, DEFAULT_SCHEMAS_DIR } from '../src/registry.js';
import { selectExtractionPlan, EXTRACTION_MODES } from '../src/fallback.js';
import { callMessages, LlmError } from '../src/llm.js';
import { runPipeline, DEFAULT_RUNS_ROOT, formatFinalLine } from '../src/run.js';
import { composeEmail, screenDraft } from '../src/email.js';
import { writeAtomic, readJson } from '../src/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── source resolution ────────────────────────────────────────────────────────
// One positional arg, either an http(s) URL (PyAI fetches it server-side) or
// a local file path (uploaded as multipart) — src/ingest.js's submitJob
// already demands exactly one of {filePath, audioUrl}; this is just the CLI's
// job of picking which one the caller meant.
export function resolveSource(arg) {
  if (!arg) throw new Error('usage: node scripts/pipeline.mjs <audio-file-or-url>');
  if (/^https?:\/\//i.test(arg)) return { audioUrl: arg };
  return { filePath: path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg) };
}

function defaultCallId(source) {
  const raw = source.filePath ? path.basename(source.filePath) : source.audioUrl;
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'pipeline-run';
}

// ── the chain from a transcript onward ───────────────────────────────────────
// Split out from ingestAndRun so the fallback + gate + bundle + email chain
// can be proven with a fixture transcript, no ingest/network involved at all
// (test/pipeline.test.js's fallback + gate proofs use this directly).
export async function runFromTranscript({
  transcript, callId = 'pipeline-run', budgetUsd = 1.0, runsRoot = DEFAULT_RUNS_ROOT,
  env = process.env, extractorsDir = DEFAULT_EXTRACTORS_DIR, schemasDir = DEFAULT_SCHEMAS_DIR,
  callLlmOverride, extractorDefsOverride,
} = {}) {
  const extractorDefs = extractorDefsOverride
    ?? Object.values(loadExtractors(extractorsDir, { schemasDir })).filter((e) => e.enabled);

  const plan = selectExtractionPlan(extractorDefs, { env });
  const callLlm = callLlmOverride
    ?? (plan.mode === EXTRACTION_MODES.LLM ? (req) => callMessages({ ...req, apiKey: env.ANTHROPIC_API_KEY }) : undefined);

  const record = await runPipeline({
    transcript, extractorDefs: plan.extractorDefs, callId, budgetUsd, callLlm, runsRoot,
    extractionMode: plan.mode, extractionNote: plan.note, extractorsSkipped: plan.extractorsSkipped,
  });

  const bundlePath = path.join(runsRoot, record.run_id, 'bundle.json');
  let bundle = null;
  let email = null;
  try {
    bundle = readJson(bundlePath);
  } catch {
    // GATE_BLOCKED_UNPROVEN_CLAIMS (or any exit before bundle.json is
    // written) — no bundle means no claims to email from. Never fabricate one.
  }
  if (bundle) {
    const emailDraft = composeEmail(bundle.claims, { title: bundle.call?.title ?? callId });
    email = screenDraft(emailDraft, bundle.claims); // defense in depth: same choke point the deterministic draft already passes
    writeAtomic(path.join(runsRoot, record.run_id, 'email.json'), email);
  }

  return { record, plan, bundle, email };
}

// ── ingest + the rest of the chain ──────────────────────────────────────────
export async function ingestAndRun({
  source, callId, budgetUsd = 1.0, runsRoot = DEFAULT_RUNS_ROOT, env = process.env,
  ingestFn = ingest, extractorsDir, schemasDir, callLlmOverride, extractorDefsOverride,
} = {}) {
  const resolvedCallId = callId ?? defaultCallId(source);
  const { job_id, transcript } = await ingestFn(source);
  const result = await runFromTranscript({
    transcript, callId: resolvedCallId, budgetUsd, runsRoot, env, extractorsDir, schemasDir,
    callLlmOverride, extractorDefsOverride,
  });
  return { job_id, ...result };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgv(argv) {
  const args = { source: null, callId: null, budget: 1.0 };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--call-id') args.callId = argv[i += 1];
    else if (a === '--budget') args.budget = Number(argv[i += 1]);
    else positional.push(a);
  }
  args.source = positional[0];
  return args;
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  if (!args.source) {
    console.error('usage: node scripts/pipeline.mjs <audio-file-or-url> [--call-id ID] [--budget USD]');
    process.exit(2);
  }
  const source = resolveSource(args.source);

  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  console.error(`[pipeline] extraction mode: ${hasKey ? 'llm-extraction (ANTHROPIC_API_KEY set)' : 'deterministic-trackers-only (no ANTHROPIC_API_KEY — keyless fallback)'}`);

  const startedAt = Date.now();
  let outcome;
  try {
    outcome = await ingestAndRun({
      source, callId: args.callId, budgetUsd: args.budget, runsRoot: DEFAULT_RUNS_ROOT,
    });
  } catch (err) {
    if (err instanceof PyAiError) {
      console.error(`[${err.name}] ${err.message} — the ingest (Hear) leg needs a working PyAI key; see README "Try it"`);
      process.exit(64);
    }
    if (err instanceof LlmError) {
      console.error(`[${err.name}] ${err.message}`);
      process.exit(64);
    }
    throw err;
  }

  const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(formatFinalLine(outcome.record, elapsedS));
  console.log(`extraction_mode: ${outcome.plan.mode}${outcome.plan.note ? ` — ${outcome.plan.note}` : ''}`);
  if (outcome.plan.extractorsSkipped.length) {
    console.log(`extractors skipped (no key, never attempted): ${outcome.plan.extractorsSkipped.join(', ')}`);
  }
  console.log(`job_id: ${outcome.job_id}`);
  console.log(`run dir: ${path.relative(ROOT, path.join(DEFAULT_RUNS_ROOT, outcome.record.run_id))}`);

  if (outcome.email) {
    console.log('\n── follow-up email (verified claims only) ──');
    console.log(`Subject: ${outcome.email.subject}`);
    console.log(outcome.email.body);
    if (outcome.email.cut) console.log(`(${outcome.email.cut} uncited bullet(s) cut by the choke point)`);
  } else {
    console.log('\nno bundle produced — nothing verified enough to email (see run.json exit_reason)');
  }

  process.exit(outcome.record.exit_code ?? 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(70); });
}
