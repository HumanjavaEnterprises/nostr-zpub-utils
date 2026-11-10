# TODO — nostr-zpub-utils

## Before first npm publish

- [ ] Confirm the npm package name `nostr-zpub-utils` is available / reserved.
- [ ] Verify the `HumanjavaEnterprises/nostr-zpub-utils` GitHub repo, CI badge slug (`ci.yml`), and
      security-advisory link are correct.
- [ ] Decide whether to commit generated `docs/` or leave to CI.

## Later

- [ ] Keep `versions.ts` `PUBLIC_VERSIONS` in lockstep with `hj-pay` (`colabrelay.sdk` `src/pay/derive.ts`).
      A CI check that diffs the two maps would prevent silent drift.
- [ ] hj-pay parity: since 0.2.0 `zpubToAddress` refuses non-BIP84 versions (xpub/Ltub/ypub/…) unless
      `allowNonBip84: true`. Addresses for accepted keys are unchanged; decide whether hj-pay adopts the
      same refusal so the two libraries also agree on what they reject.
- [ ] Retag: tag `v0.1.1` points before the rename commit `319ccc1` (the published 0.1.1 is the renamed build).
- [ ] Consider re-exporting a small `deriveAddresses(zpub, count)` gap-scan helper (hj-pay has one) if a
      consumer needs it — kept out of 0.1 as a non-goal.
- [ ] Add published-vector coverage for a passphrase ("25th word") case if a canonical vector surfaces.
- [ ] Evaluate whether `mnemonicToIdentity` should also expose a NIP-06 account index option.
