// Builds the public website for GitHub Pages into _site/:
//   /            landing page (site/index.html)
//   /play/       the playable itself (dist/index.html, one self-contained file)
//   /demo/       variants page with a phone frame and a live funnel
//   /research/   stage 1 research pages (store screenshots are NOT published)
// Run after `npm run build`.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const OUT = '_site';
if (!existsSync('dist/index.html')) { console.error('dist/index.html is missing. Run npm run build first.'); process.exit(1); }

rmSync(OUT, { recursive: true, force: true });
for (const dir of ['play', 'demo', 'research/preview']) mkdirSync(`${OUT}/${dir}`, { recursive: true });

cpSync('site/index.html', `${OUT}/index.html`);
cpSync('dist/index.html', `${OUT}/play/index.html`);

// The demo page points at ../index.html locally; on the site the playable lives in /play/
const demo = readFileSync('demo/index.html', 'utf8');
const from = "'../index.html?'";
if (!demo.includes(from)) { console.error('demo/index.html: playable path not found'); process.exit(1); }
writeFileSync(`${OUT}/demo/index.html`, demo.replace(from, "'../play/index.html?'"));

cpSync('research/index.html', `${OUT}/research/index.html`);
cpSync('research/options.html', `${OUT}/research/options.html`);
cpSync('research/preview/index.html', `${OUT}/research/preview/index.html`);

writeFileSync(`${OUT}/.nojekyll`, '');
console.log('Site ready in _site/');
