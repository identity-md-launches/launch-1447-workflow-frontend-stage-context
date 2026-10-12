import { useState } from "react";
import { type Address } from "viem";
import { useApp } from "./state";
import { Action, AddressView, Field, WalletGate } from "./components";
import { amount, displayAmount, same } from "./protocol";
export function OwnerTools() {
  const a = useApp();
  const [stamp, setStamp] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState(false);
  const isOwner = same(a.account, a.stats?.owner);
  const isPending = same(a.account, a.stats?.pendingOwner);
  if (!isOwner && !isPending) return null;
  return (
    <details className="panel">
      <summary>Contract owner settings</summary>
      <WalletGate>
        {isOwner && (
          <>
            <p>
              Current stamp: {displayAmount(a.stats?.stamp)} IMD. Changes affect
              later notes and knocks only.
            </p>
            <Field
              id="owner-stamp"
              label="New stamp · IMD"
              value={stamp}
              onChange={setStamp}
              hint="Between 0.01 and 1 IMD."
            />
            <Action
              id="stamp"
              primary={false}
              label="Set stamp"
              onClick={() =>
                a.transact("stamp", () => {
                  const value = amount(
                    stamp,
                    a.config.deployment.network.pairToken.decimals,
                  );
                  if (value < 10n ** 16n || value > 10n ** 18n)
                    throw new Error("Set a stamp between 0.01 and 1 IMD.");
                  return {
                    address: a.config.app.address,
                    abi: a.config.app.abi,
                    functionName: "setStamp",
                    args: [value],
                  };
                })
              }
            />
            <hr />
            <h3>Transfer ownership</h3>
            <Field
              id="next-owner"
              label="New owner address or ENS"
              value={next}
              onChange={setNext}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              I understand the new owner must accept this transfer.
            </label>
            <Action
              id="transfer-owner"
              label="Propose new owner"
              primary={false}
              disabled={!confirm}
              onClick={() =>
                a.transact("transfer-owner", async () => {
                  const resolved = await a.resolve(next);
                  if (/^0x0{40}$/i.test(resolved))
                    throw new Error("Enter a nonzero owner address.");
                  return {
                    address: a.config.app.address,
                    abi: a.config.app.abi,
                    functionName: "transferOwnership",
                    args: [resolved],
                  };
                })
              }
            />
          </>
        )}
        {isPending && (
          <>
            <p>
              You are the pending owner. Accepting gives you control of the
              stamp price.
            </p>
            <Action
              id="accept-owner"
              label="Accept ownership"
              onClick={() =>
                a.transact("accept-owner", () => ({
                  address: a.config.app.address,
                  abi: a.config.app.abi,
                  functionName: "acceptOwnership",
                }))
              }
            />
          </>
        )}
        <p className="hint">
          Ownership cannot be renounced. There are no unset launch settings,
          pause controls or upgrades.
        </p>
      </WalletGate>
    </details>
  );
}
export function TokenTools() {
  const a = useApp();
  const [mode, setMode] = useState("transfer");
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [value, setValue] = useState("");
  const [resolved, setResolved] = useState<Address>();
  const [approved, setApproved] = useState<bigint>();
  return (
    <details className="panel token-tools">
      <summary>DROP transfer & allowance tools</summary>
      <p>
        These actions move or authorize DROP directly. Sending DROP to the
        DeadDrop contract directly does not create a note and cannot be
        recovered.
      </p>
      <label htmlFor="token-operation">Action</label>
      <select
        id="token-operation"
        value={mode}
        onChange={(e) => {
          setMode(e.target.value);
          setResolved(undefined);
          setApproved(undefined);
        }}
      >
        <option value="transfer">Transfer DROP</option>
        <option value="approve">Set DROP allowance</option>
        <option value="transferFrom">Transfer from an authorized wallet</option>
      </select>
      {mode === "transferFrom" && (
        <Field
          id="token-from"
          label="From address or ENS"
          value={from}
          onChange={setFrom}
        />
      )}
      <Field
        id="token-to"
        label={
          mode === "approve"
            ? "Spender address or ENS"
            : "Recipient address or ENS"
        }
        value={to}
        onChange={(v) => {
          setTo(v);
          setResolved(undefined);
          setApproved(undefined);
        }}
      />
      <Field
        id="token-value"
        label={mode === "approve" ? "Allowance · DROP" : "Amount · DROP"}
        value={value}
        onChange={setValue}
        hint={
          mode === "approve"
            ? "Use 0 to revoke the allowance. Only approve a spender you trust."
            : `Your balance: ${displayAmount(a.stats?.dropBalance)} DROP`
        }
      />
      <WalletGate>
        <Action
          id="review-token"
          label="Review address & allowance"
          primary={false}
          onClick={() =>
            a.run("review-token", async () => {
              const address = await a.resolve(to);
              if (/^0x0{40}$/i.test(address))
                throw new Error("Enter a nonzero recipient or spender.");
              if (mode !== "approve" && same(address, a.config.app.address))
                throw new Error(
                  "Do not transfer DROP directly to DeadDrop. Use Leave a note.",
                );
              setResolved(address);
              setApproved(
                await a.read<bigint>({
                  address: a.config.token.address,
                  abi: a.config.token.abi,
                  functionName: "allowance",
                  args:
                    mode === "transferFrom"
                      ? [await a.resolve(from), a.account]
                      : [a.account, address],
                }),
              );
            })
          }
        />
        {resolved && (
          <div className="quote">
            <p>Resolved {mode === "approve" ? "spender" : "recipient"}</p>
            <AddressView address={resolved} full />
            <p>Current allowance: {displayAmount(approved)} DROP</p>
            <Action
              id="token-action"
              label={
                mode === "approve"
                  ? "Set DROP allowance"
                  : "Confirm DROP transfer"
              }
              onClick={() =>
                a.transact("token-action", async () => {
                  const amountValue = amount(value, 18, mode === "approve");
                  return {
                    address: a.config.token.address,
                    abi: a.config.token.abi,
                    functionName: mode,
                    args:
                      mode === "transferFrom"
                        ? [await a.resolve(from), resolved, amountValue]
                        : [resolved, amountValue],
                  };
                })
              }
            />
          </div>
        )}
      </WalletGate>
    </details>
  );
}
