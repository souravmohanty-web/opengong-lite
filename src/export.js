// Tier-1 export (L11): one self-contained HTML file — viewer + styles + bundle
// inlined, zero network, works over email/Slack/AirDrop/file://. The bundle is
// validated through buildViewModel first, so an export can never contain a
// claim its own transcript can't back (self-containment invariant, 02 §5.7).
import { readFileSync, writeFileSync } from 'node:fs';
import { buildViewModel } from './viewer.js';

const VIEWER_HTML = new URL('./viewer.html', import.meta.url);
const VIEWER_JS = new URL('./viewer.js', import.meta.url);
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">`;

// A transcript can literally contain "</script>" (spoken or pasted-read HTML);
// unescaped it terminates the inline JSON tag (02 §3.2, verified). Escaping
// every "<" makes the payload inert regardless of content.
export function inlineJson(bundle) {
  return JSON.stringify(bundle).replace(/</g, '\\u003c');
}

export function tier1Html(bundle) {
  buildViewModel(bundle); // throws on anything the viewer would refuse — fail at export, not at open
  const viewerHtml = readFileSync(VIEWER_HTML, 'utf8');
  const viewerJs = readFileSync(VIEWER_JS, 'utf8');
  if (viewerJs.includes('</scr' + 'ipt>')) {
    throw new Error('viewer.js contains a literal script-close tag — cannot inline safely');
  }
  return viewerHtml
    .replace('<title>', `${CSP}\n<title>`)
    .replace(
      '<script type="module" src="/viewer.js"></script>',
      `<script type="application/json" id="og-data">${inlineJson(bundle)}</script>\n<script type="module">${viewerJs}</script>`,
    );
}

// CLI: node src/export.js <bundle.json> [out.html]
if (import.meta.url === `file://${process.argv[1]}`) {
  const bundlePath = process.argv[2];
  if (!bundlePath) {
    console.error('usage: node src/export.js <bundle.json> [out.html]');
    process.exit(2);
  }
  const outPath = process.argv[3] ?? bundlePath.replace(/\.json$/, '') + '.share.html';
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const html = tier1Html(bundle);
  writeFileSync(outPath, html);
  console.log(`tier-1 share file: ${outPath} (${(html.length / 1024).toFixed(0)} KB, self-contained, offline)`);
}
