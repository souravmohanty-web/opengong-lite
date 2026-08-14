#!/usr/bin/env node
// Builds the demo workspace from the gate-checked bundles. One flow, one URL:
// the deal, then a call, then a citation, then the audio.
//
//   public/index.html     is THE landing: the deal workspace. Where the deal
//                           stands, what was promised on which call, one search
//                           box across every call, and the calls in order.
//   public/notes/NN.html  is one call: its notes, each with numbered citation
//                           chips, rendered by src/notes-view.mjs (reuses
//                           viewer.js's buildViewModel + email.js's
//                           composeEmail, read-only)
//   public/audio/NN.m4a   is the call audio, staged so the play-from-here reveal
//                           can seek it (Range-served by src/deal-server.mjs)
//   public/mine/<id>.html is one of YOUR calls: everything `npm run pipeline`
//                           registered in workspace/calls.json, rendered by the
//                           same renderer, grouped into its own deal on the
//                           landing. Its audio stages to public/mine/audio/.
//                           Separate directory on purpose: a call you added can
//                           never overwrite a sample page, and the Brightsmile
//                           demo surface stays exactly as it was built.
//
// Audio is optional: if a file is missing the click-to-reveal still works and
// the play buttons hide.
//
// Usage: node scripts/build-notes.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';
import { renderCallPage, renderDealWorkspace, buildCallGroup, shortLabel } from '../src/notes-view.mjs';
import {
  DEFAULT_MANIFEST_PATH, SAMPLE_DEAL_NAME, SAMPLE_DEAL_META, readManifest, groupCalls, loadCallBundle,
} from '../src/calls-manifest.mjs';
import { buildTemplatesPage } from './build-templates-page.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLES_DIR = join(ROOT, 'samples/bundles');
const AUDIO_SRC_DIR = join(ROOT, 'samples/audio');
const EMAILS_DIR = join(ROOT, 'samples/emails');
const PUBLIC_DIR = join(ROOT, 'public');

const DEAL_NAME = SAMPLE_DEAL_NAME;
const DEAL_META = SAMPLE_DEAL_META;

// Who is on these calls (samples/DEAL-STATE.md: rep on the left channel, buyer
// on the right). Diarization gives channel labels; the names are deal facts the
// caller owns, so the renderer never invents them.
const SPEAKERS = { speaker_1: 'Maya', speaker_2: 'Rahul' };
const OWNERS = { rep: 'Maya', buyer: 'Rahul', joint: 'Both', unknown: 'Unclear who' };

export function loadBundles(dir = BUNDLES_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.bundle.json')).sort();
  if (files.length === 0) throw new Error(`no *.bundle.json files found in ${dir}`);
  return files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

// The deal nav model: one step per call, in call order.
export function callsNav(bundles) {
  return bundles.map((b, i) => {
    const id = b.call?.id ?? String(i + 1);
    return {
      id,
      seq: i + 1,
      title: b.call?.title ?? id,
      label: shortLabel(b.call?.title ?? id),
      href: `${id}.html`, // pages live together in public/notes/
    };
  });
}

// The routed template draft for one call, if one has been generated and cached
// (scripts/generate-template-email.mjs). The build never generates it: pages are
// built with no key and no network, so a call with no cached draft simply gets
// the verbatim panel and no second one. An unreadable artifact is the same
// answer as a missing one.
export function loadRoutedEmail(callId, dir = EMAILS_DIR) {
  const path = join(dir, `${callId}.template-email.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Stage one audio file next to the page that plays it. Copies only when the
// staged copy is missing or older, so a rebuild does not recopy a 10MB wav.
function stageAudio(src, dest) {
  if (!existsSync(src)) return false;
  if (existsSync(dest) && statSync(dest).mtimeMs >= statSync(src).mtimeMs) return true;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

// Your own calls, from the register the pipeline writes. Each deal in the
// manifest becomes one group on the landing and one set of pages under
// public/mine/. A manifest row whose bundle has gone missing is skipped with a
// warning: a half-built workspace is better than a demo that will not build.
function buildMyCalls({ publicDir, manifestPath, quiet }) {
  const manifest = readManifest(manifestPath);
  const mineDir = join(publicDir, 'mine');
  const groups = [];
  let pages = 0;
  let staged = 0;

  for (const group of groupCalls(manifest)) {
    const loaded = [];
    for (const entry of group.calls) {
      try {
        loaded.push({ entry, bundle: loadCallBundle(entry, manifestPath) });
      } catch (err) {
        if (!quiet) console.warn(`skipping ${entry.id}: ${err.message}`);
      }
    }
    if (!loaded.length) continue;

    const nav = loaded.map(({ entry, bundle }, i) => ({
      id: entry.id,
      seq: i + 1,
      title: bundle.call?.title ?? entry.id,
      label: shortLabel(bundle.call?.title ?? entry.id),
      href: `${entry.id}.html`,
    }));

    mkdirSync(mineDir, { recursive: true });
    loaded.forEach(({ entry, bundle }, i) => {
      let audioSrc = null;
      if (entry.audio) {
        const ext = extname(entry.audio) || '.wav';
        const dest = join(mineDir, 'audio', `${entry.id}${ext}`);
        if (stageAudio(entry.audio, dest)) {
          audioSrc = `/mine/audio/${entry.id}${ext}`;
          staged += 1;
        }
      }
      const html = renderCallPage(bundle, {
        calls: nav,
        currentId: entry.id,
        dealName: group.name,
        seq: i + 1,
        total: loaded.length,
        homeHref: '../index.html',
        audioSrc,
      });
      writeFileSync(join(mineDir, `${entry.id}.html`), html);
      pages += 1;
    });

    groups.push(buildCallGroup(loaded.map((l) => l.bundle), {
      name: group.name,
      slug: group.slug,
      hrefPrefix: 'mine/',
    }));
  }

  return { groups, pages, staged };
}

// The whole notes build as a callable function, so `npm start` (src/index.js)
// can refresh a stale workspace in-process instead of shelling out. Returns a
// summary the caller can log; `quiet` keeps the boot path from double-printing.
export function buildNotes({
  quiet = false, publicDir = PUBLIC_DIR, manifestPath = DEFAULT_MANIFEST_PATH,
} = {}) {
  const NOTES_DIR = join(publicDir, 'notes');
  const AUDIO_DIR = join(publicDir, 'audio');
  const PUBLIC = publicDir;
  const bundles = loadBundles();
  const calls = callsNav(bundles);
  mkdirSync(NOTES_DIR, { recursive: true });
  mkdirSync(AUDIO_DIR, { recursive: true });

  let staged = 0;
  const audioPresent = new Map();
  for (const c of calls) {
    const src = join(AUDIO_SRC_DIR, `call-${c.id}.m4a`);
    if (existsSync(src)) {
      copyFileSync(src, join(AUDIO_DIR, `${c.id}.m4a`));
      audioPresent.set(c.id, true);
      staged += 1;
    }
  }

  for (const bundle of bundles) {
    const id = bundle.call?.id;
    if (!id) throw new Error('bundle missing call.id, cannot name its page');
    const seq = calls.find((c) => c.id === id)?.seq ?? null;
    const html = renderCallPage(bundle, {
      calls,
      currentId: id,
      dealName: DEAL_NAME,
      seq,
      total: calls.length,
      speakers: SPEAKERS,
      owners: OWNERS,
      homeHref: '../index.html',
      audioSrc: audioPresent.get(id) ? `/audio/${id}.m4a` : null,
      routedEmail: loadRoutedEmail(id),
    });
    writeFileSync(join(NOTES_DIR, `${id}.html`), html);
  }

  // Your own calls, from workspace/calls.json. With none registered this is
  // an empty list and the landing below renders exactly as it does today.
  const mine = buildMyCalls({ publicDir: PUBLIC, manifestPath, quiet });

  // The landing IS the deal workspace, at the server root (public/index.html).
  // The sample deal heads the page; your deals sit under it.
  writeFileSync(join(PUBLIC, 'index.html'), renderDealWorkspace(bundles, {
    dealName: DEAL_NAME,
    dealMeta: DEAL_META,
    owners: OWNERS,
    groups: mine.groups,
  }));

  // The template library (public/templates.html): the 8 files in templates/,
  // read-only, linked from the landing and from every routed panel. Built from
  // the same files the router reads, so it cannot drift from them.
  const library = buildTemplatesPage({ quiet: true, publicDir: PUBLIC, ctx: { dealName: DEAL_NAME } });

  // The old samples-first landing lived under public/notes/. One flow means one
  // landing, so a stale copy from an earlier build never competes with it.
  const stale = join(NOTES_DIR, 'index.html');
  if (existsSync(stale)) rmSync(stale);

  if (!quiet) {
    console.log(`deal workspace: public/index.html (${calls.length} calls, the landing)`);
    console.log(`call pages: ${calls.length} calls -> public/notes/{${calls.map((c) => c.id).join(',')}}.html`);
    console.log(`audio staged: ${staged}/${calls.length} -> public/audio/`);
    if (mine.pages) {
      console.log(`your calls: ${mine.pages} in ${mine.groups.length} ${mine.groups.length === 1 ? 'deal' : 'deals'} -> public/mine/ (${mine.staged} with audio)`);
    }
    console.log(`template library: ${library.count} templates -> public/templates.html`);
    console.log(`open the demo at the deal-server root (/ -> index.html)`);
  }
  return {
    calls: calls.length, staged, mine: mine.pages, groups: mine.groups.length, templates: library.count,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildNotes();
}
