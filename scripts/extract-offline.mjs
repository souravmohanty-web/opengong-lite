#!/usr/bin/env node
// Offline extraction harness (BYO-LLM honesty). No Anthropic key: the agent
// authored the extractor responses by hand and they live on disk under
// samples/extractions/<callId>/<extractor>.json. This harness feeds each one
// through the REAL pipeline — buildTranscript -> runExtraction (schema validate
// + supplied-id screen + tracker dispatch) -> injection screen -> per-claim gate
// -> gradeRun coverage -> buildBundle + run record.
//
// The gate is what keeps the authoring honest: every evidence quote is
// re-verified against THIS transcript's canonical_text in code (src/gate.js),
// so a fabricated or paraphrased quote is DEMOTED to uncorroborated
// automatically — no authored label can talk its way past a missing receipt.
//
// This module owns exactly ONE thing src/run.js's runPipeline cannot do here:
// flattening the DEEP extractor shapes (competitor_mentions, pain_points, …)
// into gate-ready claims. src/extract.js's flattenClaims only maps the Slice-1
// objections/summary shapes + tracker's already-formed claims; the deep
// extractors carry their own schemas, so runPipeline would throw on them. The
// gate, injection screen, coverage grader and bundle writer are all reused
// verbatim — nothing about verification is reimplemented here.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTranscript } from '../src/transcript.js';
import { loadExtractors, DEFAULT_SCHEMAS_DIR } from '../src/registry.js';
import { runExtraction, flattenClaims, DEFAULT_EXTRACTORS_DIR } from '../src/extract.js';
import { screenTranscript, screenClaim } from '../src/injection.js';
import { gateClaim, gradeRun } from '../src/gate.js';
import { buildBundle } from '../src/bundle.js';
import { writeAtomic } from '../src/store.js';
import { formatFinalLine } from '../src/run.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TRANSCRIPTS_DIR = path.join(ROOT, 'samples', 'transcripts');
const EXTRACTIONS_DIR = path.join(ROOT, 'samples', 'extractions');
const BUNDLES_DIR = path.join(ROOT, 'samples', 'bundles');
const NOTES_DIR = path.join(ROOT, 'samples', 'notes');

// Titles are DISPLAY copy, so they are written in house voice here (colon
// separator, no dash) and must stay byte-identical to what the committed
// bundles carry. A re-run of this harness rewrites every bundle it is given, so
// a drifting title here silently un-does a copy pass on the demo pages.
const CALL_TITLES = {
  '01': 'Discovery: Brightsmile Dental, on RingHawk',
  '02': 'Demo: after-hours routing and compliant texting',
  '03': 'Pricing: quote vs RingHawk renewal counter',
  '04': 'Commitment check: the ledger moment',
  '05': 'Close: verbal commit on the pilot',
  '06': 'Messy: the phishing email and the honesty test',
};

// Per-call provenance truth. 01-05 were really spoken by PyAI TTS and really
// transcribed back by PyAI Hear. Call 06 was NOT: the `voice:synthesize` scope
// was unavailable when the samples were generated, so there is no audio and the
// transcript is authored in Hear's own output shape. Saying "pyai-hear" for 06
// would be exactly the kind of unearned claim this project exists to refuse.
const TRANSCRIPTION_MODEL = {
  '06': 'authored transcript (no audio: TTS scope was unavailable when the samples were generated)',
};
const DEFAULT_TRANSCRIPTION_MODEL = 'pyai-hear';

// The band -> exit mapping is run.js's public taxonomy (BAND_EXIT there). It is
// infra vocabulary, not gate logic; replicated (not the gate) so the offline
// run record reads with the same exit_reason/exit_code a live run would stamp.
const BAND_EXIT = {
  SHIPPED: { exitClass: 'SHIPPED', exitCode: 0 },
  SHIPPED_WITH_CORRECTIONS: { exitClass: 'SHIPPED', exitCode: 0 },
  PARTIAL_EXTRACTORS_FAILED: { exitClass: 'PARTIAL', exitCode: 70 },
  PARTIAL_LOW_COVERAGE: { exitClass: 'PARTIAL', exitCode: 70 },
  PARTIAL_CLAIMS_DROPPED: { exitClass: 'PARTIAL', exitCode: 70 },
  GATE_BLOCKED_UNPROVEN_CLAIMS: { exitClass: 'FAILED', exitCode: 65 },
};
function classifyBand(band) {
  const e = BAND_EXIT[band] ?? { exitClass: 'FAILED', exitCode: 70 };
  return { exitReason: band, ...e };
}

// Offline usage: no tokens spent, no dollar cost. BYO-LLM means the author is
// the model; stamping a fabricated cost would be its own lie.
const OFFLINE_USAGE = {
  input_tokens: 0, output_tokens: 0,
  cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
};
const OFFLINE_NOTE = 'offline extraction (author=agent, gate-verified)';

// ── deep-shape flattening ────────────────────────────────────────────────────
// Each authored file is validated against its output_schema by runExtraction
// BEFORE we get here (invalid files never reach this function). We map the
// schema shape to gate-ready claims. Two-sided facts (objection+rep response,
// competitor+switching trigger, pain+quantified impact) carry BOTH quotes as
// evidence, so the gate re-verifies each side as its own receipt.

const onlyCite = (e) => ({ utterance_id: e.utterance_id, quote: e.quote });
function mergeEvidence(...groups) {
  return groups.flat().filter(Boolean).map(onlyCite);
}

// A derived-fact block (buying_stage / stakeholders.threading / risk_flags):
// {value, basis, evidence}. It only becomes a claim when it actually stands on
// a cited quote — an "absent" basis with no evidence is a coverage note, never
// a claim (no fabricated receipt for an abstention).
function factClaim(extractor, key, fact, label) {
  if (!fact || fact.basis === 'absent' || !(fact.evidence?.length)) return null;
  return {
    id: `${extractor}-${key}`,
    extractor,
    section: extractor,
    // The extractor supplies a human sentence for the notes; `Label: enum` is
    // only the fallback for a fact block authored before `text` was required.
    text: fact.text ?? `${label}: ${fact.value}`,
    basis: fact.basis,
    evidence: mergeEvidence(fact.evidence),
  };
}

function flattenAny(extractorName, data) {
  // Tracker output is already gate-ready claims (data.claims) — identity, the
  // same path src/extract.js's flattenClaims takes.
  if (Array.isArray(data?.claims)) return data.claims;

  switch (extractorName) {
    case 'summary':
      // Reuse the runner's own mapping: Slice-1 summary -> summary/next_steps.
      return flattenClaims('summary', data);

    case 'objections':
      return (data.objections ?? []).map((o, i) => ({
        id: `objections-${i}`, extractor: 'objections', section: 'objections',
        text: o.text, category: o.category, handling: o.handling,
        objection_status: o.objection_status,
        ...(o.stance ? { stance: o.stance } : {}),
        evidence: mergeEvidence(o.evidence, o.rep_response?.evidence),
      }));

    case 'competitors':
      return (data.competitor_mentions ?? []).map((m, i) => ({
        id: `competitors-${i}`, extractor: 'competitors', section: 'competitors',
        text: m.text, competitor: m.competitor, relationship: m.relationship,
        ...(m.stance ? { stance: m.stance } : {}),
        evidence: mergeEvidence(m.evidence, m.switching_trigger?.evidence),
      }));

    case 'pain':
      return (data.pain_points ?? []).map((p, i) => ({
        id: `pain-${i}`, extractor: 'pain', section: 'pain',
        text: p.text, layer: p.layer, who_it_affects: p.who_it_affects,
        ...(p.stance ? { stance: p.stance } : {}),
        ...(p.quantities ? { quantities: p.quantities } : {}),
        evidence: mergeEvidence(p.evidence, p.quantified_impact?.evidence),
      }));

    case 'next_steps':
      return (data.next_steps ?? []).map((n, i) => ({
        id: `next_steps-${i}`, extractor: 'next_steps', section: 'next_steps',
        text: n.text, type: n.type, owner: n.owner, commitment: n.commitment,
        due: n.due, ...(n.stance ? { stance: n.stance } : {}),
        evidence: mergeEvidence(n.evidence),
      }));

    case 'pricing':
      return (data.pricing_mentions ?? []).map((m, i) => ({
        id: `pricing-${i}`, extractor: 'pricing', section: 'pricing',
        text: m.text, kind: m.kind, pricing_signal: m.pricing_signal,
        ...(m.stance ? { stance: m.stance } : {}),
        ...(m.quantities ? { quantities: m.quantities } : {}),
        evidence: mergeEvidence(m.evidence),
      }));

    case 'buying_stage':
      return [
        factClaim('buying_stage', 'stage', data.stage, 'Buying stage'),
        factClaim('buying_stage', 'urgency', data.urgency, 'Urgency'),
        factClaim('buying_stage', 'trigger', data.trigger_event, 'Trigger event'),
      ].filter(Boolean);

    case 'stakeholders': {
      const out = (data.stakeholders ?? []).map((s, i) => ({
        id: `stakeholders-${i}`, extractor: 'stakeholders', section: 'stakeholders',
        text: s.text, role_signal: s.role_signal, present_on_call: s.present_on_call,
        evidence: mergeEvidence(s.evidence),
      }));
      const threading = factClaim('stakeholders', 'threading', data.threading, 'Threading');
      if (threading) out.push(threading);
      return out;
    }

    case 'risk_flags':
      return [
        factClaim('risk_flags', 'buyer_posture', data.buyer_posture, 'Buyer posture'),
        factClaim('risk_flags', 'transcript_quality', data.transcript_quality, 'Transcript quality'),
        factClaim('risk_flags', 'anomaly', data.anomaly, 'Anomaly'),
      ].filter(Boolean);

    default:
      throw new Error(`flattenAny: no mapping for extractor "${extractorName}"`);
  }
}

// ── injected model: return the authored file for whichever extractor is asked ──
// runExtractorCall calls callLlm({ model, system, messages, schema }); `schema`
// IS extractorDef.output_schema, so we key the authored-response lookup on the
// stringified schema (unique per extractor). No network, no key.
function makeAuthoredCallLlm(callId, extractorDefs) {
  const bySchema = new Map();
  for (const def of extractorDefs) {
    if (def.role === 'tracker') continue; // trackers never call the model
    const file = path.join(EXTRACTIONS_DIR, callId, `${def.name}.json`);
    if (!existsSync(file)) {
      throw new Error(`missing authored extraction: ${path.relative(ROOT, file)}`);
    }
    bySchema.set(JSON.stringify(def.output_schema), {
      name: def.name, text: readFileSync(file, 'utf8'),
    });
  }
  return async ({ schema }) => {
    const hit = bySchema.get(JSON.stringify(schema));
    if (!hit) throw new Error('authored-response lookup miss — unknown extractor schema');
    return {
      text: hit.text,
      stop_reason: 'end_turn',
      model: 'offline-author',
      usage: { ...OFFLINE_USAGE },
    };
  };
}

// ── run-record shape (mirrors src/run.js initRecord + closeRun) ────────────────
function buildRunRecord({ callId, transcript, extractorDefs, coverage, extractorFailures, exit }) {
  const now = new Date().toISOString();
  return {
    schema_version: '1',
    run_id: `offline_${callId}`,
    call_id: callId,
    status: 'COMPLETED',
    exit_reason: exit.exitReason,
    exit_class: exit.exitClass,
    exit_code: exit.exitCode,
    started_at: now,
    completed_at: now,
    heartbeat_at: now,
    current_stage: 'bundle',
    extractors_planned: extractorDefs.map((d) => d.name),
    budget: { limit_usd: 0, spent_usd: 0, decisions: [] },
    context_ledger: extractorDefs
      .filter((d) => d.role !== 'tracker')
      .map((d) => ({
        extractor: d.name, attempt: 1, repair: false, model: 'offline-author',
        usage: { ...OFFLINE_USAGE }, cost_usd: 0, cache_action: 'offline',
        decided_by: 'offline_author', why: OFFLINE_NOTE,
      })),
    cache_misses_unexpected: 0,
    transcript_hash: transcript.transcript_hash,
    coverage_band: coverage.band,
    coverage_ratio: coverage.ratio,
    coverage_stats: coverage.stats,
    extractor_failures: extractorFailures,
    provenance: {
      transcription_model: TRANSCRIPTION_MODEL[callId] ?? DEFAULT_TRANSCRIPTION_MODEL,
      extraction: OFFLINE_NOTE,
    },
  };
}

// ── one call end to end ────────────────────────────────────────────────────────
async function runCall(callId, extractorRegistry) {
  const rawPath = path.join(TRANSCRIPTS_DIR, `${callId}.raw.json`);
  const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
  const transcript = buildTranscript(raw.result ?? raw);

  const extractorDefs = Object.values(extractorRegistry).filter((e) => e.enabled);
  const callLlm = makeAuthoredCallLlm(callId, extractorDefs);

  const extraction = await runExtraction({ transcript, extractors: extractorDefs, callLlm });

  const claims = [];
  const extractorFailures = [];
  for (const result of extraction.results) {
    if (result.status === 'ok') claims.push(...flattenAny(result.extractor, result.data));
    else extractorFailures.push(result.extractor);
  }

  // Two independent screens, exactly as run.js wires them.
  const injectionScreen = screenTranscript(transcript);
  const gated = claims.map((claim) => {
    const verdict = screenClaim(claim, injectionScreen, transcript);
    return gateClaim(claim, transcript, { injection: verdict });
  });
  const coverage = gradeRun(gated, { extractorFailures });
  const exit = classifyBand(coverage.band);

  const bundle = buildBundle({
    transcript, claims: gated, coverage, callId,
    title: CALL_TITLES[callId] ?? callId,
    provenance: {
      transcription_model: TRANSCRIPTION_MODEL[callId] ?? DEFAULT_TRANSCRIPTION_MODEL,
      extraction_model: 'offline-author',
      note: OFFLINE_NOTE,
    },
  });
  writeAtomic(path.join(BUNDLES_DIR, `${callId}.bundle.json`), bundle);

  const record = buildRunRecord({ callId, transcript, extractorDefs, coverage, extractorFailures, exit });
  writeAtomic(path.join(NOTES_DIR, `${callId}.run.json`), record);

  return { callId, coverage, exit, record, extractorFailures };
}

function discoverCalls() {
  if (!existsSync(TRANSCRIPTS_DIR)) return [];
  return readdirSync(TRANSCRIPTS_DIR)
    .filter((f) => /^\d+\.raw\.json$/.test(f))
    .map((f) => f.slice(0, f.indexOf('.')))
    .sort();
}

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.filter((a) => !a.startsWith('-'));
  const extractorRegistry = loadExtractors(DEFAULT_EXTRACTORS_DIR, { schemasDir: DEFAULT_SCHEMAS_DIR });

  const calls = (only.length ? only : discoverCalls());
  if (!calls.length) {
    console.error('no transcripts found under samples/transcripts/');
    process.exit(64);
  }

  const summary = [];
  for (const callId of calls) {
    const r = await runCall(callId, extractorRegistry);
    const s = r.coverage.stats;
    console.log(formatFinalLine(r.record, '0.0'));
    summary.push({ callId, ...s, band: r.coverage.band, ratio: r.coverage.ratio });
  }

  // Aggregate scorecard — the demo's stage number.
  const agg = summary.reduce((a, s) => ({
    total: a.total + s.total, attempted: a.attempted + s.attempted,
    verified: a.verified + s.verified, segment_corrected: a.segment_corrected + s.segment_corrected,
    uncorroborated: a.uncorroborated + s.uncorroborated, blocked_injection: a.blocked_injection + s.blocked_injection,
    corroborated: a.corroborated + s.corroborated,
  }), { total: 0, attempted: 0, verified: 0, segment_corrected: 0, uncorroborated: 0, blocked_injection: 0, corroborated: 0 });

  console.log('\n── corpus scorecard ──');
  console.log('call  verified corrected uncorrob blocked  attempted  band');
  for (const s of summary) {
    console.log(
      `${s.callId.padEnd(5)} ${String(s.verified).padStart(8)} ${String(s.segment_corrected).padStart(9)} ` +
      `${String(s.uncorroborated).padStart(8)} ${String(s.blocked_injection).padStart(7)} ${String(s.attempted).padStart(10)}  ${s.band}`,
    );
  }
  const verifiedPct = agg.attempted ? (agg.verified / agg.attempted) * 100 : 0;
  const corroboratedPct = agg.attempted ? (agg.corroborated / agg.attempted) * 100 : 0;
  console.log(
    `\nTOTAL verified=${agg.verified} corrected=${agg.segment_corrected} uncorroborated=${agg.uncorroborated} ` +
    `blocked=${agg.blocked_injection} attempted=${agg.attempted}`,
  );
  console.log(`verified%  = ${verifiedPct.toFixed(1)}%  (verified / attempted)`);
  console.log(`corroborated% = ${corroboratedPct.toFixed(1)}%  (verified + segment_corrected / attempted)`);
}

main().catch((err) => { console.error(err); process.exit(70); });
