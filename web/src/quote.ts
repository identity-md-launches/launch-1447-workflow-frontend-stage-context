import type { Address } from "viem";
import type { Config } from "./config";
import { minimum, quoterAbi, same } from "./protocol";
export interface Quote {
  input: Address;
  amount: bigint;
  out: bigint;
  min: bigint;
  created: number;
  slippage: string;
}
export async function quote(
  config: Config,
  input: Address,
  amount: bigint,
  slippage: string,
): Promise<Quote> {
  if (amount <= 0n || amount >= 2n ** 128n)
    throw new Error("Enter an amount within the pool limit.");
  const response = await config.publicClient.simulateContract({
    address: config.deployment.network.uniswapV4.quoter,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: config.deployment.poolKey,
        zeroForOne: same(config.deployment.poolKey.currency0, input),
        exactAmount: amount,
        hookData: "0x",
      },
    ],
  } as never);
  const result = response.result as unknown as readonly [bigint, bigint];
  return {
    input,
    amount,
    out: result[0],
    min: minimum(result[0], slippage),
    created: Date.now(),
    slippage,
  };
}
export function requireFresh(
  q: Quote | undefined,
  input: Address,
  total: bigint,
  slippage: string,
): Quote {
  if (
    !q ||
    !same(q.input, input) ||
    q.amount !== total ||
    q.slippage !== slippage ||
    Date.now() - q.created > 60000
  )
    throw new Error(
      "Get a fresh quote before continuing. Quotes last 60 seconds.",
    );
  return q;
}
