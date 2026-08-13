// App-mode server (spec ruling: 127.0.0.1 only, port 4317, zero deps).
// file:// can't fetch bundles and <audio> seeking needs Range/206 — this makes
// click-to-play real. Usage: node src/server.js [bundle.json] [audio.wav]
//
// Failure discipline (audit A-blockers 1–2): content is read BEFORE headers are
// written, streams always carry an 'error' listener, and a failed request must
// never kill the process — 500 if headers aren't out yet, destroy if they are.
import { createServer } from 'node:http';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 4317;

export const DEFAULTS = {
  bundlePath: fileURLToPath(new URL('../test/fixtures/bundle.slice1.json', import.meta.url)),
  audioPath: fileURLToPath(new URL('../research/00-api-probe/call.wav', import.meta.url)),
  htmlPath: fileURLToPath(new URL('./viewer.html', import.meta.url)),
  jsPath: fileURLToPath(new URL('./viewer.js', import.meta.url)),
};

function fail(res, status, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'text/plain' }).end(message);
}

function sendFile(res, path, contentType) {
  const body = readFileSync(path);      // read BEFORE headers — a throw here still 500s cleanly
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length }).end(body);
}

function streamAudio(res, path, opts, headers, status) {
  const stream = createReadStream(path, opts);
  stream.on('error', () => fail(res, 500, 'audio read failed'));
  stream.once('open', () => {
    if (!res.headersSent) res.writeHead(status, headers);
  });
  stream.pipe(res);
}

// RFC 9110 ranges: "bytes=a-b", "bytes=a-", and the suffix form "bytes=-n"
// meaning the LAST n bytes.
export function parseRange(rangeHeader, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {                    // suffix: last n bytes
    const n = Number(m[2]);
    if (n === 0) return { invalid: true };
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return { invalid: true };
  return { start, end };
}

function serveAudio(req, res, audioPath) {
  const { size } = statSync(audioPath);
  const range = parseRange(req.headers.range, size);
  if (range?.invalid) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
    return;
  }
  if (!range) {
    streamAudio(res, audioPath, {}, {
      'Content-Type': 'audio/wav', 'Content-Length': size, 'Accept-Ranges': 'bytes',
    }, 200);
    return;
  }
  streamAudio(res, audioPath, { start: range.start, end: range.end }, {
    'Content-Type': 'audio/wav',
    'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
    'Content-Length': range.end - range.start + 1,
    'Accept-Ranges': 'bytes',
  }, 206);
}

export function createApp(paths = DEFAULTS) {
  return (req, res) => {
    const path = new URL(req.url, `http://${HOST}`).pathname;
    try {
      if (path === '/') {
        sendFile(res, paths.htmlPath, 'text/html; charset=utf-8');
      } else if (path === '/viewer.js') {
        sendFile(res, paths.jsPath, 'text/javascript; charset=utf-8');
      } else if (path === '/bundle.json') {
        sendFile(res, paths.bundlePath, 'application/json');
      } else if (path === '/audio.wav') {
        serveAudio(req, res, paths.audioPath);
      } else {
        fail(res, 404, 'not found');
      }
    } catch (err) {
      fail(res, 500, `error: ${err.message}`);
    }
  };
}

export function startServer(paths = DEFAULTS, { host = HOST, port = PORT } = {}) {
  return createServer(createApp(paths)).listen(port, host);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const paths = {
    ...DEFAULTS,
    bundlePath: process.argv[2] ?? DEFAULTS.bundlePath,
    audioPath: process.argv[3] ?? DEFAULTS.audioPath,
  };
  startServer(paths).on('listening', () => {
    console.log(`viewer: http://${HOST}:${PORT}/  (bundle: ${paths.bundlePath})`);
    // The demo path is fully cached (L17): committed bundle + committed audio,
    // zero network, zero keys. Live processing is the encore, never the main act.
    console.log('demo mode: no keys needed, works offline');
  });
}
