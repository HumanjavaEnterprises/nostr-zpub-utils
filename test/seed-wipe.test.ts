/**
 * mnemonicToZpub zeroes the 64-byte seed it expands (the library created that buffer;
 * a caller-supplied seed to seedToZpub is the caller's and is left alone).
 */
import { describe, it, expect, vi } from 'vitest';

const created: Uint8Array[] = [];
vi.mock('@scure/bip39', async (importOriginal) => {
  const real = await importOriginal<typeof import('@scure/bip39')>();
  return {
    ...real,
    mnemonicToSeedSync: (m: string, p?: string) => {
      const seed = real.mnemonicToSeedSync(m, p);
      created.push(seed);
      return seed;
    },
  };
});

const { mnemonicToZpub, seedToZpub } = await import('../src/index.js');
const { mnemonicToSeedSync } = await import('@scure/bip39');
const { MNEMONIC, BIP84_ZPUB } = await import('./vectors.mjs');

describe('seed buffer zeroing', () => {
  it('mnemonicToZpub zeroes the seed it created, after a correct derivation', () => {
    created.length = 0;
    expect(mnemonicToZpub(MNEMONIC, { asset: 'BTC' }).zpub).toBe(BIP84_ZPUB);
    expect(created).toHaveLength(1);
    expect(created[0].length).toBe(64);
    expect(created[0].every((b) => b === 0)).toBe(true);
  });

  it('the seed is zeroed on the throw path too', () => {
    created.length = 0;
    expect(() => mnemonicToZpub(MNEMONIC, { account: 2 ** 31 })).toThrow(/account/);
    expect(created).toHaveLength(1);
    expect(created[0].every((b) => b === 0)).toBe(true);
  });

  it('seedToZpub leaves a caller-supplied seed untouched', () => {
    const seed = mnemonicToSeedSync(MNEMONIC);
    const copy = new Uint8Array(seed);
    seedToZpub(seed, { asset: 'BTC' });
    expect(seed).toEqual(copy);
  });
});
