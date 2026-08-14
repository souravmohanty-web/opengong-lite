// Template-routed, LLM-drafted follow-up email (issue #2).
//
// The shape of the thing: a call's gate-verified claims pick a TEMPLATE FILE off
// the library in templates/, that template plus those claims become the model's
// entire input, the model writes prose, and the draft comes straight back
// through screenDraft() in src/email.js — the same choke point the deterministic
// baseline goes through, untouched. Second-person rewriting is allowed in the
// model step precisely because the screen re-validates every asserting line
// afterwards: a bullet with no claim id is cut and counted, and a bullet citing
// an id that is not a verified claim rejects the WHOLE draft.
//
// Nothing here reads the transcript. The model sees claim text and the quote the
// gate already matched, never the raw call. Nothing here reads the filesystem or
// the network at import time either: routing and rendering are pure, so the
// notes page and the tests exercise the exact code the live path runs.
//
// Routing is written against claim SCHEMAS (section, extractor, and the
// extractor's own enum fields), never against the words of any one deal. A
// template whose trigger cannot be answered by the claims in front of it simply
// does not fire, and a call where nothing fires returns null: the caller falls
// back to the deterministic baseline email. Null is a valid answer.

import { screenDraft, stepMeta, EmailError } from './email.js';

export const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
// Free Groq llama. Override with LLM_MODEL for any other OpenAI-compatible
// endpoint (an Ollama tag, a newer Groq model id) — nothing here is Groq-shaped
// beyond the default.
export const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const EMAILABLE = new Set(['verified', 'segment_corrected']);
const SLOT_ROLES = new Set(['outcome', 'recap', 'next_steps']);
const BLOCK_TYPES = new Set(['text', 'slot', 'instruction']);

export class TemplateError extends Error {
  constructor(name, message, extra = {}) {
    super(message);
    this.name = name;
    Object.assign(this, extra);
  }
}

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '_');
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ── the template file contract ───────────────────────────────────────────────

// Validation is deliberately strict and deliberately dumb: a template is data on
// disk, so a typo in a field name must fail loudly at load, not route silently
// to nothing at 9am on demo day.
export function validateTemplate(template) {
  const t = template;
  if (!isObj(t)) throw new TemplateError('TEMPLATE_INVALID', 'template must be an object');
  const where = (msg) => `template ${JSON.stringify(t.id ?? '(no id)')}: ${msg}`;
  for (const field of ['id', 'version', 'title', 'short', 'subject']) {
    if (typeof t[field] !== 'string' || !t[field].trim()) {
      throw new TemplateError('TEMPLATE_INVALID', where(`${field} must be a non-empty string`));
    }
  }
  if (!Number.isFinite(t.priority)) throw new TemplateError('TEMPLATE_INVALID', where('priority must be a number'));
  if (!isObj(t.panel) || typeof t.panel.explainer !== 'string' || !t.panel.explainer.trim()) {
    throw new TemplateError('TEMPLATE_INVALID', where('panel.explainer must be a non-empty string'));
  }
  if (!isObj(t.routing) || !isObj(t.routing.trigger)) {
    throw new TemplateError('TEMPLATE_INVALID', where('routing.trigger must be an object'));
  }
  const trig = t.routing.trigger;
  for (const key of Object.keys(trig)) {
    if (!['any_of', 'all_of', 'none_of'].includes(key)) {
      throw new TemplateError('TEMPLATE_INVALID', where(`unknown trigger key ${JSON.stringify(key)}`));
    }
    if (!Array.isArray(trig[key])) throw new TemplateError('TEMPLATE_INVALID', where(`trigger.${key} must be an array`));
    for (const cond of trig[key]) validateCondition(cond, where);
  }
  // A trigger that only says none_of fires on every call that is missing
  // something, which is not a trigger, it is a catch-all.
  if (!(trig.any_of?.length || trig.all_of?.length)) {
    throw new TemplateError('TEMPLATE_INVALID', where('trigger needs at least one any_of or all_of condition'));
  }
  if (!Array.isArray(t.blocks) || t.blocks.length === 0) {
    throw new TemplateError('TEMPLATE_INVALID', where('blocks must be a non-empty array'));
  }
  for (const b of t.blocks) {
    if (!isObj(b) || !BLOCK_TYPES.has(b.type)) {
      throw new TemplateError('TEMPLATE_INVALID', where('every block needs type text, slot or instruction'));
    }
    if (b.type === 'text' && typeof b.text !== 'string') {
      throw new TemplateError('TEMPLATE_INVALID', where('a text block needs text'));
    }
    if (b.type === 'instruction' && typeof b.text !== 'string') {
      throw new TemplateError('TEMPLATE_INVALID', where('an instruction block needs text'));
    }
    if (b.type === 'slot') {
      if (!SLOT_ROLES.has(b.role)) {
        throw new TemplateError('TEMPLATE_INVALID', where(`slot role must be one of ${[...SLOT_ROLES].join(', ')}`));
      }
      const dealSlot = norm(b.scope) === 'deal';
      if (!dealSlot && typeof b.section !== 'string') {
        throw new TemplateError('TEMPLATE_INVALID', where('a call slot needs a claim section'));
      }
      if (dealSlot && norm(b.source) !== 'open_rep_promises') {
        throw new TemplateError('TEMPLATE_INVALID', where('a deal slot needs a known source'));
      }
      if (b.where !== undefined) validateWhere(b.where, where);
    }
  }
  return t;
}

function validateWhere(w, where) {
  if (!isObj(w)) throw new TemplateError('TEMPLATE_INVALID', where('where must be an object of field to allowed values'));
  for (const [field, allowed] of Object.entries(w)) {
    if (!Array.isArray(allowed) || allowed.length === 0) {
      throw new TemplateError('TEMPLATE_INVALID', where(`where.${field} must be a non-empty array`));
    }
  }
}

function validateCondition(cond, where) {
  if (!isObj(cond)) throw new TemplateError('TEMPLATE_INVALID', where('every condition must be an object'));
  if (norm(cond.scope) === 'deal') {
    if (!['open_rep_promises', 'days_since_last_call'].includes(norm(cond.metric))) {
      throw new TemplateError('TEMPLATE_INVALID', where(`unknown deal metric ${JSON.stringify(cond.metric)}`));
    }
    if (cond.min !== undefined && !Number.isFinite(cond.min)) {
      throw new TemplateError('TEMPLATE_INVALID', where('condition min must be a number'));
    }
    return;
  }
  if (typeof cond.section !== 'string' && typeof cond.extractor !== 'string') {
    throw new TemplateError('TEMPLATE_INVALID', where('a call condition needs a section or an extractor'));
  }
  if (cond.where !== undefined) validateWhere(cond.where, where);
}

// ── the claim pool ───────────────────────────────────────────────────────────

// The ONLY claims routing and rendering ever see. Everything the gate did not
// pass (uncorroborated, blocked_injection) is gone before a trigger is read, so
// a planted line can never be the reason a template fires.
export function backedClaims(bundle) {
  const claims = Array.isArray(bundle?.claims) ? bundle.claims : [];
  return claims.filter((c) => isObj(c) && EMAILABLE.has(c.status));
}

const sectionKey = (claim) => norm(claim.section ?? claim.extractor);

function matchesWhere(claim, filter) {
  for (const [field, allowed] of Object.entries(filter ?? {})) {
    const value = norm(claim[field]);
    if (!value) return false;
    if (!allowed.some((a) => norm(a) === value)) return false;
  }
  return true;
}

function selectClaims(pool, spec) {
  return pool.filter((c) => {
    if (spec.section && sectionKey(c) !== norm(spec.section)) return false;
    if (spec.extractor && norm(c.extractor) !== norm(spec.extractor)) return false;
    return matchesWhere(c, spec.where);
  });
}

// Promises the rep made on EARLIER calls of this deal, re-identified by call so
// two calls that both wrote `next_steps-0` can never be confused for each other.
// These are gate-verified claims like any other and the screen checks them the
// same way; the only difference is which call they came from.
export function openRepPromises(deal = {}) {
  const prior = Array.isArray(deal.priorBundles) ? deal.priorBundles : [];
  const out = [];
  for (const b of prior) {
    const callId = String(b?.call?.id ?? '').trim();
    if (!callId) continue;
    for (const c of backedClaims(b)) {
      if (norm(c.extractor) !== 'next_steps') continue;
      if (norm(c.owner) !== 'rep') continue;
      if (norm(c.type) === 'no_next_step') continue;
      out.push({ ...c, id: `${callId}:${c.id}`, call_id: callId, section: 'commitments' });
    }
  }
  return out;
}

function dealMetrics(deal = {}) {
  const days = Number(deal.daysSinceLastCall);
  return {
    open_rep_promises: openRepPromises(deal).length,
    days_since_last_call: Number.isFinite(days) ? days : NaN,
  };
}

function evalCondition(cond, env) {
  if (norm(cond.scope) === 'deal') {
    const value = env.metrics[norm(cond.metric)];
    // No deal context, or a metric this deal cannot answer, is a quiet false.
    // A template never fires on a number nobody supplied.
    if (!Number.isFinite(value)) return false;
    return value >= (cond.min ?? 1);
  }
  const n = selectClaims(env.pool, cond).length;
  if (cond.exists === false) return n === 0;
  return n >= (cond.min ?? 1);
}

export function triggerFires(template, env) {
  const t = template.routing.trigger;
  const any = t.any_of?.length ? t.any_of.some((c) => evalCondition(c, env)) : true;
  if (!any) return false;
  const all = t.all_of?.length ? t.all_of.every((c) => evalCondition(c, env)) : true;
  if (!all) return false;
  const none = t.none_of?.length ? !t.none_of.some((c) => evalCondition(c, env)) : true;
  return none;
}

// ── routing ──────────────────────────────────────────────────────────────────

// Picks ONE template, from gate-verified claims only, in declared priority
// order. Returns null when nothing fires, and null means the caller keeps the
// deterministic baseline email. Never force a template onto a call.
export function routeTemplate(bundle, templates, ctx = {}) {
  return routeWithTrace(bundle, templates, ctx).template;
}

// Same routing, with the ladder it walked. Useful in provenance and in tests:
// the reason a call got the template it got is which triggers said no first.
export function routeWithTrace(bundle, templates, ctx = {}) {
  if (!isObj(bundle) || !Array.isArray(bundle.claims)) {
    throw new TemplateError('ROUTE_INPUT_INVALID', 'routeTemplate needs a bundle with a claims array');
  }
  const list = (Array.isArray(templates) ? templates : []).map((t) => validateTemplate(t));
  const env = { pool: backedClaims(bundle), metrics: dealMetrics(ctx.deal ?? {}) };
  const ordered = [...list].sort((a, b) => (a.priority - b.priority) || a.id.localeCompare(b.id));
  const considered = [];
  let picked = null;
  for (const t of ordered) {
    const fired = triggerFires(t, env);
    considered.push({ id: t.id, priority: t.priority, fired });
    if (fired && !picked) picked = t;
  }
  return { template: picked, considered };
}

// ── the model's input ────────────────────────────────────────────────────────

function resolveText(text, facts) {
  let missing = false;
  const out = String(text).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = facts[key];
    if (value == null || String(value).trim() === '') { missing = true; return ''; }
    return String(value);
  });
  return { out, missing };
}

function claimForModel(claim, owners) {
  const out = {
    id: claim.id,
    section: sectionKey(claim),
    text: claim.text,
    quote: claim.evidence?.[0]?.quote ?? null,
  };
  if (claim.call_id) out.call_id = claim.call_id;
  const meta = norm(claim.extractor) === 'next_steps' ? stepMeta(claim, owners) : null;
  if (meta) { out.owner = meta.owner; out.due = meta.due; out.meta = meta.label; }
  return out;
}

// Assembles everything the model is allowed to see: the template's blocks with
// their slots already filled from gate-verified claims, the backed claims
// themselves (id, text, and the quote the gate matched), and the deal facts the
// caller owns (who was on the call). No transcript, ever.
export function renderContext(bundle, template, ctx = {}) {
  validateTemplate(template);
  const owners = ctx.owners ?? {};
  const pool = backedClaims(bundle);
  const dealPool = openRepPromises(ctx.deal ?? {});
  const facts = {
    recipient: ctx.recipient ?? null,
    sender: ctx.sender ?? null,
    call: ctx.title ?? bundle?.call?.title ?? null,
    deal: ctx.dealName ?? null,
  };

  const blocks = [];
  const used = new Map();
  for (const b of template.blocks) {
    if (b.type === 'text') {
      const { out, missing } = resolveText(b.text, facts);
      const text = missing ? (typeof b.fallback === 'string' ? b.fallback : null) : out;
      if (text) blocks.push({ type: 'text', role: b.role ?? null, text });
      continue;
    }
    if (b.type === 'instruction') {
      blocks.push({ type: 'instruction', text: b.text });
      continue;
    }
    const source = norm(b.scope) === 'deal' ? dealPool : pool;
    let claims = selectClaims(source, b);
    if (Number.isFinite(b.limit)) claims = claims.slice(0, b.limit);
    // An empty slot renders nothing. It never gets filled with a plausible line.
    if (!claims.length) continue;
    for (const c of claims) if (!used.has(c.id)) used.set(c.id, c);
    blocks.push({
      type: 'slot',
      role: b.role,
      label: b.label ?? null,
      section: b.scope === 'deal' ? 'commitments' : norm(b.section),
      hint: b.hint ?? null,
      claims: claims.map((c) => claimForModel(c, owners)),
    });
  }

  const offered = [...used.values()];
  return {
    template: { id: template.id, version: template.version, title: template.title, short: template.short, subject: template.subject, word_limit: template.word_limit ?? 120 },
    call: { id: bundle?.call?.id ?? null, title: facts.call },
    deal: { name: facts.deal, recipient: facts.recipient, sender: facts.sender },
    blocks,
    claims: offered.map((c) => claimForModel(c, owners)),
    allowed_ids: offered.map((c) => c.id),
    // Every id the gate passed on this call, offered or not. The difference
    // matters: a backed claim this template did not offer is off-contract and
    // gets cut, but an id that is not in here at all is ungrounded, and an
    // ungrounded citation must reach the screen so the screen can reject the
    // whole draft. Cutting it here would quietly downgrade the Iron Law.
    backed_ids: [...pool, ...dealPool].map((c) => c.id),
    // What the screen checks against: every claim on this call in its raw gate
    // status (so an uncorroborated or blocked id is rejected, not quietly
    // missing) plus the earlier-call promises the deal slots offered.
    screen_claims: [...(bundle?.claims ?? []), ...dealPool],
  };
}

// ── the prompt ───────────────────────────────────────────────────────────────

export const VOICE_RULES = [
  'No dashes as punctuation.',
  'Never write "X, not Y" as a rhetorical flourish.',
  'No AI filler words: delve, leverage, seamless, robust, elevate, unlock, landscape, realm, testament, tapestry, crucial, game-changer.',
  'Short human sentences. Second person.',
  'Say backed, not found in the call, or blocked. Never verified, uncorroborated, or blocked_injection.',
  'Numbers exactly as the claim writes them. Never turn a number word into a digit, and never write a bare percentage.',
];

export function buildPrompt(context) {
  const t = context.template;
  const system = [
    'You write a sales follow-up email from a template and a fixed set of backed claims.',
    '',
    'Hard rules:',
    '1. Every sentence that asserts something about the call must come from one claim, and must carry that claim id.',
    '2. You may only use the claim ids listed. Never invent an id. Never cite a claim that is not listed.',
    '3. Never add a fact, a number, a date, a name, or a next step that is not in a listed claim.',
    '4. Rewriting into second person is expected. Inventing is not.',
    `5. The subject is 3 to 5 words, sentence case, no punctuation flourish. Start from "${t.subject}".`,
    `6. The whole email stays under about ${t.word_limit} words.`,
    '',
    'Voice:',
    ...VOICE_RULES.map((r) => `- ${r}`),
    '',
    'Return JSON only, this exact shape:',
    '{"subject":"...","greeting":"...","opener":"...","bullets":[{"claim_id":"<id>","group":"outcome|recap|next_steps","text":"..."}],"close":"...","signoff":"..."}',
    'greeting, opener, close and signoff are chrome: they assert nothing about the call and carry no claim id.',
  ].join('\n');

  const lines = [`Template: ${t.title} (${t.id}).`];
  if (context.call.title) lines.push(`Call: ${context.call.title}.`);
  if (context.deal.recipient) lines.push(`Writing to: ${context.deal.recipient}.`);
  if (context.deal.sender) lines.push(`Signed by: ${context.deal.sender}.`);
  lines.push('', 'Blocks, in order:');
  for (const b of context.blocks) {
    if (b.type === 'text') { lines.push(`- text (${b.role ?? 'chrome'}): ${b.text.replace(/\n/g, ' ')}`); continue; }
    if (b.type === 'instruction') { lines.push(`- instruction: ${b.text}`); continue; }
    lines.push(`- slot (${b.role}${b.label ? `, "${b.label}"` : ''}): ${b.hint ?? ''}`);
    for (const c of b.claims) {
      lines.push(`    [${c.id}] ${c.text}${c.meta ? ` (${c.meta})` : ''}`);
      if (c.quote) lines.push(`      the call said: "${c.quote}"`);
    }
  }
  lines.push('', `Claim ids you may cite: ${context.allowed_ids.join(', ')}`);
  return { system, user: lines.join('\n'), messages: [{ role: 'system', content: system }, { role: 'user', content: lines.join('\n') }] };
}

// ── the OpenAI-compatible caller (native fetch, zero deps) ───────────────────

export async function completeWithOpenAI(prompt, opts = {}) {
  const env = opts.env ?? (typeof process !== 'undefined' ? process.env : {}) ?? {};
  const baseURL = String(opts.baseURL ?? env.LLM_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const apiKey = opts.apiKey ?? env.LLM_API_KEY ?? null;
  const model = opts.model ?? env.LLM_MODEL ?? DEFAULT_MODEL;
  if (!apiKey) {
    throw new TemplateError('LLM_KEY_MISSING', 'no LLM_API_KEY: the live path needs a key, the demo path reads the cached artifact');
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const body = {
    model,
    temperature: 0,
    messages: prompt.messages,
  };
  if (opts.responseFormat !== false) body.response_format = { type: 'json_object' };

  const res = await doFetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 400); } catch { detail = ''; }
    throw new TemplateError('LLM_HTTP_ERROR', `chat/completions returned ${res.status}: ${detail}`, { status: res.status });
  }
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new TemplateError('LLM_EMPTY_RESPONSE', 'the model returned no message content');
  }
  return { text, model: json?.model ?? model, base_url: baseURL };
}

// ── parsing the model's answer ───────────────────────────────────────────────

function extractJson(raw) {
  const text = String(raw ?? '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new TemplateError('DRAFT_UNPARSEABLE', 'the model returned no JSON object');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new TemplateError('DRAFT_UNPARSEABLE', `the model returned JSON that will not parse: ${err.message}`);
  }
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Strict on shape, forgiving on nothing. A bullet with no claim id survives
// parsing on purpose: the screen is what cuts it, and the screen counts it.
export function parseDraft(raw, context) {
  const payload = extractJson(typeof raw === 'string' ? raw : raw?.text);
  if (!isObj(payload)) throw new TemplateError('DRAFT_MALFORMED', 'the model returned something that is not an object');
  if (!Array.isArray(payload.bullets) || payload.bullets.length === 0) {
    throw new TemplateError('DRAFT_MALFORMED', 'the draft carries no bullets, so it asserts nothing');
  }
  const allowed = new Set(context?.allowed_ids ?? []);
  const backed = new Set(context?.backed_ids ?? []);
  let offTemplate = 0;
  const bullets = payload.bullets.map((b, i) => {
    if (!isObj(b)) throw new TemplateError('DRAFT_MALFORMED', `bullet ${i} is not an object`);
    const text = str(b.text);
    if (!text) throw new TemplateError('DRAFT_MALFORMED', `bullet ${i} has no text`);
    const group = SLOT_ROLES.has(norm(b.group)) ? norm(b.group) : 'recap';
    const rawId = typeof b.claim_id === 'string' && b.claim_id.trim() ? b.claim_id.trim() : null;
    // A BACKED claim the template never offered is still off-contract for this
    // email. Drop the citation so the screen cuts the line and counts it. An id
    // the gate never passed is left exactly as the model wrote it, so the screen
    // sees it and rejects the whole draft.
    if (rawId && allowed.size && !allowed.has(rawId) && backed.has(rawId)) {
      offTemplate += 1;
      return { text, group, claim_id: null };
    }
    return { text, group, claim_id: rawId };
  });

  const outcome = bullets.find((b) => b.group === 'outcome') ?? null;
  return {
    subject: str(payload.subject) || context?.template?.subject || 'Follow-up',
    greeting: str(payload.greeting) || 'Hi there,',
    opener: str(payload.opener),
    outcome,
    recap: bullets.filter((b) => b.group === 'recap'),
    next_steps: bullets.filter((b) => b.group === 'next_steps'),
    assurance: str(payload.close),
    signoff: str(payload.signoff) || 'Best,',
    bullets,
    off_template_cut: offTemplate,
  };
}

// The body is assembled AFTER the screen, from what survived it, so a line the
// screen cut cannot reappear in the prose a rep copies out.
export function renderDraftBody(draft) {
  const lines = [draft.greeting, ''];
  if (draft.opener) lines.push(draft.opener, '');
  if (draft.outcome) lines.push(draft.outcome.text, '');
  if (draft.recap.length) {
    lines.push('What we covered:');
    for (const b of draft.recap) lines.push(`- ${b.text}`);
    lines.push('');
  }
  if (draft.next_steps.length) {
    lines.push('Next steps:');
    for (const b of draft.next_steps) lines.push(`- ${b.text}${b.meta ? ` (${b.meta})` : ''}`);
    lines.push('');
  }
  if (draft.assurance) lines.push(draft.assurance, '');
  lines.push(draft.signoff);
  return lines.join('\n');
}

// ── the whole path ───────────────────────────────────────────────────────────

// route → render → model → parse → screen. Every failure below the routing step
// returns a NAMED reason instead of throwing, because the honest answer to a
// broken generation is the deterministic baseline email, not a half-rendered
// panel. The one thing that never degrades quietly: a draft citing an id the
// gate did not pass is rejected whole, and the reason says so.
export async function generateTemplateEmail(bundle, templates, opts = {}) {
  const { template, considered } = routeWithTrace(bundle, templates, opts);
  if (!template) return { ok: false, reason: 'no_template_routed', template_id: null, considered };

  const context = renderContext(bundle, template, opts);
  if (!context.claims.length) {
    return { ok: false, reason: 'no_backed_claims_for_template', template_id: template.id, considered };
  }

  const prompt = buildPrompt(context);
  const complete = opts.complete ?? completeWithOpenAI;

  let completion;
  try {
    completion = await complete(prompt, opts);
  } catch (err) {
    return { ok: false, reason: err.name === 'LLM_KEY_MISSING' ? 'no_key' : 'llm_call_failed', template_id: template.id, error: err.message, considered };
  }

  let draft;
  try {
    draft = parseDraft(completion, context);
  } catch (err) {
    const reason = err.name === 'DRAFT_UNPARSEABLE' ? 'draft_unparseable' : 'draft_malformed';
    return { ok: false, reason, template_id: template.id, error: err.message, considered };
  }

  let screened;
  try {
    screened = screenDraft(draft, context.screen_claims);
  } catch (err) {
    if (err instanceof EmailError) {
      return { ok: false, reason: 'draft_rejected_unknown_citation', template_id: template.id, error: err.message, considered };
    }
    throw err;
  }
  if (!screened.bullets.length) {
    return { ok: false, reason: 'draft_empty_after_screen', template_id: template.id, cut: screened.cut, considered };
  }

  const body = renderDraftBody(screened);
  return {
    ok: true,
    template_id: template.id,
    template,
    context,
    draft: { ...screened, body },
    cut: screened.cut,
    off_template_cut: draft.off_template_cut ?? 0,
    provenance: {
      template_id: template.id,
      template_version: template.version,
      model: completion.model ?? opts.model ?? DEFAULT_MODEL,
      base_url: completion.base_url ?? null,
      temperature: 0,
      cut: screened.cut,
      off_template_cut: draft.off_template_cut ?? 0,
      bullets: screened.bullets.length,
      claim_ids: screened.bullets.map((b) => b.claim_id),
    },
    considered,
  };
}
