import {
  createPublicClient,
  defineChain,
  http,
  keccak256,
  type Abi,
} from "viem";
import fs from "node:fs";
import path from "node:path";
import { quoterAbi } from "../src/protocol";
const root = path.resolve(import.meta.dirname, "../..");
const d = JSON.parse(
  fs.readFileSync(path.join(root, "dist/imd-deployment.json"), "utf8"),
);
const app = d.contracts.find((c: any) => c.name === "DeadDrop");
const abi: Abi = JSON.parse(
  fs.readFileSync(path.join(root, "dist", app.abiPath), "utf8"),
);
const chain = defineChain({
  id: d.chainId,
  name: d.network.name,
  nativeCurrency: d.network.nativeCurrency,
  rpcUrls: { default: { http: d.network.rpcUrls } },
});
const evidence: any = {
  checkedAt: new Date().toISOString(),
  sourceCommit: d.sourceCommit,
  readOnly: true,
  transactionsBroadcast: 0,
  endpoints: [],
};
for (const rpc of d.network.rpcUrls) {
  const client = createPublicClient({
    chain,
    transport: http(rpc, { timeout: 15000, retryCount: 0 }),
  });
  const result: any = { rpc };
  try {
    result.chainId = await client.getChainId();
    result.contracts = await Promise.all(
      d.contracts.map(async (c: any) => {
        const code = await client.getBytecode({ address: c.address });
        return {
          name: c.name,
          address: c.address,
          codeBytes: code ? (code.length - 2) / 2 : 0,
          runtimeCodeKeccak: code ? keccak256(code) : null,
        };
      }),
    );
    result.blockNumber = (await client.getBlockNumber()).toString();
    const values = await Promise.all(
      [
        "DROP",
        "IMD",
        "POOL_MANAGER",
        "poolKey",
        "stamp",
        "noteCount",
        "answeredCount",
        "totalImdSpent",
        "totalDropBurned",
      ].map((functionName) =>
        client.readContract({ address: app.address, abi, functionName }),
      ),
    );
    result.reads = Object.fromEntries(
      [
        "DROP",
        "IMD",
        "POOL_MANAGER",
        "poolKey",
        "stamp",
        "noteCount",
        "answeredCount",
        "totalImdSpent",
        "totalDropBurned",
      ].map((n, i) => [n, values[i]]),
    );
    const response = await client.simulateContract({
      address: d.network.uniswapV4.quoter,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          poolKey: d.poolKey,
          zeroForOne:
            d.poolKey.currency0.toLowerCase() ===
            d.network.pairToken.address.toLowerCase(),
          exactAmount: values[4] as bigint,
          hookData: "0x",
        },
      ],
    });
    result.stampQuote = {
      amountIn: values[4],
      amountOut: response.result[0],
      gasEstimate: response.result[1],
    };
    result.status = "passed";
  } catch (e) {
    result.status = "partial-or-failed";
    result.error = (e as Error).message.slice(0, 500);
  }
  evidence.endpoints.push(result);
}
fs.writeFileSync(
  path.join(root, "docs/evidence/live-chain.json"),
  JSON.stringify(
    evidence,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    evidence,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ),
);
