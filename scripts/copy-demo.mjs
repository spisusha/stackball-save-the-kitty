// After `vite build`: put the demo page next to the playable, so dist/ is a ready site:
//   dist/index.html       — the playable (one self-contained file)
//   dist/demo/index.html  — variants page with a phone frame and a live funnel
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/demo', { recursive: true });
cpSync('demo/index.html', 'dist/demo/index.html');
console.log('Copied demo page to dist/demo/index.html');
