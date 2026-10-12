# DEAD DROP frontend

Static Vite + React + TypeScript field kit for the deployed DeadDrop application and DROP token. No backend, analytics, CDN scripts, remote fonts, private RPC URLs or credentials. Production files are in repository-root `dist/`; the publisher serves these files without rebuilding.

## Install, build and preview

Use Node 24 (validated here) and npm. All frontend manifests, lockfiles and configuration stay in `web/`.

```sh
cd web
npm ci --cache /tmp/dead-drop-npm-cache
npm run typecheck
npm test
npm run build
npm run verify
npm run preview
```

Vite uses `base: './'`; navigation uses hash routes. Serve `dist/` from HTTPS, an IPFS gateway subpath, or localhost. Web Crypto and wallet injection require a secure context. Do not open `index.html` using `file://`. `npm run dev` serves source; run `npm run build` once first to populate `web/public/abi/` and `history-start.json`. The development-only Vite middleware serves the same `dist/imd-deployment.json` directly, without maintaining another configuration copy. Production preview is the preferred full integration environment.

For the exact production subpath used for manual browser review:

```sh
node scripts/preview-check.mjs
# http://localhost:4173/preview/ (foreground preview, stops after 20 minutes)
```

## One deployment configuration

The browser fetches `./imd-deployment.json` and each referenced ABI JSON at runtime. `src/config.ts` is the loader and client factory, not an independent address map. It verifies canonical ABI Keccak hashes before rendering the app. Runtime RPC, token, router, quoter, Permit2, explorer, chain and pool settings all come from that manifest. Ethereum ENS infrastructure comes from viem's Ethereum metadata; CCIP/off-chain resolver requests are disabled. On-chain ENS names and pasted Ethereum addresses are supported.

`deployment/handoff.json` and `deployment/network.json` preserve the assignment's input records for reproducible builds. They are build inputs only and are **not** separately loaded by the browser. `scripts/export.mjs` compares them to the pinned input files when available, then reads `docs/abi/<Contract>.json` from deployed source commit `44bca84de295601125eff965360c4421abf2aa98` using `git show`. It verifies each canonical hash and rejects changed ABI exports. Keep that commit available in the Git clone. No Solidity source or root build configuration is changed.

Build order is ABI verification → Vite export → final manifest inventory. `npm run verify` independently enumerates the final export and checks the exact contract set, network, wallet-add parameters, pool key, every ABI hash and every SHA-256 asset hash. The manifest omits itself, has no extra top-level keys and includes all other files. `history-start.json` is a hashed asset containing only the handoff's deployment block for event indexing; it is not a second deployment/address map. Re-run the build after any export change.

Before enabling transactions, the app checks RPC chain ID, nonempty contract code, the deployed DROP/IMD/PoolManager bindings, exact pool key and token decimals. Reads use both configured public RPCs; contract reads can fall back to the connected provider on the correct chain. Public reads, historical data and simulations can still fail if the configured providers are unavailable; the app fails closed and offers refresh.

## Pages and controls

- Home: address/ENS search, hand-drawn loose-brick illustration, three-step explanation and live aggregate counters. No public sender/recipient feed.
- `#/0x…`: open/closed status, read price, share link/X intent for the connected owner, compose or knock. The sender opens their own drop first when needed.
- `#/inbox`: sign to unlock, own inbox/sent history, decrypted notes/replies, reply and claim, 14-day take-back with explicit confirmation, earnings, knocks and price settings. Current owner and pending owner see stamp and two-step ownership controls.
- `#/swap`: IMD↔DROP quote, exact token approval to Permit2, exact short-lived Permit2 authorization to the Universal Router and final simulated swap. Separate DROP transfer, allowance/revocation and delegated transfer tools are available in a disclosure.
- `#/manual`, `#/agents`, `llms.txt`: privacy model, key-loss limitations, agent integration and wire format.

Injected EIP-1193 wallets and EIP-6963 discovery are supported. There is no WalletConnect project ID; WalletConnect is not enabled. A wrong network shows one switch control; unknown-chain error 4902 triggers the unchanged `walletAddChain`, followed by another switch. Smart contract wallets are unsupported for the encryption flow.

## Encryption and transaction behavior

The exact message is defined once in `src/crypto.ts` and documented in `llms.txt`. SHA-256 of the **decoded signature bytes** becomes the NaCl x25519 secret. A message is `0x01 || nonce[24] || authenticated ciphertext`; sealing adds 41 bytes, leaving **983 UTF-8 bytes** for plaintext. Both participants can reread notes. Nonces are cryptographically random; low-order recipient keys, invalid versions and authentication failures are rejected. Keys/signatures are never written to local/session storage. Typed key buffers are cleared on lock, account/chain change and disconnect; JavaScript cannot guarantee erasure of every temporary/string allocation. A mismatched existing key is never silently replaced.

Wallet history requests filter the indexed `Left` event by the connected sender or recipient, in 50,000-block windows and 9,999-block RPC chunks. The UI provides earlier/newer windows and labels errors separately from empty results. Counter totals come from contract getters. Peer keys are read at the note/reply block; historical decryption needs an RPC that supports historical state. Same-block key rotations can be ambiguous because the event does not include both participants' keys. Wallets whose signatures change cannot recover old notes with a new key.

Note/knock approvals go to **DeadDrop**, which pulls and swaps IMD internally through its attested PoolManager. Standalone swap approvals go to the manifest's Permit2 and Universal Router. Quoter calls are `eth_call` simulations, never transactions. All submitted actions are simulated again before signing, use the connected account/chain after rechecking them, and retain per-action pending/error/hash state through a successful receipt and refresh. Quotes expire after 60 seconds; default slippage is 1%, accepted range 0.1–5%. Quote changes, recipient key/price changes and stamp changes require a fresh review. No unlimited approvals are requested.

If receipt confirmation times out after submission, another transaction is blocked and the page provides a separate confirmation check and explorer link. Keep the tab open until resolved; session-only tracking cannot survive closing/reloading the page or changing the connected account/chain. A one-confirmation receipt is not a finality guarantee. Reorg handling and long-lived transaction replacement tracking have not been certified.

The pool is IMD/DROP: both are ERC-20s, so standalone swaps send zero native value. The optional extended router tuple is supported and unit-tested, but this handoff uses the normal five-field tuple. Encoding follows the [official Uniswap v4 swap guide](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/swapping); addresses always come from the pinned network input.

USD context is explicitly unavailable because no approved price oracle was supplied. Keys and messages remain sensitive despite public transaction metadata; encryption is not anonymity and the contract cannot verify the quality of a reply.

## Validation

```sh
npm run typecheck
npm test
PLAYWRIGHT_BROWSERS_PATH=/tmp/dead-drop-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/dead-drop-browsers npm run test:browser
npm run check:chain   # read-only RPC verification and simulated quote
npm run verify
```

The browser test creates its own bounded foreground HTTP server under `/preview/`, uses generated test accounts and mocked RPC/wallet responses, and closes server/browser in `finally`. It does not broadcast transactions. Node, browser and live-read evidence and explicit limitations are recorded in [`../docs/VALIDATION.md`](../docs/VALIDATION.md). The implemented design is in [`../docs/DESIGN.md`](../docs/DESIGN.md), placed under the allowed write scope because repository-root `DESIGN.md` was not authorized.

No IPFS publication, site naming, ENS publication or redeployment occurs in this assignment. Absolute social-preview URLs and a social image remain pending the publisher's final domain; metadata uses the product title/description without inventing a live URL.

## Size and licensing

`web/.gitignore` is the explicitly allowed ignore file. It excludes nested dependency/cache/report directories and npm archives. Do not submit `node_modules`, browser binaries, package-manager caches or registry mirrors. Runtime font/license assets remain complete. The final tree and export inventories are recorded in validation evidence.

Runtime third-party licenses are in `public/THIRD-PARTY-NOTICES.txt` and exported with the site. Pinned Better Interface/Impeccable and ethskills notices/licenses are retained in `docs/licenses/`. The latter guides informed the design/review; they did not authorize any out-of-scope source or contract changes.
