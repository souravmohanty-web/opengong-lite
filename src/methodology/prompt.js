// Prompt + JSON-schema builders for the two LLM calls: (1) scoring a call
// against a methodology pack, (2) compiling admin free-text into a pack.
// The scoring output requires a verbatim quote per evidence item — the gate
// (src/gate.js) verifies every quote in code, per the parent repo's receipts
// discipline: the model cites, the code proves.

import { renderForPrompt } from './transcript.js';
import { VERDICTS } from './packs.js';

export function verdictSchema(pack) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['call_type', 'overall_note', 'traits'],
    properties: {
      call_type: { type: 'string', description: 'discovery | demo | pricing | negotiation | check_in | other' },
      overall_note: { type: 'string', description: 'One short paragraph: how the call went through this methodology lens.' },
      traits: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'verdict', 'confidence', 'evidence', 'gap'],
          properties: {
            id: { type: 'string', enum: pack.traits.map((t) => t.id) },
            verdict: { type: 'string', enum: VERDICTS },
            confidence: { type: 'number', description: '0-1. Below 0.6 is rendered as "check this" for human review.' },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['quote', 'segment'],
                properties: {
                  quote: { type: 'string', description: 'VERBATIM text copied from one transcript line. Never paraphrase.' },
                  segment: { type: 'integer', description: 'The [n] ordinal of the line the quote came from.' },
                },
              },
            },
            gap: { type: 'string', description: 'What was missing, specific to THIS call. Empty string when verdict is met.' },
          },
        },
      },
    },
  };
}

export function buildScoringPrompt(pack, transcript) {
  const traitBlock = pack.traits.map((t) => [
    `### ${t.id} — ${t.name} (weight ${t.weight})`,
    t.definition,
    `Classifying questions:`,
    ...t.classifying_questions.map((q) => `- ${q}`),
    t.met_signals?.length ? `Met looks like: ${t.met_signals.join('; ')}` : null,
    t.miss_signals?.length ? `Missed looks like: ${t.miss_signals.join('; ')}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  const system = [
    `You are a sales-call analyst scoring one call against the ${pack.name} methodology.`,
    `For EVERY trait below, answer its classifying questions against the transcript and return a verdict:`,
    `- met: clearly demonstrated on this call`,
    `- partial: attempted or half-done`,
    `- missed: should have happened on this call and did not`,
    `- not_applicable: could not reasonably occur on this call type (be sparing)`,
    ``,
    `Evidence rules (strictly enforced downstream in code):`,
    `- Every met/partial verdict needs at least one evidence item.`,
    `- quote must be VERBATIM, character-for-character, from a single transcript line. Never paraphrase, never merge lines, never fix punctuation.`,
    `- segment is the [n] ordinal of that line.`,
    `- missed verdicts need no evidence; put the specifics of what was missing in gap.`,
    `- gap must reference this call's actual content, not generic advice.`,
    ``,
    `## ${pack.name}`,
    pack.summary,
    ``,
    `## Traits`,
    traitBlock,
  ].join('\n');

  const user = `Transcript (one utterance per line, [n] = segment ordinal):\n\n${renderForPrompt(transcript)}`;
  return { system, messages: [{ role: 'user', content: user }] };
}

// ---- custom methodology compilation ----------------------------------------

export function packSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'name', 'summary', 'motion', 'traits'],
    properties: {
      id: { type: 'string', description: 'lowercase kebab/snake slug derived from the name' },
      name: { type: 'string' },
      origin: { type: 'string', description: 'Who created/uses this methodology, if stated. Else "custom".' },
      summary: { type: 'string' },
      motion: { type: 'string', description: 'What sales motion it fits.' },
      traits: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name', 'weight', 'definition', 'classifying_questions', 'met_signals', 'miss_signals', 'coaching'],
          properties: {
            id: { type: 'string', description: 'snake_case' },
            name: { type: 'string' },
            weight: { type: 'integer', description: '1-5; 5 = most important' },
            definition: { type: 'string' },
            classifying_questions: { type: 'array', items: { type: 'string' } },
            met_signals: { type: 'array', items: { type: 'string' } },
            miss_signals: { type: 'array', items: { type: 'string' } },
            coaching: {
              type: 'object',
              additionalProperties: false,
              required: ['why_it_matters', 'next_move', 'example_line'],
              properties: {
                why_it_matters: { type: 'string' },
                next_move: { type: 'string', description: 'Concrete action for the next call.' },
                example_line: { type: 'string', description: 'A line the rep could actually say.' },
              },
            },
          },
        },
      },
    },
  };
}

export function buildCompilePrompt(freeText) {
  const system = [
    `You convert a sales team's description of their OWN sales methodology into a scoring pack.`,
    `Extract 4-8 traits from the description. Stay faithful to their words: use their terminology for trait names, do not substitute a standard methodology's components unless the description clearly is one.`,
    `For each trait write 2-4 classifying questions an analyst would ask of a call transcript to judge whether the rep demonstrated it, plus concrete met/miss signals and coaching (why it matters, the next-call move, and one example line a rep could say).`,
    `Weights: 5 for what the description emphasizes most, down to 1 for peripheral traits. If the description gives an order or says something is critical, respect it.`,
  ].join('\n');
  const user = `Team's methodology description:\n\n${freeText}`;
  return { system, messages: [{ role: 'user', content: user }] };
}
