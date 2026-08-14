// `npm start` opens THE DEMO: the Brightsmile deal workspace, on one port, at
// one URL. It refreshes the built pages when they are stale, then serves
// public/ over 127.0.0.1:4318 — root lands on the deal, and a call is one
// click from there.
//
// Zero keys, zero network at boot. A PyAI sandbox key self-mints lazily on the
// first real transcription (pyaiFetch handles it); nothing is minted or spent
// here. Shared-principle credit: "don't mint a key until someone transcribes."
//
// The older single-call receipts viewer (src/server.js, port 4317, one fixture
// bundle) is still one command away: `npm run demo`.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { startServer, DEFAULT_PUBLIC_DIR } from './deal-server.mjs';
import { buildNotes } from '../scripts/build-notes.mjs';
import { buildDealWorkspace } from '../scripts/build-deal-index.mjs';
import { loadKey } from './keystore.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const r = (...p) => join(ROOT, ...p);

// Everything the built pages are rendered FROM. If any of it is newer than the
// oldest built artifact, the workspace on disk is stale. workspace/ is the
// register `npm run pipeline` writes, so a call added since the last build
// makes the workspace stale and `npm start` rebuilds it before serving.
export const SOURCES = [
  r('samples/bundles'),
  r('samples/audio'),
  r('workspace'),
  r('src/notes-view.mjs'),
  r('src/viewer.js'),
  r('src/email.js'),
  r('src/export.js'),
  r('src/deal-index.mjs'),
  r('scripts/build-notes.mjs'),
  r('scripts/build-deal-index.mjs'),
];
const OUTPUTS = [
  r('public/index.html'),
  r('public/deal-index.json'),
  r('public/deal-index.mjs'),
  r('public/calls'),
  r('public/notes'),
  r('public/audio'),
];

// Newest mtime under a path (a directory counts its direct children too, so a
// newly added bundle or a newly staged audio file registers as a change).
function newestMtime(path) {
  if (!existsSync(path)) return null;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = st.mtimeMs;
  for (const name of readdirSync(path)) {
    const t = newestMtime(join(path, name));
    if (t != null && t > newest) newest = t;
  }
  return newest;
}
function oldestMtime(path) {
  if (!existsSync(path)) return null;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let oldest = null;
  for (const name of readdirSync(path)) {
    const t = oldestMtime(join(path, name));
    if (t != null && (oldest == null || t < oldest)) oldest = t;
  }
  return oldest ?? st.mtimeMs;
}

export function workspaceIsStale() {
  const outs = OUTPUTS.map(oldestMtime);
  if (outs.some((t) => t == null)) return true;          // never built
  const builtAt = Math.min(...outs);
  const srcs = SOURCES.map(newestMtime).filter((t) => t != null);
  return srcs.some((t) => t > builtAt);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (workspaceIsStale()) {
    console.log('notes workspace is stale, rebuilding from samples/bundles/ ...');
    const notes = buildNotes({ quiet: true });
    const deal = buildDealWorkspace({ quiet: true });
    console.log(
      `built ${notes.calls} call pages (${notes.staged} with audio) + a ${deal.records}-record deal index`,
    );
  }

  startServer(DEFAULT_PUBLIC_DIR).on('listening', function onListening() {
    const { port } = this.address();
    console.log(`\nOpenGong Lite → http://127.0.0.1:${port}/`);
    console.log('Brightsmile Dental: the deal, then a call, then the line it came from.');
    console.log('Single-call receipts viewer (older, one fixture): npm run demo → http://127.0.0.1:4317/\n');
    const key = loadKey();
    console.log(key
      ? `PyAI key: present (${key.source})`
      : 'PyAI key: none yet. One self-mints (free) the first time you transcribe: node src/ingest.js <your-call.wav>');
    console.log(process.env.ANTHROPIC_API_KEY
      ? 'Anthropic key: set. Live extraction available.'
      : 'Anthropic key: not set. The cached demo works fully without it.');
  });
}
