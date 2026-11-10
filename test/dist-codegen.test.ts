/**
 * The ESM build and the IIFE must contain no runtime code generation, so they load and
 * run on Cloudflare Workers and strict-CSP pages. Only the CommonJS build may carry the
 * `Function`-routed import() fallback. Runs over the BUILT dist (CI builds before test).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;

describe('no code generation in the ESM build or the IIFE', () => {
  it('dist/*.js and dist/browser/*.js contain no `new Function` and no `eval(`', () => {
    expect(existsSync(join(dist, 'index.js')), 'dist/ missing — run `npm run build` first').toBe(
      true,
    );
    const files = [
      ...readdirSync(dist)
        .filter((f) => f.endsWith('.js'))
        .map((f) => join(dist, f)),
      ...readdirSync(join(dist, 'browser'))
        .filter((f) => f.endsWith('.js'))
        .map((f) => join(dist, 'browser', f)),
    ];
    expect(files.some((f) => f.endsWith('nostr-zpub-utils.min.js'))).toBe(true);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(/new\s+Function\s*\(/.test(src), `${f} has new Function`).toBe(false);
      expect(/(^|[^\w.$])eval\s*\(/.test(src), `${f} has eval(`).toBe(false);
      expect(/(^|[^\w.$])Function\s*\(\s*['"]/.test(src), `${f} has Function('...')`).toBe(false);
    }
  });
});
