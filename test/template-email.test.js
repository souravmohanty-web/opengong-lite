// Template-routed, LLM-drafted follow-up email — all offline, no key, no network.
// The model is always a stub here: what is under test is the routing ladder, the
// parser, and the screen, which are the parts that decide whether an invented
// line can reach an outbound email.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  routeTemplate, routeWithTrace, renderContext, buildPrompt, parseDraft,
  generateTemplateEmail, validateTemplate, backedClaims, openRepPromises,
  completeWithOpenAI, resolveLLMTier, TemplateError, DEFAULT_BASE_URL, DEFAULT_MODEL,
} from '../src/template-email.js';
import { renderCallPage, buildNotesModel, normalizeRoutedEmail } from '../src/notes-view.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEMPLATES_DIR = join(ROOT, 'templates');
const BUNDLES_DIR = join(ROOT, 'samples/bundles');
const EMAILS_DIR = join(ROOT, 'samples/emails');

const templates = () => readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(TEMPLATES_DIR, f), 'utf8')));
const bundles = () => readdirSync(BUNDLES_DIR).filter((f) => f.endsWith('.bundle.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(BUNDLES_DIR, f), 'utf8')));
const bundle = (id) => bundles().find((b) => b.call.id === id);
const artifact = (id) => JSON.parse(readFileSync(join(EMAILS_DIR, `${id}.template-email.json`), 'utf8'));

const OWNERS = { rep: 'Maya', buyer: 'Rahul', joint: 'Both', unknown: '' };

// The panel, not the stylesheet: the class name also lives in the page CSS, so
// a substring check on it would pass on every page ever rendered.
const PANEL = '<section class="email email--routed">';
const hasPanel = (html) => html.includes(PANEL);
const dealCtx = (id) => {
  const all = bundles();
  const i = all.findIndex((b) => b.call.id === id);
  return { deal: { priorBundles: all.slice(0, i) }, owners: OWNERS, recipient: 'Rahul', sender: 'Maya' };
};

// A minimal bundle: just enough shape for routing, which is all routing reads.
// Built here rather than pulled from the sample deal on purpose — the engine has
// to work on calls nobody has recorded yet.
const claim = (over = {}) => ({
  id: over.id ?? 'x-0', extractor: 'summary', section: 'summary',
  text: 'something was said', status: 'verified', evidence: [{ utterance_id: 1, quote: 'q' }], ...over,
});
const mini = (claims, id = '99') => ({ call: { id, title: 'Some call' }, claims });

// ── the template files are the product ──────────────────────────────────────

test('every template file on disk passes schema validation', () => {
  const list = templates();
  assert.equal(list.length, 8, 'the starter library is 8 templates');
  for (const t of list) assert.doesNotThrow(() => validateTemplate(t), `${t.id} must validate`);
});

test('template ids, priorities and subjects are unique and demo-safe', () => {
  const list = templates();
  const ids = new Set(list.map((t) => t.id));
  const priorities = new Set(list.map((t) => t.priority));
  assert.equal(ids.size, list.length, 'no duplicate template ids');
  assert.equal(priorities.size, list.length, 'no two templates share a priority, so the ladder is total');
  for (const t of list) {
    const words = t.subject.trim().split(/\s+/).length;
    assert.ok(words >= 3 && words <= 5, `${t.id} subject is 3 to 5 words, got ${words}`);
    assert.ok(!/[—–]/.test(JSON.stringify(t)), `${t.id} carries a dash`);
  }
});

test('a broken template file fails loudly instead of routing to nothing', () => {
  assert.throws(() => validateTemplate({}), /TEMPLATE_INVALID|template must be/);
  const good = templates()[0];
  assert.throws(() => validateTemplate({ ...good, routing: { trigger: { none_of: [{ section: 'pain' }] } } }),
    /at least one any_of or all_of/);
  assert.throws(() => validateTemplate({ ...good, routing: { trigger: { any_of: [{ section: 'pain' }], sometimes: [] } } }),
    /unknown trigger key/);
  assert.throws(() => validateTemplate({ ...good, blocks: [{ type: 'slot', role: 'nonsense', section: 'pain' }] }),
    /slot role must be/);
  assert.throws(() => validateTemplate({ ...good, routing: { trigger: { all_of: [{ scope: 'deal', metric: 'vibes' }] } } }),
    /unknown deal metric/);
});

// ── routing across the library ───────────────────────────────────────────────

test('each sample call routes to exactly one template, and they are all different', () => {
  const expected = {
    '01': 'post-discovery-followup',
    '02': 'post-demo-followup',
    '03': 'pricing-followup',
    '04': 'commitment-fulfillment',
    '05': 'close-pilot-confirmation',
    '06': 'no-next-step-reengagement',
  };
  const picked = new Set();
  for (const [id, templateId] of Object.entries(expected)) {
    const t = routeTemplate(bundle(id), templates(), dealCtx(id));
    assert.ok(t, `call ${id} must route somewhere`);
    assert.equal(t.id, templateId, `call ${id} routes to ${templateId}`);
    picked.add(t.id);
  }
  assert.equal(picked.size, 6, 'six calls, six different templates');
});

test('routing fires the post-demo template on call 02 and never on call 03', () => {
  const trace02 = routeWithTrace(bundle('02'), templates(), dealCtx('02'));
  assert.equal(trace02.template.id, 'post-demo-followup');
  const trace03 = routeWithTrace(bundle('03'), templates(), dealCtx('03'));
  assert.equal(trace03.template.id, 'pricing-followup');
  assert.notEqual(trace03.template.id, 'post-demo-followup');
  // The ladder is what picks, so the reason is inspectable: pricing said yes first.
  const order = trace03.considered.map((c) => c.id);
  assert.ok(order.indexOf('pricing-followup') < order.indexOf('post-demo-followup'));
});

test('the discovery template stays silent once real money is on the table', () => {
  const t = templates().find((x) => x.id === 'post-discovery-followup');
  const fires = (b) => routeWithTrace(b, [t], {}).template !== null;
  assert.ok(fires(bundle('01')), 'discovery call fires it');
  assert.ok(!fires(bundle('03')), 'a call carrying a quote does not');
});

test('the pricing template fires only on a real number, not on a budget aside', () => {
  const t = templates().find((x) => x.id === 'pricing-followup');
  const fires = (b) => routeWithTrace(b, [t], {}).template !== null;
  assert.ok(fires(bundle('03')));
  assert.ok(!fires(bundle('01')), 'a discovery call where budget is merely mentioned is not a pricing call');
  assert.ok(!fires(bundle('02')));
});

test('the commitment ledger needs an earlier call that left a rep promise', () => {
  const t = templates().find((x) => x.id === 'commitment-fulfillment');
  const withDeal = routeWithTrace(bundle('04'), [t], dealCtx('04')).template;
  assert.ok(withDeal, 'fires with the deal history behind it');
  const alone = routeWithTrace(bundle('04'), [t], {}).template;
  assert.equal(alone, null, 'the same call alone has no ledger to reconcile');
});

test('the close template fires on the commit call only', () => {
  const t = templates().find((x) => x.id === 'close-pilot-confirmation');
  assert.ok(routeWithTrace(bundle('05'), [t], {}).template);
  for (const id of ['01', '02', '03', '04', '06']) {
    assert.equal(routeWithTrace(bundle(id), [t], {}).template, null, `must stay silent on call ${id}`);
  }
});

test('the no-next-step template fires on the call where nothing was agreed', () => {
  const t = templates().find((x) => x.id === 'no-next-step-reengagement');
  assert.ok(routeWithTrace(bundle('06'), [t], {}).template);
  for (const id of ['01', '02', '03', '04', '05']) {
    assert.equal(routeWithTrace(bundle(id), [t], {}).template, null, `must stay silent on call ${id}`);
  }
});

test('the ghosted nudge ships as a file and fires on deal silence, not on a sample call', () => {
  const t = templates().find((x) => x.id === 'ghosted-deal-nudge');
  for (const b of bundles()) {
    assert.equal(routeWithTrace(b, [t], dealCtx(b.call.id)).template, null,
      `call ${b.call.id} carries no silence, so the nudge stays quiet`);
  }
  const quietDeal = mini([claim({ id: 'next_steps-0', extractor: 'next_steps', section: 'next_steps', type: 'send_info', owner: 'rep', commitment: 'firm', due: 'Friday' })]);
  assert.equal(routeWithTrace(quietDeal, [t], { deal: { daysSinceLastCall: 21 } }).template?.id, 'ghosted-deal-nudge');
  assert.equal(routeWithTrace(quietDeal, [t], { deal: { daysSinceLastCall: 3 } }).template, null, 'three days is not ghosted');
  assert.equal(routeWithTrace(quietDeal, [t], {}).template, null, 'a deal with no dates never fires a silence trigger');
});

test('the objection template ships as a file and fires when nothing louder does', () => {
  const t = templates().find((x) => x.id === 'objection-addressed');
  const b = mini([
    claim({ id: 'objections-0', extractor: 'objections', section: 'objections', category: 'trust', handling: 'addressed', objection_status: 'left_open' }),
    claim({ id: 'next_steps-0', extractor: 'next_steps', section: 'next_steps', type: 'soft_followup', owner: 'joint', commitment: 'tentative' }),
  ]);
  assert.equal(routeWithTrace(b, [t], {}).template?.id, 'objection-addressed');
  // In the full library the louder templates own the sample calls.
  assert.equal(routeWithTrace(b, templates(), {}).template?.id, 'objection-addressed');
  for (const id of ['01', '06']) {
    assert.equal(routeWithTrace(bundle(id), [t], {}).template, null, `no addressed objection on call ${id}`);
  }
});

// ── the gate decides what routing may read ───────────────────────────────────

test('routing never fires off an uncorroborated claim', () => {
  const t = templates().find((x) => x.id === 'pricing-followup');
  const quoteOnly = mini([claim({ id: 'pricing-0', extractor: 'pricing', section: 'pricing', kind: 'quote', status: 'uncorroborated' })]);
  assert.equal(routeWithTrace(quoteOnly, [t], {}).template, null, 'a quote the call cannot back is not a pricing call');
  const backedQuote = mini([claim({ id: 'pricing-0', extractor: 'pricing', section: 'pricing', kind: 'quote', status: 'verified' })]);
  assert.ok(routeWithTrace(backedQuote, [t], {}).template, 'the same claim, backed, does fire it');
});

test('routing never fires off a blocked claim', () => {
  const t = templates().find((x) => x.id === 'pricing-followup');
  const planted = mini([claim({ id: 'pricing-0', extractor: 'pricing', section: 'pricing', kind: 'discount_request', pricing_signal: 'discount_request', status: 'blocked_injection' })]);
  assert.equal(routeWithTrace(planted, [t], {}).template, null, 'a planted discount can never pick a template');
  // Call 06 carries exactly this: its blocked pricing claim must not reroute it.
  assert.equal(routeTemplate(bundle('06'), templates(), dealCtx('06')).id, 'no-next-step-reengagement');
});

test('segment_corrected claims are emailable, so they can route', () => {
  const t = templates().find((x) => x.id === 'pricing-followup');
  const corrected = mini([claim({ id: 'pricing-0', extractor: 'pricing', section: 'pricing', kind: 'quote', status: 'segment_corrected' })]);
  assert.ok(routeWithTrace(corrected, [t], {}).template);
  assert.equal(backedClaims(corrected).length, 1);
});

// ── engine-grade: calls nobody has recorded yet ──────────────────────────────

test('a quiet call routes to null instead of forcing a template', () => {
  assert.equal(routeTemplate(mini([]), templates(), {}), null, 'no claims, no template');
  assert.equal(routeTemplate(mini([claim({ id: 'risk_flags-0', extractor: 'risk_flags', section: 'risk_flags' })]), templates(), {}), null,
    'a call with only a flag on it says nothing worth sending');
});

test('sparse and malformed claim rows never crash the router', () => {
  const messy = mini([
    null,
    'not a claim',
    { id: 'no-status' },
    { id: 'no-section', status: 'verified', text: 'x' },
    claim({ id: 'summary-0-0' }),
  ]);
  assert.doesNotThrow(() => routeTemplate(messy, templates(), {}));
  assert.doesNotThrow(() => routeTemplate(mini([]), templates(), { deal: { priorBundles: [null, {}, { call: {} }] } }));
  assert.doesNotThrow(() => routeTemplate(mini([]), templates(), { deal: { daysSinceLastCall: 'soon' } }));
});

test('a bundle that is not a bundle is a programmer error, and says so', () => {
  assert.throws(() => routeTemplate(null, templates(), {}), /ROUTE_INPUT_INVALID|claims array/);
  assert.throws(() => routeTemplate({ call: { id: '1' } }, templates(), {}), /claims array/);
});

test('routing with an empty library is null, not a crash', () => {
  assert.equal(routeTemplate(bundle('02'), [], {}), null);
  assert.equal(routeTemplate(bundle('02'), null, {}), null);
});

// ── the model's input ────────────────────────────────────────────────────────

test('renderContext offers backed claims only, and the transcript never', () => {
  const b = bundle('03');
  const t = routeTemplate(b, templates(), dealCtx('03'));
  const ctx = renderContext(b, t, dealCtx('03'));
  assert.ok(ctx.allowed_ids.length > 0);
  assert.ok(!ctx.allowed_ids.includes('pricing-4'), 'the uncorroborated quote is never offered to the model');
  const serialized = JSON.stringify(ctx.blocks) + JSON.stringify(ctx.claims);
  assert.ok(!serialized.includes('utterances'), 'no transcript reaches the model input');
  for (const c of ctx.claims) assert.ok(c.id && c.text, 'every offered claim carries its id and text');
});

test('an empty slot renders nothing, and a template with nothing to say generates nothing', () => {
  const t = templates().find((x) => x.id === 'pricing-followup');
  // A call whose only price objection slot is empty still renders the rest.
  const ctx = renderContext(bundle('03'), t, dealCtx('03'));
  const labels = ctx.blocks.filter((b) => b.type === 'slot').map((b) => b.label);
  assert.ok(!labels.includes('What we covered') || ctx.blocks.every((b) => b.type !== 'slot' || b.claims.length > 0),
    'no slot renders with zero claims');
  for (const b of ctx.blocks) if (b.type === 'slot') assert.ok(b.claims.length > 0, 'an empty slot is dropped, never filled');
});

test('every slot empty degrades to no draft with a named reason, never filler', async () => {
  const t = templates().find((x) => x.id === 'close-pilot-confirmation');
  // Fires on the trigger, but the claims it wants are all in sections this call
  // never produced. Nothing to say is a valid answer.
  const b = mini([
    claim({ id: 'objections-0', extractor: 'objections', section: 'objections', handling: 'addressed', objection_status: 'buyer_accepted' }),
    claim({ id: 'next_steps-0', extractor: 'next_steps', section: 'next_steps', type: 'concrete_date', owner: 'rep', commitment: 'firm', due: 'Friday' }),
  ]);
  const stripped = { ...t, blocks: t.blocks.filter((blk) => blk.type !== 'slot' || blk.section === 'pricing') };
  const res = await generateTemplateEmail(b, [stripped], { complete: async () => ({ text: '{}' }) });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_backed_claims_for_template');
});

test('the prompt carries the claim ids the model is allowed to cite, and the voice rules', () => {
  const b = bundle('02');
  const t = routeTemplate(b, templates(), dealCtx('02'));
  const prompt = buildPrompt(renderContext(b, t, dealCtx('02')));
  assert.match(prompt.system, /Never invent an id/);
  assert.match(prompt.system, /No dashes as punctuation/);
  assert.match(prompt.user, /next_steps-0/);
  assert.equal(prompt.messages.length, 2);
});

test('deal-scope promises are namespaced by call, so two calls cannot be confused', () => {
  const all = bundles();
  const promises = openRepPromises({ priorBundles: all.slice(0, 3) });
  assert.ok(promises.length >= 3);
  for (const p of promises) assert.match(p.id, /^0\d:/, 'a prior-call promise carries its call id');
  assert.ok(promises.every((p) => p.status === 'verified' || p.status === 'segment_corrected'));
});

// ── the parser and the screen ────────────────────────────────────────────────

const stubDraft = (payload) => async () => ({ text: JSON.stringify(payload), model: 'stub' });

const goodPayload = {
  subject: 'Next steps after the demo',
  greeting: 'Hi Rahul,',
  opener: 'Thanks for the time on the demo.',
  bullets: [
    { claim_id: 'summary-0-0', group: 'outcome', text: 'The demo landed.' },
    { claim_id: 'next_steps-0', group: 'next_steps', text: 'I will send the SOC 2 report by Friday.' },
  ],
  close: 'Every line above came from something said on the call.',
  signoff: 'Best,\nMaya',
};

test('a clean draft comes back screened, with its claim ids intact', async () => {
  const res = await generateTemplateEmail(bundle('02'), templates(), { ...dealCtx('02'), complete: stubDraft(goodPayload) });
  assert.equal(res.ok, true);
  assert.equal(res.template_id, 'post-demo-followup');
  assert.equal(res.cut, 0);
  assert.deepEqual(res.draft.bullets.map((b) => b.claim_id), ['summary-0-0', 'next_steps-0']);
  assert.match(res.draft.body, /SOC 2 report/);
});

test('an invented line with no citation is cut, and the cut is counted', async () => {
  const payload = {
    ...goodPayload,
    bullets: [
      ...goodPayload.bullets,
      { group: 'next_steps', text: 'You agreed to sign by Friday.' },
    ],
  };
  const res = await generateTemplateEmail(bundle('02'), templates(), { ...dealCtx('02'), complete: stubDraft(payload) });
  assert.equal(res.ok, true);
  assert.equal(res.cut, 1);
  assert.ok(!res.draft.body.includes('agreed to sign'), 'the invented line never reaches the body');
  assert.equal(res.provenance.cut, 1);
});

test('a citation the gate never passed rejects the WHOLE draft', async () => {
  const payload = { ...goodPayload, bullets: [...goodPayload.bullets, { claim_id: 'next_steps-99', group: 'recap', text: 'invented' }] };
  const res = await generateTemplateEmail(bundle('02'), templates(), { ...dealCtx('02'), complete: stubDraft(payload) });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'draft_rejected_unknown_citation');
  assert.ok(!res.draft, 'nothing survives a rejected draft');
});

test('a draft citing an uncorroborated claim is rejected whole, not trimmed', async () => {
  const payload = {
    subject: 'Where pricing landed',
    greeting: 'Hi Rahul,',
    opener: 'Thanks for the time today.',
    bullets: [
      { claim_id: 'pricing-0', group: 'recap', text: 'Our quote is twenty eight per month.' },
      { claim_id: 'pricing-4', group: 'recap', text: 'We agreed to match twenty two if you commit today.' },
    ],
    close: 'Tell me if I got any of it wrong.',
    signoff: 'Best,\nMaya',
  };
  const res = await generateTemplateEmail(bundle('03'), templates(), { ...dealCtx('03'), complete: stubDraft(payload) });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'draft_rejected_unknown_citation');
});

test('a backed claim the template never offered is dropped, not smuggled in', async () => {
  const payload = {
    ...goodPayload,
    bullets: [...goodPayload.bullets, { claim_id: 'stakeholders-threading', group: 'recap', text: 'You are the only contact in the loop.' }],
  };
  const res = await generateTemplateEmail(bundle('02'), templates(), { ...dealCtx('02'), complete: stubDraft(payload) });
  assert.equal(res.ok, true);
  assert.equal(res.off_template_cut, 1);
  assert.equal(res.cut, 1);
  assert.ok(!res.draft.body.includes('only contact'));
});

test('malformed model output degrades to a named reason, never a crash', async () => {
  const cases = [
    ['{"subject":"x","bullets":[{"claim_id":"summary-0-0","text":"a"', 'draft_unparseable'],
    ['not json at all', 'draft_unparseable'],
    ['{"subject":"x","greeting":"hi"}', 'draft_malformed'],
    ['{"bullets":[]}', 'draft_malformed'],
    ['{"bullets":[{"claim_id":"summary-0-0"}]}', 'draft_malformed'],
  ];
  for (const [text, reason] of cases) {
    const res = await generateTemplateEmail(bundle('02'), templates(), { ...dealCtx('02'), complete: async () => ({ text }) });
    assert.equal(res.ok, false, `${text.slice(0, 20)} must not succeed`);
    assert.equal(res.reason, reason, `${text.slice(0, 20)} degrades as ${reason}`);
    assert.ok(res.error, 'the reason carries the detail a rebuild needs');
  }
});

test('a model that fails or has no key degrades to the baseline, with the reason named', async () => {
  const failed = await generateTemplateEmail(bundle('02'), templates(), {
    ...dealCtx('02'),
    complete: async () => { throw new TemplateError('LLM_HTTP_ERROR', 'chat/completions returned 503'); },
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'llm_call_failed');

  const keyless = await generateTemplateEmail(bundle('02'), templates(), {
    ...dealCtx('02'),
    complete: (prompt, opts) => completeWithOpenAI(prompt, { ...opts, env: {} }),
  });
  assert.equal(keyless.ok, false);
  assert.equal(keyless.reason, 'no_key');
});

test('a fenced JSON answer still parses, because models fence things', () => {
  const ctx = renderContext(bundle('02'), routeTemplate(bundle('02'), templates(), dealCtx('02')), dealCtx('02'));
  const draft = parseDraft('```json\n' + JSON.stringify(goodPayload) + '\n```', ctx);
  assert.equal(draft.bullets.length, 2);
  assert.equal(draft.outcome.claim_id, 'summary-0-0');
});

// ── the OpenAI-compatible caller ─────────────────────────────────────────────

test('the caller posts an OpenAI-shaped request at temperature zero', async () => {
  const seen = {};
  const fetchImpl = async (url, init) => {
    seen.url = url;
    seen.body = JSON.parse(init.body);
    seen.auth = init.headers.authorization;
    return { ok: true, json: async () => ({ model: 'llama-test', choices: [{ message: { content: '{"bullets":[{"claim_id":"a","text":"b"}]}' } }] }) };
  };
  const out = await completeWithOpenAI({ messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'k', fetchImpl, env: {} });
  assert.equal(seen.url, `${DEFAULT_BASE_URL}/chat/completions`);
  assert.equal(seen.body.temperature, 0);
  assert.equal(seen.body.model, DEFAULT_MODEL);
  assert.equal(seen.auth, 'Bearer k');
  assert.equal(out.model, 'llama-test');
});

test('the caller honours LLM_BASE_URL and LLM_MODEL, so Ollama works too', async () => {
  let url = null;
  const fetchImpl = async (u, init) => {
    url = u;
    assert.equal(JSON.parse(init.body).model, 'llama3.2');
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) };
  };
  await completeWithOpenAI({ messages: [] }, {
    fetchImpl,
    env: { LLM_BASE_URL: 'http://localhost:11434/v1/', LLM_API_KEY: 'ollama', LLM_MODEL: 'llama3.2' },
  });
  assert.equal(url, 'http://localhost:11434/v1/chat/completions');
});

test('an HTTP failure from the model is a named error, not a silent empty draft', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, text: async () => 'rate limited' });
  await assert.rejects(
    () => completeWithOpenAI({ messages: [] }, { apiKey: 'k', fetchImpl, env: {} }),
    (err) => err.name === 'LLM_HTTP_ERROR' && err.status === 429,
  );
});

// ── the cached artifacts (the demo path) ─────────────────────────────────────

test('every cached artifact is screened, honest about its source, and cites backed claims only', () => {
  for (const b of bundles()) {
    const a = artifact(b.call.id);
    assert.equal(a.provenance.model, 'offline-author', `call ${b.call.id} never claims a model run that did not happen`);
    assert.match(a.provenance.note, /screened by the real choke/);
    const backed = new Set([
      ...backedClaims(b).map((c) => c.id),
      ...openRepPromises({ priorBundles: bundles().slice(0, bundles().findIndex((x) => x.call.id === b.call.id)) }).map((c) => c.id),
    ]);
    for (const bullet of a.draft.bullets) {
      assert.ok(backed.has(bullet.claim_id), `call ${b.call.id}: ${bullet.claim_id} must be a backed claim`);
    }
    assert.ok(a.draft.body.length > 0);
    assert.ok(!/[—–]/.test(a.draft.body), `call ${b.call.id} draft carries a dash`);
  }
});

test('the cached artifact is what a live run would produce, through the same screen', async () => {
  const a = artifact('02');
  const authored = readFileSync(join(EMAILS_DIR, 'authored/02.draft.json'), 'utf8');
  const res = await generateTemplateEmail(bundle('02'), templates(), {
    ...dealCtx('02'), dealName: 'Brightsmile Dental Group',
    complete: async () => ({ text: authored, model: 'offline-author' }),
  });
  assert.equal(res.ok, true);
  assert.equal(res.draft.body, a.draft.body, 'the artifact is the screened draft, not a hand-edited copy');
  assert.equal(res.template_id, a.template.id);
});

// ── the surface ──────────────────────────────────────────────────────────────

test('call 02 renders the routed panel with its explainer, provenance and citations', () => {
  const html = renderCallPage(bundle('02'), { owners: OWNERS, routedEmail: artifact('02') });
  assert.ok(hasPanel(html), 'the routed panel renders');
  assert.match(html, /Routed follow-up: post-demo template/);
  assert.match(html, /The detected next step picked this template\. A free model drafted it\. The gate checked every line\./);
  assert.match(html, /Template post-demo-followup/);
  assert.match(html, /model offline-author/);
  assert.match(html, /0 lines cut/);
  for (const id of artifact('02').draft.bullets.map((b) => b.claim_id)) {
    assert.ok(html.includes(`data-claim="${id}"`), `${id} renders as a citation`);
  }
  assert.ok(html.includes('Follow-up email'), 'the verbatim panel stays, it is the keyless story');
});

test('the routed panel says nothing the house voice bans', () => {
  const html = renderCallPage(bundle('02'), { owners: OWNERS, routedEmail: artifact('02') });
  const panel = html.slice(html.indexOf(PANEL), html.indexOf('</section>', html.indexOf(PANEL)) + 10);
  const banned = [
    'delve', 'leverage', 'seamless', 'robust', 'elevate', 'unlock', 'landscape',
    'realm', 'testament', 'tapestry', 'crucial', 'game-changer', 'game changer',
    'verified', 'uncorroborated', 'blocked_injection', 'segment_corrected',
  ];
  for (const word of banned) {
    assert.ok(!panel.toLowerCase().includes(word), `the routed panel must not say ${word}`);
  }
  assert.ok(!/[—–]/.test(panel), 'no dashes in the routed panel');
  assert.ok(!/\d\s*%/.test(panel), 'no bare percentages');
});

test('every call page carries its own routed panel, each naming its own template', () => {
  const seen = new Set();
  for (const b of bundles()) {
    const a = artifact(b.call.id);
    const html = renderCallPage(b, { owners: OWNERS, routedEmail: a });
    assert.ok(hasPanel(html), `call ${b.call.id} renders its routed panel`);
    assert.ok(html.includes(`Routed follow-up: ${a.template.short} template`));
    seen.add(a.template.id);
  }
  assert.equal(seen.size, 6, 'six calls, six templates on screen');
});

test('no cache and no key: the page renders the baseline panel only', () => {
  const html = renderCallPage(bundle('02'), { owners: OWNERS });
  assert.ok(!hasPanel(html), 'no artifact, no routed panel');
  assert.ok(html.includes('Follow-up email'), 'the verbatim draft still ships');
  assert.ok(html.includes('email-body'), 'the baseline panel is intact');
});

test('a half-written artifact is dropped whole, never half-rendered', () => {
  const a = artifact('02');
  const broken = [
    null,
    'nonsense',
    { ...a, template: undefined },
    { ...a, provenance: {} },
    { ...a, draft: { ...a.draft, bullets: [] } },
    { ...a, draft: { ...a.draft, bullets: [{ text: 'no id' }] } },
    { ...a, template: { ...a.template, explainer: undefined } },
  ];
  for (const bad of broken) {
    assert.equal(normalizeRoutedEmail(bad), null, 'a broken artifact yields no panel');
    const html = renderCallPage(bundle('02'), { owners: OWNERS, routedEmail: bad });
    assert.ok(!hasPanel(html));
    assert.ok(html.includes('Follow-up email'), 'and the baseline panel still renders');
  }
});

test('the model carries the routed draft only when one was passed in', () => {
  assert.equal(buildNotesModel(bundle('02'), {}).routedEmail, null);
  const m = buildNotesModel(bundle('02'), { routedEmail: artifact('02') });
  assert.equal(m.routedEmail.template.id, 'post-demo-followup');
  assert.equal(m.routedEmail.cut, 0);
  assert.ok(m.email.bullets.length > 0, 'the baseline draft is untouched by any of this');
});

// ── the tier ladder: configured key > local Ollama > offline/cached ─────────
// All offline. Ollama detection is injected here (a fake detectOllama, or a
// fake fetchImpl one layer down) so none of this needs Ollama installed,
// running, or even present on the machine running the suite.

test('TIER-01 a configured key wins outright, and Ollama is never even probed', async () => {
  const explode = async () => { throw new Error('detectOllama must never be called when a key is configured'); };
  const tier = await resolveLLMTier({ env: { LLM_API_KEY: 'k-123' }, detectOllama: explode });
  assert.equal(tier.source, 'configured');
  assert.equal(tier.apiKey, 'k-123');
  assert.equal(tier.baseURL, DEFAULT_BASE_URL);
  assert.equal(tier.model, DEFAULT_MODEL);
});

test('TIER-01b an explicit opts.apiKey wins the same way as an env key, and still skips the probe', async () => {
  const explode = async () => { throw new Error('must not probe'); };
  const tier = await resolveLLMTier({ env: {}, apiKey: 'k-explicit', detectOllama: explode });
  assert.equal(tier.source, 'configured');
});

test('TIER-02 no key, Ollama detected: keyless local tier, carrying the model the probe picked', async () => {
  const detectOllama = async (opts) => {
    assert.deepEqual(opts.env, {}, 'the probe receives the same env the tier resolver was given');
    return { baseURL: 'http://127.0.0.1:11434/v1', model: 'llama3.2:3b', source: 'ollama-local' };
  };
  const tier = await resolveLLMTier({ env: {}, detectOllama });
  assert.equal(tier.source, 'ollama-local');
  assert.equal(tier.apiKey, 'ollama');
  assert.equal(tier.baseURL, 'http://127.0.0.1:11434/v1');
  assert.equal(tier.model, 'llama3.2:3b');
});

test('TIER-03 no key, no Ollama: the offline/cached tier, exactly as today', async () => {
  const tier = await resolveLLMTier({ env: {}, detectOllama: async () => null });
  assert.deepEqual(tier, { source: 'offline' });
});

test('TIER-03b a probe that times out or is refused degrades the same as no key at all', async () => {
  // Standing in for detectOllama's own internal degrade-to-null (test/llm-detect.test.js
  // covers that layer directly): whatever reaches resolveLLMTier as null must not throw
  // and must land on the offline tier, never wedge on a live-looking but broken tier.
  const refused = async () => null;
  const timedOut = async () => null;
  for (const detectOllama of [refused, timedOut]) {
    const tier = await resolveLLMTier({ env: {}, detectOllama });
    assert.equal(tier.source, 'offline');
  }
});

test('TIER-04 provenance carries the source, and only the local tier gets the "via local Ollama" suffix', async () => {
  const configured = await generateTemplateEmail(bundle('02'), templates(), {
    ...dealCtx('02'),
    complete: async () => ({ text: JSON.stringify(goodPayload), model: 'llama-3.3-70b-versatile', source: 'configured' }),
  });
  assert.equal(configured.ok, true);
  assert.equal(configured.provenance.source, 'configured');
  assert.equal(configured.provenance.model, 'llama-3.3-70b-versatile');

  const ollama = await generateTemplateEmail(bundle('02'), templates(), {
    ...dealCtx('02'),
    complete: async () => ({ text: JSON.stringify(goodPayload), model: 'llama3.2:3b', source: 'ollama-local' }),
  });
  assert.equal(ollama.ok, true);
  assert.equal(ollama.provenance.source, 'ollama-local');
  assert.equal(ollama.provenance.model, 'llama3.2:3b via local Ollama');
});

test('TIER-05 a completion with no source label defaults to configured, so pre-existing callers are unaffected', async () => {
  const res = await generateTemplateEmail(bundle('02'), templates(), {
    ...dealCtx('02'),
    complete: async () => ({ text: JSON.stringify(goodPayload), model: 'llama-3.3-70b-versatile' }),
  });
  assert.equal(res.ok, true);
  assert.equal(res.provenance.source, 'configured');
  assert.equal(res.provenance.model, 'llama-3.3-70b-versatile', 'no suffix without the ollama-local source');
});

test('TIER-06 completeWithOpenAI tags its own return with whatever source it was told, defaulting to configured', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ model: 'llama3.2', choices: [{ message: { content: '{}' } }] }) });
  const plain = await completeWithOpenAI({ messages: [] }, { apiKey: 'k', fetchImpl, env: {} });
  assert.equal(plain.source, 'configured');
  const local = await completeWithOpenAI({ messages: [] }, { apiKey: 'ollama', fetchImpl, env: {}, source: 'ollama-local' });
  assert.equal(local.source, 'ollama-local');
});
