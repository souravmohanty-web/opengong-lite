// The pipeline-to-workspace loop: a run that ends somewhere a human looks.
//
// Every test here drives the REAL chain (scripts/pipeline.mjs's ingestAndRun,
// the same fixture-injected ingest path test/pipeline.test.js uses) and the
// REAL builders (scripts/build-notes.mjs, scripts/build-deal-index.mjs) into a
// temp workspace and a temp public/ directory. Nothing here reimplements
// registration, rendering, or the gate, and nothing here writes into the
// repo's own public/ or workspace/.
//
// The line these tests hold: adding a call of your own can never change the
// Brightsmile demo. That deal is rehearsed, and the byte-for-byte assertion
// below is what keeps it that way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildTranscript } from '../src/transcript.js';
import { loadExtractors, DEFAULT_SCHEMAS_DIR } from '../src/registry.js';
import { DEFAULT_EXTRACTORS_DIR } from '../src/extract.js';
import { EXTRACTION_MODES } from '../src/fallback.js';
import { TRACKER_ONLY_NOTE } from '../src/notes-view.mjs';
import { SOURCES } from '../src/index.js';
import {
  registerCall, readManifest, groupCalls, loadCallBundle, sourceTitle, callIdFrom,
  SAMPLE_DEAL_NAME, DEFAULT_DEAL_NAME, DEFAULT_MANIFEST_PATH, DEFAULT_WORKSPACE_DIR,
} from '../src/calls-manifest.mjs';
import { ingestAndRun, publishToWorkspace, parseArgv } from '../scripts/pipeline.mjs';
import { buildNotes } from '../scripts/build-notes.mjs';

const FIXTURE_RAW = JSON.parse(
  readFileSync(new URL('../research/00-api-probe/stereo_result.json', import.meta.url), 'utf8'),
);

// Stands in for src/ingest.js's submitJob -> pollJob round trip, exactly as
// test/pipeline.test.js's PIPE-06 does: same return shape, committed fixture,
// zero network.
const ingestFn = async () => ({ job_id: 'job_fixture_001', transcript: buildTranscript(FIXTURE_RAW.result) });

// Canned extractor responses so one call can run the WITH-key path offline
// (same technique as pipeline.test.js's PIPE-05 — the quotes are copied
// verbatim out of the fixture transcript, so the real gate verifies them).
const T = buildTranscript(FIXTURE_RAW.result);
function llmSubset() {
  const registry = loadExtractors(DEFAULT_EXTRACTORS_DIR, { schemasDir: DEFAULT_SCHEMAS_DIR });
  const defs = ['summary', 'tracker'].map((n) => registry[n]);
  const u0 = T.utterances[0];
  const u1 = T.utterances[1];
  const SUMMARY_JSON = JSON.stringify({
    sections: [
      { title: 'Outcome', blocks: [{ evidence: [{ utterance_id: u0.id, quote: u0.text }], text: 'The rep opened on how the dialer handles compliance.' }] },
      { title: 'Next steps', blocks: [{ evidence: [{ utterance_id: u1.id, quote: u1.text }], text: 'The buyer put price on the table for the next call.' }] },
    ],
  });
  const bySchema = new Map();
  for (const def of defs) {
    if (def.role === 'tracker') continue;
    bySchema.set(JSON.stringify(def.output_schema), SUMMARY_JSON);
  }
  const callLlm = async ({ schema }) => {
    const text = bySchema.get(JSON.stringify(schema));
    if (!text) throw new Error('unexpected extractor in the test subset');
    return {
      text, stop_reason: 'end_turn', model: 'fixture',
      usage: { input_tokens: 400, output_tokens: 80, cache_creation_input_tokens: 400, cache_read_input_tokens: 0 },
    };
  };
  return { defs, callLlm };
}

function scratch() {
  const root = mkdtempSync(path.join(tmpdir(), 'opengong-workspace-'));
  return {
    root,
    runsRoot: path.join(root, 'runs'),
    manifestPath: path.join(root, 'workspace', 'calls.json'),
    publicDir: path.join(root, 'public'),
    clean() { rmSync(root, { recursive: true, force: true }); },
  };
}

// One call all the way through: ingest -> extraction -> gate -> bundle ->
// email -> registered -> rendered.
async function runAndPublish(s, { source, deal, withKey = false } = {}) {
  const env = withKey ? { ANTHROPIC_API_KEY: 'sk-ant-test-fixture-key' } : {};
  const extras = withKey ? { extractorDefsOverride: llmSubset().defs, callLlmOverride: llmSubset().callLlm } : {};
  const out = await ingestAndRun({ source, runsRoot: s.runsRoot, env, ingestFn, ...extras });
  assert.ok(out.bundle, 'the fixture run has to produce a bundle for this test to mean anything');
  const published = publishToWorkspace({
    bundlePath: path.join(s.runsRoot, out.record.run_id, 'bundle.json'),
    deal,
    title: sourceTitle(source),
    audioPath: source.filePath ?? null,
    runId: out.record.run_id,
    source: source.filePath ?? source.audioUrl,
    manifestPath: s.manifestPath,
    publicDir: s.publicDir,
  });
  return { out, published };
}

function fakeAudio(dir, name = 'yourcall.wav') {
  const p = path.join(dir, name);
  writeFileSync(p, Buffer.alloc(128, 7));
  return p;
}

const read = (...p) => readFileSync(path.join(...p), 'utf8');

function visibleText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

// Everything the landing says about deals other than the sample one.
const GROUPS_RE = /\n {2}<section class="deal-sec deal-group"[\s\S]*?\n {2}<\/section>/g;
const stripGroups = (html) => html.replace(GROUPS_RE, '');

// ── the loop ─────────────────────────────────────────────────────────────────

test('WL-01 a pipeline run ends in the register: manifest row, bundle copy, honest title, its own deal', async () => {
  const s = scratch();
  const audio = fakeAudio(s.root);
  const { out, published } = await runAndPublish(s, { source: { filePath: audio } });

  const manifest = readManifest(s.manifestPath);
  assert.equal(manifest.calls.length, 1);
  const entry = manifest.calls[0];
  assert.equal(entry.id, published.entry.id);
  assert.equal(entry.title, 'yourcall.wav', 'the title is the file you handed the pipeline, never one we made up');
  assert.equal(entry.deal, DEFAULT_DEAL_NAME, 'a new call defaults into its own deal');
  assert.equal(entry.run_id, out.record.run_id);
  assert.equal(entry.audio, audio);

  // the bundle is copied, so the workspace still builds after runs/ is cleaned
  const stored = path.join(path.dirname(s.manifestPath), entry.bundle);
  assert.ok(existsSync(stored));
  rmSync(s.runsRoot, { recursive: true, force: true });
  const reloaded = loadCallBundle(entry, s.manifestPath);
  assert.equal(reloaded.call.id, entry.id);
  assert.equal(reloaded.call.title, 'yourcall.wav');
  assert.deepEqual(reloaded.claims.map((c) => c.id), out.bundle.claims.map((c) => c.id));

  s.clean();
});

test('WL-02 the builders pick it up: a card on the landing in its own group, and its own notes page', async () => {
  const s = scratch();
  const { out, published } = await runAndPublish(s, { source: { filePath: fakeAudio(s.root) }, withKey: true });

  const landing = read(s.publicDir, 'index.html');
  const group = /<section class="deal-sec deal-group"[\s\S]*?<\/section>/.exec(landing);
  assert.ok(group, 'the landing has a group for your own calls');
  const groupHtml = group[0];

  // the sample deal is still the page's own header, and it comes first
  assert.ok(landing.indexOf(`<h1 class="deal-h1">${SAMPLE_DEAL_NAME}</h1>`) < landing.indexOf(groupHtml));
  assert.match(groupHtml, /<h2 class="deal-h2">Your calls<\/h2>/);
  assert.match(groupHtml, /1 call you ran through the pipeline\./);

  // the card: honest title, the backed fraction, a link to its page
  assert.match(groupHtml, /<span class="call-label">yourcall\.wav<\/span>/);
  const backed = out.bundle.claims.filter((c) => c.status === 'verified' || c.status === 'segment_corrected').length;
  const attempted = out.bundle.claims.filter((c) => c.status !== 'blocked_injection').length;
  assert.ok(groupHtml.includes(`${backed} of ${attempted} backed.`), `the card shows the fraction: ${groupHtml}`);
  assert.match(groupHtml, new RegExp(`href="mine/${published.entry.id}\\.html"`));

  const page = read(s.publicDir, 'mine', `${published.entry.id}.html`);
  assert.match(page, /<h1>yourcall\.wav<\/h1>/);
  assert.match(page, /Your calls\. Call 1 of 1\./);
  assert.match(page, /href="\.\.\/index\.html"/, 'the page links back to the landing');

  s.clean();
});

test('WL-03 the notes page carries the standard citation treatment: numbered chips, receipts, a source list', async () => {
  const s = scratch();
  const { published } = await runAndPublish(s, { source: { filePath: fakeAudio(s.root) }, withKey: true });
  const page = read(s.publicDir, 'mine', `${published.entry.id}.html`);

  assert.ok(page.includes('class="cite"'), 'a note with no citation chip is the thing this project exists to prevent');
  assert.ok(page.includes('class="receipt"'), 'the chip opens the transcript line it came from');
  assert.ok(page.includes('class="sources"'), 'each section closes with its numbered source list');
  const text = visibleText(page);
  assert.match(text, /\d+ of \d+ notes backed\./, 'the tally is a fraction');
  // the quote in the receipt is the transcript line, verbatim
  const quoted = T.utterances[0].text;
  assert.ok(page.includes(quoted.slice(0, 40)), 'the evidence line is rendered verbatim');

  s.clean();
});

test('WL-04 the Brightsmile deal is untouched, byte for byte, by a call of your own', async () => {
  const s = scratch();

  // baseline: the workspace with nothing of yours registered
  const baseDir = path.join(s.root, 'public-baseline');
  buildNotes({ quiet: true, publicDir: baseDir, manifestPath: path.join(s.root, 'no-such-workspace', 'calls.json') });
  const baseLanding = read(baseDir, 'index.html');
  const basePages = readdirSync(path.join(baseDir, 'notes')).sort()
    .map((f) => [f, read(baseDir, 'notes', f)]);
  assert.equal(basePages.length, 6);
  assert.equal(stripGroups(baseLanding), baseLanding, 'a workspace with no calls of yours renders no group at all');

  await runAndPublish(s, { source: { filePath: fakeAudio(s.root) } });

  for (const [name, before] of basePages) {
    assert.equal(read(s.publicDir, 'notes', name), before, `public/notes/${name} changed`);
  }
  const after = read(s.publicDir, 'index.html');
  assert.notEqual(after, baseLanding, 'the landing does show the new call');
  assert.equal(stripGroups(after), baseLanding, 'the landing changed outside the group of your own calls');

  s.clean();
});

test('WL-05 a keyless run says so where it shows: the same limited-coverage line on the card and on the page', async () => {
  const s = scratch();
  const { out, published } = await runAndPublish(s, { source: { filePath: fakeAudio(s.root) } });

  assert.equal(out.bundle.provenance.extraction_mode, EXTRACTION_MODES.DETERMINISTIC_TRACKERS_ONLY);
  assert.ok(out.bundle.claims.every((c) => c.extractor === 'tracker'));

  const landing = visibleText(read(s.publicDir, 'index.html'));
  assert.ok(landing.includes(TRACKER_ONLY_NOTE), 'the landing card hides what the run could not cover');

  const page = read(s.publicDir, 'mine', `${published.entry.id}.html`);
  assert.ok(visibleText(page).includes(TRACKER_ONLY_NOTE), 'the page hides what the run could not cover');
  // no model name is claimed for a run where no model ran
  assert.equal(/Notes written by/.test(visibleText(page)), false);
  // and the header does not promise numbered citations a tracker run has none of
  assert.equal(/Every note carries a numbered citation/.test(visibleText(page)), false);

  s.clean();
});

test('WL-06 audio is optional the same way it already is: a local file plays, a URL degrades', async () => {
  const s = scratch();
  const audio = fakeAudio(s.root);
  const withAudio = await runAndPublish(s, { source: { filePath: audio } });
  const urlCall = await runAndPublish(s, { source: { audioUrl: 'https://example.com/calls/inbound-42.wav' } });

  const staged = path.join(s.publicDir, 'mine', 'audio', `${withAudio.published.entry.id}.wav`);
  assert.ok(existsSync(staged), 'a local file is staged next to the page that plays it');
  assert.equal(readFileSync(staged).length, readFileSync(audio).length);
  const page1 = read(s.publicDir, 'mine', `${withAudio.published.entry.id}.html`);
  assert.match(page1, /<audio id="call-audio"[^>]*src="\/mine\/audio\//);
  assert.ok(page1.includes('class="play"'), 'the play-from-here button is there when there is audio');

  const page2 = read(s.publicDir, 'mine', `${urlCall.published.entry.id}.html`);
  assert.equal(urlCall.published.entry.audio, null);
  assert.ok(!page2.includes('<audio id="call-audio"'), 'no audio element with nothing to play');
  assert.ok(!page2.includes('class="play"'), 'no dead play button');
  assert.match(visibleText(page2), /No audio is staged for this call/);
  // the URL-ingested call still gets an honest title from where it came from
  assert.equal(urlCall.published.entry.title, 'example.com/calls/inbound-42.wav');

  s.clean();
});

test('WL-07 two calls named the same get two pages, and both are listed', async () => {
  const s = scratch();
  const a = await runAndPublish(s, { source: { filePath: fakeAudio(s.root) } });
  const b = await runAndPublish(s, { source: { filePath: fakeAudio(s.root) } });

  assert.notEqual(a.published.entry.id, b.published.entry.id);
  assert.ok(existsSync(path.join(s.publicDir, 'mine', `${a.published.entry.id}.html`)));
  assert.ok(existsSync(path.join(s.publicDir, 'mine', `${b.published.entry.id}.html`)));

  const group = /<section class="deal-sec deal-group"[\s\S]*?<\/section>/.exec(read(s.publicDir, 'index.html'))[0];
  assert.match(group, /2 calls you ran through the pipeline\./);
  assert.match(group, new RegExp(`href="mine/${a.published.entry.id}\\.html"`));
  assert.match(group, new RegExp(`href="mine/${b.published.entry.id}\\.html"`));
  assert.match(group, /<span class="call-seq">02<\/span>/);

  s.clean();
});

test('WL-08 --deal names a second deal of your own, and the sample deal refuses to take a call', async () => {
  const s = scratch();
  assert.equal(parseArgv(['call.wav']).deal, DEFAULT_DEAL_NAME);
  assert.equal(parseArgv(['call.wav', '--deal', 'Northwind Dental']).deal, 'Northwind Dental');
  assert.equal(parseArgv(['call.wav', '--no-workspace']).workspace, false);
  assert.equal(parseArgv(['call.wav']).workspace, true);

  await runAndPublish(s, { source: { filePath: fakeAudio(s.root) }, deal: 'Northwind Dental' });
  await runAndPublish(s, { source: { filePath: fakeAudio(s.root, 'second.wav') } });

  const groups = groupCalls(readManifest(s.manifestPath));
  assert.deepEqual(groups.map((g) => g.name), ['Northwind Dental', DEFAULT_DEAL_NAME]);

  const landing = read(s.publicDir, 'index.html');
  assert.match(landing, /data-deal="northwind-dental"/);
  assert.match(landing, /data-deal="your-calls"/);
  assert.ok(landing.indexOf('data-deal="northwind-dental"') < landing.indexOf('data-deal="your-calls"'),
    'deals stay in the order you first used them');

  // the rehearsed deal is read-only
  const bundlePath = path.join(path.dirname(s.manifestPath), groups[0].calls[0].bundle);
  assert.throws(
    () => registerCall({ bundlePath, deal: SAMPLE_DEAL_NAME, manifestPath: s.manifestPath }),
    /read-only/,
  );
  assert.throws(
    () => registerCall({ bundlePath, deal: 'brightsmile dental group', manifestPath: s.manifestPath }),
    /read-only/,
  );
  assert.equal(readManifest(s.manifestPath).calls.length, 2, 'a refused registration writes nothing');

  s.clean();
});

test('WL-09 npm start rebuilds when a call is registered: the register is a build input', () => {
  assert.ok(SOURCES.includes(DEFAULT_WORKSPACE_DIR),
    'the staleness check has to watch the register, or a new call never reaches the served pages');
  assert.equal(path.dirname(DEFAULT_MANIFEST_PATH), DEFAULT_WORKSPACE_DIR);
});

test('WL-10 the new surfaces speak the house voice', async () => {
  const s = scratch();
  const { published } = await runAndPublish(s, { source: { filePath: fakeAudio(s.root) }, deal: 'Northwind Dental' });
  const landing = read(s.publicDir, 'index.html');
  const page = read(s.publicDir, 'mine', `${published.entry.id}.html`);

  for (const [name, html] of [['landing', landing], ['call page', page]]) {
    assert.ok(!html.includes('—') && !html.includes('–'), `${name} leaked a dash`);
    const text = visibleText(html);
    assert.equal(/\buncorroborated\b|\bverified\b|segment[_ ]corrected|blocked[_ ]injection/i.exec(text), null,
      `${name} leaked insider vocabulary`);
    assert.equal(/\d\s*%/.exec(text), null, `${name} shows a bare percentage instead of a fraction`);
  }
  assert.match(visibleText(landing), /\d+ of \d+ notes backed\./);

  s.clean();
});

test('WL-11 callIdFrom and sourceTitle keep a file name honest and a URL usable', () => {
  assert.equal(callIdFrom('Q3 Review Call.wav'), 'q3-review-call');
  assert.equal(callIdFrom('../../etc/passwd'), 'etc-passwd');
  assert.equal(callIdFrom(''), 'call');
  assert.equal(sourceTitle({ filePath: '/tmp/deals/acme-discovery.wav' }), 'acme-discovery.wav');
  assert.equal(sourceTitle({ audioUrl: 'https://cdn.example.com/a/b.wav?x=1' }), 'cdn.example.com/a/b.wav');
  assert.equal(sourceTitle({}), 'call');
});
