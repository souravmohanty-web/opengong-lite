import { ensureKey, pyaiFetch, maskKey, PyAiError } from './pyai.js';

// Phase-0 entry: cold start must end with a working PyAI key (exit test).
// Later phases extend this into the app server.
async function main() {
  console.log('opengong-lite — skeleton boot');

  const record = await ensureKey();
  console.log(`PyAI key: ${maskKey(record.key)} (${record.source})${record.expires_at ? `, expires ${record.expires_at}` : ''}`);

  // Cheap authed call proves the key actually works (and exercises the
  // 401 re-mint path when a stored key has expired).
  const res = await pyaiFetch('/voices');
  const voices = await res.json();
  const count = Array.isArray(voices) ? voices.length : (voices.voices?.length ?? voices.data?.length ?? '?');
  console.log(`PyAI reachable: /voices → ${count} voices`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('Anthropic key: not set — extraction disabled, cached-fixture demo path unaffected');
  } else {
    console.log('Anthropic key: set');
  }
  console.log('ready');
}

main().catch((err) => {
  if (err instanceof PyAiError) {
    console.error(`[${err.name}] ${err.message}`);
    if (err.problem?.request_id) console.error(`request_id: ${err.problem.request_id}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
