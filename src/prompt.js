import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Prompt composer (token-optimization.md §cache mechanics, contextual-analysis.md
// §prompt-level mechanics). Block order: system(discipline+glossary) -> transcript
// (cache_control breakpoint) -> task. Exactly one rendering of the transcript enters
// prompts, byte-identical to what src/gate.js verifies against (contextual-analysis
// non-negotiable, fixture F-24) — checkRender() below is that assertion in code.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISCIPLINE_TEXT = readFileSync(
  path.join(__dirname, '..', 'prompts', 'context-discipline.txt'),
  'utf8',
).trimEnd();

const MAX_GLOSSARY_ENTRIES = 40;

// ---- transcript rendering: "[U<id>] <token>: <text>" — NO timestamps. Mono
// utterances (speaker:null, role:null) render no token at all. Role-inferred
// utterances render "rep?"/"prospect?" (literal "?", role never certain here) and
// take priority over a raw speaker label when both are present. ----
function utteranceToken(u) {
  if (u.role) return `${u.role}?`;
  if (u.speaker) return u.speaker;
  return null;
}

function renderLine(u) {
  const token = utteranceToken(u);
  const prefix = token ? `[U${u.id}] ${token}:` : `[U${u.id}]`;
  return `${prefix} ${u.text}`;
}

export function renderTranscript(transcript) {
  const lines = transcript.utterances.map(renderLine);
  return {
    block: lines.join('\n'),
    suppliedIds: new Set(transcript.utterances.map((u) => u.id)),
  };
}

// Re-derives the expected render from the source transcript and throws a
// descriptive error on any divergence: id sequence, timestamp leakage, token
// choice, or (the load-bearing check) byte-identity of each line's text section
// against utterances[i].text. Import this in extract.js/gate.js as the single
// runtime assertion that "what the model saw" and "what the gate verifies against"
// are the same bytes.
export function checkRender(transcript, rendered) {
  const expectedLines = transcript.utterances.map(renderLine);
  const actualLines = rendered.block.split('\n');

  if (actualLines.length !== expectedLines.length) {
    throw new Error(`checkRender: line count ${actualLines.length} !== utterance count ${expectedLines.length}`);
  }
  for (let i = 0; i < expectedLines.length; i++) {
    if (actualLines[i] !== expectedLines[i]) {
      throw new Error(`checkRender: line ${i} mismatch\n  expected: ${JSON.stringify(expectedLines[i])}\n  actual:   ${JSON.stringify(actualLines[i])}`);
    }
    if (/\(\d{1,2}:\d{2}\)/.test(actualLines[i])) {
      throw new Error(`checkRender: line ${i} leaks a timestamp: ${JSON.stringify(actualLines[i])}`);
    }
  }

  const expectedIds = transcript.utterances.map((u) => u.id);
  const actualIds = [...rendered.suppliedIds].sort((a, b) => a - b);
  if (JSON.stringify(actualIds) !== JSON.stringify([...expectedIds].sort((a, b) => a - b))) {
    throw new Error('checkRender: suppliedIds does not match transcript utterance ids');
  }
  return true;
}

// ---- glossary block: entries whose term/alias occurs (substring, lowercase) in
// canonical_text, capped at 40, ~1 line each (contextual-analysis.md §Entity
// registry). Silently returns '' when nothing matches — the caller omits the
// section rather than emitting an empty header. ----
export function buildGlossaryBlock(entries, canonicalText) {
  if (!entries || !entries.length) return '';
  const haystack = (canonicalText ?? '').toLowerCase();
  const matched = entries.filter((e) => {
    const surfaces = [e.term, ...(e.aliases ?? [])].filter(Boolean).map((s) => s.toLowerCase());
    return surfaces.some((s) => haystack.includes(s));
  }).slice(0, MAX_GLOSSARY_ENTRIES);

  if (!matched.length) return '';
  const lines = matched.map((e) => {
    const note = e.disambiguation ? ` — ${e.disambiguation}` : '';
    return `- ${e.term} (${e.type ?? 'entity'})${note}`;
  });
  return ['Glossary — terms seen in this call:', ...lines].join('\n');
}

// ---- system blocks: [blockA staticDiscipline(+glossary), blockB transcript] ----
// blockB carries the cache_control marker; blockA+blockB together are the cached
// prefix and MUST be byte-identical across every extractor def for the same
// transcript (only buildUser's task turn, appended after this, varies per
// extractor) — never Date.now() or a run id anywhere in either block.
export function buildSystem(transcript, glossaryEntries = []) {
  const { block: transcriptBlock, suppliedIds } = renderTranscript(transcript);
  const glossaryBlock = buildGlossaryBlock(glossaryEntries, transcript.canonical_text);

  const blockA = {
    type: 'text',
    text: glossaryBlock ? `${DISCIPLINE_TEXT}\n\n${glossaryBlock}` : DISCIPLINE_TEXT,
  };
  const blockB = {
    type: 'text',
    text: transcriptBlock,
    cache_control: { type: 'ephemeral' },
  };

  return { blocks: [blockA, blockB], suppliedIds };
}

// ---- task turn: uncached, extractor-specific ----
export function buildUser(extractorDef) {
  const text =
    `${extractorDef.prompt}\n\n` +
    `Respond with JSON only, matching this schema exactly (no extra keys, no prose):\n` +
    JSON.stringify(extractorDef.output_schema);
  return { role: 'user', content: [{ type: 'text', text }] };
}

// ---- repair turn: literal validator text + the bad output echoed back ----
export function buildRepair(errors, offendingPaths, offendingOutput) {
  const lines = [
    'Your previous response failed validation. Fix exactly these issues and return corrected JSON only, same schema, no prose:',
    ...errors.map((e) => `- ${e}`),
  ];
  if (offendingPaths?.length) {
    lines.push(`Offending paths: ${offendingPaths.join(', ')}`);
  }
  if (offendingOutput !== undefined) {
    lines.push('Your previous response was:', typeof offendingOutput === 'string' ? offendingOutput : JSON.stringify(offendingOutput));
  }
  return { role: 'user', content: [{ type: 'text', text: lines.join('\n') }] };
}
