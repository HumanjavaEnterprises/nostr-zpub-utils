/**
 * Regression tests for the 2026-11-10 review (Z4 Ltub label, BIP84-only derivation,
 * Z5 key wiping, null/garbage input, Workers-safe import, optional-peer injection).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';

import * as api from '../src/index.js';
import {
  PUBLIC_VERSIONS,
  PRIVATE_VERSIONS,
  outputVersionHex,
  mnemonicToZpub,
  seedToZpub,
  zpubToAddress,
  zpubToAddressForAsset,
  checkXpub,
  inspectZpub,
  mnemonicToIdentity,
  psbtNetworkFor,
  NonBip84KeyError,
  WrongDepthKeyError,
  AmbiguousAssetError,
} from '../src/index.js';
import { reVersion } from './ref-derive.mjs';
import { MNEMONIC, BIP84_ZPUB, BTC_VECTORS } from './vectors.mjs';

/**
 * SLIP-132 "Registered HD version bytes", as published at
 * https://github.com/satoshilabs/slips/blob/master/slip-0132.md (Bitcoin, Bitcoin
 * Testnet, Litecoin, Litecoin Testnet rows; single-sig only). Litecoin has NO
 * P2WPKH (BIP84) row: Ltub is m/44'/2', Mtub is m/49'/2'.
 */
const SLIP132 = [
  {
    pub: '0488b21e',
    prv: '0488ade4',
    label: 'xpub',
    purpose: 'bip44',
    network: 'mainnet',
  },
  {
    pub: '049d7cb2',
    prv: '049d7878',
    label: 'ypub',
    purpose: 'bip49',
    network: 'mainnet',
  },
  {
    pub: '04b24746',
    prv: '04b2430c',
    label: 'zpub',
    purpose: 'bip84',
    network: 'mainnet',
  },
  {
    pub: '043587cf',
    prv: '04358394',
    label: 'tpub',
    purpose: 'bip44',
    network: 'testnet',
  },
  {
    pub: '044a5262',
    prv: '044a4e28',
    label: 'upub',
    purpose: 'bip49',
    network: 'testnet',
  },
  {
    pub: '045f1cf6',
    prv: '045f18bc',
    label: 'vpub',
    purpose: 'bip84',
    network: 'testnet',
  },
  {
    pub: '019da462',
    prv: '019d9cfe',
    label: 'Ltub',
    purpose: 'bip44',
    network: 'mainnet',
  },
  {
    pub: '01b26ef6',
    prv: '01b26792',
    label: 'Mtub',
    purpose: 'bip49',
    network: 'mainnet',
  },
  {
    pub: '0436f6e1',
    prv: '0436ef7d',
    label: 'ttub',
    purpose: 'bip44',
    network: 'testnet',
  },
] as const;

describe('SLIP-132 conformance of the version table', () => {
  it('every PUBLIC/PRIVATE version row matches the published SLIP-132 table', () => {
    expect(Object.keys(PUBLIC_VERSIONS).sort()).toEqual(SLIP132.map((r) => r.pub).sort());
    for (const r of SLIP132) {
      const row = PUBLIC_VERSIONS[r.pub];
      expect(row.label).toBe(r.label);
      expect(row.purpose).toBe(r.purpose);
      expect(row.network).toBe(r.network);
      expect(PRIVATE_VERSIONS[r.prv]).toBe(r.label.replace('pub', 'prv').replace('tub', 'tpv'));
    }
  });

  it('every key the library EMITS carries the BIP84 version for its network (no purpose warning)', () => {
    for (const asset of ['BTC', 'LTC'] as const) {
      for (const network of ['mainnet', 'testnet'] as const) {
        const v = outputVersionHex(asset, network);
        expect(PUBLIC_VERSIONS[v].purpose).toBe('bip84');
        expect(PUBLIC_VERSIONS[v].network).toBe(network);
        const { zpub } = mnemonicToZpub(MNEMONIC, { asset, network });
        const res = checkXpub(zpub, asset);
        expect(res.ok).toBe(true);
        expect(res.warnings.some((w) => w.includes('implies'))).toBe(false);
      }
    }
  });
});

describe("Z4 — the 'Ltub' label (a BIP44 byte on a BIP84 key) is refused", () => {
  it('mnemonicToZpub / seedToZpub / outputVersionHex throw for ltcLabel Ltub', () => {
    const opts = {
      asset: 'LTC',
      ltcLabel: 'Ltub',
    } as unknown as api.ZpubOptions;
    expect(() => mnemonicToZpub(MNEMONIC, opts)).toThrow(/SLIP-132 has no Litecoin BIP84/);
    expect(() => seedToZpub(mnemonicToSeedSync(MNEMONIC), opts)).toThrow(/Ltub/);
    expect(() => outputVersionHex('LTC', 'mainnet', 'Ltub' as never)).toThrow(/Ltub/);
  });

  it("ltcLabel 'zpub' (explicit) is still accepted and is the default", () => {
    expect(mnemonicToZpub(MNEMONIC, { asset: 'LTC', ltcLabel: 'zpub' }).zpub).toBe(
      mnemonicToZpub(MNEMONIC, { asset: 'LTC' }).zpub,
    );
  });
});

describe('zpubToAddress derives only from BIP84 versions unless allowNonBip84', () => {
  const nonBip84 = SLIP132.filter((r) => r.purpose !== 'bip84');

  for (const r of nonBip84) {
    it(`refuses a ${r.label} by default, and the opt-in reproduces the BIP84 address`, () => {
      const base =
        r.network === 'mainnet'
          ? BIP84_ZPUB
          : mnemonicToZpub(MNEMONIC, { asset: 'BTC', network: 'testnet' }).zpub;
      const key = reVersion(base, r.pub);
      const asset = PUBLIC_VERSIONS[r.pub].assets.length === 1 ? undefined : ('BTC' as const);
      const forAsset = PUBLIC_VERSIONS[r.pub].assets[0];

      expect(() => zpubToAddress(key, { asset, index: 0 })).toThrow(NonBip84KeyError);
      // The message must not claim the key IS BIP44/BIP49 — wallets export real m/84' keys this way.
      expect(() => zpubToAddress(key, { asset, index: 0 })).toThrow(/don't say BIP84/);
      expect(() => zpubToAddress(key, { asset, index: 0 })).not.toThrow(/BIP44|BIP49/);
      expect(() => zpubToAddressForAsset(key, forAsset, { index: 0 })).toThrow(NonBip84KeyError);
      expect(() => zpubToAddress(key, { asset, index: 0, allowNonBip84: false })).toThrow(
        NonBip84KeyError,
      );

      const viaOptIn = zpubToAddressForAsset(key, forAsset, {
        index: 0,
        allowNonBip84: true,
      });
      expect(viaOptIn).toBe(zpubToAddressForAsset(base, forAsset, { index: 0 }));
    });
  }

  it('the BIP84 keys (zpub, vpub) still derive the published vectors with no opt-in', () => {
    for (const { change, index, address } of BTC_VECTORS) {
      expect(
        zpubToAddress(BIP84_ZPUB, {
          asset: 'BTC',
          change: change as 0 | 1,
          index,
        }),
      ).toBe(address);
    }
    const vpub = mnemonicToZpub(MNEMONIC, {
      asset: 'BTC',
      network: 'testnet',
    }).zpub;
    expect(zpubToAddress(vpub, { asset: 'BTC' }).startsWith('tb1')).toBe(true);
  });

  it('a BIP84 key on the wrong requested network is still a network mismatch', () => {
    expect(() => zpubToAddress(BIP84_ZPUB, { asset: 'BTC', network: 'testnet' })).toThrow(
      /network mismatch/,
    );
  });

  it('the ambiguous-chain guard still applies to the BIP84 zpub', () => {
    expect(() => zpubToAddress(BIP84_ZPUB)).toThrow(AmbiguousAssetError);
  });
});

describe('Z5 — seedToZpub wipes EVERY HD node it creates', () => {
  afterEach(() => vi.restoreAllMocks());

  it("wipes master, m/84', m/84'/coin' and the account node (all four depths)", () => {
    const wipedDepths: number[] = [];
    const real = HDKey.prototype.wipePrivateData;
    vi.spyOn(HDKey.prototype, 'wipePrivateData').mockImplementation(function (this: HDKey) {
      wipedDepths.push(this.depth);
      return real.call(this);
    });
    for (const [asset, network] of [
      ['BTC', 'mainnet'],
      ['LTC', 'mainnet'],
      ['BTC', 'testnet'],
    ] as const) {
      wipedDepths.length = 0;
      const r = seedToZpub(mnemonicToSeedSync(MNEMONIC), { asset, network, account: 7 });
      expect(r.path.split('/').length).toBe(4);
      expect(wipedDepths.sort()).toEqual([0, 1, 2, 3]);
    }
    // Wiping does not change the result: the published vector still comes out.
    expect(seedToZpub(mnemonicToSeedSync(MNEMONIC), { asset: 'BTC' }).zpub).toBe(BIP84_ZPUB);
  });

  it('wiped nodes really have their private key and chain code zeroed', () => {
    const seen: HDKey[] = [];
    const real = HDKey.prototype.wipePrivateData;
    vi.spyOn(HDKey.prototype, 'wipePrivateData').mockImplementation(function (this: HDKey) {
      seen.push(this);
      return real.call(this);
    });
    seedToZpub(mnemonicToSeedSync(MNEMONIC), { asset: 'BTC' });
    expect(seen).toHaveLength(4);
    for (const n of seen) expect(n.privateKey).toBeNull();
  });
});

describe('zpubToAddress derives only from ACCOUNT keys (depth 3) unless allowNonAccountDepth', () => {
  const seed = mnemonicToSeedSync(MNEMONIC);
  const master = HDKey.fromMasterSeed(seed);
  const paths: Record<number, string> = {
    0: 'm',
    1: "m/84'",
    2: "m/84'/0'",
    4: "m/84'/0'/0'/0",
    5: "m/84'/0'/0'/0/0",
  };
  for (const [depthStr, path] of Object.entries(paths)) {
    const depth = Number(depthStr);
    it(`refuses a depth-${depth} key (${path}) re-versioned as zpub; the opt-in derives <key>/c/i`, () => {
      const node = path === 'm' ? master : master.derive(path);
      expect(node.depth).toBe(depth);
      const zpub = reVersion(node.publicExtendedKey, '04b24746');
      expect(() => zpubToAddress(zpub, { asset: 'BTC' })).toThrow(WrongDepthKeyError);
      expect(() => zpubToAddressForAsset(zpub, 'LTC', { index: 1 })).toThrow(WrongDepthKeyError);
      expect(() => zpubToAddress(zpub, { asset: 'BTC', allowNonAccountDepth: false })).toThrow(
        /depth is \d+, expected 3/,
      );
      const viaOptIn = zpubToAddress(zpub, {
        asset: 'BTC',
        change: 1,
        index: 2,
        allowNonAccountDepth: true,
      });
      const expected = zpubToAddress(
        reVersion(master.derive("m/84'/0'/0'").publicExtendedKey, '04b24746'),
        { asset: 'BTC', change: 0, index: 0 },
      );
      expect(viaOptIn.startsWith('bc1q')).toBe(true);
      if (depth !== 3) expect(viaOptIn).not.toBe(expected);
    });
  }

  it('the depth-3 account key is unaffected', () => {
    expect(zpubToAddress(BIP84_ZPUB, { asset: 'BTC' })).toBe(BTC_VECTORS[0].address);
  });
});

describe('explicit null is not a default', () => {
  it('index: null and change: null throw instead of meaning 0', () => {
    expect(() => zpubToAddress(BIP84_ZPUB, { asset: 'BTC', index: null as never })).toThrow(
      /index/,
    );
    expect(() => zpubToAddress(BIP84_ZPUB, { asset: 'BTC', change: null as never })).toThrow(
      /change/,
    );
    expect(() => zpubToAddressForAsset(BIP84_ZPUB, 'BTC', { index: null as never })).toThrow(
      /index/,
    );
  });

  it('asset / account / network / passphrase: null throws instead of meaning the default', () => {
    expect(() => mnemonicToZpub(MNEMONIC, { asset: null as never })).toThrow(/asset/);
    expect(() => mnemonicToZpub(MNEMONIC, { account: null as never })).toThrow(/account/);
    expect(() => mnemonicToZpub(MNEMONIC, { network: null as never })).toThrow(/network/);
    expect(() => mnemonicToZpub(MNEMONIC, { passphrase: null as never })).toThrow(/passphrase/);
  });
});

describe('null / garbage input → clear Error, never a raw TypeError', () => {
  const garbage: unknown[] = [null, undefined, 0, 1.5, NaN, -1, true, {}, [], 'x', '', Symbol('s')];

  function expectCleanError(fn: () => unknown) {
    let err: unknown;
    try {
      fn();
    } catch (e) {
      err = e;
    }
    if (err !== undefined) {
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(TypeError);
      expect(err).not.toBeInstanceOf(RangeError);
    }
  }

  it('every public-side function', () => {
    for (const g of garbage) {
      expectCleanError(() => api.zpubToAddress(g as string));
      expectCleanError(() => api.zpubToAddress(BIP84_ZPUB, g as api.AddressOptions));
      expectCleanError(() => api.zpubToAddress(BIP84_ZPUB, { asset: g as 'BTC' }));
      expectCleanError(() => api.zpubToAddress(BIP84_ZPUB, { asset: 'BTC', index: g as number }));
      expectCleanError(() => api.zpubToAddress(BIP84_ZPUB, { asset: 'BTC', change: g as 0 }));
      expectCleanError(() =>
        api.zpubToAddress(BIP84_ZPUB, {
          asset: 'BTC',
          network: g as 'mainnet',
        }),
      );
      expectCleanError(() => api.zpubToAddressForAsset(BIP84_ZPUB, g as 'BTC'));
      expectCleanError(() =>
        api.zpubToAddressForAsset(g as string, 'BTC', g as api.AddressOptions),
      );
      expectCleanError(() => api.inspectZpub(g as string));
      expectCleanError(() => api.assertPublicOnly(g as string));
      expectCleanError(() => api.assertNoPrivateKeyMaterial(g as string));
      expectCleanError(() => api.assertDistinctXpubs(g as string, g as string));
      expectCleanError(() => api.checkXpub(g as string, g as 'BTC'));
      expectCleanError(() => api.outputVersionHex(g as 'BTC', g as 'mainnet'));
    }
  });

  it('every seed-side function', () => {
    const seed = mnemonicToSeedSync(MNEMONIC);
    for (const g of garbage) {
      expectCleanError(() => api.mnemonicToZpub(g as string));
      expectCleanError(() => api.mnemonicToZpub(MNEMONIC, g as api.ZpubOptions));
      expectCleanError(() => api.mnemonicToZpub(MNEMONIC, { asset: g as 'BTC' }));
      expectCleanError(() => api.mnemonicToZpub(MNEMONIC, { account: g as number }));
      expectCleanError(() => api.mnemonicToZpub(MNEMONIC, { passphrase: g as string }));
      expectCleanError(() => api.mnemonicToZpub(MNEMONIC, { network: g as 'mainnet' }));
      expectCleanError(() => api.seedToZpub(g as Uint8Array));
      expectCleanError(() => api.seedToZpub(seed, g as api.ZpubOptions));
    }
    // An unknown asset is refused (it used to produce the path m/84'/undefined').
    expect(() => api.mnemonicToZpub(MNEMONIC, { asset: 'DOGE' as 'BTC' })).toThrow(/asset/);
  });

  it('PSBT helpers', () => {
    for (const g of garbage) {
      expectCleanError(() => api.createPsbt(g as api.PsbtConfig));
      expectCleanError(() => api.createPsbt({ asset: 'BTC' }, g as api.PsbtOptions));
      expectCleanError(() => api.psbtNetworkFor(g as 'BTC', g as 'mainnet'));
      expectCleanError(() => api.p2wpkhScript(g as Uint8Array, 'BTC'));
      expectCleanError(() => api.Psbt.fromPsbt(g as Uint8Array, { asset: 'BTC' }));
      const p = api.createPsbt({ asset: 'BTC' });
      expectCleanError(() => p.addInput(g as api.PsbtInput));
      expectCleanError(() => p.addOutput(g as api.PsbtOutput));
      expectCleanError(() => p.combine(g as Uint8Array));
      expectCleanError(() => p.signOnlyOurInputs(g as Uint8Array, g as number[]));
    }
  });

  it('mnemonicToIdentity rejects with a clean Error', async () => {
    for (const g of garbage) {
      const err = await mnemonicToIdentity(g as string, g as api.IdentityOptions).catch((e) => e);
      if (err !== undefined && !(typeof err === 'object' && err && 'npub' in err)) {
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(TypeError);
      }
    }
  });

  it('an unknown asset never falls through to Litecoin network params', () => {
    expect(() => psbtNetworkFor('DOGE' as 'BTC')).toThrow(/asset/);
    expect(() => psbtNetworkFor('LTC', 'regtest' as 'mainnet')).toThrow(/network/);
  });
});

describe('Workers / strict-CSP safety', () => {
  afterEach(() => vi.restoreAllMocks());

  it('importing the library does not build a Function from a string', async () => {
    vi.resetModules();
    const RealFunction = globalThis.Function;
    const trap = new Proxy(RealFunction, {
      construct() {
        throw new EvalError('Code generation from strings disallowed for this context');
      },
      apply() {
        throw new EvalError('Code generation from strings disallowed for this context');
      },
    });
    globalThis.Function = trap as FunctionConstructor;
    try {
      // @ts-expect-error -- query suffix forces a fresh module instance; no typings for it
      const fresh = await import('../src/identity.js?csp-probe');
      expect(typeof fresh.mnemonicToIdentity).toBe('function');
    } finally {
      globalThis.Function = RealFunction;
    }
  });
});

describe('mnemonicToIdentity — optional peer can be passed in (bundled apps)', () => {
  it('uses an injected nostr-nsec-seedphrase module and returns the same anchors', async () => {
    const seedphrase = await import('nostr-nsec-seedphrase');
    const injected = await mnemonicToIdentity(MNEMONIC, { seedphrase });
    const looked = await mnemonicToIdentity(MNEMONIC);
    expect(injected).toEqual(looked);
    expect(injected.zpubBTC).toBe(BIP84_ZPUB);
    // NIP-06 published vector for the abandon…about mnemonic is not in NIP-06 itself,
    // so pin the npub to the seedphrase library's own result instead.
    const kp = await seedphrase.seedPhraseToKeyPair(MNEMONIC);
    expect(injected.npub).toBe(kp.npub);
  });

  it('refuses an injected object that is not the seedphrase module', async () => {
    await expect(mnemonicToIdentity(MNEMONIC, { seedphrase: {} as never })).rejects.toThrow(
      /options\.seedphrase/,
    );
    await expect(
      mnemonicToIdentity(MNEMONIC, {
        seedphrase: { seedPhraseToKeyPair: () => ({}) },
      }),
    ).rejects.toThrow(/did not return an npub/);
  });

  it('inspectZpub output is unchanged in shape (no new fields leak from the decoder)', () => {
    expect(Object.keys(inspectZpub(BIP84_ZPUB)).sort()).toEqual([
      'asset',
      'assets',
      'depth',
      'fingerprint',
      'label',
      'network',
      'parentFingerprint',
      'purpose',
    ]);
  });
});
