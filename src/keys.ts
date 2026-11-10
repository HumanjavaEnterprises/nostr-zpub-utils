/**
 * SEED-SIDE logic — enclave/client ONLY, never a server.
 *
 * ⛔ Every export in this file TOUCHES THE SEED. A BIP39 mnemonic (or a raw seed)
 * is private material. These functions MUST run only where the seed is allowed to
 * live — a browser, a hardware enclave, an offline signer — and NEVER on a shared
 * server, a receiving rail, or anywhere the seed shouldn't be. This is the exact
 * inverse of the public side (`derive.ts`), which is watch-only and never sees a
 * seed.
 *
 * These functions output ONLY PUBLIC material — an account-level `zpub`/`vpub` and
 * its fingerprint. They never return, log, persist, or transmit the seed, the
 * mnemonic, or any private/extended-private key bytes. The seed exists only as a
 * local variable for the duration of the call and is never surfaced.
 *
 * @packageDocumentation
 */

import { HDKey } from '@scure/bip32';
import { base58check, hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import { outputVersionHex, describeValue, type ChainAsset, type ChainNetwork } from './versions.js';
import type { ZpubOptions, ZpubResult } from './types.js';

const b58check = base58check(sha256);
const HARDENED_OFFSET = 0x80000000;

/** SLIP-44 mainnet coin_type per asset. BTC = 0, LTC = 2. */
const MAINNET_COIN_TYPE: Record<ChainAsset, number> = { BTC: 0, LTC: 2 };

/**
 * SLIP-44 coin_type for the BIP84 account path, NETWORK-AWARE.
 *
 * On mainnet each coin has its own type (BTC 0, LTC 2). On TESTNET, SLIP-44
 * registers a single shared type — coin 1, "Testnet (all coins)" — so EVERY coin's
 * testnet account lives at `m/84'/1'/…`. This is what Sparrow/Electrum and testnet
 * faucets derive against; using the mainnet coin type on testnet produces addresses
 * no real testnet wallet is watching.
 */
function coinFor(asset: ChainAsset, network: ChainNetwork): number {
  return network === 'testnet' ? 1 : MAINNET_COIN_TYPE[asset];
}

/**
 * Re-serialize an extended key (as produced by @scure/bip32, which emits the
 * registered `xpub` version) under a different SLIP-132 version byte. This is the
 * inverse of the public side's neutral re-serialization, so a `zpub` this produces
 * decodes to the identical key `derive.ts` reads.
 */
function reSerializeVersion(extendedKey: string, versionHex: string): string {
  const raw = b58check.decode(extendedKey);
  const out = new Uint8Array(raw);
  out.set(hex.decode(versionHex), 0);
  return b58check.encode(out);
}

/**
 * SEED-SIDE — enclave/client only, never a server.
 *
 * Derive the account-level BIP84 extended PUBLIC key from a raw BIP39 seed.
 * Path: `m/84'/coin'/account'` — mainnet coin is BTC 0 / LTC 2; TESTNET coin is 1
 * for BOTH (SLIP-44 "Testnet (all coins)"), so a testnet account is `m/84'/1'/0'`
 * and serializes as a `vpub` (`tb1…`/`tltc1…` addresses). Returns PUBLIC material
 * only: the `zpub`/`vpub`, its path, asset, and fingerprint.
 *
 * @param seed - the BIP39 seed bytes (private material — keep in the enclave)
 * @param opts - asset / account / network
 */
export function seedToZpub(seed: Uint8Array, opts?: ZpubOptions | null): ZpubResult {
  if (!(seed instanceof Uint8Array) || seed.length < 16) {
    throw new Error('seedToZpub: seed must be a Uint8Array of at least 16 bytes');
  }
  const o = normalizeOptions('seedToZpub', opts);
  // Only `undefined` means "default"; an explicit null is refused below.
  const asset: ChainAsset = o.asset === undefined ? 'BTC' : o.asset;
  if (asset !== 'BTC' && asset !== 'LTC') {
    throw new Error(`seedToZpub: asset must be 'BTC' or 'LTC', got ${describeValue(asset)}`);
  }
  const account = o.account === undefined ? 0 : o.account;
  if (!Number.isInteger(account) || account < 0 || account >= 0x80000000) {
    throw new Error(
      `seedToZpub: account must be an integer in [0, 2^31), got ${describeValue(account)}`,
    );
  }
  const network = o.network === undefined ? 'mainnet' : o.network;
  if (network !== 'mainnet' && network !== 'testnet') {
    throw new Error(
      `seedToZpub: network must be 'mainnet' or 'testnet', got ${describeValue(network)}`,
    );
  }
  // Resolve (and validate) the output version BEFORE touching the seed.
  const versionHex = outputVersionHex(asset, network, o.ltcLabel);
  const coin = coinFor(asset, network);
  const path = `m/84'/${coin}'/${account}'`;

  // Walk the path one level at a time so EVERY node we create — master, m/84',
  // m/84'/coin' and the account node — can be wiped in the finally. (`HDKey.derive`
  // would create the intermediate nodes internally where we could not reach them;
  // the coin-level node alone can derive every account's private key.)
  const nodes: HDKey[] = [HDKey.fromMasterSeed(seed)];
  try {
    for (const child of [84, coin, account]) {
      nodes.push(nodes[nodes.length - 1].deriveChild(child + HARDENED_OFFSET));
    }
    const node = nodes[nodes.length - 1];
    if (!node.publicKey) {
      throw new Error('seedToZpub: derivation did not yield a public key');
    }
    // @scure/bip32 serializes under the registered xpub version; swap to the SLIP-132
    // BIP84 output version (zpub / vpub) WITHOUT ever serializing a private key.
    const zpub = reSerializeVersion(node.publicExtendedKey, versionHex);

    const fp = node.fingerprint;
    const fingerprint = hex.encode(
      new Uint8Array([(fp >>> 24) & 0xff, (fp >>> 16) & 0xff, (fp >>> 8) & 0xff, fp & 0xff]),
    );
    // Only PUBLIC fields are returned.
    return { zpub, path, asset, fingerprint };
  } finally {
    // Every node holds private key bytes: zero them (key + chain code) before returning.
    // The caller owns `seed`; we never copy it. JS cannot guarantee no other copy of
    // the key material remains (engine/GC copies, the caller's own strings).
    for (const n of nodes) n.wipePrivateData();
  }
}

/** Accept `undefined`/`null` as "no options"; reject anything that is not an object. */
function normalizeOptions(fn: string, opts: ZpubOptions | null | undefined): ZpubOptions {
  if (opts === undefined || opts === null) return {};
  if (typeof opts !== 'object' || Array.isArray(opts)) {
    throw new Error(`${fn}: options must be an object, got ${describeValue(opts)}`);
  }
  return opts;
}

/**
 * SEED-SIDE — enclave/client only, never a server.
 *
 * Derive the account-level BIP84 `zpub` (mainnet) / `vpub` (testnet) from a BIP39 mnemonic. Validates the
 * mnemonic against the English wordlist, expands it to a seed
 * (`@scure/bip39` `mnemonicToSeedSync`, with the optional passphrase), and hands off
 * to {@link seedToZpub}. Returns PUBLIC material only.
 *
 * @param mnemonic - the BIP39 mnemonic (private material — keep in the enclave)
 * @param opts - asset / account / passphrase / network
 */
export function mnemonicToZpub(mnemonic: string, opts?: ZpubOptions | null): ZpubResult {
  if (typeof mnemonic !== 'string' || mnemonic.trim() === '') {
    throw new Error('mnemonicToZpub: mnemonic must be a non-empty string');
  }
  const m = mnemonic.trim();
  if (!validateMnemonic(m, wordlist)) {
    // Deliberately do NOT echo the mnemonic back in the error.
    throw new Error('mnemonicToZpub: invalid BIP39 mnemonic (checksum/wordlist failed)');
  }
  const o = normalizeOptions('mnemonicToZpub', opts);
  const passphrase = o.passphrase === undefined ? '' : o.passphrase;
  if (typeof passphrase !== 'string') {
    throw new Error('mnemonicToZpub: passphrase must be a string');
  }
  // Validate the remaining options (and the output version) before expanding the seed.
  outputVersionHex(
    o.asset === undefined ? 'BTC' : o.asset,
    o.network === undefined ? 'mainnet' : o.network,
    o.ltcLabel,
  );
  const seed = mnemonicToSeedSync(m, passphrase);
  try {
    return seedToZpub(seed, o);
  } finally {
    seed.fill(0); // we created this seed; zero it
  }
}
