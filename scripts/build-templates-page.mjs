#!/usr/bin/env node
// Builds public/templates.html: the read-only template library for the demo
// workspace. One static page, no client script, built straight from the files
// in templates/ so the page can never drift from what the router actually
// reads.
//
// What a judge gets on stage: the eight follow-up templates, each with the
// situation it is for, the trigger that fires it in plain words, and its
// anatomy (which lines are fixed text, which are filled from backed notes,
// which are instructions the buyer never sees).
//
// Called from scripts/build-notes.mjs, and runnable on its own:
//   node scripts/build-templates-page.mjs
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_DIR = join(ROOT, 'templates');
const PUBLIC_DIR = join(ROOT, 'public');

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// The three kinds of line a template is made of. The label is what the page
// calls each one; the note is the one-line explanation under the legend.
export const BLOCK_KINDS = {
  text: {
    label: 'fixed text',
    note: 'Ships word for word from the file. The model never rewrites it.',
  },
  slot: {
    label: 'filled from backed notes',
    note: 'Filled from claims the gate checked, each carrying its claim id.',
  },
  instruction: {
    label: 'instruction to the model',
    note: 'House rules for the draft. The buyer never sees this line.',
  },
};

// Templates in the order the router reads them (src/template-email.js sorts by
// priority, then by id), so the page shows the real running order.
export function loadTemplates(dir = TEMPLATES_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`no template files found in ${dir}`);
  return files
    .map((f) => ({ file: `templates/${f}`, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
    .sort((a, b) => (a.priority - b.priority) || String(a.id).localeCompare(String(b.id)));
}

// ── the trigger, in words a person says out loud ─────────────────────────────
// The trigger is a small data structure (all_of / any_of / none_of over claim
// sections and deal metrics). These maps turn it into a sentence. A section or
// a value nobody has mapped yet still renders, in its own plain words, so a new
// template is never invisible on this page.

const SECTION_BASE = {
  summary: 'the call has a summary',
  pain: 'a problem got named',
  objections: 'a concern came up',
  pricing: 'a price came up',
  next_steps: 'a next step was agreed',
  buying_stage: 'the buying stage',
};

const SECTION_NOUN = {
  summary: 'summary',
  pain: 'problem',
  objections: 'concern',
  pricing: 'price',
  next_steps: 'next step',
  buying_stage: 'buying stage',
};

// How a filter field reads in the sentence, and what each of its values is
// called. Keyed field, then value.
const FIELD_CONNECTOR = {
  type: 'with',
  owner: 'owned by',
  handling: 'that was',
  objection_status: 'that the buyer',
  kind: 'as',
  pricing_signal: 'as',
  value: 'reads',
};

const VALUE_WORDS = {
  'type.concrete_date': 'a date',
  'type.send_info': 'something to send',
  'type.soft_followup': 'a loose check back',
  'type.no_next_step': 'nothing agreed',
  'owner.rep': 'the rep',
  'owner.buyer': 'the buyer',
  'owner.joint': 'both sides',
  'handling.addressed': 'answered on the call',
  'handling.deflected': 'pushed to later',
  'objection_status.buyer_accepted': 'accepted',
  'objection_status.left_open': 'left open',
  'kind.quote': 'a quote',
  'kind.discount_request': 'a discount ask',
  'kind.price_objection': 'a pushback on price',
  'pricing_signal.sticker_shock': 'sticker shock',
  'pricing_signal.discount_request': 'a discount ask',
  'pricing_signal.competitor_price_cited': 'a rival price',
  'value.committed': 'committed',
};

const METRIC_PHRASE = {
  open_rep_promises: (min) => (min > 1
    ? `${min} promises from earlier calls are still open`
    : 'a promise from an earlier call is still open'),
  days_since_last_call: (min) => `${min} days or more have passed since the last call`,
};

const humanWord = (s) => String(s ?? '').replace(/_/g, ' ').trim();

export function listJoin(items, conj = 'and') {
  const list = items.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ${conj} ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, ${conj} ${list[list.length - 1]}`;
}

// Clauses are long enough that two of them run together without a comma. This
// is the same join with the comma always kept.
export function clauseJoin(items, conj = 'and') {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')}, ${conj} ${list[list.length - 1]}`;
}

// One condition, broken into a base clause plus its filter groups, so two
// conditions on the same section can be merged instead of said twice.
export function conditionParts(cond = {}) {
  if (String(cond.scope ?? '').toLowerCase() === 'deal') {
    const metric = String(cond.metric ?? '').toLowerCase();
    const phrase = METRIC_PHRASE[metric]?.(Number(cond.min ?? 1))
      ?? `${humanWord(metric)} is at least ${Number(cond.min ?? 1)}`;
    return { base: phrase, groups: [] };
  }
  const section = String(cond.section ?? cond.extractor ?? '').toLowerCase();
  if (cond.exists === false) {
    return { base: `no ${SECTION_NOUN[section] ?? humanWord(section)} was found`, groups: [] };
  }
  const base = SECTION_BASE[section] ?? `the call has ${humanWord(section)}`;
  const groups = Object.entries(cond.where ?? {}).map(([field, values]) => ({
    connector: FIELD_CONNECTOR[field] ?? 'where',
    values: (Array.isArray(values) ? values : [values])
      .map((v) => VALUE_WORDS[`${field}.${v}`] ?? humanWord(v)),
  }));
  // A next step whose only allowed value is "nothing agreed" reads better said
  // straight than filtered.
  if (section === 'next_steps' && groups.length === 1
      && groups[0].values.length === 1 && groups[0].values[0] === 'nothing agreed') {
    return { base: 'nothing was agreed as a next step', groups: [] };
  }
  return { base, groups };
}

const partsKey = (p) => `${p.base}|${p.groups.map((g) => g.connector).join('+')}`;

// Two conditions that say the same thing about the same section become one
// clause with a longer value list (the pricing template asks twice).
function mergeParts(list) {
  const out = [];
  const byKey = new Map();
  for (const p of list) {
    const key = partsKey(p);
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, p);
      out.push(p);
      continue;
    }
    seen.groups.forEach((g, i) => {
      for (const v of p.groups[i].values) if (!g.values.includes(v)) g.values.push(v);
    });
  }
  return out;
}

const renderParts = (p) => {
  const filters = clauseJoin(p.groups.map((g) => `${g.connector} ${listJoin(g.values, 'or')}`), 'and');
  return filters ? `${p.base} ${filters}` : p.base;
};

// Returns the joined sentence plus how many clauses survived the merge, so the
// caller knows whether "either" still makes sense.
function clauseList(conds, conj) {
  const parts = mergeParts((conds ?? []).map(conditionParts));
  return { text: clauseJoin(parts.map(renderParts), conj), n: parts.length };
}

// The whole trigger as one or two sentences. Every template on the page gets
// one, so a judge reading a card knows when it fires without opening the file.
export function triggerSentence(template = {}) {
  const trig = template.routing?.trigger ?? {};
  const clauses = [];
  if (trig.all_of?.length) clauses.push(clauseList(trig.all_of, 'and').text);
  if (trig.any_of?.length) {
    const any = clauseList(trig.any_of, 'or');
    clauses.push(any.n > 1 ? `either ${any.text}` : any.text);
  }
  const fires = clauses.length ? `Fires when ${clauseJoin(clauses, 'and')}.` : 'Fires on any call.';
  const quiet = trig.none_of?.length
    ? ` It stays quiet if ${clauseList(trig.none_of, 'or').text}.`
    : '';
  return `${fires}${quiet}`;
}

// ── one card ─────────────────────────────────────────────────────────────────
const NUM_WORD = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

function blockRowHtml(block, i) {
  const kind = BLOCK_KINDS[block.type] ?? { label: humanWord(block.type) };
  const name = block.label ?? humanWord(block.role) ?? '';
  const body = block.type === 'slot'
    ? [block.hint, block.scope === 'deal' ? `Reads ${humanWord(block.source)} from earlier calls.` : null]
      .filter(Boolean).join(' ')
    : String(block.text ?? '').replace(/\n/g, ' ');
  const source = block.type === 'slot'
    ? `<span class="t-src">${escapeHtml(block.scope === 'deal' ? 'deal' : (block.section ?? block.extractor ?? ''))}</span>`
    : '';
  return `<li class="t-block t-block--${escapeHtml(block.type)}">
      <span class="t-num">${i + 1}</span>
      <span class="t-kind t-kind--${escapeHtml(block.type)}">${escapeHtml(kind.label)}</span>
      ${name ? `<span class="t-role">${escapeHtml(name)}</span>` : ''}${source}
      <span class="t-text">${escapeHtml(body)}</span>
    </li>`;
}

export function templateCardHtml(template, rank) {
  const blocks = Array.isArray(template.blocks) ? template.blocks : [];
  const counts = ['text', 'slot', 'instruction']
    .map((k) => ({ k, n: blocks.filter((b) => b.type === k).length }))
    .filter((c) => c.n > 0)
    .map((c) => `${c.n} ${BLOCK_KINDS[c.k].label}`);
  return `<details class="tcard">
    <summary class="tcard-head">
      <span class="tcard-rank">${rank}</span>
      <span class="tcard-name">${escapeHtml(template.title ?? template.id)}</span>
      <span class="tcard-id">${escapeHtml(template.id)}</span>
      <span class="tcard-purpose">${escapeHtml(template.situation ?? '')}</span>
      <span class="tcard-trigger">${escapeHtml(triggerSentence(template))}</span>
      <span class="tcard-more">Open the anatomy</span>
    </summary>
    <div class="tcard-body">
      <p class="t-meta">
        <span class="t-meta-k">Subject</span>${escapeHtml(template.subject ?? '')}
        <span class="t-meta-k">Word cap</span>${escapeHtml(String(template.word_limit ?? ''))}
        <span class="t-meta-k">File</span><code>${escapeHtml(template.file ?? '')}</code>
      </p>
      <p class="t-panel">On the call page it says: ${escapeHtml(template.panel?.explainer ?? '')}</p>
      <p class="t-shape">${escapeHtml(`${blocks.length} lines: ${listJoin(counts, 'and')}.`)}</p>
      <ol class="t-blocks">${blocks.map(blockRowHtml).join('')}</ol>
    </div>
  </details>`;
}

// ── the page ─────────────────────────────────────────────────────────────────
export function renderTemplatesPage(templates, ctx = {}) {
  const count = templates.length;
  const countWord = NUM_WORD[count] ?? String(count);
  const homeHref = ctx.homeHref ?? 'index.html';
  const legend = Object.values(BLOCK_KINDS)
    .map((k) => `<li><span class="t-kind">${escapeHtml(k.label)}</span>${escapeHtml(k.note)}</li>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Template library · OpenGong</title>
<style>${TEMPLATE_STYLES}</style>
</head>
<body>
<nav class="deal-rail">
  <a class="deal-name" href="${escapeHtml(homeHref)}">${escapeHtml(ctx.dealName ?? 'The deal workspace')}</a>
  <span class="rail-here">Template library</span>
</nav>
<main class="wrap">
  <header class="t-head">
    <p class="eyebrow">OpenGong · notes that cite the call</p>
    <h1>Template library</h1>
    <p class="t-lead">${escapeHtml(countWord)} follow-up templates. The call picks one by what actually happened on it. Each is a file you can edit.</p>
    <p class="t-sub">The router reads them in this order and stops at the first one that fires. When none fire, the call keeps its plain follow-up email.</p>
    <ul class="t-legend">${legend}</ul>
  </header>
  <div class="tgrid">
    ${templates.map((t, i) => templateCardHtml(t, i + 1)).join('\n    ')}
  </div>
  <footer class="t-foot">
    <p>Read-only here. Change a template by editing its file and building the workspace again.</p>
    <p><a href="${escapeHtml(homeHref)}">Back to the deal workspace</a></p>
  </footer>
</main>
</body>
</html>`;
}

// Same tokens as the workspace pages (src/notes-view.mjs), so the library sits
// inside the app instead of next to it. Kept minimal on purpose: this page has
// its own layout and borrows nothing else.
const TEMPLATE_STYLES = `
:root{
  --paper:#f6f7f9; --surface:#ffffff; --ink:#14171c; --ink-soft:#565d68;
  --ink-faint:#5f6672; --line:#e3e6ea; --line-soft:#eceef1;
  --accent:#2947d8; --accent-soft:#e7ebfc; --accent-ink:#1c34ad;
  --backed:#0f7a52; --held:#b26a00; --held-bg:#fbf3e3; --held-line:#eccf9c;
  --shadow:0 1px 2px rgba(20,23,28,.05),0 6px 20px rgba(20,23,28,.05);
  color-scheme:light;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --paper:#0f1115; --surface:#181b21; --ink:#e7e9ee; --ink-soft:#a2a9b4;
    --ink-faint:#98a0ac; --line:#282d35; --line-soft:#20242b;
    --accent:#7f94ff; --accent-soft:#1c2440; --accent-ink:#aab6ff;
    --backed:#39b483; --held:#e0a24a; --held-bg:#241d10; --held-line:#4a3c1e;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35);
    color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --paper:#0f1115; --surface:#181b21; --ink:#e7e9ee; --ink-soft:#a2a9b4;
  --ink-faint:#98a0ac; --line:#282d35; --line-soft:#20242b;
  --accent:#7f94ff; --accent-soft:#1c2440; --accent-ink:#aab6ff;
  --backed:#39b483; --held:#e0a24a; --held-bg:#241d10; --held-line:#4a3c1e;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35);
  color-scheme:dark;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}

.deal-rail{
  position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:18px;
  padding:11px 22px; background:color-mix(in srgb,var(--surface) 88%,transparent);
  backdrop-filter:saturate(1.4) blur(8px); border-bottom:1px solid var(--line);
  flex-wrap:wrap;
}
.deal-name{font-size:16px;font-weight:600;letter-spacing:.01em;color:var(--ink);text-decoration:none}
.deal-name:hover{color:var(--accent-ink)}
.deal-name::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:8px;vertical-align:middle}
.rail-here{font-size:15px;color:var(--accent-ink);font-weight:600}

.wrap{max-width:1080px;margin:0 auto;padding:34px 22px 72px}
.eyebrow{margin:0 0 8px;font-size:12.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-faint)}
h1{margin:0 0 10px;font-size:31px;line-height:1.2;letter-spacing:-.015em}
.t-lead{margin:0 0 6px;font-size:18px;color:var(--ink)}
.t-sub{margin:0 0 18px;font-size:15px;color:var(--ink-soft);max-width:66ch}
.t-legend{list-style:none;display:flex;flex-wrap:wrap;gap:10px;margin:0 0 26px;padding:0}
.t-legend li{
  flex:1 1 260px;background:var(--surface);border:1px solid var(--line);border-radius:11px;
  padding:11px 13px;font-size:13.5px;color:var(--ink-soft);
}
.t-kind{
  display:inline-block;margin-right:8px;padding:2px 8px;border-radius:999px;font-size:11.5px;
  letter-spacing:.02em;border:1px solid var(--line);color:var(--ink-faint);background:var(--line-soft);
  white-space:nowrap;
}
.t-kind--slot{color:var(--backed);border-color:color-mix(in srgb,var(--backed) 35%,var(--line))}
.t-kind--instruction{color:var(--held);border-color:var(--held-line);background:var(--held-bg)}
.t-kind--text{color:var(--ink-faint)}

.tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;align-items:start}
.tcard{
  background:var(--surface);border:1px solid var(--line);border-radius:14px;
  box-shadow:var(--shadow);overflow:hidden;
}
.tcard[open]{grid-column:1/-1;border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.tcard-head{list-style:none;cursor:pointer;display:grid;gap:6px;padding:15px 17px}
.tcard-head::-webkit-details-marker{display:none}
.tcard-rank{
  display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;
  border-radius:50%;background:var(--accent-soft);color:var(--accent-ink);
  font-size:12px;font-weight:600;
}
.tcard-name{font-size:17px;font-weight:600;letter-spacing:-.01em}
.tcard-id{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--ink-faint)}
.tcard-purpose{font-size:14.5px;color:var(--ink-soft)}
.tcard-trigger{font-size:13.5px;color:var(--ink-faint);border-left:2px solid var(--line);padding-left:10px}
.tcard-more{font-size:12.5px;color:var(--accent-ink)}
.tcard[open] .tcard-more::after{content:" is below"}
.tcard-body{padding:0 17px 17px;border-top:1px solid var(--line-soft)}
.t-meta{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;margin:14px 0 10px;font-size:14px}
.t-meta-k{font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-faint);margin-right:6px}
.t-panel,.t-shape{margin:0 0 8px;font-size:13.5px;color:var(--ink-soft)}
.t-blocks{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}
.t-block{
  display:grid;grid-template-columns:22px auto auto 1fr;gap:6px 9px;align-items:baseline;
  padding:9px 11px;border:1px solid var(--line-soft);border-radius:10px;background:var(--paper);
}
.t-block--slot{border-color:color-mix(in srgb,var(--backed) 25%,var(--line-soft))}
.t-block--instruction{border-color:var(--held-line);background:var(--held-bg)}
.t-num{font-size:12px;color:var(--ink-faint)}
.t-role{font-size:12.5px;font-weight:600;color:var(--ink)}
.t-src{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;color:var(--ink-faint)}
.t-text{grid-column:2/-1;font-size:14px;color:var(--ink-soft)}
.t-foot{margin-top:28px;padding-top:16px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink-faint)}
.t-foot a{color:var(--accent-ink)}
@media (max-width:640px){
  .tgrid{grid-template-columns:1fr}
  .t-block{grid-template-columns:22px 1fr}
  .t-text{grid-column:1/-1}
}
`;

// Write the page. Returns what was written, so the caller can log it.
export function buildTemplatesPage({ quiet = false, publicDir = PUBLIC_DIR, templatesDir = TEMPLATES_DIR, ctx = {} } = {}) {
  const templates = loadTemplates(templatesDir);
  mkdirSync(publicDir, { recursive: true });
  const path = join(publicDir, 'templates.html');
  writeFileSync(path, renderTemplatesPage(templates, ctx));
  if (!quiet) console.log(`template library: public/templates.html (${templates.length} templates)`);
  return { path, count: templates.length, ids: templates.map((t) => t.id) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildTemplatesPage();
}
