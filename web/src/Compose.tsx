import { useEffect, useState } from "react";
import { bytesToHex, formatUnits, type Address } from "viem";
import { useApp, type Drop } from "./state";
import { Action, Field, WalletGate, Notice } from "./components";
import { amount, displayAmount, erc20Abi, nonzeroKey, same } from "./protocol";
import { seal, sealedBytes, textBytes, MAX_TEXT_BYTES } from "./crypto";
import { quote, requireFresh, type Quote } from "./quote";
import { useRemote } from "./useRemote";
export function OpenDrop() {
  const a = useApp();
  const [price, setPrice] = useState("0");
  return (
    <div className="panel">
      <h2>Open your dead drop</h2>
      <p>
        One signature unlocks a session key. A separate transaction publishes
        your public key and price. Gas is paid in ETH.
      </p>
      <Field
        id="open-price"
        label="Your price to read · IMD"
        value={price}
        onChange={setPrice}
        hint="0 means free to read. The sender still pays the stamp."
      />
      <WalletGate>
        {!a.key ? (
          <Action id="unlock" label="Sign to unlock inbox" onClick={a.unlock} />
        ) : (
          <Action
            id="open"
            label="Open my drop on chain"
            onClick={() =>
              a.transact("open", () => ({
                address: a.config.app.address,
                abi: a.config.app.abi,
                functionName: "openDrop",
                args: [
                  bytesToHex(a.key!.publicKey),
                  amount(
                    price,
                    a.config.deployment.network.pairToken.decimals,
                    true,
                  ),
                ],
              }))
            }
          />
        )}
      </WalletGate>
      <p className="hint">
        Keys live only in this tab’s memory. Never share the inbox signature.
      </p>
    </div>
  );
}
export function Compose({ to, drop }: { to: Address; drop: Drop }) {
  const a = useApp();
  const { config, account, stats } = a;
  const imd = config.deployment.network.pairToken;
  const knocking = !nonzeroKey(drop.key);
  const own = useRemote(
    () => (account ? a.getDrop(account) : Promise.resolve(undefined)),
    [account, a.revision],
    `own-${account}`,
  );
  const [note, setNote] = useState("");
  const [tip, setTip] = useState(formatUnits(drop.price, imd.decimals));
  const [slippage, setSlippage] = useState("1");
  const [q, setQ] = useState<Quote>();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setTip(formatUnits(drop.price, imd.decimals));
    setQ(undefined);
  }, [drop.price, to, imd.decimals]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setQ(undefined), [tip, slippage, stats?.stamp, to]);
  const allowance = useRemote(
    () =>
      account
        ? a.read<bigint>({
            address: imd.address,
            abi: erc20Abi,
            functionName: "allowance",
            args: [account, config.app.address],
          })
        : Promise.resolve(0n),
    [account, a.revision],
  );
  let total = 0n;
  let validation = "";
  let tipValue = 0n;
  try {
    tipValue = knocking ? 0n : amount(tip, imd.decimals, true);
    if (tipValue < drop.price && !knocking)
      throw new Error(
        `Tip must be at least ${formatUnits(drop.price, imd.decimals)} IMD.`,
      );
    total = (stats?.stamp ?? 0n) + tipValue;
    if (!knocking && (textBytes(note) === 0 || sealedBytes(note) > 1024))
      throw new Error(`Write 1–${MAX_TEXT_BYTES} UTF-8 bytes before sealing.`);
  } catch (e) {
    validation = (e as Error).message;
  }
  const fresh =
    q &&
    now - q.created < 60000 &&
    q.amount === total &&
    q.slippage === slippage;
  const needApproval = allowance.data === undefined || allowance.data < total;
  const insufficient =
    stats?.imdBalance !== undefined && stats.imdBalance < total;
  async function freshInputs() {
    const current = await a.getDrop(to);
    if (!same(current.key, drop.key) || current.price !== drop.price)
      throw new Error(
        "The recipient changed their key or price. Refresh this drop before sending.",
      );
    const stamp = await a.appRead<bigint>("stamp");
    if (stamp !== stats?.stamp)
      throw new Error(
        "The stamp changed. Refresh chain state and get a new quote.",
      );
    if (!knocking) {
      const sender = await a.getDrop(account!);
      if (!a.key || !same(sender.key, bytesToHex(a.key.publicKey)))
        throw new Error("Open your drop with this session key first.");
    }
    return requireFresh(q, imd.address, total, slippage);
  }
  if (same(account, to))
    return (
      <Notice>
        This is your drop. Share its address so someone else can leave a note.
      </Notice>
    );
  return (
    <div className="compose panel">
      <p className="eyebrow">
        {knocking ? "No words. Just a signal." : "For their eyes only"}
      </p>
      <h2>{knocking ? "Send a knock" : "Leave a sealed note"}</h2>
      <p>
        {knocking
          ? "This wallet has no open drop yet. A knock burns one stamp and leaves a public signal, without text."
          : "The note is sealed in your browser before it reaches your wallet. Your tip is paid in DROP only when they answer."}
      </p>
      <WalletGate>
        {!knocking && own.loading && !own.data ? (
          <p role="status">Checking your drop…</p>
        ) : !knocking && own.error ? (
          <p role="alert">{own.error}</p>
        ) : !knocking && !nonzeroKey(own.data?.key ?? "") ? (
          <OpenDrop />
        ) : !knocking && !a.key ? (
          <Action id="unlock" label="Sign to unlock inbox" onClick={a.unlock} />
        ) : (
          <>
            {!knocking && (
              <>
                <Field
                  id="note"
                  label="Your note"
                  textarea
                  value={note}
                  onChange={setNote}
                  invalid={sealedBytes(note) > 1024}
                  hint={`${textBytes(note)} / ${MAX_TEXT_BYTES} text bytes · ${sealedBytes(note)} / 1,024 sealed bytes`}
                />
                <Field
                  id="tip"
                  label="Tip · IMD"
                  value={tip}
                  onChange={setTip}
                  hint={`Recipient’s minimum: ${formatUnits(drop.price, imd.decimals)} IMD`}
                />
              </>
            )}
            <Field
              id="slippage"
              label="Maximum slippage · %"
              value={slippage}
              onChange={setSlippage}
              hint="Default 1%. Allowed range 0.1–5%. Quotes expire after 60 seconds."
            />
            <dl className="receipt">
              <div>
                <dt>Stamp</dt>
                <dd>{displayAmount(stats?.stamp, imd.decimals)} IMD</dd>
              </div>
              {!knocking && (
                <div>
                  <dt>Tip</dt>
                  <dd>{displayAmount(tipValue, imd.decimals)} IMD</dd>
                </div>
              )}
              <div className="total">
                <dt>You spend</dt>
                <dd>{displayAmount(total, imd.decimals)} IMD + gas</dd>
              </div>
              <div>
                <dt>Your balance</dt>
                <dd>{displayAmount(stats?.imdBalance, imd.decimals)} IMD</dd>
              </div>
            </dl>
            <p className="hint">
              USD context is unavailable. No price oracle is configured.
            </p>
            {validation && <p className="hint">{validation}</p>}
            {insufficient && (
              <p className="notice">
                Your IMD balance is too low. Add IMD to this wallet to continue.
              </p>
            )}
            {q && q.amount === total && (
              <div className="quote" aria-live="polite">
                <p>
                  Quoted output <strong>{displayAmount(q.out)} DROP</strong>
                </p>
                <p>
                  Minimum output <strong>{formatUnits(q.min, 18)} DROP</strong>
                </p>
                <p>
                  {knocking
                    ? "All output is burned."
                    : `About ${displayAmount((q.out * tipValue) / total)} DROP is held for the recipient; the rest is burned.`}
                </p>
                <p className="hint">
                  {fresh
                    ? `Quote expires in ${Math.max(0, 60 - Math.floor((now - q.created) / 1000))}s.`
                    : "Quote expired or changed. Get a new quote."}
                </p>
              </div>
            )}
            {!fresh ? (
              <Action
                id="quote-note"
                label="Get DROP quote"
                disabled={!!validation || insufficient || !stats?.stamp}
                onClick={() =>
                  a.run("quote-note", async () =>
                    setQ(await quote(config, imd.address, total, slippage)),
                  )
                }
              />
            ) : needApproval ? (
              <>
                <p className="hint">
                  Step 1 of 2 · Allow DeadDrop to spend exactly{" "}
                  {formatUnits(total, imd.decimals)} IMD. This approval does not
                  send a note.
                </p>
                <Action
                  id="approve-note"
                  label="Approve IMD for DeadDrop"
                  disabled={
                    !!validation ||
                    insufficient ||
                    allowance.loading ||
                    !!allowance.error
                  }
                  onClick={() =>
                    a.transact("approve-note", async () => {
                      await freshInputs();
                      return {
                        address: imd.address,
                        abi: erc20Abi,
                        functionName: "approve",
                        args: [config.app.address, total],
                      };
                    })
                  }
                />
              </>
            ) : (
              <>
                <p className="hint">
                  Final step ·{" "}
                  {knocking
                    ? "Burn the stamp to signal this wallet."
                    : "Pay the stamp and tip; leave your encrypted note. The stamp cannot be returned."}
                </p>
                <Action
                  id={knocking ? "knock" : "leave"}
                  label={knocking ? "Pay stamp & knock" : "Seal & leave note"}
                  disabled={!!validation || insufficient}
                  onClick={() =>
                    a
                      .transact(knocking ? "knock" : "leave", async () => {
                        const checked = await freshInputs();
                        const available = await a.read<bigint>({
                          address: imd.address,
                          abi: erc20Abi,
                          functionName: "allowance",
                          args: [account, config.app.address],
                        });
                        if (available < total)
                          throw new Error(
                            "Allowance changed. Refresh and approve IMD again.",
                          );
                        return {
                          address: config.app.address,
                          abi: config.app.abi,
                          functionName: knocking ? "knock" : "leave",
                          args: knocking
                            ? [to, checked.min]
                            : [
                                to,
                                seal(note, drop.key, a.key!),
                                tipValue,
                                checked.min,
                              ],
                        };
                      })
                      .then((ok) => {
                        if (ok) {
                          setNote("");
                          setQ(undefined);
                        }
                      })
                  }
                />
              </>
            )}
            {allowance.error && (
              <p className="error" role="alert">
                Allowance unavailable: {allowance.error}
              </p>
            )}
          </>
        )}
      </WalletGate>
    </div>
  );
}
