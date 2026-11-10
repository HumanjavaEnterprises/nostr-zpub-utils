# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-10

Fixes from the 2026-11-10 package review. Addresses derived from BIP84 keys are byte-identical to 0.1.1.

### Breaking
- **`zpubToAddress` / `zpubToAddressForAsset` accept BIP84 version bytes only by default** — `zpub`
  (mainnet) or `vpub` (testnet). Any other SLIP-132 version (`xpub`/`tpub`/`Ltub`/`ttub`/`ypub`/`Mtub`/`upub`)
  now throws the new `NonBip84KeyError`: those bytes don't say BIP84, so the library can't tell whether the
  wallet watches the P2WPKH addresses it would derive. Some wallets export real native-segwit (m/84') account
  keys under other bytes — Bitcoin Core / Litecoin Core descriptor wallets (`xpub`/`tpub`), Ledger Live (`xpub`
  for BTC, `Ltub` for LTC); for those, pass `{ allowNonBip84: true }` (addresses identical to 0.1.1).
- **`zpubToAddress` / `zpubToAddressForAsset` accept ACCOUNT keys (depth 3) only by default.** A root, m/84',
  m/84'/coin', chain-level or address-level key used to derive `<key>/<change>/<index>` silently, giving
  addresses no wallet watches; it now throws the new `WrongDepthKeyError`. Opt in with
  `{ allowNonAccountDepth: true }`.
- **Explicit `null` is no longer a default.** `index: null` / `change: null` (and `asset`/`account`/`network`/
  `passphrase: null` on the seed side) used to mean 0 / the default; they now throw. Only `undefined` means
  "use the default".
- **`ltcLabel: 'Ltub'` removed** (`mnemonicToZpub`, `seedToZpub`, `outputVersionHex`). It serialized a BIP84
  (`m/84'/2'`) key under Litecoin's BIP44 version `0x019da462`, which the library's own `checkXpub` flagged.
  SLIP-132 has no Litecoin BIP84 version; LTC keys are emitted as `zpub` (mainnet) / `vpub` (testnet), as
  before by default. Passing `'Ltub'` now throws; `ZpubOptions.ltcLabel` is typed `'zpub'`. Ltub keys already
  exported by 0.1.x keep deriving the same addresses with `zpubToAddress(ltub, { allowNonBip84: true })`.
- **`nostr-nsec-seedphrase` is an optional peer only** (`>=0.8.0 <0.10.0`), no longer an
  `optionalDependency`, so `npm install nostr-zpub-utils` no longer pulls it (87 packages / 24 MB before).
  Install it yourself to use `mnemonicToIdentity`.
- **The `browser` export condition now resolves to the ESM build** (`dist/index.js`); it pointed at an IIFE
  with no exports, so bundlers got `undefined` for every import. The top-level `browser` field is removed.
  The IIFE is still built for `<script>` use (`unpkg`/`jsdelivr` fields), now without the seedphrase
  dependency inlined and without a source map; its global is renamed `NostrZpubUtils`
  (`NostrZpubUtilities` kept as an alias).
- Unknown `asset`/`network` values now throw instead of being passed through (an unknown asset used to build
  the path `m/84'/undefined'`; `psbtNetworkFor` mapped any non-BTC asset to Litecoin).

### Added
- `NonBip84KeyError`, `WrongDepthKeyError`, `AddressOptions.allowNonBip84`,
  `AddressOptions.allowNonAccountDepth`, `BIP84_PUBLIC_VERSION_HEX`.
- `mnemonicToIdentity(mnemonic, { seedphrase })`: pass the `nostr-nsec-seedphrase` module in explicitly, for
  bundled apps (browser, Workers). Works with seedphrase 0.8.x (async) and 0.9.x (sync).
- `engines` (`node >= 20`), `sideEffects: false`, `./package.json` export, `default` export condition.

- **PSBT layer for BTC/LTC (`src/psbt.ts`) — CoinJoin-COMPATIBLE, never a coordinator.** A thin, PURE
  (no network) wrapper over `@scure/btc-signer` for the receiving-side spend. New dependency:
  `@scure/btc-signer` (pinned exact; `npm audit --omit=dev` reported **0 vulnerabilities** at add time).
  - `Psbt` class + `createPsbt(config, opts?)` — build a PSBT/`Transaction` for BTC or LTC (mainnet or
    testnet): `addInput` (caller supplies the prevout / `witnessUtxo` — **we never fetch UTXOs**),
    `addOutput` (by address or raw script), `toPsbt`/`Psbt.fromPsbt` (serialize / accept an
    externally-supplied shared PSBT), `combine` (merge participants' partial signatures),
    `isInputSigned`, and `finalizeAndExtract` (raw tx hex + txid — **we never broadcast**).
  - `signOnlyOurInputs(signingKey, ourIndices)` — the load-bearing CoinJoin-compatible primitive: signs
    ONLY the input indices we declare we own, and never touches the rest. Built on `@scure/btc-signer`'s
    `signIdx` (its authors' documented safe primitive for exactly this mixer/join workflow). ⛔ **Signing
    is ENCLAVE/CLIENT-ONLY** — it touches a private key; building/merging/finalizing need no private
    material and are safe anywhere.
  - Helpers `psbtNetworkFor(asset, network?)` and `p2wpkhScript(pubkey, asset, network?)`; new types
    `PsbtConfig`, `PsbtOptions`, `PsbtInput`, `PsbtOutput`, `PsbtNetwork`, `PsbtSigningKey`, `SignResult`.
  - **CoinJoin posture: participate, never coordinate.** We ship no coordinator, pool, or mixing service
    (real regulatory exposure — see design doc Decision 3); being join-compatible is not that. LTC has no
    CoinJoin ecosystem (MWEB is its privacy path, out of scope); LTC support lets one spend/merge API
    cover both chains.
  - Tests (`test/psbt.test.ts`, 6 cases, no network): a signed+finalized tx round-trips / re-parses via
    `@scure/btc-signer` (BTC and LTC); with a multi-input PSBT we own only some indices, we sign ONLY
    those (others stay unsigned); we refuse to sign an input we cannot actually sign; and a two-party
    build → sign-own-input → combine → finalize flow.
  - Docs: SPEC.md and README.md gain a spend-side PSBT section; PSBT removed from the non-goals (it is now
    in scope, with coordinator/broadcast/UTXO-fetch remaining out of scope).
- **QA harness (`qa/`) — agent-runnable, dev-only, NOT shipped.** Two modes behind one dispatcher
  (`node qa/run.mjs`; npm scripts `qa` / `qa:testnet`), mirroring the sibling `nostr-crosschain-wallet`
  harness (same flags, `--json` shape, and exit-code discipline: `0` pass, `1` failure, `2` bad arg).
  - `qa/synthetic.mjs` — OFFLINE (no network), over the built `dist/`, per asset (BTC/LTC): the published
    BIP84 `abandon…about` derivation vectors plus N seeded-random cases (reproducible sha256-counter PRNG,
    `--count`/`--seed`), and the load-bearing PSBT safety property — a 2-input PSBT owned only at index 0
    signs input 0 and leaves input 1 untouched; declaring an unowned index throws (never silent-signs);
    `finalizeAndExtract` refuses while incomplete; a fully-owned PSBT finalizes and the raw hex round-trips
    via `Psbt.fromPsbt` and `@scure/btc-signer`; no private-key material appears in any output.
  - `qa/testnet.mjs` — GATED, env-gated, network. Derives a testnet receive address, does a watch-only READ
    of balance/UTXOs from a Blockbook-style indexer, then builds + signs a PSBT and OUTPUTS the raw signed
    hex + txid + explorer hint for the operator to broadcast EXTERNALLY (zpub-utils does not broadcast).
    Missing env for an asset → SKIP. Keys are supplied via env only, never committed. Never run in CI.
  - `qa/` is excluded from the npm tarball (`files` allowlist + `.npmignore`).

### Fixed
- No runtime code generation in the ESM build or the IIFE. 0.1.1 built a `Function` from a string at module
  load, so runtimes that forbid code generation (Cloudflare Workers, strict-CSP pages) could not import it.
  The `Function`-routed `import()` fallback now exists only in the CommonJS build (`dist/cjs/peer-import.js`,
  reached only when `require` exists and `require()` of the peer fails); a test greps the ESM build and the
  IIFE for `new Function` / `eval(`.
- The optional peer is loaded through an indirect specifier, so bundling an app that does not install it no
  longer fails with "Could not resolve nostr-nsec-seedphrase".
- `seedToZpub` walks `m/84'/coin'/account'` one level at a time and calls `wipePrivateData()` (zeroes private
  key and chain code) on every HD node it creates: the master, `m/84'`, `m/84'/coin'` and the account node.
  `mnemonicToZpub` also zeroes the 64-byte seed it expands (also on error). A seed passed to `seedToZpub` is
  the caller's and is not touched, and the mnemonic string cannot be wiped. JavaScript cannot guarantee that
  no other copy of the key material remains in memory (engine or GC copies).
- `null`/garbage arguments to every public function (including `null` options) produce a clear `Error`, never a
  raw `TypeError`.
- Browser IIFE 2.9 MB tarball → no source map and no inlined `nostr-nsec-seedphrase`/`pino`.
- `npm audit` clean: vitest `^4.1.12`, `overrides.minimatch ^11.0.6`.
- `@noble/hashes`, `@scure/base`, `@scure/bip32`, `@scure/bip39` aligned to 2.4.0 (the versions
  `@scure/btc-signer` pins), so one copy of each installs. No behaviour change: addresses re-verified
  byte-identical to 0.1.1.

### Docs
- README/SPEC: LTC keys are `zpub`, why (SLIP-132 table), BIP84-only address derivation, optional-peer install,
  `mnemonicToIdentity` is always account 0 with an empty passphrase.

### Notes
- The PSBT layer adds `@scure/btc-signer` as a hard dependency (audited; `npm audit --omit=dev` clean),
  so watch-only consumers install it too; ESM consumers tree-shake it when unused.
- Signing: prefer raw 32-byte keys; when signing a *loaded* PSBT, validate inputs/amounts first (standard
  PSBT trust rule). `combine` cannot redirect funds — a hostile partner can at worst inject a bogus
  partial sig that fails finalization (DoS, not theft).

## [0.1.1] - 2026-08-29

### Added
- README: a prominent **"one seed is one root, not one wallet"** safety box — the mnemonic is both
  the agent's `npub` and its receiving keys (sibling NIP-06 / BIP84 paths, one shared root); losing
  or compromising it loses/compromises both; and a restatement that the library never guesses a
  chain (definite prefix resolves, ambiguous one throws — no silent BTC default).

### Notes
- Documentation only. No code, API, or derivation-path change; `asset` behaviour is unchanged
  (it already refuses to guess rather than defaulting).
### Fixed
- **Testnet coin_type (derivation bug).** Seed-side derivation used the mainnet
  coin_type on every network, so `network: 'testnet'` derived at `m/84'/0'/0'`
  (BTC) instead of the SLIP-44 testnet path `m/84'/1'/0'` (coin 1 = "Testnet, all
  coins"). Testnet addresses now match Sparrow/Electrum/faucet wallets. `coinFor`
  in `keys.ts` is network-aware (mainnet BTC 0 / LTC 2; testnet 1 for both);
  testnet serializes as `vpub` (`tb1…`/`tltc1…`). Mainnet paths and the published
  BIP84 vectors are unchanged.

## [0.1.0] - 2026-08-28

Initial draft release — derive Bitcoin/Litecoin receiving keys from a Nostr identity root.

### Added
- **[SPEC.md](SPEC.md)** — the authoritative spec: one mnemonic → both a Nostr identity and a BIP84
  receiving hierarchy; the one hard boundary (seed-side is enclave-only, outputs public material only);
  what it derives; the correctness gates; the non-goals.
- **Seed-side (enclave/client only)**:
  - `mnemonicToZpub(mnemonic, opts)` / `seedToZpub(seed, opts)` — derive the BIP84 account-level
    `zpub`/`Ltub` at `m/84'/coin'/account'` (BTC coin 0, LTC coin 2). Returns PUBLIC material only
    (`{ zpub, path, asset, fingerprint }`).
  - `mnemonicToIdentity(mnemonic)` — the one-root tie-in: NIP-06 `npub` + BTC/LTC `zpub`s from a single
    mnemonic. Returns PUBLIC anchors only — never an `nsec` or seed. Uses the OPTIONAL peer
    `nostr-nsec-seedphrase`; throws a clear install hint if absent.
- **Public-side (watch-only, safe anywhere; mirrors `hj-pay` byte-for-byte)**:
  - `zpubToAddress` / `zpubToAddressForAsset` — BIP84 P2WPKH `bc1…`/`ltc1…` addresses from a public account
    key.
  - `inspectZpub` — asset/network/purpose/label/depth/fingerprint, no derivation.
  - `assertPublicOnly` / `assertNoPrivateKeyMaterial` — the hard guard: rejects every private-key shape on
    a prefix check AND the decoded key byte (catches a `zprv` re-versioned to wear a `zpub` prefix).
  - `checkXpub` — go-live preflight (mirrors hj-pay): never throws, returns `{ ok, info, errors, warnings }`,
    flagging a wrong depth (≠ 3), a non-BIP84 purpose byte, or an ambiguous prefix.
  - `assertDistinctXpubs` — catches the same account key configured for both chains (fingerprint match).
- **Safe-by-default addressing (LTC ambiguity fix).** `xpub`/`zpub`/`tpub`/`vpub` version bytes are shared by
  BTC and LTC, so they do not pin a chain. `zpubToAddress` now REQUIRES an explicit `{ asset }` for such an
  ambiguous prefix and throws `AmbiguousAssetError` otherwise — it never silently defaults to `bc1…` and
  hands out an unwatched wrong-chain address. A chain-definite prefix (`Ltub`/`Mtub`/`ttub`/`ypub`/`upub`)
  still needs no `asset`. The verified derivation math is unchanged.
- **`versions.ts`** — the SLIP-132 version-byte map, `PUBLIC_VERSIONS` COPIED verbatim from `hj-pay` so the
  two libraries never disagree, plus the `PRIVATE_VERSIONS` reject set.
- **Tests (vitest)** — the published BIP84 vectors (char-for-char), the round-trip pin to an independent
  `node:crypto`-only oracle (== hj-pay), the LTC independent cross-derivation + program-equality check, the
  full guard-rejection matrix, and the no-leak assertion. Plus a built-artifact smoke test over ESM + CJS.
- Dual ESM + CommonJS build with `.d.ts` and a browser IIFE bundle. Runtime deps pinned exact to the audited
  stack (`@scure/bip32` 2.3.0, `@scure/bip39` 2.3.0, `@scure/base` 2.3.0, `@noble/hashes` 2.3.0).

### Notes
- This library **never spends, signs a spend, or persists/logs/transmits private material.** It derives
  public receiving keys from a seed (enclave-side) and reads addresses from a `zpub` (watch-only) — nothing
  else. See [SECURITY.md](SECURITY.md).
