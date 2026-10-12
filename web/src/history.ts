import { getAbiItem, type AbiEvent, type Address, type Hex } from "viem";
import type { Config } from "./config";
export interface NoteRecord {
  id: bigint;
  from: Address;
  to: Address;
  tip: bigint;
  escrow: bigint;
  note: Hex;
  leftAt: bigint;
  answered: boolean;
  takenBack: boolean;
  blockNumber: bigint;
  reply?: Hex;
  replyBlock?: bigint;
}
export async function ownNotes(
  config: Config,
  account: Address,
  tab: "inbox" | "sent",
  fromBlock: bigint,
  toBlock: bigint,
): Promise<NoteRecord[]> {
  const event = getAbiItem({ abi: config.app.abi, name: "Left" }) as AbiEvent;
  const logs = [];
  // Only indexed logs belonging to the connected wallet are requested. Smaller chunks
  // support public RPC limits; errors are surfaced instead of hiding incomplete history.
  for (let start = fromBlock; start <= toBlock; start += 9999n) {
    const end = start + 9998n > toBlock ? toBlock : start + 9998n;
    logs.push(
      ...(await config.publicClient.getLogs({
        address: config.app.address,
        event,
        args: tab === "inbox" ? { to: account } : { from: account },
        fromBlock: start,
        toBlock: end,
        strict: true,
      })),
    );
  }
  const ordered = logs.filter((l) => !l.removed).reverse();
  const notes: NoteRecord[] = [];
  let replyHead: bigint | undefined;
  for (const log of ordered) {
    const args = log.args as unknown as {
      id: bigint;
      from: Address;
      to: Address;
      tip: bigint;
      escrow: bigint;
      note: Hex;
    };
    const state = (await config.publicClient.readContract({
      address: config.app.address,
      abi: config.app.abi,
      functionName: "notes",
      args: [args.id],
    })) as [Address, bigint, boolean, boolean, Address, bigint];
    const n: NoteRecord = {
      ...args,
      leftAt: state[1],
      answered: state[2],
      takenBack: state[3],
      blockNumber: log.blockNumber!,
    };
    if (n.answered) {
      replyHead ??= await config.publicClient.getBlockNumber();
      const replies = [];
      // An answer can be much newer than the page containing its original note.
      // Bound reply queries too, so old answered notes work on range-limited RPCs.
      for (let end = replyHead; end >= n.blockNumber; end -= 9999n) {
        const start = end - 9998n > n.blockNumber ? end - 9998n : n.blockNumber;
        const chunk = await config.publicClient.getLogs({
          address: config.app.address,
          event: getAbiItem({
            abi: config.app.abi,
            name: "Answered",
          }) as AbiEvent,
          args: { id: n.id },
          fromBlock: start,
          toBlock: end,
          strict: true,
        });
        if (chunk.length) {
          replies.push(...chunk);
          break;
        }
      }
      const reply = replies.at(-1);
      if (reply) {
        n.reply = (reply.args as unknown as { reply: Hex }).reply;
        n.replyBlock = reply.blockNumber!;
      }
    }
    notes.push(n);
  }
  return notes;
}
