import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  custom,
  keccak256,
  toBytes,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}
export interface Deployment {
  version: number;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  poolKey: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
    pairToken: {
      address: Address;
      name: string;
      symbol: string;
      decimals: number;
    };
  };
  walletAddChain?: {
    chainId: Hex;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
  assets: { path: string; sha256: string }[];
}
export const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
export const abiHash = (abi: unknown) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
const safePath = (p: string) =>
  /^[\w./-]+$/.test(p) && !p.startsWith("/") && !p.split("/").includes("..");
async function json(path: string) {
  const r = await fetch(new URL(path, document.baseURI));
  if (!r.ok) throw new Error(`Unable to load ${path}. Reload the site.`);
  return r.json();
}
export async function loadConfig() {
  const deployment: Deployment = await json("imd-deployment.json");
  if (
    deployment.version !== 1 ||
    deployment.network.chainId !== deployment.chainId ||
    !deployment.poolKey
  )
    throw new Error(
      "Deployment configuration is invalid. Transactions are disabled.",
    );
  const contracts = await Promise.all(
    deployment.contracts.map(async (c) => {
      if (!safePath(c.abiPath)) throw new Error("Invalid ABI path.");
      const abi: Abi = await json(c.abiPath);
      if (!Array.isArray(abi) || abiHash(abi) !== c.abiHash)
        throw new Error(
          `${c.name} ABI verification failed. Transactions are disabled.`,
        );
      return { ...c, abi };
    }),
  );
  const app = contracts.find((c) => c.name === "DeadDrop"),
    token = contracts.find((c) => c.name === "LaunchToken");
  if (!app || !token)
    throw new Error("The deployment is missing a required contract.");
  const history: { blockNumber: number } = await json("history-start.json");
  if (!Number.isSafeInteger(history.blockNumber) || history.blockNumber < 0)
    throw new Error("Invalid history start.");
  // ENS contracts come from viem's Ethereum chain metadata, never used for swaps.
  const chain = defineChain({
    ...(deployment.chainId === mainnet.id ? mainnet : {}),
    id: deployment.chainId,
    name: deployment.network.name,
    nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: {
      default: { name: "Explorer", url: deployment.network.explorer },
    },
  });
  const publicClient = createPublicClient({
    chain,
    ccipRead: false,
    transport: fallback(
      deployment.network.rpcUrls.map((url) =>
        http(url, { timeout: 12000, retryCount: 1 }),
      ),
    ),
    batch: { multicall: false },
  });
  return {
    deployment,
    app,
    token,
    chain,
    publicClient,
    historyStart: BigInt(history.blockNumber),
  };
}
export type Config = Awaited<ReturnType<typeof loadConfig>>;
export function walletReadClient(config: Config, provider: EIP1193Provider) {
  return createPublicClient({
    chain: config.chain,
    ccipRead: false,
    transport: custom(provider),
  });
}
