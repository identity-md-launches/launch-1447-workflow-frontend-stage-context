import {
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  formatUnits,
  type Address,
} from "viem";
import type { PoolKey } from "./config";
export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
export const poolComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;
export const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "poolKey", type: "tuple", components: poolComponents },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;
export const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
export const permitAbi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export const same = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const nonzeroKey = (key: string) =>
  /^0x[0-9a-f]{64}$/i.test(key) && !/^0x0+$/.test(key);
export function amount(
  value: string,
  decimals: number,
  allowZero = false,
): bigint {
  if (
    !/^\d+(\.\d+)?$/.test(value) ||
    (value.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(
      `Enter a valid amount with at most ${decimals} decimal places.`,
    );
  const a = parseUnits(value, decimals);
  if (a < 0n || (!allowZero && a === 0n) || a > 2n ** 256n - 1n)
    throw new Error(
      "Enter an amount greater than zero and within the token limit.",
    );
  return a;
}
export function minimum(out: bigint, slippage: string) {
  const bps = amount(slippage, 2, true);
  if (bps < 10n || bps > 500n)
    throw new Error("Slippage must be between 0.1% and 5%.");
  const min = (out * (10000n - bps)) / 10000n;
  if (min === 0n)
    throw new Error("Quote is too small. Increase the input amount.");
  return min;
}
export const displayAmount = (n: bigint | undefined, d = 18) =>
  n === undefined
    ? "—"
    : Number(formatUnits(n, d)).toLocaleString("en-US", {
        maximumFractionDigits: 6,
      });
export function swapInput(
  poolKey: PoolKey,
  input: Address,
  amountIn: bigint,
  min: bigint,
  extended = false,
) {
  const zeroForOne = same(poolKey.currency0, input);
  const output = zeroForOne ? poolKey.currency1 : poolKey.currency0;
  const tuple = extended
    ? parseAbiParameters(
        "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)",
      )
    : parseAbiParameters(
        "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
      );
  if (amountIn >= 2n ** 128n || min >= 2n ** 128n)
    throw new Error("Amount exceeds the router limit.");
  const params = [
    encodeAbiParameters(tuple, [
      {
        poolKey,
        zeroForOne,
        amountIn,
        amountOutMinimum: min,
        ...(extended ? { minHopPriceX36: 0n } : {}),
        hookData: "0x",
      },
    ] as never),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      input,
      amountIn,
    ]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [output, min]),
  ];
  return encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
    "0x060c0f",
    params,
  ]);
}
export const errors: Record<string, string> = {
  NoDrop: "Open your drop before leaving a note.",
  HasDrop: "This wallet has opened its drop. Leave a note instead.",
  SelfNote: "Choose a wallet other than your own.",
  TipBelowPrice:
    "The recipient changed their price. Refresh the drop and update your tip.",
  InsufficientOutput:
    "The price moved beyond your slippage limit. Get a new quote.",
  PartialSwap: "There is not enough pool liquidity for this amount.",
  TooEarly: "The 14-day waiting period has not ended.",
  AlreadyAnswered: "This note has already been answered.",
  AlreadyTakenBack: "This note has already been taken back.",
  NotRecipient: "Only the recipient can answer this note.",
  NotSender: "Only the sender can take back this note.",
  StampOutOfRange: "The stamp must be between 0.01 and 1 IMD.",
  OwnableUnauthorizedAccount: "Only the current owner can change this setting.",
  BadLength: "Shorten the message to fit the sealed byte limit.",
  KeyRequired: "Unlock your session key first.",
  ERC20InsufficientBalance: "Your token balance is too low.",
  ERC20InsufficientAllowance: "Approve the required amount, then try again.",
};
export function errorText(error: unknown): string {
  let e = error as {
    code?: number;
    shortMessage?: string;
    message?: string;
    data?: { errorName?: string };
    cause?: unknown;
  };
  for (let i = 0; e && i < 10; i++, e = e.cause as typeof e) {
    if (e.code === 4001 || e.code === 4100)
      return "The wallet request was declined. You can try again.";
    if (e.data?.errorName && errors[e.data.errorName])
      return errors[e.data.errorName];
    if (e.shortMessage?.includes("reverted") && e.message?.includes("reason:"))
      return (
        e.message.split("reason:")[1].trim().split("\n")[0].slice(0, 180) ||
        "The contract rejected this request. Refresh state and review the amount before trying again."
      );
    if (
      /timed out|failed to fetch|network request failed/i.test(
        e.shortMessage ?? e.message ?? "",
      )
    )
      return "The network could not be reached. Check your connection and refresh chain state.";
    if (/insufficient funds/i.test(e.shortMessage ?? e.message ?? ""))
      return "Not enough ETH for network gas. Add ETH to your wallet and try again.";
  }
  const initial = error as { shortMessage?: string; message?: string };
  return (
    initial.shortMessage ??
    initial.message ??
    "Unable to complete this request. Check your connection and try again."
  )
    .split("\n")[0]
    .slice(0, 240);
}
