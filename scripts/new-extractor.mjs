#!/usr/bin/env node
// Scaffolds a new extractor (L12: "extractors are declarative extractor.json
// files ... `npx opengong new-extractor` starter"). An extractor is ONE JSON
// file — no code, no registration step: src/registry.js re-reads extractors/
// fresh on every run, so the next pipeline run picks the new file up.
//
// Usage: npm run new-extractor <name>
//
// The scaffold lands with "enabled": false on purpose. An enabled extractor
// with no authored response would fail the offline sample corpus on the next
// run; you flip the flag once the prompt and schema are real.
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const EXTRACTORS_DIR = fileURLToPath(new URL('../extractors', import.meta.url));

export function scaffold(name) {
  return {
    name,
    version: '0.1.0',
    title: `<TODO: human title for ${name}>`,
    description: `<TODO: one sentence on what ${name} pulls out of a call, and what it refuses to guess at.>`,
    enabled: false,
    role: 'extraction',
    scope: 'call',
    evidence_required: true,
    applies_to: ['discovery', 'demo', 'negotiation', 'renewal'],
    consumer: ['manager'],
    crm_map: { hubspot: { property: `ai_${name}` } },
    prompt: `<TODO: tell the model exactly what to return.>\n\nCopy every quote character-for-character out of the transcript: no paraphrase, and never convert a number word to digits. Every item you return must carry the quote that proves it in \`evidence\`. If the call does not support an item, leave the list empty rather than inventing one: the gate re-verifies each quote against the transcript in code, so an unprovable item is dropped, not shipped.`,
    output_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['evidence', 'text'],
            properties: {
              evidence: { type: 'array', items: { $ref: 'opengong://evidence' } },
              text: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const name = (process.argv[2] ?? '').trim();
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(name)) {
    console.error('usage: npm run new-extractor <name>   (lowercase letters, digits, underscore)');
    process.exit(64);
  }
  const file = join(EXTRACTORS_DIR, `${name}.json`);
  if (existsSync(file)) {
    console.error(`extractors/${name}.json already exists — pick another name or edit that file.`);
    process.exit(73);
  }
  writeFileSync(file, JSON.stringify(scaffold(name), null, 2) + '\n');

  console.log(`created extractors/${name}.json`);
  console.log('\nnext:');
  console.log(`  1. fill in the <TODO: ...> markers (title, description, prompt)`);
  console.log(`  2. shape output_schema to what you want back, evidence-first`);
  console.log(`  3. set "enabled": true`);
  console.log(`  4. re-run the whole call library: node src/run.js  (or scripts/extract-offline.mjs`);
  console.log(`     for the committed samples, which need an authored response per call)`);
  console.log('\nThat is the whole extension surface. No code changed, nothing registered:');
  console.log('src/registry.js reads extractors/ fresh on every run and validates this file');
  console.log('against the same lint every shipped extractor passes.');
}
