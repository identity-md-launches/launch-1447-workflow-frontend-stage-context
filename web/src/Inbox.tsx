import { useEffect, useState } from "react";
import { bytesToHex, formatUnits, type Address } from "viem";
import { useApp } from "./state";
import {
  Action,
  AddressView,
  Field,
  Notice,
  SectionHead,
  WalletGate,
} from "./components";
import { OpenDrop } from "./Compose";
import { amount, displayAmount, nonzeroKey, same } from "./protocol";
import { seal, sealedBytes, textBytes, MAX_TEXT_BYTES, unseal } from "./crypto";
import { useRemote } from "./useRemote";
import { ownNotes, type NoteRecord } from "./history";
function NoteCard({
  note: n,
  tab,
}: {
  note: NoteRecord;
  tab: "inbox" | "sent";
}) {
  const a = useApp();
  const [reply, setReply] = useState("");
  const [takeConfirm, setTakeConfirm] = useState(false);
  const peer = tab === "inbox" ? n.from : n.to;
  const content = useRemote(async () => {
    if (!a.key) return undefined;
    const historic = await a.getDrop(peer, n.blockNumber);
    let text: string | undefined,
      replyText: string | undefined,
      noteError: string | undefined,
      replyError: string | undefined;
    try {
      text = unseal(n.note, historic.key, a.key);
    } catch (e) {
      noteError = (e as Error).message;
    }
    if (n.reply && n.replyBlock) {
      try {
        const replyKey = await a.getDrop(peer, n.replyBlock);
        replyText = unseal(n.reply, replyKey.key, a.key);
      } catch (e) {
        replyError = (e as Error).message;
      }
    }
    return { text, replyText, noteError, replyError };
  }, [n.id, n.reply, a.key]);
  const takeAt = n.leftAt + 1209600n;
  const eligible =
    !!a.stats && a.stats.timestamp >= takeAt && !n.answered && !n.takenBack;
  return (
    <article className="note-card">
      <div className="row between">
        <h3>Note #{n.id.toString()}</h3>
        <span className="status-label">
          {n.takenBack ? "Taken back" : n.answered ? "Answered" : "Waiting"}
        </span>
      </div>
      <p className="hint">
        {tab === "inbox" ? "From" : "To"} <AddressView address={peer} />
      </p>
      <p className="mono small">
        {new Date(Number(n.leftAt) * 1000).toLocaleString()} ·{" "}
        {displayAmount(n.escrow)} DROP{" "}
        {n.answered ? "paid" : n.takenBack ? "returned" : "in escrow"}
      </p>
      {content.loading ? (
        <p role="status">Opening sealed note…</p>
      ) : content.error ? (
        <p className="error" role="alert">
          Cannot load the historical public key: {content.error}
        </p>
      ) : content.data?.noteError ? (
        <p className="error">{content.data.noteError}</p>
      ) : (
        <p className="message" dir="auto">
          {content.data?.text}
        </p>
      )}
      {n.reply && (
        <div className="reply">
          <h4>Reply</h4>
          {content.data?.replyError ? (
            <p className="error">{content.data.replyError}</p>
          ) : (
            <p className="message" dir="auto">
              {content.data?.replyText}
            </p>
          )}
        </div>
      )}
      {tab === "inbox" && !n.answered && !n.takenBack && (
        <>
          <Field
            id={`reply-${n.id}`}
            label="Your sealed reply"
            value={reply}
            onChange={setReply}
            textarea
            hint={`${sealedBytes(reply)} / 1,024 sealed bytes · reply to receive ${displayAmount(n.escrow)} DROP`}
            invalid={sealedBytes(reply) > 1024}
          />
          <Action
            id={`answer-${n.id}`}
            label="Seal reply & claim tip"
            disabled={
              !a.key ||
              !textBytes(reply) ||
              textBytes(reply) > MAX_TEXT_BYTES ||
              !a.verified ||
              !a.correctChain
            }
            onClick={() =>
              a
                .transact(`answer-${n.id}`, async () => {
                  const peerDrop = await a.getDrop(peer);
                  const own = await a.getDrop(a.account!);
                  if (!a.key || !same(own.key, bytesToHex(a.key.publicKey)))
                    throw new Error(
                      "Your inbox key changed. Reconnect with the original signing wallet.",
                    );
                  return {
                    address: a.config.app.address,
                    abi: a.config.app.abi,
                    functionName: "answer",
                    args: [n.id, seal(reply, peerDrop.key, a.key)],
                  };
                })
                .then((ok) => {
                  if (ok) setReply("");
                })
            }
          />
        </>
      )}
      {tab === "sent" && !n.answered && !n.takenBack && (
        <>
          <p className="hint">
            Take back after {new Date(Number(takeAt) * 1000).toLocaleString()}.
            The stamp is never returned.
          </p>
          {eligible ? (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={takeConfirm}
                  onChange={(e) => setTakeConfirm(e.target.checked)}
                />
                Return the escrow and close this note to replies.
              </label>
              <Action
                id={`take-${n.id}`}
                label="Take back escrow"
                disabled={!takeConfirm || !a.correctChain || !a.verified}
                onClick={() =>
                  a.transact(`take-${n.id}`, () => ({
                    address: a.config.app.address,
                    abi: a.config.app.abi,
                    functionName: "takeBack",
                    args: [n.id],
                  }))
                }
              />
            </>
          ) : (
            <button className="button" disabled>
              Waiting for 14-day unlock
            </button>
          )}
        </>
      )}
    </article>
  );
}
export function Inbox() {
  const a = useApp();
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [page, setPage] = useState(0);
  const [price, setPrice] = useState("");
  const own = useRemote(
    () => (a.account ? a.getDrop(a.account) : Promise.resolve(undefined)),
    [a.account, a.revision],
    `own-${a.account}`,
  );
  useEffect(() => {
    if (own.data)
      setPrice(
        formatUnits(
          own.data.price,
          a.config.deployment.network.pairToken.decimals,
        ),
      );
  }, [own.data?.price]);
  useEffect(() => setPage(0), [a.account, tab]);
  const history = useRemote(
    async () => {
      if (!a.account || !a.key) return undefined;
      const latest = await a.config.publicClient.getBlockNumber();
      const end = latest - BigInt(page) * 50000n;
      const start =
        end - 49999n > a.config.historyStart
          ? end - 49999n
          : a.config.historyStart;
      if (end < start) return { notes: [], start, end, complete: true };
      return {
        notes: await ownNotes(a.config, a.account, tab, start, end),
        start,
        end,
        complete: start === a.config.historyStart,
      };
    },
    [a.account, a.key, tab, page, a.revision],
    `history-${a.account}-${!!a.key}-${tab}-${page}`,
  );
  return (
    <>
      <SectionHead number="02" title="Your dead drop">
        <p>
          The words stay between wallets. Unlock this tab to read and answer
          your notes.
        </p>
      </SectionHead>
      <WalletGate>
        {own.loading && !own.data ? (
          <p role="status">Reading your drop…</p>
        ) : own.error ? (
          <p className="error" role="alert">
            {own.error}
          </p>
        ) : !nonzeroKey(own.data?.key ?? "") ? (
          <OpenDrop />
        ) : (
          <>
            <div className="two-col">
              <div className="panel">
                <p className="eyebrow">Your drop is open</p>
                <h2>{displayAmount(own.data?.price)} IMD to read</h2>
                {a.account && <AddressView address={a.account} full />}
                <div className="row">
                  <a className="button" href={`#/${a.account}`}>
                    Share my drop ↗
                  </a>
                  {a.key ? (
                    <button className="button" onClick={a.lock}>
                      Lock this session
                    </button>
                  ) : (
                    <Action
                      id="unlock"
                      label="Sign to unlock inbox"
                      onClick={a.unlock}
                    />
                  )}
                </div>
                <p className="hint">
                  Signing costs no gas. This signature is your inbox secret;
                  sign it only on DEAD DROP.
                </p>
              </div>
              <div className="panel">
                <dl className="receipt">
                  <div>
                    <dt>Earned so far</dt>
                    <dd>{displayAmount(a.stats?.earned)} DROP</dd>
                  </div>
                  <div>
                    <dt>Knocks received</dt>
                    <dd>{a.stats?.knocks?.toString() ?? "—"}</dd>
                  </div>
                </dl>
                <Field
                  id="set-price"
                  label="Price to read · IMD"
                  value={price}
                  onChange={setPrice}
                  hint="Applies to future notes. Existing escrow is unchanged."
                />
                <Action
                  id="price"
                  label="Set my price"
                  primary={false}
                  onClick={() =>
                    a.transact("price", () => ({
                      address: a.config.app.address,
                      abi: a.config.app.abi,
                      functionName: "setPrice",
                      args: [
                        amount(
                          price,
                          a.config.deployment.network.pairToken.decimals,
                          true,
                        ),
                      ],
                    }))
                  }
                />
              </div>
            </div>
            {a.key ? (
              <section className="inbox">
                <div className="tab-row" aria-label="Note folders">
                  <button
                    className={tab === "inbox" ? "selected" : ""}
                    onClick={() => setTab("inbox")}
                    aria-pressed={tab === "inbox"}
                  >
                    Inbox
                  </button>
                  <button
                    className={tab === "sent" ? "selected" : ""}
                    onClick={() => setTab("sent")}
                    aria-pressed={tab === "sent"}
                  >
                    Sent
                  </button>
                </div>
                <p className="hint">
                  Only your notes are shown. History is loaded in windows of
                  50,000 blocks; earlier notes are available below.
                </p>
                {history.loading && !history.data ? (
                  <p role="status">Loading your sealed notes…</p>
                ) : history.error ? (
                  <p className="error" role="alert">
                    History could not be loaded: {history.error} Use “Refresh
                    chain state” to retry. This is not an empty inbox.
                  </p>
                ) : history.data?.notes.length ? (
                  history.data.notes.map((n) => (
                    <NoteCard key={n.id.toString()} note={n} tab={tab} />
                  ))
                ) : (
                  <div className="empty">
                    <EnvelopeLabel />
                    <h2>No notes in this window</h2>
                    <p>
                      {tab === "inbox"
                        ? "Share your drop to invite a sealed note."
                        : "Find a wallet and leave your first sealed note."}
                    </p>
                    <a
                      className="button"
                      href={tab === "inbox" ? `#/${a.account}` : "#/"}
                    >
                      {tab === "inbox" ? "Share my drop" : "Find a wallet"} ↗
                    </a>
                  </div>
                )}
                <div className="row">
                  <button
                    className="button"
                    disabled={page === 0 || history.loading}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Newer notes
                  </button>
                  <button
                    className="button"
                    disabled={
                      !!history.data?.complete ||
                      history.loading ||
                      !!history.error
                    }
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Earlier notes
                  </button>
                </div>
                {history.data && (
                  <p className="hint mono">
                    Blocks {history.data.start.toString()}–
                    {history.data.end.toString()}
                    {history.data.complete ? " · beginning of deployment" : ""}
                  </p>
                )}
              </section>
            ) : (
              <Notice>
                Your notes stay sealed until you unlock this session. Nothing is
                saved to local storage.
              </Notice>
            )}
          </>
        )}
      </WalletGate>
    </>
  );
}
function EnvelopeLabel() {
  return (
    <span className="empty-mark" aria-hidden="true">
      ↳
    </span>
  );
}
