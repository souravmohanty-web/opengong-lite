#!/usr/bin/env node
// methodology-coach CLI (npm run coach -- <cmd>).
//   list                                   — all packs (builtin + custom)
//   show <pack-id>                         — traits + classifying questions
//   set <pack-id>                          — admin setting: active methodology
//   score <transcript> [--pack id]         — score + coach
//         [--mock fixture.json]            — keyless: canned LLM response
//         [--offline-prepare req.json]     — keyless: write LLM request, stop
//         [--offline-complete resp.json]   — keyless: resume with response JSON
//         [--out report.md]                — write report (default: stdout)
//   compile <file-or-text> [--save]        — free-text methodology -> pack JSON
//
// Keyless-first: with no ANTHROPIC_API_KEY, `score` replays a committed cached
// verdict when one ships beside the transcript (samples/methodology/cached/),
// else points at the offline two-step. A fresh clone never dead-ends on a key.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks, loadSettings, activePack, SETTINGS_PATH } from './packs.js';
import { parseTranscript, speakerLabelsFound } from './transcript.js';
import {
  scoreTranscript, compilePack, liveProvider, mockProvider,
  prepareProvider, completeProvider, cachedVerdictPath, Prepared,
} from './run.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
}

function pickProvider({ transcriptPath, packId } = {}) {
  if (arg('--mock')) return mockProvider(arg('--mock'));
  if (arg('--offline-prepare')) return prepareProvider(arg('--offline-prepare'));
  if (arg('--offline-complete')) return completeProvider(arg('--offline-complete'));
  if (process.env.ANTHROPIC_API_KEY) return liveProvider();
  if (transcriptPath && packId) {
    const cached = cachedVerdictPath(transcriptPath, packId);
    if (cached) {
      console.error(`note: no ANTHROPIC_API_KEY — replaying cached demo verdict (${cached}). Set a key for live scoring.`);
      return mockProvider(cached);
    }
  }
  console.error('no ANTHROPIC_API_KEY and no cached verdict for this transcript+pack.');
  console.error('keyless path: rerun with --offline-prepare req.json , produce the response JSON with any LLM, then rerun with --offline-complete <response.json>.');
  process.exit(1);
}

const [, , cmd, ...rest] = process.argv;

try {
  if (cmd === 'list') {
    const settings = loadSettings();
    for (const p of loadPacks({ customDir: settings.custom_packs_dir }).values()) {
      const active = p.id === settings.methodology ? '  <- active' : '';
      console.log(`${p.id.padEnd(22)} ${p.name.padEnd(28)} ${p.traits.length} traits (${p._origin})${active}`);
    }
  } else if (cmd === 'show') {
    const settings = loadSettings();
    const pack = loadPacks({ customDir: settings.custom_packs_dir }).get(rest[0]);
    if (!pack) throw new Error(`unknown pack "${rest[0]}" — run \`list\``);
    console.log(`# ${pack.name}\n${pack.summary}\nMotion: ${pack.motion ?? '-'}\n`);
    for (const t of pack.traits) {
      console.log(`## ${t.name} (${t.id}, weight ${t.weight})\n${t.definition}`);
      for (const q of t.classifying_questions) console.log(`  - ${q}`);
      console.log('');
    }
  } else if (cmd === 'set') {
    const settings = loadSettings();
    const packs = loadPacks({ customDir: settings.custom_packs_dir });
    if (!packs.has(rest[0])) throw new Error(`unknown pack "${rest[0]}" — run \`list\``);
    settings.methodology = rest[0];
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    console.log(`active methodology -> ${rest[0]}`);
  } else if (cmd === 'score') {
    const file = rest[0];
    if (!file) throw new Error('usage: score <transcript-file> [--pack id]');
    const settings = loadSettings();
    const packs = loadPacks({ customDir: settings.custom_packs_dir });
    const pack = arg('--pack') ? packs.get(arg('--pack')) : activePack();
    if (!pack) throw new Error(`unknown pack "${arg('--pack')}"`);
    const transcript = parseTranscript(readFileSync(file, 'utf8'));
    if (transcript.segments.length === 0) throw new Error('transcript parsed to 0 segments — expected "Name (Role): text" lines or {segments:[...]} JSON');
    if (!speakerLabelsFound(transcript)) console.error('warn: fewer than 2 speakers found — verdicts about who said what will be weak');

    const { scored, gated, report } = await scoreTranscript({
      pack, transcript, transcriptName: basename(file),
      provider: pickProvider({ transcriptPath: file, packId: pack.id }),
    });
    const out = arg('--out');
    if (out) { writeFileSync(out, report); console.log(`report -> ${out}`); } else { console.log(report); }
    console.error(`\nscore=${scored.score}/100 pack=${pack.id} verified=${gated.gate.evidence_verified}/${gated.gate.evidence_total} unverified_traits=${gated.gate.traits_unverified}`);
  } else if (cmd === 'compile') {
    const src = rest[0];
    if (!src) throw new Error('usage: compile <file-or-quoted-text> [--save]');
    const freeText = existsSync(src) ? readFileSync(src, 'utf8') : src;
    const pack = await compilePack({ freeText, provider: pickProvider() });
    if (process.argv.includes('--save')) {
      const settings = loadSettings();
      const dir = join(ROOT, settings.custom_packs_dir);
      mkdirSync(dir, { recursive: true });
      const dest = join(dir, `${pack.id}.json`);
      writeFileSync(dest, JSON.stringify(pack, null, 2));
      console.log(`saved -> ${dest}\nactivate with: npm run coach -- set ${pack.id}`);
    } else {
      console.log(JSON.stringify(pack, null, 2));
    }
  } else {
    console.log('commands: list | show <id> | set <id> | score <file> [--pack id] [--mock f|--offline-prepare f|--offline-complete f] [--out f] | compile <file-or-text> [--save]');
  }
} catch (err) {
  if (err instanceof Prepared) {
    console.log(`LLM request written to ${err.outPath}.`);
    console.log(`Produce the response JSON (matching the embedded schema), then rerun with --offline-complete <response.json>.`);
    process.exit(0);
  }
  console.error(`error: ${err.message}`);
  process.exit(1);
}
