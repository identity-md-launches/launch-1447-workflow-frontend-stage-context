# Frontend validation — DEAD DROP

## Outcome and scope

The frontend source, lockfile, production static export, runtime deployment manifest, design record and validation evidence are complete within the assignment's writable paths. Contracts and root build configuration are unchanged. Source implements the approved field-kit design, all primary DeadDrop actions, standalone IMD/DROP swaps, token tools, wallet-only note history and agent documentation.

**Worker limitation:** `.git` is mounted read-only. `git add -- web dist docs` returned exit 128 (`Unable to create .git/index.lock: Read-only file system`). No local commit could be made; the contributor/publisher must collect these working-tree artifacts. Repository-root `DESIGN.md` is also outside the explicit write budget, so the design record is [docs/DESIGN.md](DESIGN.md). Neither limitation was worked around by writing protected paths.

This is worker-produced evidence, not independent certification. No site publication, naming, pinning or contract redeployment was attempted. No real transaction was signed or broadcast.

## Reproducible checks

Environment: Node **24.21.0**, npm **11.19.0**, TypeScript **5.9.3**, Vite **7.2.2**, React **19.2.0**. Browser automation uses Playwright **1.56.1**, Chromium **141.0.7390.37**, with the installed browser MCP used for additional real-RPC rendered inspection.

| Check | Actual result | Evidence |
| --- | --- | --- |
| `npm run typecheck --prefix web` | Passed, exit 0 | [typecheck.txt](evidence/typecheck.txt) |
| `npm test --prefix web` | 11 tests passed; 0 failures | [unit-tests.txt](evidence/unit-tests.txt); cases listed below |
| `npm run build --prefix web` | Passed, exit 0; static files exported to root `dist/` | [build.txt](evidence/build.txt), final manifest and asset inventory |
| `npm run verify --prefix web` | Passed, exit 0; exact handoff/network, pinned ABIs and all final asset hashes | [export-verification.txt](evidence/export-verification.txt) |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/dead-drop-browsers npm run test:browser --prefix web` | **24 checks passed**, 0 browser exceptions/console errors | [browser-results.json](evidence/browser-results.json) |
| `npm run check:chain --prefix web` | Both configured RPCs passed read-only checks and quoter simulation | [live-chain.json](evidence/live-chain.json) |
| Development server middleware | Served bytes identical to `dist/imd-deployment.json`; server closed afterward | Direct `createServer` / fetch / byte comparison executed on worker |
| Six-domain design review | Reviewed and applicable findings fixed | Coverage/finding tables below; [DESIGN.md](DESIGN.md) |

Vite reports one harmless dependency annotation warning from `ox/_esm/core/Base64.js`; Rollup removes the misplaced PURE comment. There are no app type errors or observed browser console warnings/errors in the final checks.

The browser suite serves the actual production export under `/preview/`, intercepts the exact configured RPC URLs and injects an EIP-1193 test wallet. Accounts/signatures are generated for each run and never become deployment configuration. RPC/transaction fixtures model contract results; they are not proof of a live swap. All mock transactions remain inside the test process. Confirmation-timeout coverage advances the browser clock by 180 seconds virtually; it does not wait three minutes in real time.

## Interaction coverage

The 24 completed browser checks cover:

1. Static gateway-subpath loading, bundled fonts/scripts and expected resource origins.
2. Reflow without document overflow at 320, 390, 768 and 1,440 CSS pixels.
3. Keyboard skip-link focus without corrupting hash navigation.
4. Reduced-motion brick behavior with a working native toggle.
5. Home axe scan (zero detected violations) and measured text/action contrast.
6. Invalid address/ENS input with a recoverable error and no transaction.
7. Connection rejection recovery; wrong-chain detection; exact add-chain parameters after error 4902; subsequent switch.
8. Inbox locked until the exact signature; rejected signing recovers; no local/session storage.
9. Indexed wallet-only history, decryption and encrypted reply calldata before signing.
10. Sender rereading, mature take-back and explicit close-note confirmation.
11. Price and owner stamp controls.
12. UTF-8 byte ceiling, quote, exact DeadDrop IMD approval, draft survival after approval and encrypted note calldata/minimum output.
13. Knock for a closed recipient with the stamp quote and no text.
14. Both Permit2 approvals, configured router destination, zero native value and v4 command/action encoding.
15. Failed simulation stops signing; transaction rejection can be retried.
16. DROP transfer, zero-allowance revocation and delegated transfer controls.
17. Unknown submitted-receipt status blocks further writes; separate confirmation recovery submits no duplicate transaction.
18. Account changes remove the session key and private rendered content.
19. Opening a new drop with a signature plus a separate on-chain action.
20. Two-step ownership proposal/acceptance, with proposal confirmation.
21. Missing deployed code keeps transaction controls unavailable.
22. Smart contract wallet unsupported state prevents key derivation.
23. Missing injected wallet shows installation/wallet-browser guidance.
24. No unexpected page exceptions or console errors across these flows.

The 11 unit/protocol tests cover both pinned canonical ABI hashes; raw-signature SHA-256 derivation and key zeroing; both participants' note/reply decryption; random nonces; malformed/tampered/wrong-key/version rejection; UTF-8 sealed-size boundaries; numeric precision and slippage bounds; both swap directions and exact pool hook; five-field and extended six-field tuple layouts; stale/mismatched quote rejection; low-order recipient-key rejection; actionable wallet/custom/multiline revert errors; and bounded wallet-filtered queries for replies newer than an old history window (some tests exercise several related cases).

## Live reads and rendered evidence

On 2026-10-12, both `ethereum-rpc.publicnode.com` and `eth.drpc.org` reported chain ID **1**, nonempty LaunchToken (**1,739 bytes**) and DeadDrop (**7,893 bytes**) code, matching token/PoolManager/pool-key getters, the **0.1 IMD** stamp and zero initial aggregate activity at block **26177894**. Both simulated the configured quoter successfully. Exact values, public addresses and runtime-code hashes are in [live-chain.json](evidence/live-chain.json). These are observations at that block, not future availability or contract-audit claims.

The installed browser MCP inspected the finished export with real RPC reads at 1,440×1,000 and 390×844. It confirmed loaded Archivo Narrow 600/700 and IBM Plex Mono 400, no overflow, and no console errors. A keyboard walk followed skip link → brand → wallet control → five navigation links → lookup input, then typed an actual handoff address and pressed Enter. The closed-drop page loaded and focus moved to `main`; no wallet was connected. The loose-brick control was keyboard-activated and its visible focus ring inspected. See [manual-browser.json](evidence/manual-browser.json).

| Screenshot | Content |
| --- | --- |
| [live-desktop.png](evidence/live-desktop.png) | Final desktop home, real RPC totals |
| [live-mobile.png](evidence/live-mobile.png) | Final 390px home, real RPC totals |
| [brick-focus-mobile.png](evidence/brick-focus-mobile.png) | Visible keyboard focus and revealed envelope |
| [keyboard-find-mobile.png](evidence/keyboard-find-mobile.png) | Keyboard lookup result and disconnected knock prerequisite |
| [home-1440.png](evidence/home-1440.png), [home-390.png](evidence/home-390.png) | Automated production-export reflow with seeded mock totals |
| [inbox-desktop.png](evidence/inbox-desktop.png) | Seeded private note/reply and transaction state |
| [compose-mobile.png](evidence/compose-mobile.png) | 390px seeded composition, quote and final send step |

The screenshots containing notes use test content and generated test wallets. No private real inbox was accessed.

## Better Interface review

The pinned workflow/core principles of all six Better Interface domains and the eth-frontend-ux reference were read and applied during construction. The requested concrete/ink/orange palette, condensed Archivo headlines, mono coordinates, SVG brick and single animation were preserved. Licenses/notices are retained under `docs/licenses/`; runtime font/library licenses are exported as `THIRD-PARTY-NOTICES.txt`.

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | **Checked** | Native controls, labels/hints, semantic headings/landmarks, visible focus, skip link, error/status announcements, reduced motion, touch targets; automated home axe scan and keyboard search/brick walk. No screen-reader speech session or full keyboard-only wallet-extension transaction was performed. |
| Layout | **Checked** | Home at 320/390/768/1440; composition at 390; inbox at desktop; full-address and long-status wrapping; no observed page overflow. Native 200% zoom, RTL mirroring and translated strings were not tested. |
| Writing | **Checked** | Plain action labels, explicit stamp/tip/escrow economics, public metadata versus sealed words, meaningful empty/error states, correct knock eligibility, unknown-receipt recovery and absent-USD explanation. |
| Typography | **Checked** | Local fonts loaded; heading hierarchy, paragraph measure, tabular numerals, addresses and byte counters; mobile inputs at 16px. No cross-platform font-rendering or assistive text-enlargement certification. |
| Colors | **Checked** | Actual opaque rendered pairs: ink/paper **12.57:1**, muted/paper **5.58:1**, ink/orange **5.91:1**. Zero home axe findings; status has text/border cues. No dark theme was requested, so dark-theme review is **Not applicable**. |
| UI | **Checked** | Primary/neutral/disabled/pending/error/confirmed states, copy feedback, native disclosures, intentional brick toggle, reduced-motion result. No custom modals/overlays: focus trapping is **Not applicable**. Slow-motion animation-panel inspection was not performed. |

### Findings, fixes and rechecks

| Severity | Final source location | Observed issue → correction → recheck |
| --- | --- | --- |
| HIGH | `web/src/useRemote.ts:3`, `web/src/App.tsx:234`, `web/src/Compose.tsx:62`, `web/src/Inbox.tsx:183` | Approval/refresh temporarily removed the composer and erased a draft. Same-wallet data is retained while refreshing and existing content stays mounted. The full approval→sealed-send test now preserves and decrypts the original draft; account-change tests still clear private content. |
| HIGH | `web/src/protocol.ts:153` | A multiline viem revert reason was trimmed after splitting, producing an empty error. Trim before selecting the first reason line, with a nonempty fallback. Unit regression and browser simulation-failure/rejection checks pass. |
| HIGH | `web/src/state.tsx:448`, `web/src/components.tsx:108` | A submitted transaction with unavailable receipt needed an explicit state to prevent accidental resubmission. Added an uncertain-receipt gate, explorer link and independent confirmation check. Virtual-clock browser test confirms recovery without a second transaction. |
| MEDIUM | `web/src/App.tsx:411` | Skip link originally changed the hash route to an unknown page. It now focuses `main` without navigation. Keyboard regression passes. |
| MEDIUM | `web/src/App.tsx:142`, `web/src/styles.css:340` | Hiding mobile `<br>` elements joined words; the hero underline split awkwardly. Added real spaces around breaks, adjusted mobile scale and kept “dead drop” together. Final 320/390/768/1440 reflow and viewed screenshots pass. |
| MEDIUM | `web/src/components.tsx:118`, `web/src/App.tsx:462` | Local action gates could duplicate the wrong-network switch control. Gates now direct visitors to the single global switch action. Unknown-chain switch/add/switch interaction passes. |
| MEDIUM | `web/src/history.ts:66` | Old reply lookups used a single potentially oversized RPC block range. Reply queries now walk backwards in bounded 9,999-block chunks through the current head and filter the specific note ID. The old-history regression and the production inbox/reply flow pass. |
| MEDIUM | `web/src/state.tsx:403` | An asynchronous key lookup could finish after an account change. Added a generation check after lookup and cleared key buffers on cancellation. Account-change privacy regression passes. |

No observed HIGH/MEDIUM issue remains unresolved in the validated flows. A source review is not a substitute for the unperformed checks below.

## Deployment and packaging

- Both ABI exports were obtained from deployed source commit `44bca84de295601125eff965360c4421abf2aa98`; canonical Keccak hashes exactly match the handoff.
- `dist/imd-deployment.json` is the runtime configuration and is generated after the final export. It preserves `launchId`, `chainId`, `sourceCommit`, `attestationHash`, the exact contract set, exact `poolKey`, network and optional wallet-add block.
- The final manifest declares **16 assets / 750,993 bytes**, excluding itself. Paths are relative and traversal-free; all files including HTML, ABI JSON, fonts and license notices are SHA-256 inventoried. Largest asset is well below 8 MiB and the HTTP publication budget has ample headroom.
- `web/.gitignore` is explicitly within the path budget. Nested dependency/cache directories and npm archives are excluded. No submodule, vendor registry or unnecessary archive is introduced.
- Full proposed-tree and compressed delivery-size measurements are recorded in [submission-size.json](evidence/submission-size.json). Root configuration, contracts, existing ABI exports and vendored Solidity libraries are unchanged.

## Remaining limitations

- Real wallet extension/device behavior, live approvals/swaps/note/reply/take-back broadcasts, transaction replacement and chain reorg behavior were not exercised. Mocked interactions and read-only quotes do not certify them.
- Screen-reader speech, browser-native 200% zoom, physical iOS/Android, RTL/localization and exhaustive assistive-technology combinations remain unverified. The axe result is not a full accessibility-compliance claim.
- Historical decryption needs archive-capable RPC reads; key changes, nondeterministic wallet signatures, and same-block key rotations can make older notes unreadable. The app intentionally refuses silent key replacement. History uses bounded block windows; very active windows can still require many RPC reads.
- Keys and transaction tracking are session-only. Closing/reloading a tab or changing the connected account/chain loses local transaction tracking; check the explorer before resubmitting an uncertain transaction. JavaScript memory erasure is best effort.
- On-chain ENS lookup is implemented; exhaustive ENS resolver varieties and live ENS-name resolution were not browser-tested. Off-chain/CCIP resolution is disabled.
- The stamp's DROP share is burned; tip escrow fluctuates in value. The contract cannot guarantee a useful or correctly encrypted reply. No USD oracle was supplied.
- The final live domain/CID is assigned later. Absolute social-preview URLs/images, publication, pinning and naming are pending publisher responsibilities, not worker completion prerequisites.

**Completion:** source/export/worker-validation deliverable complete within the writable scope, with the Git commit and root-design-path restrictions explicitly recorded above. Overall workflow publication checks remain for the control plane.
