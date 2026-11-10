/**
 * SEED-SIDE logic — enclave/client ONLY, never a server.
 *
 * The one-root tie-in: from a SINGLE BIP39 mnemonic, produce the PUBLIC anchors of
 * an identity — its Nostr `npub` (NIP-06, `m/44'/1237'/0'/0/0`) and its two BIP84
 * receiving `zpub`s (BTC `m/84'/0'/0'`, LTC `m/84'/2'/0'`). "Your keys are your
 * identity are your wallet" is literally one seed.
 *
 * ⛔ TOUCHES THE SEED. Run only in an enclave/client. Returns PUBLIC anchors ONLY —
 * `npub` + the two `zpub`s. It NEVER returns, logs, or transmits the `nsec`, the
 * seed, or the mnemonic.
 *
 * The Nostr derivation is delegated to `nostr-nsec-seedphrase`, an OPTIONAL PEER
 * dependency (`>=0.8.0 <0.10.0`; install it yourself). The core zpub derivation (`keys.ts`) has no Nostr dependency and works
 * with it absent; only this function needs it, and it throws a clear install hint if
 * it is missing.
 *
 * @packageDocumentation
 */

import { mnemonicToZpub } from './keys.js';
import { importPeer } from './peer-import.js';
import type { Identity } from './types.js';

/** Minimal shape of the part of `nostr-nsec-seedphrase` we consume. */
interface SeedphraseModule {
  /** Async in 0.8.x, sync in 0.9.x — awaited either way. */
  seedPhraseToKeyPair: (mnemonic: string) => { npub: string } | Promise<{ npub: string }>;
}

function isSeedphraseModule(mod: unknown): mod is SeedphraseModule {
  return (
    typeof mod === 'object' &&
    mod !== null &&
    typeof (mod as SeedphraseModule).seedPhraseToKeyPair === 'function'
  );
}

async function loadSeedphrase(): Promise<SeedphraseModule> {
  // Indirect specifier: the peer is OPTIONAL, so bundlers (esbuild/Vite/webpack/
  // Wrangler) must not try to resolve it at build time — a watch-only app that never
  // installs it would otherwise fail to bundle. Bundled apps pass the module in via
  // `mnemonicToIdentity(m, { seedphrase })` instead.
  const spec = 'nostr-nsec-seedphrase';
  let mod: unknown;
  try {
    mod = await importPeer(spec);
  } catch {
    mod = undefined;
  }
  const candidate = isSeedphraseModule(mod)
    ? mod
    : (mod as { default?: unknown } | undefined)?.default;
  if (!isSeedphraseModule(candidate)) {
    throw new Error(
      'mnemonicToIdentity requires the optional peer dependency "nostr-nsec-seedphrase" (>=0.8.0 <0.10.0). ' +
        'Install it (npm install nostr-nsec-seedphrase) to derive the npub — in a bundled app also pass ' +
        "it in: mnemonicToIdentity(m, { seedphrase: await import('nostr-nsec-seedphrase') }) — or use " +
        'mnemonicToZpub for the receiving keys alone.',
    );
  }
  return candidate;
}

/** Options for {@link mnemonicToIdentity}. */
export interface IdentityOptions {
  /**
   * The `nostr-nsec-seedphrase` module, passed in explicitly (e.g.
   * `await import('nostr-nsec-seedphrase')`). Use this in bundled apps (browser,
   * Workers): the library's own runtime lookup uses an indirect specifier that
   * bundlers do not follow. Omit it in Node, where the peer is found at runtime.
   */
  seedphrase?: { seedPhraseToKeyPair: (mnemonic: string) => unknown };
}

/**
 * SEED-SIDE — enclave/client only, never a server.
 *
 * From ONE mnemonic, derive the PUBLIC anchors: NIP-06 `npub` + BTC/LTC BIP84
 * `zpub`s. Returns PUBLIC material only — never the `nsec` or the seed.
 *
 * Always account 0 with an empty BIP39 passphrase, for all three anchors
 * (`m/44'/1237'/0'/0/0`, `m/84'/0'/0'`, `m/84'/2'/0'`). For another account or a
 * passphrase, call `mnemonicToZpub` (and the seedphrase library) directly.
 *
 * @param mnemonic - the BIP39 mnemonic (private material — keep in the enclave)
 * @param opts - optional `{ seedphrase }`: the `nostr-nsec-seedphrase` module, for bundled apps
 * @returns `{ npub, zpubBTC, zpubLTC }`
 */
export async function mnemonicToIdentity(
  mnemonic: string,
  opts?: IdentityOptions | null,
): Promise<Identity> {
  if (typeof mnemonic !== 'string' || mnemonic.trim() === '') {
    throw new Error('mnemonicToIdentity: mnemonic must be a non-empty string');
  }
  const m = mnemonic.trim();
  if (opts !== undefined && opts !== null && (typeof opts !== 'object' || Array.isArray(opts))) {
    throw new Error('mnemonicToIdentity: options must be an object');
  }
  const injected = opts?.seedphrase;
  if (injected !== undefined && !isSeedphraseModule(injected)) {
    throw new Error(
      'mnemonicToIdentity: options.seedphrase must be the nostr-nsec-seedphrase module ' +
        '(an object with a seedPhraseToKeyPair function)',
    );
  }
  const { seedPhraseToKeyPair } = injected ?? (await loadSeedphrase());
  // Only `npub` is read off the keypair — the nsec/privateKey are deliberately
  // dropped and never surfaced.
  const pair = await seedPhraseToKeyPair(m);
  const npub = (pair as { npub?: unknown } | null)?.npub;
  if (typeof npub !== 'string' || !npub.startsWith('npub1')) {
    throw new Error('mnemonicToIdentity: nostr-nsec-seedphrase did not return an npub');
  }

  const zpubBTC = mnemonicToZpub(m, { asset: 'BTC' }).zpub;
  const zpubLTC = mnemonicToZpub(m, { asset: 'LTC' }).zpub;

  return { npub, zpubBTC, zpubLTC };
}
