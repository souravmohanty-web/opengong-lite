#!/usr/bin/env node
// Generates the routed follow-up email for every sample call whose claims fire
// a template, and caches the screened result under samples/emails/.
//
// WHY A CACHE. The demo runs with no key and no network. The notes page renders
// this artifact, never the live model, so a dead conference wifi cannot take the
// beat down. The live path is the same code either way: only where the
// completion comes from changes.
//
//   node scripts/generate-template-email.mjs              # every call
//   node scripts/generate-template-email.mjs --call 02    # one call
//   LLM_API_KEY=... node scripts/generate-template-email.mjs   # a configured endpoint
//
// The tier is picked once, for the whole run, in this order:
//   1. LLM_API_KEY set -> that OpenAI-compatible endpoint (LLM_BASE_URL, default
//      Groq; LLM_MODEL) at temperature 0.
//   2. No key, but Ollama is running on 127.0.0.1:11434 -> drafts locally,
//      no key needed. Picks an installed model itself (LLM_MODEL overrides).
//   3. Neither -> the completion is read from
//      samples/emails/authored/NN.draft.json, a draft written offline in the
//      shape the model must return. It still goes through the SAME parser and
//      the SAME screenDraft() choke as a live answer, and it is labelled model
//      "offline-author" in provenance. It is never labelled as a model run
//      that did not happen.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateTemplateEmail, completeWithOpenAI, resolveLLMTier } from '../src/template-email.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_DIR = join(ROOT, 'templates');
const BUNDLES_DIR = join(ROOT, 'samples/bundles');
const OUT_DIR = join(ROOT, 'samples/emails');
const AUTHORED_DIR = join(OUT_DIR, 'authored');

// Deal facts the caller owns (samples/DEAL-STATE.md). The renderer never infers
// a name; if it is not passed, it does not render.
const DEAL_NAME = 'Brightsmile Dental Group';
const OWNERS = { rep: 'Maya', buyer: 'Rahul', joint: 'Both', unknown: '' };

export const OFFLINE_NOTE = 'authored offline, screened by the real choke; regenerate live with LLM_API_KEY, or start Ollama locally and rerun with no key';

export function loadTemplates(dir = TEMPLATES_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

export function loadBundles(dir = BUNDLES_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.bundle.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

// The offline author, standing in for the model. Reads a hand-written draft in
// the model's own output shape and hands it back as a completion, so the parser
// and the screen do exactly what they would do to a live answer.
export function offlineAuthor(callId, dir = AUTHORED_DIR) {
  const path = join(dir, `${callId}.draft.json`);
  return async () => {
    if (!existsSync(path)) {
      throw Object.assign(new Error(`no authored draft at ${path}`), { name: 'LLM_KEY_MISSING' });
    }
    return { text: readFileSync(path, 'utf8'), model: 'offline-author', base_url: null };
  };
}

// tier.source is one of 'configured' | 'ollama-local' | 'offline'. The offline
// branch stamps model/base_url/note itself, same as it always has; the two
// live branches keep whatever generateTemplateEmail already put in
// result.provenance (it already carries the "via local Ollama" suffix and the
// source field for the ollama-local case) and only add the run-level note.
export function artifactFor(bundle, result, { tier }) {
  const t = result.template;
  const note = tier.source === 'offline'
    ? OFFLINE_NOTE
    : tier.source === 'ollama-local'
      ? 'live local model run, no key needed, screened by the same choke as the baseline draft'
      : 'live model run, screened by the same choke as the baseline draft';
  return {
    call_id: bundle.call?.id ?? null,
    template: {
      id: t.id,
      version: t.version,
      title: t.title,
      short: t.short,
      explainer: t.panel.explainer,
    },
    draft: {
      subject: result.draft.subject,
      greeting: result.draft.greeting,
      opener: result.draft.opener,
      outcome: result.draft.outcome,
      recap: result.draft.recap,
      next_steps: result.draft.next_steps,
      assurance: result.draft.assurance,
      signoff: result.draft.signoff,
      body: result.draft.body,
      bullets: result.draft.bullets,
    },
    screen: {
      cut: result.cut,
      off_template_cut: result.off_template_cut,
      bullets: result.draft.bullets.length,
      claim_ids: result.draft.bullets.map((b) => b.claim_id),
    },
    provenance: tier.source === 'offline'
      ? { ...result.provenance, model: 'offline-author', base_url: null, source: 'offline-author', note }
      : { ...result.provenance, note },
    routing: { considered: result.considered },
    generated_at: new Date().toISOString(),
  };
}

export async function generateAll({ only = null, outDir = OUT_DIR, quiet = false } = {}) {
  const templates = loadTemplates();
  const bundles = loadBundles();
  // One tier decision for the whole run: a key wins outright (Ollama is never
  // probed), otherwise one short local probe, otherwise the offline cache.
  const tier = await resolveLLMTier({ env: process.env });
  mkdirSync(outDir, { recursive: true });

  if (!quiet) {
    if (tier.source === 'configured') console.log(`LLM tier: configured endpoint (${tier.baseURL}, model ${tier.model})`);
    else if (tier.source === 'ollama-local') console.log(`LLM tier: local Ollama detected, no key needed (model ${tier.model})`);
    else console.log('LLM tier: no key, no local Ollama running. Using the offline cache.');
  }

  const written = [];
  const skipped = [];
  for (let i = 0; i < bundles.length; i += 1) {
    const bundle = bundles[i];
    const callId = bundle.call?.id ?? String(i + 1);
    if (only && callId !== only) continue;

    const complete = tier.source === 'offline'
      ? offlineAuthor(callId)
      : (prompt, opts) => completeWithOpenAI(prompt, {
        ...opts, apiKey: tier.apiKey, baseURL: tier.baseURL, model: tier.model, source: tier.source,
      });

    const result = await generateTemplateEmail(bundle, templates, {
      deal: { priorBundles: bundles.slice(0, i) },
      dealName: DEAL_NAME,
      recipient: OWNERS.buyer,
      sender: OWNERS.rep,
      owners: OWNERS,
      complete,
      model: tier.model,
    });

    if (!result.ok) {
      skipped.push({ callId, reason: result.reason, error: result.error ?? null });
      if (!quiet) console.log(`call ${callId}: no routed email (${result.reason})`);
      continue;
    }
    const artifact = artifactFor(bundle, result, { tier });
    const path = join(outDir, `${callId}.template-email.json`);
    writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
    written.push({ callId, templateId: result.template_id, cut: result.cut, path });
    if (!quiet) {
      console.log(`call ${callId}: ${result.template_id} (${result.draft.bullets.length} backed lines, ${result.cut} cut) -> samples/emails/${callId}.template-email.json`);
    }
  }
  if (!quiet) {
    console.log(tier.source === 'offline'
      ? 'source: offline-author, screened by the real choke. Set LLM_API_KEY to regenerate live, or start Ollama locally and rerun with no key.'
      : `source: ${tier.source === 'ollama-local' ? 'local Ollama, no key needed' : 'live model'}. Provenance says so.`);
  }
  return { written, skipped, live: tier.source !== 'offline', tier: tier.source };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const callIdx = argv.indexOf('--call');
  const only = callIdx >= 0 ? argv[callIdx + 1] : null;
  generateAll({ only }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
