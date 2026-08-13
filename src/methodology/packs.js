// Methodology pack loading + validation. A pack is one JSON file in
// methodologies/ — the same declarative-plugin pattern as extractors/: adding a
// methodology is one file, zero code. Admin-compiled packs (from free text via
// `coach compile`) live in methodologies-custom/ and win on id collision.
// Files starting with "_" (the settings file) are not packs.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SETTINGS_PATH = join(ROOT, 'methodologies', '_settings.json');

export const VERDICTS = ['met', 'partial', 'missed', 'not_applicable'];

export function validatePack(pack, source = 'inline') {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(`${source}: ${msg}`); };

  need(typeof pack?.id === 'string' && /^[a-z0-9_-]+$/.test(pack.id), 'id must be kebab/snake lowercase string');
  need(typeof pack?.name === 'string' && pack.name.length > 0, 'name required');
  need(typeof pack?.summary === 'string' && pack.summary.length > 0, 'summary required');
  need(Array.isArray(pack?.traits) && pack.traits.length >= 3 && pack.traits.length <= 12, 'traits must be an array of 3-12');

  const ids = new Set();
  for (const t of pack?.traits ?? []) {
    const at = `trait ${t?.id ?? '?'}`;
    need(typeof t?.id === 'string' && /^[a-z0-9_]+$/.test(t.id), `${at}: id must be snake_case`);
    need(!ids.has(t?.id), `${at}: duplicate id`);
    ids.add(t?.id);
    need(typeof t?.name === 'string', `${at}: name required`);
    need(typeof t?.definition === 'string' && t.definition.length > 0, `${at}: definition required`);
    need(Number.isFinite(t?.weight) && t.weight > 0 && t.weight <= 5, `${at}: weight must be 1-5`);
    need(Array.isArray(t?.classifying_questions) && t.classifying_questions.length >= 1, `${at}: classifying_questions required`);
    need(typeof t?.coaching?.why_it_matters === 'string', `${at}: coaching.why_it_matters required`);
    need(typeof t?.coaching?.next_move === 'string', `${at}: coaching.next_move required`);
    need(typeof t?.coaching?.example_line === 'string', `${at}: coaching.example_line required`);
  }
  return errors;
}

function loadDir(dir, origin) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => {
      const pack = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const errors = validatePack(pack, `${origin}/${f}`);
      if (errors.length) throw new Error(`PACK_INVALID:\n  ${errors.join('\n  ')}`);
      return { ...pack, _origin: origin };
    });
}

export function loadPacks({ customDir = 'methodologies-custom' } = {}) {
  const builtin = loadDir(join(ROOT, 'methodologies'), 'builtin');
  const custom = loadDir(join(ROOT, customDir), 'custom');
  const byId = new Map();
  for (const p of [...builtin, ...custom]) byId.set(p.id, p); // custom wins
  return byId;
}

export function loadSettings() {
  return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
}

export { SETTINGS_PATH };

export function activePack() {
  const settings = loadSettings();
  const packs = loadPacks({ customDir: settings.custom_packs_dir });
  const pack = packs.get(settings.methodology);
  if (!pack) throw new Error(`SETTINGS_BAD_METHODOLOGY: "${settings.methodology}" not found. Available: ${[...packs.keys()].join(', ')}`);
  return pack;
}
