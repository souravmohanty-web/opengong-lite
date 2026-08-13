// Slice-1 app-mode server (spec ruling: 127.0.0.1 only, port 4317, zero deps).
// file:// can't fetch bundles and <audio> seeking needs Range/206 — this makes
// click-to-play real. Usage: node src/server.js [bundle.json] [audio.wav]
import { createServer } from 'node:http';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 4317;

const bundlePath = process.argv[2] ?? fileURLToPath(new URL('../test/fixtures/bundle.slice1.json', import.meta.url));
const audioPath = process.argv[3] ?? fileURLToPath(new URL('../research/00-api-probe/call.wav', import.meta.url));
const htmlPath = fileURLToPath(new URL('./viewer.html', import.meta.url));
const jsPath = fileURLToPath(new URL('./viewer.js', import.meta.url));

function serveAudio(req, res) {
  const { size } = statSync(audioPath);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (!range) {
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    createReadStream(audioPath).pipe(res);
    return;
  }
  const start = range[1] ? Number(range[1]) : 0;
  const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
    return;
  }
  res.writeHead(206, {
    'Content-Type': 'audio/wav',
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
  });
  createReadStream(audioPath, { start, end }).pipe(res);
}

const server = createServer((req, res) => {
  const path = new URL(req.url, `http://${HOST}`).pathname;
  try {
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(readFileSync(htmlPath));
    } else if (path === '/viewer.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(readFileSync(jsPath));
    } else if (path === '/bundle.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(readFileSync(bundlePath));
    } else if (path === '/audio.wav') {
      serveAudio(req, res);
    } else {
      res.writeHead(404).end('not found');
    }
  } catch (err) {
    res.writeHead(500).end(`error: ${err.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`viewer: http://${HOST}:${PORT}/  (bundle: ${bundlePath})`);
  // The demo path is fully cached (L17): committed bundle + committed audio,
  // zero network, zero keys. Live processing is the encore, never the main act.
  console.log('demo mode: no keys needed, works offline');
});
