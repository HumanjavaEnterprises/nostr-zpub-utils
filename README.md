# nostr-zpub-utils

<div align="center">

[![npm version](https://img.shields.io/npm/v/nostr-zpub-utils.svg)](https://www.npmjs.com/package/nostr-zpub-utils)
[![npm downloads](https://img.shields.io/npm/dm/nostr-zpub-utils.svg)](https://www.npmjs.com/package/nostr-zpub-utils)
[![License](https://img.shields.io/npm/l/nostr-zpub-utils.svg)](https://github.com/humanjavaenterprises/nostr-zpub-utils/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Test Status](https://img.shields.io/github/actions/workflow/status/humanjavaenterprises/nostr-zpub-utils/ci.yml?branch=main&label=tests)](https://github.com/humanjavaenterprises/nostr-zpub-utils/actions)
[![Code Style](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io/)

</div>

**One mnemonic, two lives: your `npub` (who you are) and your `zpub` (where you get paid) — derived from
the same seed, on the same curve.**

Nostr keys and Bitcoin keys are the same curve (secp256k1), so a single BIP39 mnemonic yields *both* a Nostr
identity (NIP-06 `m/44'/1237'/0'/0/0` → `npub`) and a hierarchy of receiving keys (BIP84 `m/84'/coin'/0'` →
`zpub` → addresses). Where [`nostr-agentic-identity`](https://github.com/humanjavaenterprises/nostr-agentic-identity)
defines *who an agent is*, this defines *where value reaches it* — Bitcoin and Litecoin.

> Status: **0.2** · Read **[SPEC.md](SPEC.md)** first — it is authoritative; the code here is a thin,
> audited-stack expression of it. Prior art it composes: `@scure/bip32` + `@scure/bip39` (audited HD
> derivation), SLIP-132, BIP84/44, and `nostr-nsec-seedphrase` (BIP39 ↔ Nostr keys, optional).

> ### ⚠️ One seed is one root, not one wallet — read this before shipping
> This mnemonic is **both the agent's voice and its treasury.** The same seed derives the `npub`
> that signs its words (NIP-06, `m/44'/1237'/0'/0/0`) and the receiving keys that hold its money
> (BIP84, `m/84'/coin'/0'`). Those are **sibling derivation paths, not the same key** — but they
> share one root. So:
> - **Losing the seed loses both** the business identity and the coin inbox. Back it up like money.
> - **Compromising the seed compromises both.** Consider a dedicated account index (or a separate
>   seed) for agent spend vs. human funds, so a hot agent key is not your cold treasury.
> - The library **never guesses a chain.** A definite-prefix key resolves its asset; an ambiguous
>   one makes you pass `asset` or it throws. It will not silently hand you a BTC address for an LTC
>   key. Keep it that way in your own call sites.

## The one hard boundary (the whole safety of the library)

**Deriving a zpub touches the SEED. The seed is private material.** So the library has two clearly-separated
sides:

- 🔒 **Seed-side — enclave/client ONLY** (`mnemonicToZpub`, `seedToZpub`, `mnemonicToIdentity`). These touch
  the seed and MUST run only where the seed is allowed to live (a browser, a hardware enclave, an offline
  signer) — **never a shared server**. They **output PUBLIC material only** — a `zpub`/`vpub`, an `npub` — and
  never return, log, persist, or transmit the seed, the mnemonic, or any private byte.
- 👁️ **Public-side — watch-only, safe anywhere** (`zpubToAddress`, `inspectZpub`, `assertPublicOnly`). Reads
  addresses off a public `zpub`. This side **mirrors [`hj-pay`](https://github.com/humanjavaenterprises)
  byte-for-byte** — same decode, same BIP84 P2WPKH bech32 — so the two libraries never disagree about which
  address a `zpub` produces. It **rejects every private-key shape** (`xprv`/`zprv`/`Ltpv`/…, a raw scalar, a
  seed phrase, *and a `zprv` re-versioned to wear a `zpub` prefix*) on a prefix check AND on the decoded key
  byte.

A conforming caller keeps the seed in the enclave, calls a derive function, and hands the resulting `zpub` to
the watch-only world. If a design needs the seed on a server to work, it is using this library wrong.

## What it derives

| Input | Path | Output |
|---|---|---|
| BIP39 mnemonic (+ optional passphrase) | BTC BIP84 `m/84'/0'/account'` | `zpub…` |
| BIP39 mnemonic | LTC BIP84 `m/84'/2'/account'` | `zpub…` |
| BIP39 mnemonic, `network: 'testnet'` | BIP84 `m/84'/1'/account'` (BTC and LTC) | `vpub…` |
| a BIP84 `zpub`/`vpub` (public) | `.../change/index` | a receive address (`bc1…`/`ltc1…`/`tb1…`/`tltc1…`) |
| a `zpub` | — | inspect: asset, network, purpose, SLIP-132 label, fingerprint |

Account level (depth 3) is the export unit — the shape `hj-pay` expects.

**Why LTC keys are `zpub`, never `Ltub`:** [SLIP-132](https://github.com/satoshilabs/slips/blob/master/slip-0132.md)
registers no Litecoin native-segwit version. `Ltub` (`0x019da462`) is P2PKH, path `m/44'/2'`, and `Mtub`
(`0x01b26ef6`) is P2WPKH-in-P2SH, path `m/49'/2'`. A BIP84 Litecoin account is therefore emitted under the
BIP84 `zpub` byte (`vpub` on testnet), which is what Litecoin wallets use for native segwit. Before 0.2.0
an `ltcLabel: 'Ltub'` option labelled the BIP84 key as BIP44; it was removed and now throws.

## Installation

```bash
npm install nostr-zpub-utils
# optional peer (>=0.8.0 <0.10.0) — only needed for mnemonicToIdentity's npub derivation:
npm install nostr-nsec-seedphrase
```

Runtime deps are limited to the estate's audited stack (pinned exact): `@scure/bip32`, `@scure/bip39`,
`@scure/base`, `@noble/hashes`, and `@scure/btc-signer` (the PSBT layer — `npm audit --omit=dev` clean at
add time). `nostr-nsec-seedphrase` is an **optional peer** used only by `mnemonicToIdentity`; it is not installed for
you, so a watch-only install stays small. The core zpub derivation has no Nostr dependency.

## Quick Start

### Seed-side — derive receiving keys (ENCLAVE/CLIENT ONLY)

```typescript
import { mnemonicToZpub, mnemonicToIdentity } from 'nostr-zpub-utils';

// A BTC BIP84 account key from the seed root:
const { zpub, path, fingerprint } = mnemonicToZpub(MNEMONIC, { asset: 'BTC' });
// zpub → hand to the watch-only world; the seed never leaves this enclave.

// A Litecoin account (m/84'/2'/0'), emitted under the SLIP-132 BIP84 zpub byte:
const ltc = mnemonicToZpub(MNEMONIC, { asset: 'LTC' });

// The one-root tie-in — PUBLIC anchors only (no nsec, ever). Needs the optional peer
// nostr-nsec-seedphrase. Always account 0, empty passphrase.
const { npub, zpubBTC, zpubLTC } = await mnemonicToIdentity(MNEMONIC);

// In a bundled app (browser, Workers), pass the peer in explicitly:
const id = await mnemonicToIdentity(MNEMONIC, { seedphrase: await import('nostr-nsec-seedphrase') });
```

### Public-side — read addresses off a zpub (safe anywhere, incl. a server)

```typescript
import { zpubToAddress, inspectZpub, assertPublicOnly, checkXpub, assertDistinctXpubs } from 'nostr-zpub-utils';

assertPublicOnly(zpub);                                    // throws on ANY private-key shape
inspectZpub(zpub);                                         // { label, asset, network, purpose, depth, fingerprint }
zpubToAddress(zpub, { asset: 'BTC', index: 0, change: 0 }); // 'bc1q…'
zpubToAddress(ltc.zpub, { asset: 'LTC', index: 0 });        // 'ltc1…'

// Preflight before going live:
checkXpub(zpub, 'BTC');                        // { ok, info, errors, warnings } — never throws
assertDistinctXpubs(zpubBTC, zpubLTC);         // throws if the same key is configured for both chains
```

> **BIP84 version bytes and account keys only.** `zpubToAddress` / `zpubToAddressForAsset` derive BIP84
> P2WPKH addresses, so by default they accept only the BIP84 versions: `zpub` (mainnet) and `vpub` (testnet).
> Any other prefix (`xpub`/`tpub`/`Ltub`/`ttub`/`ypub`/`Mtub`/`upub`) throws `NonBip84KeyError`: the version
> bytes don't say BIP84, so this library can't tell whether your wallet watches these addresses. Some wallets
> export real native-segwit keys this way — Bitcoin Core and Litecoin Core descriptor wallets export
> `xpub`/`tpub`, Ledger Live exports `xpub` (BTC) and `Ltub` (LTC). If your wallet exported this key for a
> native-segwit (m/84') account, pass `{ allowNonBip84: true }`.
>
> The key must also be an ACCOUNT key (depth 3, `m/84'/coin'/account'`): a root, purpose, coin, chain or
> address-level key throws `WrongDepthKeyError` unless `{ allowNonAccountDepth: true }`. Only `undefined` means
> "default" for `index`/`change`; an explicit `null` throws.
>
> **The chain must be explicit for shared prefixes.** `zpub`/`vpub` are used by *both* Bitcoin and Litecoin
> wallets — the version byte does not pin a chain. Calling `zpubToAddress` on such a key **without `asset`**
> throws `AmbiguousAssetError` rather than silently defaulting to `bc1…` and handing out an address no wallet
> is watching. Use `zpubToAddressForAsset(zpub, asset)` when you want to name the chain positionally.

### Spend-side — PSBT (ENCLAVE/CLIENT ONLY, CoinJoin-compatible)

Build, sign, and merge PSBTs for BTC/LTC spends of inputs **you already own**. A thin, pure wrapper over
[`@scure/btc-signer`](https://github.com/paulmillr/scure-btc-signer) — no UTXO fetching, no broadcast, no
coordinator. The load-bearing primitive is `signOnlyOurInputs`: it signs **only** the indices you declare
you own and never touches the rest, which is exactly what lets you **participate** in a CoinJoin without
**coordinating** one.

```typescript
import { createPsbt, Psbt } from 'nostr-zpub-utils';

// Build a spend — the caller supplies each input's prevout (we never fetch UTXOs):
const p = createPsbt({ asset: 'BTC' });                        // or { asset: 'LTC', network: 'testnet' }
p.addInput({ txid, index, witnessUtxo: { script, amount } });
p.addOutput({ address: 'bc1q…', amount: 90_000n });           // or { script, amount }

p.signOnlyOurInputs(privateKey, [0]);   // 🔒 ENCLAVE ONLY — signs ONLY index 0; other inputs untouched
const { hex, txid } = p.finalizeAndExtract();  // raw tx hex → hand to the wallet/network layer to broadcast

// Participate in a coordinator's join transaction without coordinating it:
const mine = Psbt.fromPsbt(sharedPsbtBytes, { asset: 'BTC' }); // their inputs + outputs, merged in
mine.signOnlyOurInputs(privateKey, [myIndex]);                 // sign ONLY ours
const partiallySigned = mine.toPsbt();                         // hand back; a coordinator combines the parts
```

> 🔒 **Signing is enclave/client-only.** `signOnlyOurInputs` touches a private key — same boundary as the
> seed side. Building, merging, serializing, and finalizing a PSBT need no private material and are safe
> anywhere. We are CoinJoin-**compatible** (we participate); we are **not** a coordinator, pool, or mixer —
> running one carries real regulatory exposure. LTC has no CoinJoin ecosystem (MWEB is its privacy path, out
> of scope); LTC support just lets one spend/merge API cover both chains.

> ⚠️ **Two caveats when signing.** (1) **Prefer raw 32-byte signing keys** — the tested, supported path. An
> `HDKey` is accepted but derives per the PSBT's own `bip32Derivation`, which this thin wrapper does not
> populate for self-built PSBTs. (2) **Trust your inputs before signing a *loaded* PSBT.** A PSBT you receive
> (`Psbt.fromPsbt`) carries counterparty-supplied prevouts and derivation paths — validate the input amounts
> and that each input you sign is genuinely yours *before* calling `signOnlyOurInputs`. This is the standard
> PSBT "verify what you sign" rule; the wrapper enforces that you only sign declared indices, not that those
> inputs are what you think they are.

> 📦 **Dependency note.** The PSBT layer pulls `@scure/btc-signer` (audited stack, `npm audit --omit=dev`
> clean). It is a hard dependency, so watch-only/derivation-only consumers who never sign still install it;
> ESM `import` consumers tree-shake it if they don't touch the PSBT exports.

## Correctness gates (in the test suite)

- **BIP84 published vectors** — the `abandon … about` mnemonic derives the canonical account
  `zpub6rFR7y4Q2Aij…` and its first addresses `bc1qcr8te4…` (0/0), `bc1qnjg0jd8…` (0/1), `bc1q8c6fshw…`
  (1/0), character for character.
- **Round-trip pin to hj-pay** — `zpubToAddress` is checked against an independent `node:crypto`-only
  reference implementation (the same oracle hj-pay's own tests use), pinning the two libraries together.
- **LTC cross-check** — no published BIP84 LTC vectors exist, so a second minimal HDKey path and an
  independent oracle must agree with `keys.ts`, and the `ltc1…` witness programs must equal the published
  BTC vectors' programs.
- **SLIP-132 conformance** — the version table matches the published SLIP-132 rows, every emitted key carries
  the BIP84 version for its network, and every non-BIP84 version is refused by the address functions unless
  `allowNonBip84` is set.
- **Guard** — every private-key shape (`xprv/yprv/zprv/tprv/uprv/vprv/Ltpv/Mtpv/ttpv`, a raw scalar, a seed
  phrase, and a `zprv` re-versioned to wear a `zpub` prefix) is rejected by `assertPublicOnly` and by every
  public-path function.
- **No leakage** — no seed/mnemonic/private byte appears in any return value or thrown error.

## Module Support

Dual ESM + CommonJS with full type declarations. Bundlers (Vite, webpack, esbuild) and Cloudflare Workers
resolve the ESM build through the `browser` / `workerd` / `worker` export conditions. A minified IIFE for a
plain `<script>` tag is served via unpkg/jsdelivr (`dist/browser/nostr-zpub-utils.min.js`, global
`NostrZpubUtils`; the old `NostrZpubUtilities` name is kept as an alias). Node >= 20.

### ESM (recommended)
```typescript
import { mnemonicToZpub } from 'nostr-zpub-utils';
```

### CommonJS
```javascript
const { mnemonicToZpub } = require('nostr-zpub-utils');
```

## Non-goals

Not a wallet, not custody, not a relay client. Not coin-selection, not a fee estimator, not a UTXO fetcher,
not a broadcaster — and **never a CoinJoin coordinator/pool/mixer**. It derives public receiving keys, reads
addresses off a `zpub`, and builds/signs PSBTs for inputs the caller already owns. Signing stays in the
enclave/hardware where the key lives; broadcasting and live chain state stay in the separate wallet/network
layer.

## Security

See [SECURITY.md](SECURITY.md). The load-bearing rule is the seed boundary above: the seed-side functions are
enclave-only and emit public material only; the public side is watch-only and rejects private material twice.

## License

MIT License — see the [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes.
