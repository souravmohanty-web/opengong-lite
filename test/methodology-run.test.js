import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTranscript } from '../src/methodology/transcript.js';
import { loadPacks } from '../src/methodology/packs.js';
import { scoreTranscript, mockProvider } from '../src/methodology/run.js';

const transcript = parseTranscript(readFileSync(new URL('../samples/methodology/call-discovery.txt', import.meta.url), 'utf8'));
const fixture = new URL('./fixtures/methodology-meddic-verdict.json', import.meta.url).pathname;

test('full pipeline: mock LLM -> gate -> score -> coaching report', async () => {
  const pack = loadPacks().get('meddic');
  const { gated, scored, report } = await scoreTranscript({
    pack, transcript, transcriptName: 'call-discovery.txt', provider: mockProvider(fixture),
  });

  // Score: metrics(4,met)+eb(4,met)+dc(3,met)+dp(3,missed)+pain(5,met)+champ(4,partial)
  // = (4+4+3+0+5+2)/23 = 78.26 -> 78
  assert.equal(scored.score, 78);

  // Gate: the fake champion quote demoted; the off-by-one metrics quote corrected.
  const champ = gated.traits.find((t) => t.id === 'champion');
  assert.equal(champ.evidence.filter((e) => e.status === 'demoted').length, 1);
  assert.equal(champ.unverified, false, 'one real quote keeps champion verified');
  const metrics = gated.traits.find((t) => t.id === 'metrics');
  assert.ok(metrics.evidence.some((e) => e.status === 'segment_corrected'));

  // Report: coaching for the miss and the low-confidence flag for champion.
  assert.match(report, /Score: 78\/100/);
  assert.match(report, /## Coaching/);
  assert.match(report, /Decision Process — missed/);
  assert.match(report, /low confidence — check this/);
  assert.doesNotMatch(report, /I will fight for this internally/, 'demoted evidence never renders as proof');
});

test('keyless clone path: cached verdict resolves for the bundled sample', async () => {
  const { cachedVerdictPath } = await import('../src/methodology/run.js');
  const p = cachedVerdictPath(new URL('../samples/methodology/call-discovery.txt', import.meta.url).pathname, 'meddic');
  assert.ok(p, 'cached demo verdict ships with the repo');
  assert.match(p, /call-discovery\.meddic\.verdict\.json$/);
  assert.equal(cachedVerdictPath('/nowhere/x.txt', 'meddic'), null);
});
