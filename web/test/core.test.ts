import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import nacl from "tweetnacl";
import {
  bytesToHex,
  decodeAbiParameters,
  parseAbiParameters,
  hexToBytes,
} from "viem";
import {
  deriveKey,
  seal,
  unseal,
  sealedBytes,
  MAX_TEXT_BYTES,
  destroyKey,
} from "../src/crypto";
import { amount, minimum, swapInput, errorText } from "../src/protocol";
import { abiHash, type PoolKey } from "../src/config";
import { requireFresh } from "../src/quote";
const handoff = JSON.parse(
  readFileSync(new URL("../deployment/handoff.json", import.meta.url), "utf8"),
);
const pool: PoolKey = handoff.poolKey;
test("pinned canonical ABI hashes match both implementation exports", () => {
  for (const c of handoff.contracts)
    assert.equal(
      abiHash(
        JSON.parse(
          readFileSync(
            new URL(`../../docs/abi/${c.name}.json`, import.meta.url),
            "utf8",
          ),
        ),
      ),
      c.abiHash,
    );
});
test("signature derivation is deterministic and operates on raw hex bytes", async () => {
  const signature = bytesToHex(nacl.randomBytes(65));
  const a = await deriveKey(signature),
    b = await deriveKey(signature);
  assert.deepEqual(a, b);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(hexToBytes(signature)),
  );
  assert.deepEqual(a.secretKey, new Uint8Array(hash));
  destroyKey(a);
  assert.ok(a.secretKey.every((x) => x === 0));
});
test("NaCl protocol lets sender and recipient reread, replies reverse direction", () => {
  const a = nacl.box.keyPair(),
    b = nacl.box.keyPair();
  const boxed = seal("Hello, 世界 🧱", bytesToHex(b.publicKey), a);
  assert.equal(unseal(boxed, bytesToHex(a.publicKey), b), "Hello, 世界 🧱");
  assert.equal(unseal(boxed, bytesToHex(b.publicKey), a), "Hello, 世界 🧱");
  const reply = seal("Reply", bytesToHex(a.publicKey), b);
  assert.equal(unseal(reply, bytesToHex(b.publicKey), a), "Reply");
  assert.notEqual(boxed, seal("Hello, 世界 🧱", bytesToHex(b.publicKey), a));
});
test("enforces sealed UTF-8 boundary and rejects tampering, wrong key and version", () => {
  const a = nacl.box.keyPair(),
    b = nacl.box.keyPair();
  assert.equal(MAX_TEXT_BYTES, 983);
  const text = "x".repeat(983);
  const encrypted = seal(text, bytesToHex(b.publicKey), a);
  assert.equal(hexToBytes(encrypted).length, 1024);
  assert.equal(sealedBytes("🧱"), 45);
  assert.throws(() => seal(text + "x", bytesToHex(b.publicKey), a));
  assert.throws(() => seal("", bytesToHex(b.publicKey), a));
  assert.throws(() =>
    unseal(encrypted, bytesToHex(a.publicKey), nacl.box.keyPair()),
  );
  const bad = hexToBytes(encrypted);
  bad[40] ^= 1;
  assert.throws(() => unseal(bytesToHex(bad), bytesToHex(a.publicKey), b));
  bad[0] = 2;
  assert.throws(() => unseal(bytesToHex(bad), bytesToHex(a.publicKey), b));
});
test("amounts reject exponent, negative, excess precision and unsafe slippage", () => {
  assert.equal(amount("1.234567", 6), 1234567n);
  for (const s of ["-1", "1e3", "abc", "0", "1.1234567"])
    assert.throws(() => amount(s, 6));
  assert.equal(amount("0", 18, true), 0n);
  assert.equal(minimum(10000n, "1"), 9900n);
  assert.throws(() => minimum(10000n, "0"));
  assert.throws(() => minimum(10000n, "5.1"));
  assert.throws(() => minimum(1n, "1"));
});
test("router bytes use attested key, correct direction and five-field tuple", () => {
  for (const input of [pool.currency0, pool.currency1]) {
    const encoded = swapInput(pool, input, 100n, 90n);
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters("bytes,bytes[]"),
      encoded,
    );
    assert.equal(actions, "0x060c0f");
    const [swap] = decodeAbiParameters(
      parseAbiParameters(
        "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
      ),
      params[0],
    );
    assert.equal(swap.poolKey.hooks.toLowerCase(), pool.hooks);
    assert.equal(swap.poolKey.fee, pool.fee);
    assert.equal(swap.zeroForOne, input === pool.currency0);
    assert.equal(swap.amountIn, 100n);
    assert.equal(swap.amountOutMinimum, 90n);
    assert.equal(swap.hookData, "0x");
    const [settle, max] = decodeAbiParameters(
      parseAbiParameters("address,uint256"),
      params[1],
    );
    const [take, min] = decodeAbiParameters(
      parseAbiParameters("address,uint256"),
      params[2],
    );
    assert.equal(settle.toLowerCase(), input);
    assert.equal(
      take.toLowerCase(),
      input === pool.currency0 ? pool.currency1 : pool.currency0,
    );
    assert.equal(max, 100n);
    assert.equal(min, 90n);
  }
});
test("extended router tuple adds minHopPriceX36 before hookData", () => {
  const [, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    swapInput(pool, pool.currency0, 100n, 90n, true),
  );
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)",
    ),
    params[0],
  );
  assert.equal(swap.minHopPriceX36, 0n);
  assert.equal(swap.hookData, "0x");
});
test("stale or mismatched quote fails closed", () => {
  const q = {
    input: pool.currency1,
    amount: 100n,
    out: 120n,
    min: 118n,
    created: Date.now(),
    slippage: "1",
  };
  assert.equal(requireFresh(q, q.input, 100n, "1"), q);
  assert.throws(() =>
    requireFresh({ ...q, created: Date.now() - 61000 }, q.input, 100n, "1"),
  );
  assert.throws(() => requireFresh(q, q.input, 101n, "1"));
  assert.throws(() => requireFresh(q, q.input, 100n, "2"));
  assert.throws(() => requireFresh(q, pool.currency0, 100n, "1"));
});
test("rejects low-order recipient keys before sealing plaintext", () => {
  const key = nacl.box.keyPair();
  assert.throws(
    () => seal("private", bytesToHex(new Uint8Array(32)), key),
    /invalid encryption key/,
  );
});
test("decodes actionable errors and wallet rejection", () => {
  assert.equal(
    errorText({
      shortMessage: "The contract reverted with the following reason:",
      message:
        "The contract reverted with the following reason:\nPool liquidity unavailable\nContract Call:",
    }),
    "Pool liquidity unavailable",
  );
  assert.match(errorText({ cause: { code: 4001 } }), /declined/);
  assert.match(
    errorText({ cause: { data: { errorName: "TipBelowPrice" } } }),
    /changed their price/,
  );
  assert.match(errorText(new Error("insufficient funds")), /ETH/);
});

test("old answered notes use bounded private event queries through the current head", async () => {
  const { ownNotes } = await import("../src/history");
  const abi = JSON.parse(
    readFileSync(
      new URL("../../docs/abi/DeadDrop.json", import.meta.url),
      "utf8",
    ),
  );
  const calls: any[] = [];
  const config = {
    app: { address: pool.hooks, abi },
    publicClient: {
      getBlockNumber: async () => 50000n,
      readContract: async () => [
        pool.currency0,
        1000n,
        true,
        false,
        pool.currency1,
        5n,
      ],
      getLogs: async (request: any) => {
        calls.push(request);
        assert.ok(request.toBlock - request.fromBlock < 9999n);
        if (request.event.name === "Left") {
          assert.deepEqual(request.args, { to: pool.currency1 });
          return request.fromBlock <= 15000n && request.toBlock >= 15000n
            ? [
                {
                  removed: false,
                  blockNumber: 15000n,
                  args: {
                    id: 1n,
                    from: pool.currency0,
                    to: pool.currency1,
                    tip: 5n,
                    escrow: 5n,
                    note: "0x01",
                  },
                },
              ]
            : [];
        }
        assert.deepEqual(request.args, { id: 1n });
        return request.fromBlock <= 20000n && request.toBlock >= 20000n
          ? [{ blockNumber: 20000n, args: { reply: "0x02" } }]
          : [];
      },
    },
  } as unknown as import("../src/config").Config;
  const notes = await ownNotes(config, pool.currency1, "inbox", 10000n, 19999n);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].reply, "0x02");
  assert.equal(notes[0].replyBlock, 20000n);
  assert.ok(calls.filter((c) => c.event.name === "Answered").length > 1);
});
