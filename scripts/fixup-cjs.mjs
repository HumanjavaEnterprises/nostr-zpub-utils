/**
 * After `tsc -p tsconfig.cjs.json` emits CommonJS into dist/cjs/, drop a
 * `package.json` with `{ "type": "commonjs" }` there so Node treats those `.js`
 * files as CJS even though the root package.json declares `"type": "module"`.
 *
 * This is the standard dual-package fixup for an ESM-first package that also
 * ships a `require`-able CommonJS build under dist/cjs/.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist/cjs/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('package.json', dir), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
console.log('Wrote dist/cjs/package.json { "type": "commonjs" }');

// The CommonJS peer loader replaces tsc's emit (which would turn `import()` into a
// plain `require()`); see scripts/cjs-peer-import.cjs. Keeps `new Function` out of
// the ESM build and the IIFE.
copyFileSync(new URL('cjs-peer-import.cjs', import.meta.url), new URL('peer-import.js', dir));
console.log('Wrote dist/cjs/peer-import.js (CommonJS peer loader)');
