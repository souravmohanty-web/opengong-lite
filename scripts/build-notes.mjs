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
//
// Audio is optional: if a file is missing the click-to-reveal still works and
// the play buttons hide.
//
// Usage: node scripts/build-notes.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderCallPage, renderDealWorkspace, shortLabel } from '../src/notes-view.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLES_DIR = join(ROOT, 'samples/bundles');
const AUDIO_SRC_DIR = join(ROOT, 'samples/audio');
const PUBLIC_DIR = join(ROOT, 'public');
const NOTES_DIR = join(PUBLIC_DIR, 'notes');
const AUDIO_DIR = join(PUBLIC_DIR, 'audio');

const DEAL_NAME = 'Brightsmile Dental Group';
const DEAL_META = '5 locations, on RingHawk today';

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

// The whole notes build as a callable function, so `npm start` (src/index.js)
// can refresh a stale workspace in-process instead of shelling out. Returns a
// summary the caller can log; `quiet` keeps the boot path from double-printing.
export function buildNotes({ quiet = false } = {}) {
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
      homeHref: '../index.html',
      audioSrc: audioPresent.get(id) ? `/audio/${id}.m4a` : null,
    });
    writeFileSync(join(NOTES_DIR, `${id}.html`), html);
  }

  // The landing IS the deal workspace, at the server root (public/index.html).
  writeFileSync(join(PUBLIC_DIR, 'index.html'), renderDealWorkspace(bundles, {
    dealName: DEAL_NAME,
    dealMeta: DEAL_META,
    owners: OWNERS,
  }));

  // The old samples-first landing lived under public/notes/. One flow means one
  // landing, so a stale copy from an earlier build never competes with it.
  const stale = join(NOTES_DIR, 'index.html');
  if (existsSync(stale)) rmSync(stale);

  if (!quiet) {
    console.log(`deal workspace: public/index.html (${calls.length} calls, the landing)`);
    console.log(`call pages: ${calls.length} calls -> public/notes/{${calls.map((c) => c.id).join(',')}}.html`);
    console.log(`audio staged: ${staged}/${calls.length} -> public/audio/`);
    console.log(`open the demo at the deal-server root (/ -> index.html)`);
  }
  return { calls: calls.length, staged };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildNotes();
}
