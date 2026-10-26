// Checks the built playable against common ad network rules.
import { readFileSync, statSync } from 'node:fs';

const file = 'dist/index.html';
let ok = true;
const fail = (msg) => { ok = false; console.log('FAIL  ' + msg); };
const pass = (msg) => console.log('OK    ' + msg);
const warn = (msg) => console.log('WARN  ' + msg);

let html;
try { html = readFileSync(file, 'utf8'); } catch { console.log('No ' + file + '. Run npm run build first.'); process.exit(1); }

const mb = statSync(file).size / 1024 / 1024;
if (mb > 5) fail(`size ${mb.toFixed(2)} MB, networks allow 5 MB`);
else if (mb > 2) warn(`size ${mb.toFixed(2)} MB: fine for most networks, Meta wants the HTML under 2 MB`);
else pass(`size ${mb.toFixed(2)} MB (under 2 MB, fits every network)`);

// External resources are not allowed: no <script src="http...">, <link href="http...">, url(http...), fetch to the web.
const external = [
  /<script[^>]+src=["']https?:/i,
  /<link[^>]+href=["']https?:/i,
  /<img[^>]+src=["']https?:/i,
  /url\(\s*["']?https?:/i,
  /fonts\.googleapis/i,
  /cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare/i,
];
const hits = external.filter((re) => re.test(html));
if (hits.length) fail('external resources found: ' + hits.map(String).join(', '));
else pass('no external scripts, styles, fonts or images');

if (/<script[^>]+src=["'](?!data:)/i.test(html)) fail('script loaded from a separate file, everything must be inline');
else pass('all scripts are inline');

// Only searches the built file for the text "eval(" — nothing is executed here.
if (/\beval\s*\(/.test(html.replace(/\/\/[^\n]*/g, ''))) warn('eval() found (may come from a library), check it');

const required = ['mraid', 'FbPlayableAd', 'apps.apple.com', 'play.google.com'];
required.forEach((s) => (html.includes(s) ? pass(`contains ${s}`) : fail(`missing ${s}`)));

console.log(ok ? '\nAll checks passed.' : '\nSome checks failed.');
process.exit(ok ? 0 : 1);
