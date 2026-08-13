// Orchestration: transcript + pack -> scoring prompt -> LLM -> evidence gate ->
// score -> coaching markdown. The LLM call goes through src/llm.js (the repo's
// raw-fetch Anthropic client) with the model from capabilities.json role
// "extraction" — methodology scoring is extraction-class spend on the same
// budget axis, no new role or vendor.
//
// Keyless paths (the demo rule: cached path spends zero keys):
//   - cachedVerdictPath(): replay a committed verdict for a bundled sample.
//   - prepare/complete: write the full LLM request to a file, let any model or
//     human produce the response JSON, resume deterministically (the same
//     agent-as-LLM harness pattern as scripts/extract-offline.mjs).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { callMessages } from '../llm.js';
import { buildScoringPrompt, buildCompilePrompt, verdictSchema, packSchema } from './prompt.js';
import { gateVerdicts } from './gate.js';
import { scoreCall } from './score.js';
import { renderCoaching } from './coach.js';
import { validatePack } from './packs.js';

function extractionModel() {
  const caps = JSON.parse(readFileSync(new URL('../../capabilities.json', import.meta.url), 'utf8'));
  return caps.roles.extraction.model;
}

export async function scoreTranscript({ pack, transcript, transcriptName, provider }) {
  const { system, messages } = buildScoringPrompt(pack, transcript);
  const schema = verdictSchema(pack);

  const raw = await provider({ system, messages, schema, schemaName: 'call_verdict' });
  const verdictOutput = typeof raw === 'string' ? JSON.parse(raw) : raw;

  const gated = gateVerdicts(transcript, verdictOutput);
  const scored = scoreCall(pack, gated);
  const report = renderCoaching(pack, gated, scored, { transcriptName });
  return { verdictOutput, gated, scored, report };
}

export async function compilePack({ freeText, provider }) {
  const { system, messages } = buildCompilePrompt(freeText);
  const raw = await provider({ system, messages, schema: packSchema(), schemaName: 'methodology_pack' });
  const pack = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const errors = validatePack(pack, 'compiled');
  if (errors.length) throw new Error(`COMPILED_PACK_INVALID:\n  ${errors.join('\n  ')}`);
  return pack;
}

// ---- providers -------------------------------------------------------------

export function liveProvider() {
  return async ({ system, messages, schema, schemaName }) => {
    const res = await callMessages({ model: extractionModel(), system, messages, schema, schemaName });
    return res.text;
  };
}

export function mockProvider(fixturePath) {
  return async () => readFileSync(fixturePath, 'utf8');
}

export class Prepared extends Error {
  constructor(outPath) { super(`prepared: ${outPath}`); this.name = 'PREPARED'; this.outPath = outPath; }
}

export function prepareProvider(outPath) {
  return async ({ system, messages, schema, schemaName }) => {
    writeFileSync(outPath, JSON.stringify({ schemaName, system, messages, schema }, null, 2));
    throw new Prepared(outPath);
  };
}

export function completeProvider(responsePath) {
  return async () => readFileSync(responsePath, 'utf8');
}

// Keyless fallback: a cached verdict shipped next to the transcript —
// <transcript dir>/cached/<basename-without-ext>.<packId>.verdict.json.
export function cachedVerdictPath(transcriptPath, packId) {
  const dir = dirname(transcriptPath);
  const base = basename(transcriptPath).replace(/\.[^.]+$/, '');
  const p = join(dir, 'cached', `${base}.${packId}.verdict.json`);
  return existsSync(p) ? p : null;
}
