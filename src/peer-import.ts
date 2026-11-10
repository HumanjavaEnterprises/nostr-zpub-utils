/**
 * Runtime loader for an OPTIONAL peer dependency (ESM build).
 *
 * The specifier is passed in as a variable and the bundler-ignore hints are set, so
 * esbuild / Vite / webpack / Wrangler never try to resolve the peer at build time — a
 * watch-only app that does not install it must still bundle.
 *
 * This file does no runtime code generation (no Function constructor, no eval), so
 * the ESM build and the IIFE run under no-code-generation runtimes (Cloudflare
 * Workers, strict-CSP pages). The CommonJS build replaces it with `scripts/cjs-peer-import.cjs` (see
 * `scripts/fixup-cjs.mjs`), because TypeScript's CommonJS emit rewrites `import()` to
 * `require()`.
 *
 * @packageDocumentation
 */

/** Dynamically import `specifier` at runtime. Rejects if it cannot be loaded. */
export function importPeer(specifier: string): Promise<unknown> {
  return import(/* @vite-ignore */ /* webpackIgnore: true */ specifier);
}
