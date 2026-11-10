import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  minify: true,
  // A plain <script> asset (served via unpkg/jsdelivr). Bundlers and Workers use the
  // ESM build (dist/index.js) through the `exports` conditions, never this file.
  sourcemap: false,
  format: 'iife',
  globalName: 'NostrZpubUtils',
  // Keep the pre-0.2.0 global name as an alias for existing <script> users.
  footer: { js: 'globalThis.NostrZpubUtilities=NostrZpubUtils;' },
  outfile: 'dist/browser/nostr-zpub-utils.min.js',
  target: ['es2020'],
  platform: 'browser',
  // The optional peer is resolved at runtime (or passed in by the caller); never bundled.
  external: ['nostr-nsec-seedphrase'],
  define: {
    'process.env.NODE_ENV': '"production"',
    global: 'globalThis',
  },
  metafile: true,
});

const output = Object.entries(result.metafile.outputs)
  .filter(([k]) => k.endsWith('.js'))
  .map(([k, v]) => `${k}: ${(v.bytes / 1024).toFixed(1)}KB`);
console.log('Browser bundle built:', output.join(', '));
