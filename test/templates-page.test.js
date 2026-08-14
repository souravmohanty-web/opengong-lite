// The template library page — DOM-free tests. Exercises the exact builder the
// demo workspace is built from (scripts/build-templates-page.mjs, called by
// scripts/build-notes.mjs): the model is plain data, the render is a string.
// Reads the real templates/ files, so a new or edited template is covered the
// moment it lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadTemplates,
  renderTemplatesPage,
  templateCardHtml,
  triggerSentence,
  conditionParts,
  listJoin,
  buildTemplatesPage,
  BLOCK_KINDS,
} from '../scripts/build-templates-page.mjs';
import { renderDealWorkspace, renderCallPage } from '../src/notes-view.mjs';

const TEMPLATES_DIR = new URL('../templates', import.meta.url).pathname;
const BUNDLES_DIR = new URL('../samples/bundles', import.meta.url).pathname;
const EMAILS_DIR = new URL('../samples/emails', import.meta.url).pathname;

const templateFiles = () => readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
const bundles = () => readdirSync(BUNDLES_DIR)
  .filter((f) => f.endsWith('.bundle.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(BUNDLES_DIR, f), 'utf8')));
const page = () => renderTemplatesPage(loadTemplates(TEMPLATES_DIR));

// Everything a reader sees, with style and script blocks stripped. The copy
// rules below are about words on screen, never about CSS.
function visibleText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

// ── loading ──────────────────────────────────────────────────────────────────
test('loadTemplates reads every file in templates/, in the order the router checks them', () => {
  const list = loadTemplates(TEMPLATES_DIR);
  assert.equal(list.length, templateFiles().length);
  assert.equal(list.length, 8, 'the starter library is 8 templates');
  const priorities = list.map((t) => t.priority);
  assert.deepEqual(priorities, [...priorities].sort((a, b) => a - b), 'lowest priority is checked first');
  for (const t of list) {
    assert.ok(t.id && t.title && t.subject, `${t.file} carries id, title and subject`);
    assert.ok(t.file.startsWith('templates/'), 'each card can name the file it came from');
  }
});

test('loadTemplates refuses an empty directory instead of building an empty page', () => {
  const empty = mkdtempSync(join(tmpdir(), 'og-templates-'));
  assert.throws(() => loadTemplates(empty), /no template files/);
});

// ── the trigger, in words ────────────────────────────────────────────────────
test('every template gets a trigger sentence a person can read out loud', () => {
  for (const t of loadTemplates(TEMPLATES_DIR)) {
    const s = triggerSentence(t);
    assert.match(s, /^Fires when /, `${t.id} says when it fires`);
    assert.ok(s.endsWith('.'), `${t.id} trigger is a sentence`);
    assert.ok(!/_/.test(s), `${t.id} trigger leaked a field name: ${s}`);
    assert.ok(!/\ball_of\b|\bany_of\b|\bnone_of\b/.test(s), `${t.id} trigger leaked its structure`);
  }
});

test('the post-demo trigger reads the way the demo says it out loud', () => {
  const t = loadTemplates(TEMPLATES_DIR).find((x) => x.id === 'post-demo-followup');
  assert.equal(
    triggerSentence(t),
    'Fires when a next step was agreed with a date or something to send, and a concern came up that was answered on the call.',
  );
});

test('a none_of rule reads as the case that keeps the template quiet', () => {
  const t = loadTemplates(TEMPLATES_DIR).find((x) => x.id === 'post-discovery-followup');
  assert.match(triggerSentence(t), /It stays quiet if a price came up as a quote, a discount ask, or a pushback on price\./);
});

test('a deal-scope condition reads as time passing, not as a metric name', () => {
  assert.equal(
    conditionParts({ scope: 'deal', metric: 'days_since_last_call', min: 14 }).base,
    '14 days or more have passed since the last call',
  );
  assert.equal(
    conditionParts({ scope: 'deal', metric: 'open_rep_promises', min: 1 }).base,
    'a promise from an earlier call is still open',
  );
});

test('an unmapped section still renders in plain words, so a new template is never invisible', () => {
  const s = triggerSentence({ routing: { trigger: { all_of: [{ section: 'security_review' }] } } });
  assert.equal(s, 'Fires when the call has security review.');
});

test('listJoin keeps the serial comma and never emits a stray conjunction', () => {
  assert.equal(listJoin(['a'], 'or'), 'a');
  assert.equal(listJoin(['a', 'b'], 'or'), 'a or b');
  assert.equal(listJoin(['a', 'b', 'c'], 'or'), 'a, b, or c');
});

// ── the page ─────────────────────────────────────────────────────────────────
test('the page renders all 8 templates: every id, every name, every subject', () => {
  const html = page();
  const text = visibleText(html);
  for (const t of loadTemplates(TEMPLATES_DIR)) {
    assert.ok(text.includes(t.id), `${t.id} is on the page`);
    assert.ok(text.includes(t.title), `${t.title} is on the page`);
    assert.ok(text.includes(t.subject), `${t.id} shows its subject line`);
    assert.ok(text.includes(String(t.word_limit)), `${t.id} shows its word cap`);
    assert.ok(text.includes(t.file), `${t.id} names the file you can edit`);
    assert.ok(text.includes(triggerSentence(t)), `${t.id} shows its trigger in words`);
  }
});

test('the page explains itself in one line at the top', () => {
  const text = visibleText(page());
  assert.ok(text.includes('Eight follow-up templates. The call picks one by what actually happened on it. Each is a file you can edit.'));
});

test('the three kinds of line are labelled, in the legend and on every block', () => {
  const html = page();
  const text = visibleText(html);
  for (const kind of Object.values(BLOCK_KINDS)) {
    assert.ok(text.includes(kind.label), `the page names the ${kind.label} kind`);
    assert.ok(text.includes(kind.note), `the legend explains ${kind.label}`);
  }
  // one label per block, and the counts add up across the whole library
  const rendered = (html.match(/class="t-kind t-kind--/g) ?? []).length;
  const blocks = loadTemplates(TEMPLATES_DIR).reduce((n, t) => n + t.blocks.length, 0);
  assert.equal(rendered, blocks, 'every block in every template carries its kind');
});

test('a card shows the anatomy in file order, with the fixed text and the model instruction verbatim', () => {
  const t = loadTemplates(TEMPLATES_DIR).find((x) => x.id === 'ghosted-deal-nudge');
  const text = visibleText(templateCardHtml(t, 2));
  const positions = t.blocks
    .map((b) => (b.type === 'slot' ? b.hint : String(b.text).replace(/\n/g, ' ')))
    .map((needle) => text.indexOf(needle.slice(0, 40)));
  assert.ok(positions.every((p) => p >= 0), 'every block renders');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'blocks render in file order');
  assert.ok(text.includes('Still the right time, or has something changed on your end?'), 'fixed text is shown word for word');
  assert.ok(text.includes('No urgency, no pressure'), 'the model instruction is shown');
});

test('each card opens without any client script: the page ships no JavaScript', () => {
  const html = page();
  assert.ok(!/<script/i.test(html), 'a static page needs no script tag');
  assert.equal((html.match(/<details class="tcard">/g) ?? []).length, 8);
  assert.match(html, /<summary class="tcard-head">/);
});

test('the page speaks the house voice: no dashes, no machine words, no AI tells', () => {
  const text = visibleText(page()).toLowerCase();
  const banned = [
    'delve', 'leverage', 'seamless', 'robust', 'elevate', 'unlock', 'landscape',
    'realm', 'testament', 'tapestry', 'crucial', 'game-changer', 'game changer',
    'utilize', 'streamline', 'empower', 'harness', 'cutting-edge', 'best-in-class',
    'verified', 'uncorroborated', 'blocked_injection', 'segment_corrected',
    'all_of', 'any_of', 'none_of', 'word_limit',
  ];
  for (const word of banned) {
    assert.ok(!text.includes(word), `the template library must not say ${word}`);
  }
  const html = page();
  assert.ok(!html.includes('—'), 'the page leaked an em-dash');
  assert.ok(!html.includes('–'), 'the page leaked an en-dash');
});

// ── the links into it ────────────────────────────────────────────────────────
test('the deal landing links to the template library', () => {
  const html = renderDealWorkspace(bundles(), { dealName: 'Brightsmile Dental Group' });
  assert.match(html, /href="templates\.html"/, 'the landing links to the page');
  assert.match(visibleText(html), /Templates/);
});

test('a routed panel says where its template came from, and links there', () => {
  const artifactPath = join(EMAILS_DIR, '02.template-email.json');
  if (!existsSync(artifactPath)) return; // no cached draft staged: nothing to link from
  const bundle = bundles().find((b) => b.call.id === '02');
  const html = renderCallPage(bundle, { routedEmail: JSON.parse(readFileSync(artifactPath, 'utf8')) });
  assert.match(html, /href="\.\.\/templates\.html"/, 'the call page reaches the library one level up');
  assert.match(visibleText(html), /From the template library/);
});

// ── the build ────────────────────────────────────────────────────────────────
test('buildTemplatesPage writes one page and reports what went into it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'og-public-'));
  const out = buildTemplatesPage({ quiet: true, publicDir: dir, templatesDir: TEMPLATES_DIR });
  assert.equal(out.count, 8);
  assert.equal(out.ids.length, 8);
  assert.ok(existsSync(join(dir, 'templates.html')));
  const written = readFileSync(join(dir, 'templates.html'), 'utf8');
  assert.match(written, /<title>Template library/);
  for (const id of out.ids) assert.ok(written.includes(id), `${id} is in the written file`);
});
