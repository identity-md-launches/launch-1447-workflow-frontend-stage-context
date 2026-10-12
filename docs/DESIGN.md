# DEAD DROP — implemented design

## Overview

DEAD DROP is a field kit for leaving paid, encrypted notes for Ethereum wallets. The interface uses the approved concrete-grey page, ink type and one signal-orange accent. Condensed uppercase headings, compact coordinates and a line-drawn brick wall carry the identity. The main action is address lookup; wallet and transaction details appear as the task requires them.

This file lives in `docs/` because the task's explicit write budget permits `web/**`, `dist/**` and `docs/**`, but not repository-root `DESIGN.md`. It documents the final implementation, rather than a proposal. Source: `web/src/styles.css`, `components.tsx` and page components in `web/src/`. Browser evidence and limitations: [VALIDATION.md](VALIDATION.md).

## Colors

CSS custom properties in `web/src/styles.css:1` define the palette.

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#D8D5CE` | Concrete page, disabled controls, inverse text |
| `--ink` | `#141414` | Primary text, structural borders, selected states, focus |
| `--accent` | `#FF5A1F` | Primary action fill, envelope, short signal markers |
| `--surface` | `#E8E5DE` | Fields, quote receipts, notices and error backgrounds |
| `--muted` | `#514F4A` | Supporting copy and hints |
| `--line` | `#8C8982` | Nonessential dividers and subdued boundaries |

This is the brief's single concrete/light theme; there is no theme switch. Errors use text plus a bordered panel; status is never communicated by color alone. Selection uses ink with paper text. The 3px focus perimeter uses ink and a 4px offset; forced-colors mode uses system `Highlight`.

Measured rendered contrast pairs in Chromium: ink/paper **12.57:1**, muted/paper **5.58:1**, ink/orange **5.91:1**. These measurements apply to the opaque pairs recorded in `evidence/browser-results.json`, not a claim about every possible wallet extension or browser state.

## Typography

- `--font-display`: locally bundled **Archivo Narrow**, weights 600 and 700, with Arial Narrow/sans-serif fallbacks. Headings and brand are uppercase through CSS. Heading line height is 1.05, with slightly negative letter spacing. Brand uses a 1.0 line height.
- `--font-body`: Arial, Helvetica, sans-serif. Native system body font avoids a third download. Base size 16px, line height 1.55; explanatory text stays around 70 characters per line.
- `--font-mono`: locally bundled **IBM Plex Mono 400** for addresses, prices, receipts, coordinates and changing totals. Numeric text uses tabular figures. Labels/hints are generally 11–13px; inputs remain 16px on mobile.
- General page h1 scales from 46px to 80px. The hero uses 60–86px at normal desktop widths, 96px at the largest breakpoint; its mobile scale is 43–72px. h2 is normally 34px; h3 is 25px. Local components use smaller steps for instructional cards and the footer.
- Paragraphs use `text-wrap: pretty`, headings `balance`. The phrase “dead drop” is kept together in the hero. Addresses and hashes wrap without truncating required full values; shortened addresses link to an explorer and have copy controls.

Fontsource dependencies supply the Latin font files. WOFF2 is preferred and WOFF fallbacks are retained. Intended font loading is checked through `document.fonts.ready`, resource requests and screenshots; font licenses ship with the export.

## Layout

The main shell is at most 1,280px, with 48px desktop margins. Breakpoints at 1,080px, 760px and 380px respond to the content:

- At 1,080px, margins become 32px, address lookup stacks its input/button, and totals become two columns.
- At 760px, margins become 20px; hero, main content panels and manual layouts become one column. The header can wrap. Navigation stays in normal flow. The decorative network label is removed to give the links room.
- At 380px, margins become 16px and navigation can wrap into additional rows. Essential controls remain in flow and accessible at 320px.

Spacing follows an 8/16/24/32/48/72px scale (component rules use these literal lengths). Fields and secondary content are grouped inside `.panel`; `.two-col`, `.row`, `.stack`, `.receipt`, `.quote` and `.section-head` are reusable layout patterns. Related controls use roughly 12px gaps, while panel/section separation is larger.

There are no fixed-height text cards, sticky toolbars or hidden horizontal carousels. Full addresses, sealed-byte counters and transaction messages wrap. Buttons are at least 48px high, with compact header controls at least 42px. Smaller copy controls are 36px high and spaced apart.

Observed reflow coverage includes 320, 390, 768 and 1,440 CSS pixels. The primary composition flow is captured at 390px. Native zoom, physical-device behavior and translated/RTL layouts are not certified.

## Elevation & depth

The interface is flat: no gradients, glow, shadows or floating dashboard tiles. Borders structure the kit and mark receipts/controls. The sole spatial illustration is the SVG wall in `App.tsx` (`Wall`): a loose brick slides to reveal an orange sealed envelope.

The brick moves only on a deliberate button action. Its transform transition is 600ms with `cubic-bezier(0.2, 0, 0, 1)`, enabled only for `prefers-reduced-motion: no-preference`. Reduced motion makes the change immediate. There are no loading spinners, entrance sequences or competing animations.

## Shapes

Controls and panels have square corners. Repeated thin ink rectangles echo envelopes and bricks; the orange accent is a fill or short underline, never a pill. The envelope icon shares one stroke style and is decorative when paired with named text. The wall has an accessible SVG title and a separately named native toggle button.

## Components

| Component / source | Use and states |
| --- | --- |
| `Action`, `components.tsx` | Primary or neutral transaction/request button; independently keyed pending stage, persistent error, success and transaction explorer link. Buttons remain unavailable through confirmation and refresh; uncertain submitted receipts have a separate global recovery action. |
| `WalletGate`, `components.tsx` | Connect → correct chain → verified deployment → supported EOA → action. Wrong-chain switching has one global control. Unknown receipt status blocks further transactions. |
| `Field`, `components.tsx` | Persistent label, hint association, 16px input or resizable textarea; invalid sealed-byte lengths are marked. Never relies on placeholder alone. |
| `AddressView`, `components.tsx` | Checksummed full/short address, explorer link, copy control and recoverable clipboard feedback. |
| `SectionHead`, `components.tsx` | Small coordinate label, one page h1 and optional introduction. |
| `OpenDrop` / `Compose`, `Compose.tsx` | Session unlock/open prerequisites, byte counter, exact IMD receipt, quote expiry/minimum, explicit approval then note or knock. Draft stays mounted during same-wallet refresh. |
| `NoteCard` / `Inbox`, `Inbox.tsx` | Private incoming/sent folders, decrypted content, waiting/answered/taken-back text, reply form, mature take-back confirmation and history paging. Loading/error/empty states are distinct. |
| `Swap`, `Swap.tsx` | Direction toggle, amount/slippage, quote, token-to-Permit2 approval, router authorization and final swap. Additional token tools are disclosed separately. |
| `OwnerTools`, `Tools.tsx` | Owner-only stamp and two-step ownership controls; confirmation is required before proposing a new owner. |
| Native `details` / `summary` | Manual questions, deployment diagnostics and advanced token/owner controls. Browser-native keyboard/disclosure behavior. |

The skip link focuses `main` without changing the hash route. Hash navigation returns focus to the page content. Native controls provide keyboard activation; no custom modal focus trap is required. Session/account changes remove private rendered content. Errors and status use `role="alert"` and `role="status"`; the main region exposes its busy state.

## Do's and don'ts

- Start another page with `SectionHead` and `.two-col` or `.prose`; reuse the shell and normal document flow.
- Use `Action` and `WalletGate` for contract writes. Preserve per-action state, exact amounts, chain/account verification and simulation before signing.
- Keep one orange primary action within the active task. Use neutral controls for alternate navigation and secondary tools.
- Use the manifest loader for every address, RPC and pool value. Do not introduce another deployment map.
- Keep sensitive text out of URLs, logs and browser storage. Preserve indexed wallet-only history filtering and clear session data on account changes.
- Maintain the grey/ink/orange identity, square shapes and single intentional brick animation. Do not add gradients, pills, auto-animation, public note feeds or speculative USD pricing.

Guidance attribution: Better Interface by Jakub Krehel (MIT), documentation method adapted from Impeccable by Paul Bakaus (Apache-2.0), and ethskills frontend UX by Austin Griffith (MIT). Exact pinned notices/licenses are retained under [licenses](licenses/).
