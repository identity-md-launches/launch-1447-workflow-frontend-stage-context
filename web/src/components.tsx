import { useState, type ReactNode } from "react";
import { getAddress, type Address } from "viem";
import { useApp } from "./state";
export function Envelope({ small = false }: { small?: boolean }) {
  return (
    <svg
      width={small ? 22 : 34}
      height={small ? 18 : 27}
      viewBox="0 0 34 27"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 3h30v21H2zM2 3l15 13L32 3"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
export function AddressView({
  address,
  full = false,
}: {
  address: Address;
  full?: boolean;
}) {
  const { config } = useApp();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const formatted = getAddress(address);
  return (
    <span className="address-group">
      <a
        className="mono address"
        href={`${config.deployment.network.explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        title={formatted}
      >
        {full ? formatted : `${formatted.slice(0, 6)}…${formatted.slice(-4)}`}
      </a>
      <button
        className="copy"
        aria-label={`Copy address ${formatted}`}
        onClick={() => {
          void navigator.clipboard
            .writeText(formatted)
            .then(() => setCopied(true))
            .catch(() =>
              setError("Copy unavailable. Select the address to copy it."),
            );
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {error && <span role="status">{error}</span>}
    </span>
  );
}
export function Action({
  id,
  label,
  onClick,
  disabled = false,
  primary = true,
}: {
  id: string;
  label: string;
  onClick: () => unknown;
  disabled?: boolean;
  primary?: boolean;
}) {
  const { actions, isBusy, config } = useApp();
  const action = actions[id];
  return (
    <div className="action" data-action={id}>
      <button
        className={primary ? "button primary" : "button"}
        disabled={disabled || isBusy}
        onClick={() => void onClick()}
      >
        {action?.pending ? `${label} — ${action.stage}` : label}
        <span aria-hidden="true">↗</span>
      </button>
      <div role="status" className="action-status">
        {action?.success &&
          (action.hash ? "Confirmed. State refreshed." : "Complete.")}
        {action?.hash && (
          <a
            href={`${config.deployment.network.explorer}/tx/${action.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {" "}
            View transaction ↗
          </a>
        )}
      </div>
      {action?.error && (
        <p className="error" role="alert">
          {action.error}
        </p>
      )}
    </div>
  );
}
export function WalletGate({ children }: { children: ReactNode }) {
  const app = useApp();
  if (!app.account)
    return (
      <Action
        id="connect"
        label="Connect wallet"
        onClick={() => app.connect()}
      />
    );
  if (!app.correctChain)
    return (
      <p className="notice">
        Use the network control above to switch to {app.config.chain.name}.
      </p>
    );
  if (!app.verified)
    return (
      <p className="notice">
        Transactions are disabled until deployment checks succeed. Use “Refresh
        chain state” below to retry.
      </p>
    );
  if (app.uncertainActions.length)
    return (
      <p className="notice">
        A submitted transaction has an unknown confirmation status. Use the
        check above before continuing.
      </p>
    );
  if (app.smartWallet)
    return (
      <p className="notice">
        Smart contract wallets are not supported for inbox encryption. Connect
        an externally owned wallet.
      </p>
    );
  return <>{children}</>;
}
export function Field({
  label,
  id,
  value,
  onChange,
  hint,
  textarea = false,
  placeholder,
  invalid = false,
  readOnly = false,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  textarea?: boolean;
  placeholder?: string;
  invalid?: boolean;
  readOnly?: boolean;
}) {
  const props = {
    id,
    name: id,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    placeholder,
    "aria-describedby": hint ? `${id}-hint` : undefined,
    "aria-invalid": invalid || undefined,
    readOnly,
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {textarea ? (
        <textarea {...props} rows={6} />
      ) : (
        <input
          {...props}
          autoComplete="off"
          spellCheck={false}
          inputMode={
            /amount|price|tip|slippage|stamp/.test(id) ? "decimal" : "text"
          }
        />
      )}{" "}
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
    </div>
  );
}
export function SectionHead({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-head">
      <p className="eyebrow">{number} / Field notes</p>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}
