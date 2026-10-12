import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  bytesToHex,
  createWalletClient,
  custom,
  getAddress,
  recoverMessageAddress,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { normalize } from "viem/ens";
import { type Config, walletReadClient } from "./config";
import { deriveKey, destroyKey, KEY_MESSAGE, type SessionKey } from "./crypto";
import { erc20Abi, errorText, same } from "./protocol";
export type Injected = EIP1193Provider & { providers?: Injected[] };
declare global {
  interface Window {
    ethereum?: Injected;
  }
}
export type Tx = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};
export type ActionState = {
  pending: boolean;
  stage: string;
  error?: string;
  hash?: Hex;
  success?: boolean;
  uncertain?: boolean;
};
export interface Stats {
  stamp: bigint;
  noteCount: bigint;
  answeredCount: bigint;
  totalImdSpent: bigint;
  totalDropBurned: bigint;
  owner: Address;
  pendingOwner: Address;
  imdBalance?: bigint;
  dropBalance?: bigint;
  earned?: bigint;
  knocks?: bigint;
  timestamp: bigint;
}
export interface Drop {
  key: Hex;
  price: bigint;
}
function useModel(config: Config) {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [providers, setProviders] = useState<
    { name: string; provider: Injected }[]
  >([]);
  const [provider, setProvider] = useState<Injected>();
  const [key, setKey] = useState<SessionKey>();
  const keyRef = useRef<SessionKey | undefined>(undefined);
  const [verified, setVerified] = useState(false);
  const [readError, setReadError] = useState("");
  const [stats, setStats] = useState<Stats>();
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const busy = useRef(false);
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const [smartWallet, setSmartWallet] = useState(false);
  const correctChain = chainId === config.deployment.chainId;
  const lock = useCallback(() => {
    destroyKey(keyRef.current);
    keyRef.current = undefined;
    setKey(undefined);
  }, []);
  useEffect(() => {
    const announce = (event: Event) => {
      const d = (
        event as CustomEvent<{ info: { name: string }; provider: Injected }>
      ).detail;
      setProviders((p) =>
        p.some((x) => x.provider === d.provider)
          ? p
          : [...p, { name: d.info.name, provider: d.provider }],
      );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (window.ethereum)
      setProviders((p) =>
        p.length
          ? p
          : (window.ethereum!.providers ?? [window.ethereum!]).map((p, i) => ({
              name: i ? "Browser wallet " + (i + 1) : "Browser wallet",
              provider: p,
            })),
      );
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  const read = useCallback(
    async <T,>(tx: Tx): Promise<T> => {
      try {
        return (await config.publicClient.readContract(tx as never)) as T;
      } catch (error) {
        if (provider && correctChain) {
          return (await walletReadClient(config, provider).readContract(
            tx as never,
          )) as T;
        }
        throw error;
      }
    },
    [config, provider, correctChain],
  );
  const appRead = useCallback(
    <T,>(functionName: string, args: readonly unknown[] = []): Promise<T> =>
      read<T>({
        address: config.app.address,
        abi: config.app.abi,
        functionName,
        args,
      }),
    [read, config],
  );
  const getDrop = useCallback(
    async (address: Address, blockNumber?: bigint): Promise<Drop> => {
      const result =
        blockNumber !== undefined
          ? ((await config.publicClient.readContract({
              address: config.app.address,
              abi: config.app.abi,
              functionName: "drops",
              args: [address],
              blockNumber,
            })) as [Hex, bigint])
          : await appRead<[Hex, bigint]>("drops", [address]);
      return { key: result[0], price: result[1] };
    },
    [config, appRead],
  );
  const refresh = useCallback(async () => {
    const gen = generation.current;
    try {
      const client = config.publicClient;
      const id = await client.getChainId();
      if (id !== config.deployment.chainId)
        throw new Error(
          "The RPC reports the wrong chain. Transactions are disabled.",
        );
      const codes = await Promise.all(
        [
          config.app.address,
          config.token.address,
          config.deployment.network.pairToken.address,
        ].map((address) => client.getBytecode({ address })),
      );
      if (codes.some((c) => !c || c === "0x"))
        throw new Error(
          "Deployed contract code is unavailable from the RPC. Transactions are disabled; refresh to retry.",
        );
      const [drop, imd, manager, pool, imdDecimals, dropDecimals] =
        await Promise.all([
          appRead<Address>("DROP"),
          appRead<Address>("IMD"),
          appRead<Address>("POOL_MANAGER"),
          appRead<Config["deployment"]["poolKey"]>("poolKey"),
          read<number>({
            address: config.deployment.network.pairToken.address,
            abi: erc20Abi,
            functionName: "decimals",
          }),
          read<number>({
            address: config.token.address,
            abi: config.token.abi,
            functionName: "decimals",
          }),
        ]);
      const expected = config.deployment.poolKey;
      if (
        !same(drop, config.token.address) ||
        !same(imd, config.deployment.network.pairToken.address) ||
        !same(manager, config.deployment.network.uniswapV4.poolManager) ||
        !same(pool.currency0, expected.currency0) ||
        !same(pool.currency1, expected.currency1) ||
        !same(pool.hooks, expected.hooks) ||
        pool.fee !== expected.fee ||
        pool.tickSpacing !== expected.tickSpacing ||
        imdDecimals !== config.deployment.network.pairToken.decimals ||
        dropDecimals !== 18
      )
        throw new Error(
          "On-chain token or pool settings differ from the deployment. Transactions are disabled.",
        );
      const names = [
        "stamp",
        "noteCount",
        "answeredCount",
        "totalImdSpent",
        "totalDropBurned",
        "owner",
        "pendingOwner",
      ];
      const values = await Promise.all(
        names.map((n) => appRead<bigint | Address>(n)),
      );
      const block = await client.getBlock();
      const next = Object.fromEntries(
        names.map((n, i) => [n, values[i]]),
      ) as unknown as Stats;
      next.timestamp = block.timestamp;
      if (account) {
        const [imdBalance, dropBalance, earned, knocks, code] =
          await Promise.all([
            read<bigint>({
              address: imd,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [account],
            }),
            read<bigint>({
              address: drop,
              abi: config.token.abi,
              functionName: "balanceOf",
              args: [account],
            }),
            appRead<bigint>("earned", [account]),
            appRead<bigint>("knocks", [account]),
            client.getBytecode({ address: account }),
          ]);
        Object.assign(next, { imdBalance, dropBalance, earned, knocks });
        if (gen === generation.current) setSmartWallet(!!code && code !== "0x");
      }
      if (gen !== generation.current) return;
      setStats(next);
      setVerified(true);
      setReadError("");
      setRevision((n) => n + 1);
    } catch (e) {
      if (gen === generation.current) {
        setVerified(false);
        setReadError(errorText(e));
      }
    }
  }, [config, appRead, read, account]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!account) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy.current)
        void refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [refresh, account]);
  useEffect(() => {
    if (!provider) return;
    const changed = (data: unknown) => {
      generation.current++;
      lock();
      setStats(undefined);
      setSmartWallet(false);
      setActions({});
      setAccount(
        (data as string[])[0] ? getAddress((data as string[])[0]) : undefined,
      );
    };
    const chain = (data: unknown) => {
      generation.current++;
      lock();
      setChainId(Number(data));
      setActions({});
    };
    const disconnected = () => changed([]);
    provider.on?.("accountsChanged", changed);
    provider.on?.("chainChanged", chain);
    provider.on?.("disconnect", disconnected);
    return () => {
      provider.removeListener?.("accountsChanged", changed);
      provider.removeListener?.("chainChanged", chain);
      provider.removeListener?.("disconnect", disconnected);
    };
  }, [provider, lock]);
  useEffect(() => () => destroyKey(keyRef.current), []);
  async function run(
    id: string,
    work: (update: (state: Partial<ActionState>) => void) => Promise<void>,
  ) {
    if (busy.current) return false;
    busy.current = true;
    const gen = generation.current;
    const update = (state: Partial<ActionState>) => {
      if (gen === generation.current)
        setActions((s) => ({ ...s, [id]: { ...s[id], ...state } }));
    };
    update({
      pending: true,
      stage: "Working…",
      error: undefined,
      hash: undefined,
      success: false,
      uncertain: false,
    });
    try {
      await work(update);
      update({ success: true, stage: "Complete" });
      return true;
    } catch (e) {
      update({ error: errorText(e), stage: "Request stopped" });
      return false;
    } finally {
      busy.current = false;
      update({ pending: false });
    }
  }
  async function connect(selected?: Injected) {
    await run("connect", async (update) => {
      update({ stage: "Connect in your wallet…" });
      const p = selected ?? providers[0]?.provider ?? window.ethereum;
      if (!p)
        throw new Error(
          "No browser wallet found. Open this site in a wallet browser or install an Ethereum wallet.",
        );
      const accounts = (await p.request({
        method: "eth_requestAccounts",
      })) as Address[];
      const id = await p.request({ method: "eth_chainId" });
      generation.current++;
      lock();
      setProvider(p);
      setAccount(accounts[0] ? getAddress(accounts[0]) : undefined);
      setChainId(Number(id));
      setActions({});
    });
  }
  function disconnect() {
    generation.current++;
    lock();
    setAccount(undefined);
    setProvider(undefined);
    setChainId(undefined);
    setActions({});
    setStats(undefined);
  }
  async function switchChain() {
    await run("network", async (update) => {
      if (!provider) throw new Error("Connect your wallet first.");
      update({ stage: `Switch to ${config.chain.name}…` });
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${config.chain.id.toString(16)}` }],
        });
      } catch (e) {
        const err = e as { code?: number; message?: string };
        if (
          err.code !== 4902 &&
          !/unknown chain|unrecognized chain|not added/i.test(err.message ?? "")
        )
          throw e;
        if (!config.deployment.walletAddChain)
          throw new Error("This network has no approved wallet configuration.");
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [config.deployment.walletAddChain],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${config.chain.id.toString(16)}` }],
        });
      }
      setChainId(Number(await provider.request({ method: "eth_chainId" })));
    });
  }
  async function assertWallet() {
    if (!provider || !account) throw new Error("Connect your wallet first.");
    const [id, list] = await Promise.all([
      provider.request({ method: "eth_chainId" }),
      provider.request({ method: "eth_accounts" }),
    ]);
    if (Number(id) !== config.chain.id)
      throw new Error(`Switch to ${config.chain.name} first.`);
    if (!same((list as string[])[0], account))
      throw new Error("The wallet account changed. Connect again.");
    return createWalletClient({
      chain: config.chain,
      account,
      transport: custom(provider),
    });
  }
  async function unlock() {
    await run("unlock", async (update) => {
      if (!verified)
        throw new Error("Wait for deployment verification before signing.");
      const wallet = await assertWallet();
      const code = await config.publicClient.getBytecode({ address: account! });
      if (code && code !== "0x")
        throw new Error(
          "Smart contract wallets are not supported for inbox encryption. Connect an externally owned wallet.",
        );
      update({ stage: "Sign the inbox message in your wallet…" });
      const gen = generation.current;
      const signature = await wallet.signMessage({ message: KEY_MESSAGE });
      const signer = await recoverMessageAddress({
        message: KEY_MESSAGE,
        signature,
      });
      if (!same(signer, account))
        throw new Error(
          "This signature does not belong to the connected wallet.",
        );
      const derived = await deriveKey(signature);
      if (gen !== generation.current) {
        destroyKey(derived);
        throw new Error("The wallet changed while signing. Try again.");
      }
      const existing = await getDrop(account!);
      if (gen !== generation.current) {
        destroyKey(derived);
        throw new Error("The wallet changed while unlocking. Try again.");
      }
      if (
        existing.key !== `0x${"0".repeat(64)}` &&
        !same(existing.key, bytesToHex(derived.publicKey))
      ) {
        destroyKey(derived);
        throw new Error(
          "This signature produces a different inbox key. Use the original signing wallet; replacing the key would make old notes unreadable.",
        );
      }
      destroyKey(keyRef.current);
      keyRef.current = derived;
      setKey(derived);
    });
  }
  async function transact(id: string, make: () => Promise<Tx> | Tx) {
    if (Object.values(actions).some((action) => action.uncertain)) return false;
    return run(id, async (update) => {
      if (!verified)
        throw new Error(
          "Deployment verification must succeed before a transaction.",
        );
      const gen = generation.current;
      const wallet = await assertWallet();
      const tx = await make();
      update({ stage: "Simulating transaction…" });
      const { request } = await config.publicClient.simulateContract({
        ...tx,
        account,
      } as never);
      await assertWallet();
      if (gen !== generation.current)
        throw new Error("Wallet changed; review and try again.");
      update({ stage: "Confirm in your wallet…" });
      const hash = await wallet.writeContract(request as never);
      update({ hash, stage: "Waiting for confirmation…" });
      let receipt;
      try {
        receipt = await config.publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
          timeout: 180000,
        });
      } catch {
        update({ uncertain: true });
        throw new Error(
          "The transaction was submitted, but confirmation is unavailable. Check its status below before sending anything else.",
        );
      }
      if (receipt.status !== "success")
        throw new Error(
          "The transaction reverted. Your wallet paid network gas; refresh before trying again.",
        );
      update({ stage: "Refreshing confirmed state…" });
      await refresh();
    });
  }
  async function checkConfirmation(id: string) {
    const hash = actions[id]?.hash;
    const gen = generation.current;
    if (!hash) return;
    await run(`confirm-${id}`, async () => {
      const receipt = await config.publicClient.getTransactionReceipt({ hash });
      await refresh();
      if (generation.current !== gen) return;
      setActions((states) => ({
        ...states,
        [id]: {
          ...states[id],
          uncertain: false,
          success: receipt.status === "success",
          error:
            receipt.status === "success"
              ? undefined
              : "Transaction reverted. The transaction spent gas; review before trying again.",
        },
      }));
    });
  }
  async function resolve(value: string): Promise<Address> {
    const input = value.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(input)) return getAddress(input);
    if (!input.includes("."))
      throw new Error("Enter a complete Ethereum address or ENS name.");
    const resolved = await config.publicClient.getEnsAddress({
      name: normalize(input),
    });
    if (!resolved)
      throw new Error(
        "This ENS name has no Ethereum address. Check the name and try again.",
      );
    return resolved;
  }
  return {
    config,
    account,
    chainId,
    correctChain,
    provider,
    providers,
    key,
    smartWallet,
    verified,
    stats,
    readError,
    actions,
    revision,
    read,
    appRead,
    getDrop,
    refresh,
    run,
    connect,
    disconnect,
    switchChain,
    unlock,
    lock,
    transact,
    checkConfirmation,
    uncertainActions: Object.entries(actions).filter(
      ([, action]) => action.uncertain,
    ),
    resolve,
    isBusy: Object.values(actions).some((a) => a.pending),
  };
}
type Model = ReturnType<typeof useModel>;
const Context = createContext<Model | null>(null);
export const useApp = () => {
  const c = useContext(Context);
  if (!c) throw new Error("Missing application state.");
  return c;
};
export function AppProvider({
  config,
  children,
}: {
  config: Config;
  children: ReactNode;
}) {
  const model = useModel(config);
  return <Context.Provider value={model}>{children}</Context.Provider>;
}
