#!/usr/bin/env node
// scripts/scorecard.mjs — self-grading scorecard runner (team/SCORECARD.md, mirrored
// machine-readably in team/scorecard.json). Zero-dep ESM, Node >=22, offline, <90s.
//
// For every AUTO metric this computes a REAL band from the repo/tests right now.
// For HUMAN or sample-dependent metrics it reports "pending" with a reason — it never
// fakes a pass. Prints a markdown table + category rollup + weighted /100 + gate
// status, and writes team/score-run.json.
//
// Usage: node scripts/scorecard.mjs   (also wired as `npm run scorecard`)

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;

const startedAt = Date.now();

function rel(p) { return path.relative(ROOT, p); }
function abs(p) { return path.join(ROOT, p); }
function readText(p) { return readFileSync(abs(p), 'utf8'); }
function safeReadJson(p) {
  try { return JSON.parse(readText(p)); } catch { return null; }
}

// ── generic TAP runner + parser ─────────────────────────────────────────────
// Runs `node --test --test-reporter=tap <files>` and returns both the overall
// summary and a per-test pass/fail map keyed by the test's literal name.
function runTap(files) {
  // Strip NODE_TEST_CONTEXT/NODE_TEST_WORKER_ID before spawning: when this script is
  // itself invoked from inside a `node --test` run (e.g. by test/scorecard.test.js),
  // Node's test runner sets those on the environment; a nested `node --test` child
  // that inherits them silently emits nothing to stdout (it assumes a parent runner
  // is aggregating it over an internal channel). Stripping them makes the child run
  // as a normal, independent, TAP-to-stdout process regardless of who invoked us.
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST_')),
  );
  const res = spawnSync(NODE, ['--test', '--test-reporter=tap', ...files], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: cleanEnv,
  });
  const out = `${res.stdout || ''}\n${res.stderr || ''}`;
  const tests = [];
  const lineRe = /^(not ok|ok) (\d+) - (.+)$/gm;
  let m;
  while ((m = lineRe.exec(out))) {
    tests.push({ ok: m[1] === 'ok', num: Number(m[2]), name: m[3].trim() });
  }
  const passM = /^# pass (\d+)$/m.exec(out);
  const failM = /^# fail (\d+)$/m.exec(out);
  const totalM = /^# tests (\d+)$/m.exec(out);
  return {
    raw: out,
    tests,
    pass: passM ? Number(passM[1]) : null,
    fail: failM ? Number(failM[1]) : null,
    total: totalM ? Number(totalM[1]) : null,
    spawnError: res.error ? String(res.error.message || res.error) : null,
    exitCode: res.status,
  };
}

// find the (first) test whose name starts with a given id prefix, e.g. "G-06"
function findTest(tapResult, idPrefix) {
  return tapResult.tests.find((t) => t.name.startsWith(idPrefix));
}

// memoize expensive test-file runs so multiple metrics sharing a file only pay once
const tapCache = new Map();
function tap(fileRel) {
  if (!tapCache.has(fileRel)) tapCache.set(fileRel, runTap([fileRel]));
  return tapCache.get(fileRel);
}

// ── band helpers ─────────────────────────────────────────────────────────
const BAND_EMOJI = { green: '🟢', yellow: '🟡', red: '🔴', pending: '⏳' };
const BAND_SCORE = { green: 1, yellow: 0.5, red: 0, pending: 0 };

function ok(band, value, reason) { return { band, value, reason }; }
function pending(reason, value = null) { return { band: 'pending', value, reason }; }

// ── AUTO metric implementations ─────────────────────────────────────────────
const CHECKS = {};

// -- Loop depth ---------------------------------------------------------
CHECKS['ld-5.1-quote-gate-fabrication'] = () => {
  const t = tap('test/gate.test.js');
  if (t.spawnError) return pending(`could not run test/gate.test.js: ${t.spawnError}`);
  const g06 = findTest(t, 'G-06');
  const suiteGreen = t.fail === 0 && t.total > 0;
  const g06Green = !!g06 && g06.ok;
  if (suiteGreen && g06Green) {
    return ok('green', `${t.pass}/${t.total} gate.test.js tests pass, G-06 green`, 'test/gate.test.js');
  }
  const failing = t.tests.filter((x) => !x.ok).map((x) => x.name).slice(0, 5);
  return ok('red', `${t.pass}/${t.total} pass`, `failing: ${failing.join('; ') || (g06Green ? '' : 'G-06 not found/failing')}`);
};

CHECKS['ld-5.2-fabricated-id-rejection'] = () => {
  const t = tap('test/extract.mock.test.js');
  if (t.spawnError) return pending(`could not run test/extract.mock.test.js: ${t.spawnError}`);
  const ex11 = findTest(t, 'EX-11');
  const ex12 = findTest(t, 'EX-12');
  if (!ex11 || !ex12) return pending('EX-11/EX-12 not found in test/extract.mock.test.js');
  const green = ex11.ok && ex12.ok;
  return ok(green ? 'green' : 'red', `EX-11=${ex11.ok ? 'ok' : 'FAIL'} EX-12=${ex12.ok ? 'ok' : 'FAIL'}`, 'test/extract.mock.test.js');
};

CHECKS['ld-5.3-injection-layered-defense'] = () => {
  const t = tap('test/injection.test.js');
  if (t.spawnError) return pending(`could not run test/injection.test.js: ${t.spawnError}`);
  const green = t.fail === 0 && t.total > 0;
  const failing = t.tests.filter((x) => !x.ok).map((x) => x.name).slice(0, 5);
  return ok(green ? 'green' : 'red', `${t.pass}/${t.total} injection.test.js tests pass`, green ? 'test/injection.test.js' : `failing: ${failing.join('; ')}`);
};

CHECKS['ld-5.4-readme-limits-footer'] = () => {
  let readme = '';
  try { readme = readText('README.md'); } catch { return pending('README.md not found'); }
  const limitsSection = /## Known limitations[\s\S]*?(?=\n## |\n---|\s*$)/i.exec(readme)?.[0] ?? '';
  const bulletCount = (limitsSection.match(/^- \*\*/gm) || []).length;
  const limitsOk = bulletCount >= 3;

  let footerHit = false;
  let footerFile = null;
  const srcDir = abs('src');
  for (const f of readdirSync(srcDir)) {
    if (!f.endsWith('.js')) continue;
    const content = readText(path.join('src', f));
    if (/dropped[-_]?count/i.test(content) || (/footer/i.test(content) && /dropped/i.test(content))) {
      footerHit = true;
      footerFile = f;
      break;
    }
  }

  if (limitsOk && footerHit) {
    return ok('green', `${bulletCount} limitation bullets; dropped-count footer found in src/${footerFile}`, 'README.md + src/*.js grep');
  }
  const reasons = [];
  if (!limitsOk) reasons.push(`only ${bulletCount} limitation bullets in README (need >=3)`);
  if (!footerHit) reasons.push('no dropped-count footer feature found in src/');
  return ok('red', `${bulletCount} limitation bullets`, reasons.join('; '));
};

CHECKS['ld-5.5-operational-spine'] = () => {
  const t = tap('test/run.test.js');
  if (t.spawnError) return pending(`could not run test/run.test.js: ${t.spawnError}`);
  const ids = ['R-04', 'R-05', 'R-06', 'R-07'];
  const found = ids.map((id) => ({ id, test: findTest(t, id) }));
  const missing = found.filter((f) => !f.test);
  if (missing.length) return pending(`not found in test/run.test.js: ${missing.map((m) => m.id).join(', ')}`);
  const allGreen = found.every((f) => f.test.ok);
  const status = found.map((f) => `${f.id}=${f.test.ok ? 'ok' : 'FAIL'}`).join(' ');
  return ok(allGreen ? 'green' : 'red', status, 'test/run.test.js');
};

// -- Craft ----------------------------------------------------------------
CHECKS['cr-6.4a-zero-prod-deps'] = () => {
  const npmRes = spawnSync('npm', ['ls', '--omit=dev', '--depth=0', '--json'], { cwd: ROOT, encoding: 'utf8' });
  if (npmRes.error) return pending(`could not run npm ls: ${npmRes.error.message}`);
  let parsed;
  try { parsed = JSON.parse(npmRes.stdout); } catch { return pending('npm ls --json did not return parseable output'); }
  const deps = parsed.dependencies ? Object.keys(parsed.dependencies) : [];
  return ok(deps.length === 0 ? 'green' : 'red', `${deps.length} prod deps`, deps.length ? deps.join(', ') : 'npm ls --omit=dev --depth=0');
};

CHECKS['cr-6.4b-tests-pass-offline'] = () => {
  const testDir = abs('test');
  const files = readdirSync(testDir)
    .filter((f) => f.endsWith('.test.js') && f !== 'scorecard.test.js')
    .map((f) => path.join('test', f));
  const t = runTap(files);
  if (t.spawnError) return pending(`could not run test suite: ${t.spawnError}`);
  const green = t.fail === 0 && t.total > 0;
  return ok(green ? 'green' : 'red', `${t.pass}/${t.total} tests pass (excl. scorecard.test.js)`, green ? 'offline, zero network' : `${t.fail} failing`);
};

CHECKS['cr-6.5-canonical-text-source'] = () => {
  const srcDir = abs('src');
  const hits = [];
  for (const f of readdirSync(srcDir)) {
    if (!f.endsWith('.js') || f === 'transcript.js') continue;
    const content = readText(path.join('src', f));
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (/result\.text/.test(line)) hits.push(`src/${f}:${i + 1}`);
    });
  }
  return ok(hits.length === 0 ? 'green' : 'red', `${hits.length} matches outside transcript.js`, hits.join('; ') || 'grep -rn "result\\.text" src/*.js (excl. transcript.js)');
};

CHECKS['cr-6.6-gitleaks-ci'] = () => {
  const wfDir = abs('.github/workflows');
  if (!existsSync(wfDir)) return ok('red', 'no .github/workflows/', 'no CI config found');
  const files = readdirSync(wfDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const f of files) {
    const content = readText(path.join('.github/workflows', f));
    if (/gitleaks/i.test(content)) return ok('green', `gitleaks job in ${f}`, `.github/workflows/${f}`);
  }
  return ok('red', 'no gitleaks reference', `checked: ${files.join(', ') || '(no workflow files)'}`);
};

CHECKS['cr-license-mit'] = () => {
  if (!existsSync(abs('LICENSE'))) return ok('red', 'LICENSE missing', 'no LICENSE file at repo root');
  const content = readText('LICENSE');
  const isMit = /MIT License/i.test(content);
  return ok(isMit ? 'green' : 'red', isMit ? 'MIT License present' : 'LICENSE present but not MIT', 'LICENSE');
};

// -- Banned phrases (shared by pp-2.9 and cr-6.7a / Gate B) ----------------
const BANNED_PHRASES = ['fully local', '100% private', 'no data leaves'];
const NEGATION_CUE = /\b(not|isn't|doesn't|don't|never|n't|wrong to say|we don't say|this isn't)\b/i;

function bannedPhraseGrep(files) {
  const violations = [];
  const guarded = [];
  for (const f of files) {
    if (!existsSync(abs(f))) continue;
    const content = readText(f);
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      for (const phrase of BANNED_PHRASES) {
        if (line.toLowerCase().includes(phrase)) {
          const entry = { file: f, line: i + 1, phrase, text: line.trim() };
          if (NEGATION_CUE.test(line)) guarded.push(entry);
          else violations.push(entry);
        }
      }
    });
  }
  return { violations, guarded };
}

CHECKS['cr-6.7a-banned-phrase-zero'] = () => {
  const files = ['README.md', 'DATA-FLOW.md'];
  const { violations, guarded } = bannedPhraseGrep(files);
  const value = `${violations.length} unguarded hits (${guarded.length} guarded/negated hits ignored)`;
  if (violations.length === 0) return ok('green', value, `checked: ${files.join(', ')}`);
  return ok('red', value, violations.map((v) => `${v.file}:${v.line} "${v.phrase}"`).join('; '));
};

CHECKS['pp-2.9-no-bot-banned-phrases'] = () => {
  let readme = '';
  try { readme = readText('README.md'); } catch { return pending('README.md not found'); }
  const noBotLine = /(no bot|meeting bot).{0,40}(join|record)|work on recordings you already have/i.test(readme);
  const { violations } = bannedPhraseGrep(['README.md', 'DATA-FLOW.md']);
  if (noBotLine && violations.length === 0) {
    return ok('green', 'no-bot language present, 0 banned phrases', 'README.md');
  }
  const reasons = [];
  if (!noBotLine) reasons.push('no "works on recordings you already have / no bot" language found in README');
  if (violations.length) reasons.push(`${violations.length} banned-phrase hits`);
  return ok('red', `no-bot=${noBotLine}, banned-hits=${violations.length}`, reasons.join('; '));
};

// -- DATA-FLOW.md verification (Gate B) ------------------------------------
CHECKS['cr-6.7b-data-flow-complete'] = () => {
  if (!existsSync(abs('DATA-FLOW.md'))) {
    return ok('red', 'DATA-FLOW.md missing', 'craft/Gate-B: DATA-FLOW.md absent → RED by rule');
  }
  const content = readText('DATA-FLOW.md');
  const tableMatch = /## Every outbound network call([\s\S]*?)(?=\n## )/.exec(content);
  if (!tableMatch) return ok('red', 'network-call table not found', 'expected a "## Every outbound network call" section');
  const rows = tableMatch[1].split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
  if (rows.length === 0) return ok('red', '0 table rows found', 'expected numbered rows in the network-call table');

  const citeRe = /`([\w./-]+\.js):(\d+)`/g;
  const results = rows.map((row, idx) => {
    const cites = [...row.matchAll(citeRe)];
    if (cites.length === 0) return { row: idx + 1, ok: false, reason: 'no file:line citation found' };
    const [, file, lineStr] = cites[cites.length - 1]; // last citation = actual call site
    const lineNum = Number(lineStr);
    if (!existsSync(abs(file))) return { row: idx + 1, ok: false, reason: `${file} does not exist` };
    const lines = readText(file).split('\n');
    if (lineNum < 1 || lineNum > lines.length) return { row: idx + 1, ok: false, reason: `${file}:${lineNum} out of range` };
    const lineText = lines[lineNum - 1];
    const isFetch = /fetch\w*\(/i.test(lineText);
    return { row: idx + 1, ok: isFetch, reason: isFetch ? `${file}:${lineNum} ok` : `${file}:${lineNum} does not contain fetch(` };
  });
  const failing = results.filter((r) => !r.ok);
  if (failing.length === 0) {
    return ok('green', `${results.length}/${results.length} rows resolve to a real fetch-family call`, 'DATA-FLOW.md');
  }
  return ok('red', `${results.length - failing.length}/${results.length} rows resolve`, failing.map((f) => `row ${f.row}: ${f.reason}`).join('; '));
};

// -- API gravity ------------------------------------------------------------
function listRunRecords() {
  const runsDir = abs('runs');
  if (!existsSync(runsDir)) return [];
  const dirs = readdirSync(runsDir).filter((d) => statSync(path.join(runsDir, d)).isDirectory());
  const records = [];
  for (const d of dirs) {
    const p = path.join('runs', d, 'run.json');
    if (existsSync(abs(p))) {
      const j = safeReadJson(p);
      if (j) records.push({ path: p, data: j });
    }
  }
  return records;
}

CHECKS['ag-4.1-both-direction-minutes'] = () => {
  const records = listRunRecords();
  if (records.length === 0) return pending('no runs/*/run.json found yet');
  let found = false;
  for (const r of records) {
    const str = JSON.stringify(r.data);
    if (/tts_seconds|hear_seconds|speak_seconds|audio_seconds_(in|out)/i.test(str)) { found = true; break; }
  }
  if (!found) return pending(`no tts_seconds/hear_seconds-style field found in ${records.length} run record(s) scanned`);
  return pending(`field present but >=3600s-each threshold not yet evaluated by this runner across ${records.length} record(s)`);
};

CHECKS['ag-4.2-frictionless-cold-start'] = () => {
  if (!existsSync(abs('src/pyai.js'))) return ok('red', 'src/pyai.js missing', 'no PyAI client found');
  const content = readText('src/pyai.js');
  const hasMint = /export\s+async\s+function\s+mintSandboxKey/.test(content);
  const hasEnsure = /export\s+async\s+function\s+ensureKey/.test(content) && /loadKey\(\)\s*\?\?/.test(content);
  const hasInteractivePrompt = /readline|process\.stdin\.on\(['"]data|prompt\(/i.test(content);
  if (hasMint && hasEnsure && !hasInteractivePrompt) {
    return ok('green', 'mintSandboxKey + ensureKey wired, no interactive prompt', 'src/pyai.js (static check)');
  }
  const reasons = [];
  if (!hasMint) reasons.push('mintSandboxKey not found');
  if (!hasEnsure) reasons.push('ensureKey does not auto-fallback to mint');
  if (hasInteractivePrompt) reasons.push('interactive prompt code found');
  return ok('red', 'mint flow incomplete', reasons.join('; '));
};

CHECKS['ag-4.4-cost-stamped'] = () => {
  const records = listRunRecords();
  if (records.length === 0) return pending('no runs/*/run.json found yet');
  let total = 0;
  let stamped = 0;
  const gaps = [];
  for (const r of records) {
    const ledger = r.data.context_ledger || [];
    for (const [i, entry] of ledger.entries()) {
      total += 1;
      if (typeof entry.cost_usd === 'number' && Number.isFinite(entry.cost_usd)) stamped += 1;
      else gaps.push(`${r.path}#context_ledger[${i}]`);
    }
  }
  if (total === 0) return pending(`${records.length} run record(s) found but none have context_ledger entries yet`);
  const green = stamped === total;
  return ok(green ? 'green' : 'red', `${stamped}/${total} entries stamped across ${records.length} run record(s)`, green ? 'runs/*/run.json' : gaps.slice(0, 5).join('; '));
};

// -- Product pull: contextual/interpretation guard fixtures ---------------
// Each of these five wires a scored fixture set under test/fixtures/scorecard/
// to its dedicated test file, via the same tap()-and-inspect pattern the
// loop_depth checks above use. Green requires BOTH the suite to pass AND the
// expected number of per-case tests to have actually run (a suite that
// silently lost cases to a typo/skip must not read green).
function countMatching(tapResult, re) {
  return tapResult.tests.filter((t) => re.test(t.name)).length;
}

CHECKS['pp-2.1-ambiguity-traps'] = () => {
  const t = tap('test/scorecard-2.1-ambiguity.test.js');
  if (t.spawnError) return pending(`could not run test/scorecard-2.1-ambiguity.test.js: ${t.spawnError}`);
  const cases = countMatching(t, /^SC-2\.1 amb-/);
  const suiteGreen = t.fail === 0 && t.total > 0;
  if (suiteGreen && cases === 12) {
    return ok('green', `${t.pass}/${t.total} pass, 12/12 planted ambiguous terms resolve or demote correctly`, 'test/scorecard-2.1-ambiguity.test.js');
  }
  const failing = t.tests.filter((x) => !x.ok).map((x) => x.name).slice(0, 5);
  return ok('red', `${t.pass}/${t.total} pass, ${cases}/12 ambiguity cases ran`, failing.join('; ') || 'fixture did not run all 12 cases');
};

CHECKS['pp-2.2-negation-hypothetical-reported'] = () => {
  const t = tap('test/scorecard-2.2-traps.test.js');
  if (t.spawnError) return pending(`could not run test/scorecard-2.2-traps.test.js: ${t.spawnError}`);
  const cases = countMatching(t, /^SC-2\.2 trap-/);
  const suiteGreen = t.fail === 0 && t.total > 0;
  if (suiteGreen && cases === 9) {
    return ok('green', `${t.pass}/${t.total} pass, 9/9 negation/hypothetical/reported traps yield 0 asserted claims`, 'test/scorecard-2.2-traps.test.js');
  }
  const failing = t.tests.filter((x) => !x.ok).map((x) => x.name).slice(0, 5);
  return ok('red', `${t.pass}/${t.total} pass, ${cases}/9 trap cases ran`, failing.join('; ') || 'fixture did not run all 9 cases');
};

CHECKS['pp-2.3-coreference'] = () => {
  const t = tap('test/scorecard-2.3-coreference.test.js');
  if (t.spawnError) return pending(`could not run test/scorecard-2.3-coreference.test.js: ${t.spawnError}`);
  const cases = countMatching(t, /^SC-2\.3 coref-/);
  const suiteGreen = t.fail === 0 && t.total > 0;
  if (suiteGreen && cases === 6) {
    return ok('green', `${t.pass}/${t.total} pass, 6/6 coreference cases resolve or demote correctly`, 'test/scorecard-2.3-coreference.test.js');
  }
  const failing = t.tests.filter((x) => !x.ok).map((x) => x.name).slice(0, 5);
  return ok('red', `${t.pass}/${t.total} pass, ${cases}/6 coreference cases ran`, failing.join('; ') || 'fixture did not run all 6 cases');
};

CHECKS['pp-2.5-absence-honesty'] = () => {
  const t = tap('test/scorecard-2.5-absence.test.js');
  if (t.spawnError) return pending(`could not run test/scorecard-2.5-absence.test.js: ${t.spawnError}`);
  const suiteGreen = t.fail === 0 && t.total === 5;
  if (suiteGreen) {
    return ok('green', `${t.pass}/${t.total} pass — quiet call yields >=3 coverage records, 0 fabricated claims`, 'test/scorecard-2.5-absence.test.js');
  }
  const failing = t.tests.filter((x) => !x.ok).map((x) => x.name).slice(0, 5);
  return ok('red', `${t.pass}/${t.total} pass`, failing.join('; ') || `expected 5 tests, found ${t.total}`);
};

CHECKS['pp-2.7-degradation-ladder'] = () => {
  const t = tap('test/scorecard-2.7-degradation.test.js');
  if (t.spawnError) return pending(`could not run test/scorecard-2.7-degradation.test.js: ${t.spawnError}`);
  const ids = ['SC-2.7-mono', 'SC-2.7-noisy', 'SC-2.7-non-english'];
  const found = ids.map((id) => ({ id, test: findTest(t, id) }));
  const missing = found.filter((f) => !f.test);
  if (missing.length) return pending(`not found in test/scorecard-2.7-degradation.test.js: ${missing.map((m) => m.id).join(', ')}`);
  const allGreen = found.every((f) => f.test.ok);
  const status = found.map((f) => `${f.id}=${f.test.ok ? 'ok' : 'FAIL'}`).join(' ');
  return ok(allGreen ? 'green' : 'red', status, 'test/scorecard-2.7-degradation.test.js (mono / noisy / non-English)');
};

// -- Demo magnetism -----------------------------------------------------
CHECKS['dm-3.2-refusal-states-in-bundle'] = () => {
  const p = 'test/fixtures/bundle.slice1.json';
  if (!existsSync(abs(p))) return pending(`${p} not found`);
  const bundle = safeReadJson(p);
  const claims = bundle?.claims;
  if (!Array.isArray(claims)) return pending(`${p} has no claims[] array`);
  const statuses = new Set(claims.map((c) => c.status));
  const hasDemoted = statuses.has('uncorroborated') || statuses.has('segment_corrected');
  const hasQuarantined = statuses.has('blocked_injection');
  if (hasDemoted && hasQuarantined) {
    return ok('green', `statuses present: ${[...statuses].join(', ')}`, p);
  }
  return ok('red', `statuses present: ${[...statuses].join(', ')}`, `missing ${!hasDemoted ? 'a demoted claim ' : ''}${!hasQuarantined ? 'a blocked_injection claim' : ''}`.trim());
};

CHECKS['dm-bonus-demo-command-exists'] = () => {
  const pkg = safeReadJson('package.json');
  const demoScript = pkg?.scripts?.demo;
  if (!demoScript) return ok('red', 'no "demo" script in package.json', 'package.json scripts');
  return ok('green', `npm run demo → ${demoScript}`, 'package.json scripts.demo');
};

CHECKS['dm-bonus-tier1-export-works'] = async () => {
  const p = 'test/fixtures/bundle.slice1.json';
  if (!existsSync(abs(p)) || !existsSync(abs('src/export.js'))) {
    return pending('test/fixtures/bundle.slice1.json or src/export.js missing');
  }
  try {
    const mod = await import(new URL('../src/export.js', import.meta.url));
    const bundle = safeReadJson(p);
    const html = mod.tier1Html(bundle);
    const valid = typeof html === 'string' && html.startsWith('<!doctype html') && html.includes('og-data') && html.length > 500;
    if (valid) return ok('green', `${(html.length / 1024).toFixed(1)} KB self-contained HTML`, 'src/export.js tier1Html()');
    return ok('red', 'export ran but output looks invalid', `length=${html?.length ?? 0}`);
  } catch (err) {
    return ok('red', 'export threw', err.message);
  }
};

// ── generic pending handler for human / pending-samples metrics ────────────
function pendingFromDef(def) {
  return pending(def.method || `grader=${def.grader}, no evidence gathered yet`);
}

// ── load definitions and compute ────────────────────────────────────────
const scorecardDef = JSON.parse(readFileSync(abs('team/scorecard.json'), 'utf8'));

async function computeAll() {
  const results = [];
  for (const def of scorecardDef.metrics) {
    let res;
    try {
      if (def.grader === 'auto' && CHECKS[def.id]) {
        res = await CHECKS[def.id](def);
      } else {
        res = pendingFromDef(def);
      }
    } catch (err) {
      res = ok('red', 'runner error', `${err.message}`);
    }
    results.push({ ...def, ...res });
  }
  return results;
}

function computeGates(results) {
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const gateDefs = scorecardDef.gates;
  const gates = {};

  for (const g of gateDefs) {
    if (g.id === 'B') {
      const metricsForGate = g.metrics.map((id) => byId[id]).filter(Boolean);
      const anyRed = metricsForGate.some((m) => m.band === 'red');
      const allGreen = metricsForGate.length > 0 && metricsForGate.every((m) => m.band === 'green');
      gates[g.id] = {
        ...g,
        state: anyRed ? 'RED' : allGreen ? 'PASS' : 'PENDING',
        detail: metricsForGate.map((m) => `${m.id}=${m.band}`).join(', '),
      };
    } else if (g.id === 'C') {
      const precisionMetric = byId['pp-2.6-precision-golden-call'];
      const labelsPaths = ['team/labels.json', 'labels.json', 'samples/labels.json'];
      const labelsExist = labelsPaths.some((p) => existsSync(abs(p)));
      if (!labelsExist) {
        gates[g.id] = { ...g, state: 'RED', detail: 'no labels.json found (SCORECARD.md: "no labels" triggers this gate on its own) — Product pull capped at 15/30' };
      } else {
        gates[g.id] = { ...g, state: 'PENDING', detail: `labels.json found; precision not yet computed by this runner (metric ${precisionMetric?.band ?? 'unknown'})` };
      }
    } else if (g.id === 'A') {
      const metricsForGate = g.metrics.map((id) => byId[id]).filter(Boolean);
      const anyRed = metricsForGate.some((m) => m.band === 'red');
      const allGreen = metricsForGate.length > 0 && metricsForGate.every((m) => m.band === 'green');
      gates[g.id] = {
        ...g,
        state: anyRed ? 'RED' : allGreen ? 'PASS' : 'PENDING',
        detail: metricsForGate.map((m) => `${m.id}=${m.band}`).join(', ') || 'not yet rehearsed',
      };
    }
  }
  return gates;
}

function computeRollup(results, gates) {
  const dims = Object.keys(scorecardDef.categories);
  const raw = {};
  for (const dim of dims) {
    const inDim = results.filter((r) => r.dimension === dim);
    raw[dim] = inDim.reduce((sum, r) => sum + r.weight * BAND_SCORE[r.band], 0);
  }
  const capped = { ...raw };
  const notes = [];

  // Gate B: any RED forces craft to 0
  if (gates.B?.state === 'RED') {
    capped.craft = 0;
    notes.push('Gate B RED → Craft forced to 0');
  }
  // Gate C: RED caps product_pull at 15
  if (gates.C?.state === 'RED') {
    const before = capped.product_pull;
    capped.product_pull = Math.min(capped.product_pull, 15);
    if (capped.product_pull < before) notes.push(`Gate C RED → Product pull capped at 15/30 (was ${before.toFixed(1)})`);
  }
  // Gate A: any RED caps demo_magnetism at 12 and total at 65 (applied after sum below)
  let totalCapAt65 = false;
  if (gates.A?.state === 'RED') {
    const before = capped.demo_magnetism;
    capped.demo_magnetism = Math.min(capped.demo_magnetism, 12);
    if (capped.demo_magnetism < before) notes.push(`Gate A RED → Demo magnetism capped at 12/25 (was ${before.toFixed(1)})`);
    totalCapAt65 = true;
  }

  let total = dims.reduce((sum, dim) => sum + capped[dim], 0);
  if (totalCapAt65 && total > 65) {
    notes.push(`Gate A RED → total capped at 65 (was ${total.toFixed(1)})`);
    total = 65;
  }

  return { raw, capped, total, notes };
}

// ── output rendering ────────────────────────────────────────────────────
function renderTable(results) {
  const lines = [];
  lines.push('| Dimension | Metric | Band | Value |');
  lines.push('|---|---|---|---|');
  const dimOrder = Object.keys(scorecardDef.categories);
  for (const dim of dimOrder) {
    const label = scorecardDef.categories[dim].label;
    for (const r of results.filter((x) => x.dimension === dim)) {
      const emoji = BAND_EMOJI[r.band] || r.band;
      const valueCell = (r.value ?? r.reason ?? '').toString().replace(/\|/g, '\\|').slice(0, 90);
      lines.push(`| ${label} | ${r.id} (w${r.weight}) | ${emoji} ${r.band} | ${valueCell} |`);
    }
  }
  return lines.join('\n');
}

function renderRollup(rollup) {
  const dims = Object.keys(scorecardDef.categories);
  const lines = ['', '## Category rollup', ''];
  lines.push('| Category | Cap | Raw | After gates |');
  lines.push('|---|---|---|---|');
  for (const dim of dims) {
    const cap = scorecardDef.categories[dim].weight;
    lines.push(`| ${scorecardDef.categories[dim].label} | /${cap} | ${rollup.raw[dim].toFixed(1)} | ${rollup.capped[dim].toFixed(1)} |`);
  }
  lines.push('');
  lines.push(`**Weighted total: ${rollup.total.toFixed(1)} / 100**`);
  if (rollup.notes.length) {
    lines.push('');
    for (const n of rollup.notes) lines.push(`- ${n}`);
  }
  return lines.join('\n');
}

function renderGates(gates) {
  const lines = ['', '## Gates', ''];
  for (const id of ['A', 'B', 'C']) {
    const g = gates[id];
    if (!g) continue;
    const marker = g.state === 'RED' ? '🔴' : g.state === 'PASS' ? '🟢' : '⏳';
    lines.push(`- **Gate ${id} (${g.name})**: ${marker} ${g.state} — ${g.effect}. ${g.detail}`);
  }
  return lines.join('\n');
}

async function main() {
  const results = await computeAll();
  const gates = computeGates(results);
  const rollup = computeRollup(results, gates);

  const durationMs = Date.now() - startedAt;

  const summary = {
    green: results.filter((r) => r.band === 'green').length,
    yellow: results.filter((r) => r.band === 'yellow').length,
    red: results.filter((r) => r.band === 'red').length,
    pending: results.filter((r) => r.band === 'pending').length,
    total_metrics: results.length,
  };

  const report = [
    `# OpenGong Lite — self-grading scorecard`,
    ``,
    `Generated ${new Date().toISOString()} in ${durationMs}ms — ${summary.green} 🟢 / ${summary.yellow} 🟡 / ${summary.red} 🔴 / ${summary.pending} ⏳ pending (${summary.total_metrics} metrics)`,
    ``,
    renderTable(results),
    renderRollup(rollup),
    renderGates(gates),
    ``,
  ].join('\n');

  console.log(report);

  const scoreRun = {
    schema_version: '1',
    generated_at: new Date().toISOString(),
    duration_ms: durationMs,
    summary,
    metrics: results,
    gates,
    rollup,
    total: rollup.total,
  };
  writeFileSync(abs('team/score-run.json'), JSON.stringify(scoreRun, null, 2));
  console.log(`\nWrote ${rel(abs('team/score-run.json'))}`);

  if (durationMs > 90_000) {
    console.error(`WARNING: scorecard run took ${durationMs}ms, over the 90s budget`);
  }
}

main().catch((err) => {
  console.error('scorecard runner crashed:', err);
  process.exit(1);
});
