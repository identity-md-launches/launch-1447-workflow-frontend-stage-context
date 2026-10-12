// Test-only chain model. Accounts and signatures are generated at run time.
// No keys, addresses or fixture code from this file are bundled into the site.
import { readFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  bytesToHex,
  decodeFunctionData,
  encodeFunctionResult,
  encodeEventTopics,
  encodeAbiParameters,
  getAbiItem,
  keccak256,
  toBytes,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { deriveKey, KEY_MESSAGE, seal } from "../src/crypto";
import {
  erc20Abi,
  quoterAbi,
  permitAbi,
  routerAbi,
  same,
} from "../src/protocol";
const read = (file: string) =>
  JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
export const manifest = read("../../dist/imd-deployment.json");
const app = manifest.contracts.find((x: any) => x.name === "DeadDrop");
const token = manifest.contracts.find((x: any) => x.name === "LaunchToken");
const appAbi: Abi = read("../../dist/" + app.abiPath),
  tokenAbi: Abi = read("../../dist/" + token.abiPath);
const network = manifest.network;
const EMPTY_KEY = `0x${"0".repeat(64)}` as Hex;
const NULL_ADDRESS = `0x${"0".repeat(40)}` as Address;
const UNIT = 10n ** 18n;
export class MockChain {
  signer = privateKeyToAccount(generatePrivateKey());
  peer = privateKeyToAccount(generatePrivateKey());
  closed = privateKeyToAccount(generatePrivateKey());
  outsider = privateKeyToAccount(generatePrivateKey());
  account: Address = this.signer.address;
  chain = "0x1";
  known = true;
  ownOpen = true;
  smart = false;
  codeMissing = false;
  bindingMismatch = false;
  quoteFail = false;
  rejectSign = false;
  rejectConnect = false;
  rejectTx = false;
  failSimulation = false;
  rpcFail = false;
  receiptHold = false;
  timestamp = BigInt(Math.floor(Date.now() / 1000));
  block =
    BigInt(read("../deployment/handoff.json").contracts[0].blockNumber) + 1000n;
  price = 5n * UNIT;
  stamp = UNIT / 10n;
  balance = 1000n * UNIT;
  earned = 0n;
  knocks = 0n;
  owner: Address = this.signer.address;
  pendingOwner: Address = NULL_ADDRESS;
  key!: Awaited<ReturnType<typeof deriveKey>>;
  peerKey!: Awaited<ReturnType<typeof deriveKey>>;
  allowances = new Map<string, bigint>();
  permits = new Map<string, [bigint, number, number]>();
  transactions: any[] = [];
  requests: any[] = [];
  notes: any[] = [];
  logs: any[] = [];
  receiptAt = new Map<string, number>();
  signature!: Hex;
  async init() {
    this.signature = await this.signer.signMessage({ message: KEY_MESSAGE });
    this.key = await deriveKey(this.signature);
    this.peerKey = await deriveKey(
      await this.peer.signMessage({ message: KEY_MESSAGE }),
    );
    this.addNote(
      this.peer.address,
      this.signer.address,
      seal(
        "The package is behind the third brick.",
        bytesToHex(this.key.publicKey),
        this.peerKey,
      ),
    );
    this.addNote(
      this.signer.address,
      this.peer.address,
      seal(
        "An unanswered field report.",
        bytesToHex(this.peerKey.publicKey),
        this.key,
      ),
      this.timestamp - 15n * 86400n,
    );
    return this;
  }
  contract(address: string) {
    if (same(address, app.address)) return appAbi;
    if (same(address, token.address)) return tokenAbi;
    if (same(address, network.pairToken.address)) return erc20Abi;
    if (same(address, network.uniswapV4.quoter)) return quoterAbi;
    if (same(address, network.uniswapV4.permit2)) return permitAbi;
    if (same(address, network.uniswapV4.universalRouter)) return routerAbi;
    throw new Error("Unrecognized mocked contract " + address);
  }
  emit(name: string, args: any) {
    const event = getAbiItem({ abi: appAbi, name }) as any;
    const data = encodeAbiParameters(
      event.inputs.filter((x: any) => !x.indexed),
      event.inputs.filter((x: any) => !x.indexed).map((x: any) => args[x.name]),
    );
    this.logs.push({
      address: app.address,
      topics: encodeEventTopics({ abi: appAbi, eventName: name, args }),
      data,
      blockNumber: toHex(this.block),
      transactionHash: keccak256(toBytes(`event-${this.logs.length}`)),
      transactionIndex: "0x0",
      blockHash: keccak256(toBytes("mock block")),
      logIndex: toHex(this.logs.length),
      removed: false,
    });
  }
  addNote(from: Address, to: Address, note: Hex, leftAt = this.timestamp) {
    const id = BigInt(this.notes.length + 1);
    const n = {
      id,
      from,
      to,
      note,
      leftAt,
      answered: false,
      takenBack: false,
      escrow: 5n * UNIT,
      tip: 5n * UNIT,
    };
    this.notes.push(n);
    this.emit("Left", n);
    return id;
  }
  drop(address: string) {
    return same(address, this.peer.address)
      ? [bytesToHex(this.peerKey.publicKey), this.price]
      : same(address, this.signer.address) && this.ownOpen
        ? [bytesToHex(this.key.publicKey), this.price]
        : [EMPTY_KEY, 0n];
  }
  blockObject() {
    return {
      number: toHex(this.block),
      hash: keccak256(toBytes("mock block")),
      parentHash: keccak256(toBytes("parent")),
      nonce: "0x0000000000000000",
      sha3Uncles: keccak256(toBytes("uncles")),
      logsBloom: `0x${"0".repeat(512)}`,
      transactionsRoot: keccak256(toBytes("transactions")),
      stateRoot: keccak256(toBytes("state")),
      receiptsRoot: keccak256(toBytes("receipts")),
      miner: this.owner,
      difficulty: "0x0",
      totalDifficulty: "0x0",
      extraData: "0x",
      size: "0x1",
      gasLimit: "0x1c9c380",
      gasUsed: "0x1",
      timestamp: toHex(this.timestamp),
      transactions: [],
      uncles: [],
      baseFeePerGas: "0x3b9aca00",
      mixHash: keccak256(toBytes("mix")),
    };
  }
  readCall(to: string, data: Hex) {
    const abi = this.contract(to);
    const { functionName, args = [] } = decodeFunctionData({ abi, data }) as {
      functionName: string;
      args: any[];
    };
    const n = functionName;
    let result: any;
    if (
      this.failSimulation &&
      ["leave", "answer", "knock", "takeBack", "execute"].includes(n)
    )
      throw Object.assign(
        new Error("execution reverted: mocked liquidity failure"),
        { code: 3 },
      );
    if (same(to, app.address)) {
      const scalars: any = {
        DROP: token.address,
        IMD: network.pairToken.address,
        POOL_MANAGER: network.uniswapV4.poolManager,
        poolKey: {
          ...manifest.poolKey,
          ...(this.bindingMismatch ? { fee: 500 } : {}),
        },
        stamp: this.stamp,
        noteCount: BigInt(this.notes.length),
        answeredCount: BigInt(this.notes.filter((n) => n.answered).length),
        totalImdSpent: 102n * UNIT,
        totalDropBurned: 2n * UNIT,
        owner: this.owner,
        pendingOwner: this.pendingOwner,
        earned: this.earned,
        knocks: this.knocks,
      };
      if (n in scalars) result = scalars[n];
      else if (n === "drops") result = this.drop(args[0]);
      else if (n === "notes") {
        const note = this.notes[Number(args[0]) - 1];
        result = [
          note.from,
          note.leftAt,
          note.answered,
          note.takenBack,
          note.to,
          note.escrow,
        ];
      } else if (n === "leave") result = BigInt(this.notes.length + 1);
      else if (n === "takeBackAt")
        result = this.notes[Number(args[0]) - 1].leftAt + 1209600n;
    } else if (same(to, network.uniswapV4.quoter)) {
      if (this.quoteFail)
        throw Object.assign(new Error("execution reverted: pool unavailable"), {
          code: 3,
        });
      result = [args[0].exactAmount * 2n, 100000n];
    } else if (same(to, network.uniswapV4.permit2)) {
      if (n === "allowance")
        result = this.permits.get(args[1].toLowerCase()) ?? [0n, 0, 0];
    } else if (same(to, network.uniswapV4.universalRouter)) result = undefined;
    else {
      if (n === "decimals") result = 18;
      else if (n === "symbol")
        result = same(to, token.address) ? "DROP" : "IMD";
      else if (n === "balanceOf") result = this.balance;
      else if (n === "allowance")
        result =
          this.allowances.get(`${to.toLowerCase()}:${args[1].toLowerCase()}`) ??
          0n;
      else if (["approve", "transfer", "transferFrom"].includes(n))
        result = true;
    }
    return encodeFunctionResult({ abi, functionName: n, result } as any);
  }
  rpc(method: string, params: any[] = []): any {
    this.requests.push({ method, params });
    if (this.rpcFail) throw new Error("Mocked RPC unavailable");
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_blockNumber") return toHex(++this.block);
    if (method === "eth_getCode") {
      if (same(params[0], this.signer.address))
        return this.smart ? "0x6000" : "0x";
      if (
        same(params[0], this.peer.address) ||
        same(params[0], this.closed.address)
      )
        return "0x";
      return this.codeMissing ? "0x" : "0x6000";
    }
    if (method === "eth_getBlockByNumber") return this.blockObject();
    if (method === "eth_call")
      return this.readCall(params[0].to, params[0].data);
    if (method === "eth_getLogs") {
      const f = params[0];
      return this.logs.filter(
        (l) =>
          (!f.fromBlock || BigInt(l.blockNumber) >= BigInt(f.fromBlock)) &&
          (!f.toBlock ||
            f.toBlock === "latest" ||
            BigInt(l.blockNumber) <= BigInt(f.toBlock)) &&
          f.topics.every(
            (t: any, i: number) =>
              !t ||
              (Array.isArray(t)
                ? t.some((x) => x?.toLowerCase() === l.topics[i]?.toLowerCase())
                : t.toLowerCase() === l.topics[i]?.toLowerCase()),
          ),
      );
    }
    if (method === "eth_getTransactionReceipt") {
      if (this.receiptHold) return null;
      if (Date.now() < (this.receiptAt.get(params[0]) ?? Infinity)) return null;
      const tx = this.transactions.find((t) => t.hash === params[0]);
      return {
        transactionHash: tx.hash,
        transactionIndex: "0x0",
        blockHash: keccak256(toBytes("mock block")),
        blockNumber: toHex(this.block),
        from: this.account,
        to: tx.to,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        contractAddress: null,
        logs: [],
        logsBloom: `0x${"0".repeat(512)}`,
        status: "0x1",
        effectiveGasPrice: "0x1",
        type: "0x2",
      };
    }
    if (method === "eth_getTransactionByHash") {
      const tx = this.transactions.find((t) => t.hash === params[0]);
      return {
        ...tx,
        blockHash: keccak256(toBytes("mock block")),
        blockNumber: toHex(this.block),
        transactionIndex: "0x0",
        from: this.account,
        gas: "0x5208",
        gasPrice: "0x1",
        nonce: "0x0",
        value: "0x0",
        input: tx.data,
        type: "0x2",
        v: "0x1",
        r: toHex(1n, { size: 32 }),
        s: toHex(1n, { size: 32 }),
        chainId: "0x1",
      };
    }
    throw new Error("Unhandled mocked RPC method " + method);
  }
  async wallet({ method, params = [] }: { method: string; params?: any[] }) {
    try {
      let result: any;
      switch (method) {
        case "eth_requestAccounts":
          if (this.rejectConnect) {
            this.rejectConnect = false;
            throw Object.assign(new Error("User rejected"), { code: 4001 });
          }
          result = [this.account];
          break;
        case "eth_accounts":
          result = [this.account];
          break;
        case "eth_chainId":
          result = this.chain;
          break;
        case "wallet_switchEthereumChain":
          if (!this.known)
            throw Object.assign(new Error("Unknown chain"), { code: 4902 });
          this.chain = params[0].chainId;
          result = null;
          break;
        case "wallet_addEthereumChain":
          this.requests.push({ method, params });
          this.known = true;
          result = null;
          break;
        case "personal_sign":
          if (this.rejectSign) {
            this.rejectSign = false;
            throw Object.assign(new Error("User rejected"), { code: 4001 });
          }
          if (params[0] !== bytesToHex(toBytes(KEY_MESSAGE)))
            throw new Error("Wrong signature message");
          result = this.signature;
          break;
        case "eth_sendTransaction":
          if (this.rejectTx) {
            this.rejectTx = false;
            throw Object.assign(new Error("User rejected"), { code: 4001 });
          }
          result = this.send(params[0]);
          break;
        default:
          result = this.rpc(method, params);
      }
      return { result };
    } catch (e) {
      return {
        error: {
          message: (e as Error).message,
          code: (e as any).code ?? -32000,
        },
      };
    }
  }
  send(tx: any) {
    const abi = this.contract(tx.to);
    const { functionName: n, args = [] } = decodeFunctionData({
      abi,
      data: tx.data,
    }) as { functionName: string; args: any[] };
    const hash = keccak256(
      toBytes(`test-tx-${this.transactions.length}-${Date.now()}`),
    );
    this.transactions.push({ ...tx, hash, name: n, args });
    this.receiptAt.set(hash, Date.now() + 300);
    if (same(tx.to, app.address)) {
      if (n === "openDrop") {
        this.ownOpen = true;
        this.price = args[1];
      }
      if (n === "setPrice") this.price = args[0];
      if (n === "setStamp") this.stamp = args[0];
      if (n === "transferOwnership") this.pendingOwner = args[0];
      if (n === "acceptOwnership") this.owner = this.account;
      if (n === "leave") this.addNote(this.account, args[0], args[1]);
      if (n === "knock") this.knocks++;
      if (n === "takeBack") this.notes[Number(args[0]) - 1].takenBack = true;
      if (n === "answer") {
        const note = this.notes[Number(args[0]) - 1];
        note.answered = true;
        this.earned += note.escrow;
        this.emit("Answered", { id: args[0], reply: args[1] });
      }
    } else if (same(tx.to, network.uniswapV4.permit2))
      this.permits.set(args[0].toLowerCase(), [args[2], args[3], 0]);
    else if (n === "approve")
      this.allowances.set(
        `${tx.to.toLowerCase()}:${args[0].toLowerCase()}`,
        args[1],
      );
    return hash;
  }
}
