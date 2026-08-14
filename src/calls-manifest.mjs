// The register that closes the loop: `npm run pipeline` ends by calling
// registerCall(), and the workspace builders (scripts/build-notes.mjs) render
// exactly what the register lists. One explicit file, no watched directory:
// if a call is not in workspace/calls.json it is not in the workspace, and
// nothing appears on the landing that nobody asked for.
//
// Everything a registered call needs lives under workspace/ (git-ignored, it
// is your data, not the repo's): the manifest itself plus a copy of the run's
// bundle, so the workspace still builds after `rm -rf runs/`. Audio is NOT
// copied here — the manifest points at the file you handed the pipeline, and
// the builder stages it if it is still there. A call whose audio moved (or
// that came from a URL) degrades to audio-optional, the same way the sample
// calls already do.
//
// The Brightsmile sample deal is read-only from here. It is built from
// samples/bundles/ and this module refuses to register anything into it, so a
// rehearsal cannot be polluted by a test run five minutes before the demo.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAtomic } from './store.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const DEFAULT_WORKSPACE_DIR = path.join(ROOT, 'workspace');
export const MANIFEST_FILE = 'calls.json';
export const DEFAULT_MANIFEST_PATH = path.join(DEFAULT_WORKSPACE_DIR, MANIFEST_FILE);
export const MANIFEST_VERSION = 1;

// The demo deal, and its two facts. Named here so both the builder and the
// registration guard read the same string.
export const SAMPLE_DEAL_NAME = 'Brightsmile Dental Group';
export const SAMPLE_DEAL_META = '5 locations, on RingHawk today';

// Where a call goes when you do not say. Your own calls, kept apart from the
// sample deal.
export const DEFAULT_DEAL_NAME = 'Your calls';

export function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const SAMPLE_DEAL_SLUG = slugify(SAMPLE_DEAL_NAME);

// A page id: safe in a file name and in a URL, and never blank.
export function callIdFrom(raw) {
  return slugify(String(raw ?? '').replace(/\.[a-z0-9]{1,5}$/i, '')) || 'call';
}

function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// A call's honest title is the thing you handed the pipeline: the file name,
// or the host and path of the URL. Never a name we made up for it.
export function sourceTitle(source = {}) {
  if (source.filePath) return path.basename(source.filePath);
  if (source.audioUrl) {
    try {
      const u = new URL(source.audioUrl);
      return `${u.hostname}${u.pathname}`.replace(/\/$/, '') || u.hostname;
    } catch {
      return String(source.audioUrl);
    }
  }
  return 'call';
}

export function emptyManifest() {
  return { version: MANIFEST_VERSION, calls: [] };
}

export function readManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
  if (!existsSync(manifestPath)) return emptyManifest();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`${manifestPath} is not readable JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed?.calls)) throw new Error(`${manifestPath} has no calls array`);
  return { version: parsed.version ?? MANIFEST_VERSION, calls: parsed.calls };
}

export function writeManifest(manifest, manifestPath = DEFAULT_MANIFEST_PATH) {
  writeAtomic(manifestPath, { version: MANIFEST_VERSION, calls: manifest.calls });
  return manifest;
}

// registerCall({ bundlePath, ... }) -> { entry, manifest }
//
// Copies the run's bundle into workspace/bundles/<id>.bundle.json and appends
// one manifest row. The row carries where the call came from (run id, source,
// audio path) so the workspace can say honest things about it later.
export function registerCall({
  bundlePath,
  deal = DEFAULT_DEAL_NAME,
  title = null,
  audioPath = null,
  runId = null,
  source = null,
  manifestPath = DEFAULT_MANIFEST_PATH,
  now = () => new Date(),
} = {}) {
  if (!bundlePath) throw new Error('registerCall needs a bundlePath');
  if (!existsSync(bundlePath)) throw new Error(`no bundle at ${bundlePath}`);

  const dealName = String(deal ?? '').trim() || DEFAULT_DEAL_NAME;
  const dealSlug = slugify(dealName);
  if (!dealSlug) throw new Error('a deal name has to have letters or numbers in it');
  if (dealSlug === SAMPLE_DEAL_SLUG) {
    throw new Error(
      `${SAMPLE_DEAL_NAME} is the sample deal and it is read-only. Give your call another deal name with --deal.`,
    );
  }

  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const manifest = readManifest(manifestPath);
  const taken = new Set(manifest.calls.map((c) => c.id));
  const id = uniqueId(callIdFrom(bundle.call?.id ?? title ?? 'call'), taken);

  const workspaceDir = path.dirname(manifestPath);
  const storedBundle = path.join('bundles', `${id}.bundle.json`);
  mkdirSync(path.join(workspaceDir, 'bundles'), { recursive: true });
  copyFileSync(bundlePath, path.join(workspaceDir, storedBundle));

  const entry = {
    id,
    deal: dealName,
    dealSlug,
    title: title ?? bundle.call?.title ?? id,
    bundle: storedBundle, // relative to the manifest's own directory
    audio: audioPath && existsSync(audioPath) ? path.resolve(audioPath) : null,
    run_id: runId,
    source: source ?? null,
    added_at: now().toISOString(),
  };

  manifest.calls.push(entry);
  writeManifest(manifest, manifestPath);
  return { entry, manifest };
}

// The manifest as deal groups, in the order the deals were first used, each
// deal's calls in the order they were added.
export function groupCalls(manifest) {
  const bySlug = new Map();
  for (const call of manifest.calls ?? []) {
    const slug = call.dealSlug ?? slugify(call.deal ?? DEFAULT_DEAL_NAME);
    if (!bySlug.has(slug)) {
      bySlug.set(slug, { slug, name: call.deal ?? DEFAULT_DEAL_NAME, calls: [] });
    }
    bySlug.get(slug).calls.push(call);
  }
  return [...bySlug.values()];
}

// Load one registered call's bundle, with the page id the workspace knows it
// by. The title stays whatever the run wrote unless the manifest carries one.
export function loadCallBundle(entry, manifestPath = DEFAULT_MANIFEST_PATH) {
  const full = path.resolve(path.dirname(manifestPath), entry.bundle);
  const bundle = JSON.parse(readFileSync(full, 'utf8'));
  return {
    ...bundle,
    call: {
      ...(bundle.call ?? {}),
      id: entry.id,
      title: entry.title ?? bundle.call?.title ?? entry.id,
    },
  };
}
