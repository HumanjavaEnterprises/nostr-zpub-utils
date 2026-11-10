'use strict';
/**
 * CommonJS build of src/peer-import.ts — copied over dist/cjs/peer-import.js by
 * scripts/fixup-cjs.mjs. Only the CommonJS build contains a `new Function`; the ESM
 * build and the IIFE do not.
 *
 * 1. `require()` — works for a peer that ships CommonJS (nostr-nsec-seedphrase 0.9+),
 *    and for ESM peers on Node versions with require(esm).
 * 2. Otherwise a genuine `import()`. TypeScript's CJS emit would turn `import()` into
 *    `require()`, so it is routed through a `Function`; reached only in true CommonJS
 *    (`typeof require === 'function'`). The source string is a constant.
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.importPeer = importPeer;
function importPeer(specifier) {
  if (typeof require !== 'function') {
    return Promise.reject(new Error('importPeer: no CommonJS require() available'));
  }
  try {
    return Promise.resolve(require(specifier));
  } catch (requireError) {
    try {
      const genuineImport = new Function('s', 'return import(s);');
      return genuineImport(specifier);
    } catch {
      return Promise.reject(requireError);
    }
  }
}
