import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Dev: serves the whole project, the playable is at /game/.
// Build: one self-contained HTML file in dist/index.html (ad networks need a single file).
export default defineConfig(({ command }) => ({
  root: command === 'build' ? 'game' : '.',
  base: './',
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  plugins: [viteSingleFile()],
}));
