import { startServer, DEFAULTS } from './server.js';
import { loadKey } from './keystore.js';

// `npm start` opens the PRODUCT: the receipts viewer on the bundled demo call,
// zero keys, zero network. A PyAI sandbox key self-mints lazily on the first
// real transcription (pyaiFetch handles it) — nothing is minted or spent at
// boot. Shared-principle credit: "don't mint a key until someone transcribes."
const server = startServer(DEFAULTS);
server.on('listening', () => {
  const { port } = server.address();
  console.log(`OpenGong Lite → http://127.0.0.1:${port}/`);
  console.log('Demo call loaded. Click a claim to see its line.');
  const key = loadKey();
  console.log(key
    ? `PyAI key: present (${key.source})`
    : 'PyAI key: none yet. One self-mints (free) the first time you transcribe: node src/ingest.js <your-call.wav>');
  console.log(process.env.ANTHROPIC_API_KEY
    ? 'Anthropic key: set. Live extraction available.'
    : 'Anthropic key: not set. Cached demo works fully without it.');
});
