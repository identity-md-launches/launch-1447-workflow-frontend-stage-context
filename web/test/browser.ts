import {
  chromium,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { bytesToHex, decodeAbiParameters, parseAbiParameters } from "viem";
import { MockChain, manifest } from "./mock-chain";
import { unseal } from "../src/crypto";
const root = path.resolve(import.meta.dirname, "../..");
const dist = path.join(root, "dist");
const evidence = path.join(root, "docs/evidence");
fs.mkdirSync(evidence, { recursive: true });
const report: {
  started: string;
  manifestSha256: string;
  checks: any[];
  errors: string[];
  finished?: string;
} = {
  started: new Date().toISOString(),
  manifestSha256: createHash("sha256")
    .update(fs.readFileSync(path.join(dist, "imd-deployment.json")))
    .digest("hex"),
  checks: [],
  errors: [],
};
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};
const server = http.createServer((req, res) => {
  const raw = decodeURIComponent(
    new URL(req.url!, "http://localhost").pathname,
  );
  const relative = raw.replace(/^\/preview\//, "") || "index.html";
  const file = path.resolve(dist, relative);
  if (!raw.startsWith("/preview/") || !file.startsWith(dist + path.sep)) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] ?? "application/octet-stream",
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(server.address() as any).port}/preview/`;
const browser = await chromium.launch({ headless: true });
let active: Page | undefined;
const contexts: BrowserContext[] = [];
async function check(name: string, fn: () => Promise<unknown>) {
  console.log("CHECK", name);
  const start = Date.now();
  try {
    const detail = await fn();
    report.checks.push({
      name,
      status: "passed",
      durationMs: Date.now() - start,
      ...(detail ? { detail } : {}),
    });
  } catch (e) {
    report.checks.push({ name, status: "failed", error: String(e) });
    if (active)
      await active.screenshot({
        path: path.join(evidence, "failure.png"),
        fullPage: true,
      });
    throw e;
  }
}
async function pageFor(fixture?: MockChain, injectWallet = true) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  contexts.push(context);
  await context.addInitScript("window.__name = (fn) => fn;");
  if (fixture && injectWallet) {
    await context.exposeBinding("testWalletBridge", (_, args) =>
      fixture.wallet(args),
    );
    await context.addInitScript(() => {
      const listeners: Record<string, Function[]> = {};
      (window as any).ethereum = {
        on: (event: string, cb: Function) => (listeners[event] ??= []).push(cb),
        removeListener: (event: string, cb: Function) => {
          listeners[event] = (listeners[event] ?? []).filter((x) => x !== cb);
        },
        request: async (args: any) => {
          const response = await (window as any).testWalletBridge(args);
          if (response.error)
            throw Object.assign(new Error(response.error.message), {
              code: response.error.code,
            });
          if (args.method === "wallet_switchEthereumChain")
            (listeners.chainChanged ?? []).forEach((f) =>
              f(args.params[0].chainId),
            );
          return response.result;
        },
      };
      (window as any).testWalletEmit = (event: string, data: any) =>
        (listeners[event] ?? []).forEach((f) => f(data));
    });
  }
  const page = await context.newPage();
  active = page;
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") report.errors.push(msg.text());
  });
  for (const rpc of manifest.network.rpcUrls)
    await page.route(rpc, async (route) => {
      const input = route.request().postDataJSON();
      const one = (r: any) => {
        try {
          return {
            jsonrpc: "2.0",
            id: r.id,
            result: fixture ? fixture.rpc(r.method, r.params) : undefined,
          };
        } catch (e) {
          return {
            jsonrpc: "2.0",
            id: r.id,
            error: {
              code: (e as any).code ?? -32000,
              message: (e as Error).message,
            },
          };
        }
      };
      if (fixture)
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            Array.isArray(input) ? input.map(one) : one(input),
            (_, v) => (typeof v === "bigint" ? `0x${v.toString(16)}` : v),
          ),
        });
      else await route.continue();
    });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Every wallet has a dead drop." }),
  ).toBeVisible();
  return page;
}
const connect = async (p: Page) => {
  await p
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await expect(
    p.getByRole("button", { name: "Disconnect", exact: true }),
  ).toBeVisible();
};
const verified = async (p: Page) =>
  expect(p.getByText("Verified live", { exact: true })).toBeVisible({
    timeout: 20000,
  });
async function settle(p: Page) {
  await expect(p.locator("main")).toHaveAttribute("aria-busy", "false", {
    timeout: 20000,
  });
}

const go = async (p: Page, route: string) => {
  await p.evaluate((hash) => {
    location.hash = hash;
  }, route);
};
try {
  const f = await new MockChain().init();
  const p = await pageFor(f);
  await verified(p);
  await check(
    "production assets load at a static gateway subpath, with all fonts bundled",
    async () => {
      await p.evaluate(() => document.fonts.ready);
      const resources = await p.evaluate(() =>
        performance.getEntriesByType("resource").map((x: any) => x.name),
      );
      assert.ok(resources.some((r) => r.includes("archivo-narrow")));
      assert.ok(resources.some((r) => r.includes("ibm-plex-mono")));
      assert.ok(
        resources.every(
          (r) =>
            r.startsWith(url) ||
            manifest.network.rpcUrls.some(
              (rpc: string) => new URL(rpc).href === r,
            ),
        ),
      );
      return { resourceCount: resources.length };
    },
  );
  await check(
    "responsive reflow at 320, 390, 768 and 1440 CSS pixels",
    async () => {
      for (const width of [320, 390, 768, 1440]) {
        await p.setViewportSize({ width, height: 900 });
        await p.evaluate(() => document.fonts.ready);
        const overflow = await p.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        assert.equal(overflow, false, `overflow at ${width}`);
        if (width === 390 || width === 1440)
          await p.screenshot({
            path: path.join(evidence, `home-${width}.png`),
            fullPage: true,
          });
      }
      return { widths: [320, 390, 768, 1440] };
    },
  );
  await check(
    "keyboard skip link focuses main without corrupting the hash route",
    async () => {
      await p.reload();
      await verified(p);
      await p.keyboard.press("Tab");
      await expect(
        p.getByRole("link", { name: "Skip to content" }),
      ).toBeFocused();
      await p.keyboard.press("Enter");
      assert.equal(await p.evaluate(() => document.activeElement?.id), "main");
      assert.ok(!p.url().endsWith("#main"));
    },
  );
  await check(
    "reduced motion removes brick transition; control remains operable",
    async () => {
      await p.getByRole("button", { name: "Find the loose brick" }).click();
      assert.equal(
        await p
          .locator(".loose-brick")
          .evaluate((e) => getComputedStyle(e).transitionDuration),
        "0s",
      );
      await expect(
        p.getByRole("button", { name: "Close the brick" }),
      ).toHaveAttribute("aria-pressed", "true");
    },
  );
  await check(
    "home accessibility scan and measured color contrast",
    async () => {
      const result = await new AxeBuilder({ page: p }).analyze();
      assert.deepEqual(result.violations, []);
      const contrast = await p.evaluate(() => {
        const lum = (rgb: string) => {
          const channels = rgb
            .match(/\d+/g)!
            .slice(0, 3)
            .map((n) => {
              const v = Number(n) / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        return ["body", ".hint", ".button.primary"].map((selector) => {
          const el = document.querySelector(selector)!;
          const style = getComputedStyle(el);
          let bg = style.backgroundColor;
          let parent = el.parentElement;
          while (bg === "rgba(0, 0, 0, 0)" && parent) {
            bg = getComputedStyle(parent).backgroundColor;
            parent = parent.parentElement;
          }
          const a = lum(style.color),
            b = lum(bg);
          return {
            selector,
            foreground: style.color,
            background: bg,
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          };
        });
      });
      assert.ok(contrast.every((x) => x.ratio >= 4.5));
      return { violations: 0, contrast };
    },
  );
  await check(
    "invalid wallet lookup reports a recoverable error; no transaction",
    async () => {
      await p
        .getByLabel("Whose drop are you looking for?")
        .fill("not-an-address");
      await p.getByRole("button", { name: "Find a drop", exact: true }).click();
      await expect(p.getByRole("alert")).toContainText(
        "complete Ethereum address",
      );
      assert.equal(f.transactions.length, 0);
    },
  );
  await check(
    "connection rejection recovers and unknown chain offers add then switch",
    async () => {
      f.rejectConnect = true;
      await p
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await expect(
        p.getByRole("alert").filter({ hasText: "declined" }),
      ).toBeVisible();
      f.chain = "0x2";
      f.known = false;
      await connect(p);
      await expect(
        p.getByText("You’re connected to another network.", { exact: false }),
      ).toBeVisible();
      await p
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .click();
      await expect(
        p.getByText("You’re connected to another network.", { exact: false }),
      ).toHaveCount(0);
      assert.deepEqual(
        f.requests.find((x) => x.method === "wallet_addEthereumChain")
          .params[0],
        manifest.walletAddChain,
      );
    },
  );
  await check(
    "inbox stays sealed until exact message signature; signing rejection is recoverable",
    async () => {
      await go(p, "/inbox");
      await p
        .getByRole("button", { name: "Sign to unlock inbox", exact: true })
        .waitFor();
      f.rejectSign = true;
      await p
        .getByRole("button", { name: "Sign to unlock inbox", exact: true })
        .click();
      await expect(
        p.getByRole("alert").filter({ hasText: "declined" }),
      ).toBeVisible();
      await p
        .getByRole("button", { name: "Sign to unlock inbox", exact: true })
        .click();
      await expect(
        p.getByText("The package is behind the third brick.", { exact: true }),
      ).toBeVisible({ timeout: 15000 });
      assert.equal(
        await p.evaluate(() => localStorage.length + sessionStorage.length),
        0,
      );
    },
  );
  await check(
    "wallet-scoped history only; reply is encrypted before simulation/signing",
    async () => {
      await p.getByLabel("Your sealed reply").fill("Received. Meet at dawn.");
      await p
        .getByRole("button", { name: "Seal reply & claim tip", exact: true })
        .click();
      await settle(p);
      const tx = f.transactions.at(-1);
      assert.equal(tx.name, "answer");
      assert.equal(
        unseal(tx.args[1], bytesToHex(f.key.publicKey), f.peerKey),
        "Received. Meet at dawn.",
      );
      await expect(
        p.getByText("Answered", { exact: true }).first(),
      ).toBeVisible();
      const leftTopic = f.logs[0].topics[0];
      const reads = f.requests.filter(
        (r) =>
          r.method === "eth_getLogs" && r.params[0].topics[0] === leftTopic,
      );
      assert.ok(
        reads.every((r) =>
          r.params[0].topics.some(
            (t: any) =>
              typeof t === "string" &&
              t.toLowerCase().endsWith(f.signer.address.slice(2).toLowerCase()),
          ),
        ),
      );
      await p.screenshot({
        path: path.join(evidence, "inbox-desktop.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "sent view decrypts sender copy, requires confirmation for matured take-back",
    async () => {
      await p.getByRole("button", { name: "Sent", exact: true }).click();
      await expect(
        p.getByText("An unanswered field report.", { exact: true }),
      ).toBeVisible();
      await expect(
        p.getByRole("button", { name: "Take back escrow", exact: true }),
      ).toBeDisabled();
      await p
        .getByLabel("Return the escrow and close this note to replies.")
        .check();
      await p
        .getByRole("button", { name: "Take back escrow", exact: true })
        .click();
      await settle(p);
      assert.equal(f.transactions.at(-1).name, "takeBack");
      await expect(p.getByText("Taken back", { exact: true })).toBeVisible();
    },
  );
  await check(
    "set price and owner stamp changes use corresponding contract actions",
    async () => {
      await p.getByLabel("Price to read · IMD", { exact: true }).fill("5");
      await p
        .getByRole("button", { name: "Set my price", exact: true })
        .click();
      await settle(p);
      assert.equal(f.transactions.at(-1).name, "setPrice");
      await p.getByText("Contract owner settings", { exact: true }).click();
      await p.getByLabel("New stamp · IMD").fill("0.2");
      await p.getByRole("button", { name: "Set stamp", exact: true }).click();
      await settle(p);
      assert.equal(f.stamp, 2n * 10n ** 17n);
    },
  );
  await check(
    "note composition has byte limit, quote, exact approval and sealed calldata",
    async () => {
      await go(p, `/${f.peer.address}`);
      await p.getByLabel("Your note", { exact: true }).fill("x".repeat(984));
      await expect(
        p.getByRole("button", { name: "Get DROP quote", exact: true }),
      ).toBeDisabled();
      await p
        .getByLabel("Your note", { exact: true })
        .fill("A new sealed dispatch.");
      await p
        .getByRole("button", { name: "Get DROP quote", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Approve IMD for DeadDrop", exact: true })
        .waitFor();
      const total = f.stamp + f.price;
      await p
        .getByRole("button", { name: "Approve IMD for DeadDrop", exact: true })
        .click();
      await settle(p);
      await p
        .getByRole("button", { name: "Seal & leave note", exact: true })
        .waitFor();
      const approval = f.transactions.at(-1);
      assert.equal(approval.name, "approve");
      assert.equal(approval.args[1], total);
      assert.equal(
        approval.args[0].toLowerCase(),
        manifest.contracts.find((x: any) => x.name === "DeadDrop").address,
      );
      await p.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await p.screenshot({
        path: path.join(evidence, "compose-mobile.png"),
        fullPage: true,
      });
      await p
        .getByRole("button", { name: "Seal & leave note", exact: true })
        .click();
      await settle(p);
      const tx = f.transactions.at(-1);
      assert.equal(tx.name, "leave");
      assert.equal(
        unseal(tx.args[1], bytesToHex(f.key.publicKey), f.peerKey),
        "A new sealed dispatch.",
      );
      assert.equal(tx.args[2], f.price);
      assert.equal(tx.args[3], (total * 2n * 99n) / 100n);
      assert.ok(
        !tx.data.includes(
          Buffer.from("A new sealed dispatch.").toString("hex"),
        ),
      );
    },
  );
  await check(
    "knock for closed recipient quotes and burns a stamp without plaintext",
    async () => {
      await go(p, `/${f.closed.address}`);
      await p
        .getByRole("button", { name: "Get DROP quote", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Pay stamp & knock", exact: true })
        .click();
      await settle(p);
      assert.equal(f.transactions.at(-1).name, "knock");
      assert.equal(
        f.transactions.at(-1).args[0].toLowerCase(),
        f.closed.address.toLowerCase(),
      );
    },
  );
  await check(
    "standalone swap has both Permit2 approvals and exact router encoding",
    async () => {
      await go(p, "/swap");
      await p.getByLabel("You pay · IMD").fill("1");
      await p
        .getByRole("button", { name: "Get swap quote", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Approve IMD to Permit2", exact: true })
        .click();
      await settle(p);
      await p
        .getByRole("button", {
          name: "Authorize router in Permit2",
          exact: true,
        })
        .click();
      await settle(p);
      const auth = f.transactions.at(-1);
      assert.equal(auth.to.toLowerCase(), manifest.network.uniswapV4.permit2);
      assert.equal(
        auth.args[1].toLowerCase(),
        manifest.network.uniswapV4.universalRouter,
      );
      await p
        .getByRole("button", { name: "Swap IMD for DROP", exact: true })
        .click();
      await settle(p);
      const tx = f.transactions.at(-1);
      assert.equal(
        tx.to.toLowerCase(),
        manifest.network.uniswapV4.universalRouter,
      );
      assert.equal(tx.args[0], "0x10");
      assert.ok(!tx.value || BigInt(tx.value) === 0n);
      const [actions] = decodeAbiParameters(
        parseAbiParameters("bytes,bytes[]"),
        tx.args[1][0],
      );
      assert.equal(actions, "0x060c0f");
    },
  );
  await check(
    "failed simulation prevents signing; wallet transaction rejection recovers",
    async () => {
      await p
        .getByRole("button", { name: "Get swap quote", exact: true })
        .click();
      f.failSimulation = true;
      const before = f.transactions.length;
      await p
        .getByRole("button", { name: "Swap IMD for DROP", exact: true })
        .click();
      await expect(p.getByRole("alert")).toBeVisible({ timeout: 20000 });
      assert.equal(f.transactions.length, before);
      f.failSimulation = false;
      f.rejectTx = true;
      await p
        .getByRole("button", { name: "Swap IMD for DROP", exact: true })
        .click();
      await expect(
        p.getByRole("alert").filter({ hasText: "declined" }),
      ).toBeVisible();
      assert.equal(f.transactions.length, before);
    },
  );
  await check(
    "DROP transfer, allowance revocation and delegated transfer have working controls",
    async () => {
      await p
        .getByText("DROP transfer & allowance tools", { exact: true })
        .click();
      await p
        .getByLabel("Recipient address or ENS", { exact: true })
        .fill(f.peer.address);
      await p.getByLabel("Amount · DROP", { exact: true }).fill("2");
      await p
        .getByRole("button", {
          name: "Review address & allowance",
          exact: true,
        })
        .click();
      await p
        .getByRole("button", { name: "Confirm DROP transfer", exact: true })
        .click();
      await settle(p);
      assert.equal(f.transactions.at(-1).name, "transfer");
      assert.equal(f.transactions.at(-1).args[1], 2n * 10n ** 18n);
      await p.getByLabel("Action", { exact: true }).selectOption("approve");
      await p.getByLabel("Allowance · DROP", { exact: true }).fill("0");
      await p
        .getByRole("button", {
          name: "Review address & allowance",
          exact: true,
        })
        .click();
      await p
        .getByRole("button", { name: "Set DROP allowance", exact: true })
        .click();
      await settle(p);
      assert.equal(f.transactions.at(-1).name, "approve");
      assert.equal(f.transactions.at(-1).args[1], 0n);
      await p
        .getByLabel("Action", { exact: true })
        .selectOption("transferFrom");
      await p
        .getByLabel("From address or ENS", { exact: true })
        .fill(f.peer.address);
      await p
        .getByLabel("Recipient address or ENS", { exact: true })
        .fill(f.closed.address);
      await p.getByLabel("Amount · DROP", { exact: true }).fill("1");
      await p
        .getByRole("button", {
          name: "Review address & allowance",
          exact: true,
        })
        .click();
      await p
        .getByRole("button", { name: "Confirm DROP transfer", exact: true })
        .click();
      await settle(p);
      const tx = f.transactions.at(-1);
      assert.equal(tx.name, "transferFrom");
      assert.equal(tx.args[0].toLowerCase(), f.peer.address.toLowerCase());
      assert.equal(tx.args[1].toLowerCase(), f.closed.address.toLowerCase());
    },
  );
  await check(
    "unknown receipt status blocks duplicate transactions and supports confirmation recovery",
    async () => {
      await p.clock.install();
      f.receiptHold = true;
      const before = f.transactions.length;
      await p
        .getByRole("button", { name: "Confirm DROP transfer", exact: true })
        .click();
      await expect(
        p.getByRole("button", {
          name: /Confirm DROP transfer — Waiting for confirmation/,
        }),
      ).toBeVisible();
      await p.clock.fastForward(180001);
      await expect(
        p.getByRole("button", {
          name: "Check transaction confirmation",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        p.getByRole("button", { name: "Confirm DROP transfer", exact: true }),
      ).toHaveCount(0);
      assert.equal(f.transactions.length, before + 1);
      f.receiptHold = false;
      f.receiptAt.set(f.transactions.at(-1).hash, 0);
      await p
        .getByRole("button", {
          name: "Check transaction confirmation",
          exact: true,
        })
        .click();
      await expect(
        p.getByRole("button", {
          name: "Check transaction confirmation",
          exact: true,
        }),
      ).toHaveCount(0);
      assert.equal(f.transactions.length, before + 1);
    },
  );
  await check(
    "account change clears inbox secret and private rendered content",
    async () => {
      await go(p, "/inbox");
      await expect(
        p.getByText("The package is behind the third brick.", { exact: true }),
      ).toBeVisible();
      f.account = f.closed.address;
      await p.evaluate(
        (address) =>
          (window as any).testWalletEmit("accountsChanged", [address]),
        f.closed.address,
      );
      await expect(
        p.getByText("The package is behind the third brick.", { exact: true }),
      ).toHaveCount(0);
      await expect(
        p.getByRole("button", { name: "Sign to unlock inbox", exact: true }),
      ).toBeVisible();
    },
  );
  const fresh = await new MockChain().init();
  fresh.ownOpen = false;
  const p2 = await pageFor(fresh);
  await verified(p2);
  await connect(p2);
  await check(
    "new sender opens a drop through a signature and separate on-chain action",
    async () => {
      await go(p2, "/inbox");
      await p2.getByLabel("Your price to read · IMD").fill("3");
      await p2
        .getByRole("button", { name: "Sign to unlock inbox", exact: true })
        .click();
      await p2
        .getByRole("button", { name: "Open my drop on chain", exact: true })
        .click();
      await settle(p2);
      assert.equal(fresh.transactions.at(-1).name, "openDrop");
      assert.equal(
        fresh.transactions.at(-1).args[0],
        bytesToHex(fresh.key.publicKey),
      );
      assert.equal(fresh.transactions.at(-1).args[1], 3n * 10n ** 18n);
      await expect(
        p2.getByText("Your drop is open", { exact: true }),
      ).toBeVisible();
    },
  );
  await check(
    "ownership transfer requires proposal and acceptance by the pending owner",
    async () => {
      await p2.getByText("Contract owner settings", { exact: true }).click();
      await p2
        .getByLabel("New owner address or ENS", { exact: true })
        .fill(fresh.peer.address);
      await expect(
        p2.getByRole("button", { name: "Propose new owner", exact: true }),
      ).toBeDisabled();
      await p2
        .getByLabel("I understand the new owner must accept this transfer.")
        .check();
      await p2
        .getByRole("button", { name: "Propose new owner", exact: true })
        .click();
      await settle(p2);
      assert.equal(
        fresh.pendingOwner.toLowerCase(),
        fresh.peer.address.toLowerCase(),
      );
      fresh.account = fresh.peer.address;
      await p2.evaluate(
        (address) =>
          (window as any).testWalletEmit("accountsChanged", [address]),
        fresh.peer.address,
      );
      await p2.getByText("Contract owner settings", { exact: true }).waitFor();
      const settings = p2.locator("details").filter({
        has: p2.getByText("Contract owner settings", { exact: true }),
      });
      if ((await settings.getAttribute("open")) === null)
        await p2.getByText("Contract owner settings", { exact: true }).click();
      await p2
        .getByRole("button", { name: "Accept ownership", exact: true })
        .click();
      await settle(p2);
      assert.equal(fresh.owner.toLowerCase(), fresh.peer.address.toLowerCase());
    },
  );
  const missing = await new MockChain().init();
  missing.codeMissing = true;
  const p3 = await pageFor(missing);
  await check(
    "missing contract code keeps transaction controls disabled",
    async () => {
      await connect(p3);
      await go(p3, "/swap");
      await expect(
        p3
          .getByText(
            "Transactions are disabled until deployment checks succeed.",
            { exact: false },
          )
          .first(),
      ).toBeVisible();
      assert.equal(missing.transactions.length, 0);
    },
  );
  const smart = await new MockChain().init();
  smart.smart = true;
  const p4 = await pageFor(smart);
  await verified(p4);
  await connect(p4);
  await check(
    "smart contract wallet shows unsupported state and cannot derive inbox key",
    async () => {
      await go(p4, "/inbox");
      await expect(
        p4
          .getByText(
            "Smart contract wallets are not supported for inbox encryption.",
            { exact: false },
          )
          .first(),
      ).toBeVisible();
      await expect(
        p4.getByRole("button", { name: "Sign to unlock inbox", exact: true }),
      ).toHaveCount(0);
    },
  );
  const p5 = await pageFor(await new MockChain().init(), false);
  await check(
    "no injected wallet gives clear installation/browser guidance",
    async () => {
      await p5
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await expect(p5.getByRole("alert")).toContainText(
        "No browser wallet found",
      );
    },
  );
  await check(
    "no unexpected browser exceptions or console errors in covered flows",
    async () => {
      assert.deepEqual(report.errors, []);
      return { errors: 0 };
    },
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  fs.writeFileSync(
    path.join(evidence, "browser-results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  for (const c of contexts) await c.close();
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
  console.log(
    JSON.stringify(
      report.checks.map((c) => ({ name: c.name, status: c.status })),
      null,
      2,
    ),
  );
}
