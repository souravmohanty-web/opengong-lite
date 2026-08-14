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
//   LLM_API_KEY=... node scripts/generate-template-email.mjs   # live model
//
// With LLM_API_KEY set, the draft comes from an OpenAI-compatible endpoint
// (LLM_BASE_URL, default Groq; LLM_MODEL, default a free llama) at temperature 0.
// With no key, the completion is read from samples/emails/authored/NN.draft.json:
// a draft written offline in the shape the model must return. It still goes
// through the SAME parser and the SAME screenDraft() choke as a live answer, and
// it is labelled model "offline-author" in provenance. It is never labelled as a
// model run that did not happen.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateTemplateEmail, completeWithOpenAI, DEFAULT_MODEL } from '../src/template-email.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_DIR = join(ROOT, 'templates');
const BUNDLES_DIR = join(ROOT, 'samples/bundles');
const OUT_DIR = join(ROOT, 'samples/emails');
const AUTHORED_DIR = join(OUT_DIR, 'authored');

// Deal facts the caller owns (samples/DEAL-STATE.md). The renderer never infers
// a name; if it is not passed, it does not render.
const DEAL_NAME = 'Brightsmile Dental Group';
const OWNERS = { rep: 'Maya', buyer: 'Rahul', joint: 'Both', unknown: '' };

export const OFFLINE_NOTE = 'authored offline, screened by the real choke; regenerate live with LLM_API_KEY';

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

export function artifactFor(bundle, result, { live }) {
  const t = result.template;
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
    provenance: live
      ? { ...result.provenance, note: 'live model run, screened by the same choke as the baseline draft' }
      : { ...result.provenance, model: 'offline-author', base_url: null, note: OFFLINE_NOTE },
    routing: { considered: result.considered },
    generated_at: new Date().toISOString(),
  };
}

export async function generateAll({ only = null, outDir = OUT_DIR, quiet = false } = {}) {
  const templates = loadTemplates();
  const bundles = loadBundles();
  const live = Boolean(process.env.LLM_API_KEY);
  mkdirSync(outDir, { recursive: true });

  const written = [];
  const skipped = [];
  for (let i = 0; i < bundles.length; i += 1) {
    const bundle = bundles[i];
    const callId = bundle.call?.id ?? String(i + 1);
    if (only && callId !== only) continue;

    const result = await generateTemplateEmail(bundle, templates, {
      deal: { priorBundles: bundles.slice(0, i) },
      dealName: DEAL_NAME,
      recipient: OWNERS.buyer,
      sender: OWNERS.rep,
      owners: OWNERS,
      complete: live ? completeWithOpenAI : offlineAuthor(callId),
      model: process.env.LLM_MODEL ?? DEFAULT_MODEL,
    });

    if (!result.ok) {
      skipped.push({ callId, reason: result.reason, error: result.error ?? null });
      if (!quiet) console.log(`call ${callId}: no routed email (${result.reason})`);
      continue;
    }
    const artifact = artifactFor(bundle, result, { live });
    const path = join(outDir, `${callId}.template-email.json`);
    writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
    written.push({ callId, templateId: result.template_id, cut: result.cut, path });
    if (!quiet) {
      console.log(`call ${callId}: ${result.template_id} (${result.draft.bullets.length} backed lines, ${result.cut} cut) -> samples/emails/${callId}.template-email.json`);
    }
  }
  if (!quiet) {
    console.log(live
      ? 'source: live model. Provenance says so.'
      : 'source: offline-author, screened by the real choke. Set LLM_API_KEY to regenerate live.');
  }
  return { written, skipped, live };
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
