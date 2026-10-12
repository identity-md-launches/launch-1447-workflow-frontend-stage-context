import { useEffect, useState } from "react";
import { getAddress, isAddress, formatUnits, type Address } from "viem";
import { useApp } from "./state";
import { Action, AddressView, Envelope, SectionHead } from "./components";
import { displayAmount, nonzeroKey, same } from "./protocol";
import { useRemote } from "./useRemote";
import { Compose } from "./Compose";
import { Inbox } from "./Inbox";
import { Swap } from "./Swap";
import { Manual, Agents } from "./Manual";
import { OwnerTools, TokenTools } from "./Tools";
function Wall() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`wall-art ${open ? "is-open" : ""}`}>
      <svg viewBox="0 0 620 440" role="img" aria-labelledby="wall-title">
        <title id="wall-title">A sealed envelope behind a loose brick</title>
        <defs>
          <pattern
            id="bricks"
            width="208"
            height="116"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 0h208v58H0zM-104 58h208v58h-208zM104 58h208v58H104z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        <path d="M25 20h570v355H25z" fill="url(#bricks)" />
        <path d="M211 176h203v55H211z" fill="var(--ink)" />
        <g className="envelope">
          <path
            d="M255 179h133v48H255z"
            fill="var(--accent)"
            stroke="var(--ink)"
            strokeWidth="2"
          />
          <path
            d="m255 179 66 31 67-31M255 227l48-27m85 27-49-27"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="2"
          />
          <rect x="307" y="202" width="30" height="17" fill="var(--ink)" />
        </g>
        <g className="loose-brick">
          <path
            d="M210 175h204v57H210z"
            fill="var(--paper)"
            stroke="var(--ink)"
            strokeWidth="2"
          />
          <path
            d="m414 175 18-13v57l-18 13M210 175l18-13h204"
            fill="var(--surface)"
            stroke="var(--ink)"
            strokeWidth="2"
          />
          <path
            d="M226 191h172M226 198h81M329 218h65"
            stroke="var(--line)"
            strokeWidth="1"
          />
        </g>
        <path
          d="M420 280h70v77M486 353l4 4 4-4"
          fill="none"
          stroke="var(--ink)"
        />
        <text x="335" y="402" className="svg-label">
          HIDDEN IN PLAIN SIGHT.
        </text>
        <path d="M25 392h180" stroke="var(--ink)" />
        <text x="25" y="413" className="svg-label">
          FIG. 01 / THE DEAD DROP
        </text>
      </svg>
      <button
        className="art-button"
        aria-pressed={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close the brick" : "Find the loose brick"}{" "}
        <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
function Search() {
  const a = useApp();
  const [query, setQuery] = useState("");
  return (
    <form
      className="find-form"
      onSubmit={(e) => {
        e.preventDefault();
        void a.run("find", async () => {
          const address = await a.resolve(query);
          location.hash = `/${address}`;
        });
      }}
    >
      <label htmlFor="wallet-search">Whose drop are you looking for?</label>
      <div className="find-row">
        <input
          id="wallet-search"
          name="address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Wallet address or ENS name"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="find-error"
        />
        <button className="button primary" disabled={a.isBusy} type="submit">
          {a.actions.find?.pending ? "Finding…" : "Find a drop"}{" "}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p
        id="find-error"
        className={a.actions.find?.error ? "error" : "hint"}
        role={a.actions.find?.error ? "alert" : undefined}
      >
        {a.actions.find?.error ?? "No account needed to find a drop."}
      </p>
    </form>
  );
}
function Home() {
  const a = useApp();
  const stats = a.stats;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="square" /> An open channel. A sealed message.
          </p>
          <h1>
            Every wallet
            <br /> has a <span>dead drop.</span>
          </h1>
          <p className="hero-description">
            Leave a sealed note for any wallet.
            <br /> Only they can open it.
            <br /> They get paid when they answer.
          </p>
          <Search />
        </div>
        <Wall />
      </section>
      <div className="field-strip">
        <span className="mono">01 — HOW IT WORKS</span>
        <span>Good messages deserve an open door.</span>
      </div>
      <section className="steps" aria-label="How Dead Drop works">
        {[
          [
            "01",
            "Seal it.",
            "Write a note. Your browser seals it for their wallet. Only you and the recipient hold the keys.",
          ],
          [
            "02",
            "Drop it.",
            "Pay their price in IMD, plus a stamp. The payment buys DROP. The stamp’s share burns.",
          ],
          [
            "03",
            "Get an answer.",
            "They answer and collect the DROP tip. No answer? Take it back after 14 days.",
          ],
        ].map(([n, t, p]) => (
          <article key={n}>
            <span className="step-number">{n}</span>
            <div>
              <h2>{t}</h2>
              <p>{p}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="totals" aria-label="Public totals">
        <div className="totals-label">
          <p className="eyebrow">The paper trail</p>
          <h2>
            Totals only.
            <br /> No guest list.
          </h2>
        </div>
        <dl>
          <div>
            <dt>Notes left</dt>
            <dd>{stats?.noteCount.toLocaleString() ?? "—"}</dd>
          </div>
          <div>
            <dt>IMD sent</dt>
            <dd>{displayAmount(stats?.totalImdSpent)}</dd>
          </div>
          <div>
            <dt>DROP burned</dt>
            <dd>{displayAmount(stats?.totalDropBurned)}</dd>
          </div>
          <div>
            <dt>Answer rate</dt>
            <dd>
              {stats
                ? stats.noteCount
                  ? `${Number((stats.answeredCount * 10000n) / stats.noteCount) / 100}%`
                  : "0%"
                : "—"}
            </dd>
          </div>
        </dl>
      </section>
      <section className="home-end">
        <Envelope />
        <p>
          The words are private.
          <br /> The exchange is on chain.
        </p>
        <a href="#/manual">Read the field manual ↗</a>
      </section>
    </>
  );
}
function WalletPage({ address }: { address: Address }) {
  const a = useApp();
  const drop = useRemote(
    () => a.getDrop(address),
    [address, a.revision],
    `wallet-${address}`,
  );
  const [copy, setCopy] = useState("");
  const own = same(a.account, address);
  const link = new URL(location.href);
  link.hash = `/${address}`;
  const shareText = `My DMs are closed. My dead drop is open: ${drop.data ? formatUnits(drop.data.price, a.config.deployment.network.pairToken.decimals) : "…"} IMD to read. ${link.href}`;
  return (
    <>
      <SectionHead
        number="01"
        title={own ? "Your address. Your door." : "A place to leave a note."}
      >
        <AddressView address={address} full />
      </SectionHead>
      {drop.loading && !drop.data ? (
        <p role="status">Checking this wallet’s drop…</p>
      ) : !drop.data && drop.error ? (
        <div className="notice">
          <p role="alert">Cannot read this drop: {drop.error}</p>
          <button className="button" onClick={() => void a.refresh()}>
            Refresh chain state
          </button>
        </div>
      ) : (
        drop.data && (
          <div className="two-col">
            <aside className="panel plain">
              <p className="eyebrow">
                {nonzeroKey(drop.data.key) ? "Drop open" : "Drop not opened"}
              </p>
              <h2>
                {nonzeroKey(drop.data.key)
                  ? `${displayAmount(drop.data.price)} IMD to read`
                  : "Knock before entering."}
              </h2>
              <p>
                {nonzeroKey(drop.data.key)
                  ? "Payment waits in escrow. An on-chain answer releases the tip."
                  : "A knock leaves a signal for this wallet. Once they open a drop, you can leave a sealed note."}
              </p>
              {own && (
                <>
                  <h3>Share my drop</h3>
                  <p>{shareText.slice(0, shareText.indexOf(" http"))}</p>
                  <div className="stack">
                    <button
                      className="button"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(link.href)
                          .then(() => setCopy("Drop link copied."))
                          .catch(() =>
                            setCopy(
                              "Copy unavailable. Copy the address from your browser.",
                            ),
                          )
                      }
                    >
                      Copy my drop link ↗
                    </button>
                    <a
                      className="button"
                      href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Share on X ↗
                    </a>
                    <a href="#/inbox">Open my inbox ↗</a>
                    <p role="status">{copy}</p>
                  </div>
                </>
              )}
              <p className="hint">Ethereum · Public activity, sealed words.</p>
            </aside>
            <Compose to={address} drop={drop.data} />
          </div>
        )
      )}
    </>
  );
}
function WalletControl() {
  const a = useApp();
  const [selected, setSelected] = useState(0);
  return (
    <div className="wallet-control">
      {a.account ? (
        <>
          <span className="mono small" title={a.account}>
            {a.account.slice(0, 6)}…{a.account.slice(-4)}
          </span>
          <button className="button compact" onClick={a.disconnect}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          {a.providers.length > 1 && (
            <select
              aria-label="Choose browser wallet"
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {a.providers.map((p, i) => (
                <option key={i} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button
            className="button compact"
            disabled={a.isBusy}
            onClick={() => void a.connect(a.providers[selected]?.provider)}
          >
            {a.actions.connect?.pending ? "Connecting…" : "Connect wallet"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </>
      )}
    </div>
  );
}
export default function App() {
  const a = useApp();
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const handle = () => {
      setRoute(location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
      requestAnimationFrame(() => document.getElementById("main")?.focus());
    };
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  let page;
  const address = route.slice(1);
  if (route === "/") page = <Home />;
  else if (route === "/inbox")
    page = (
      <>
        <Inbox key={a.account} />
        <OwnerTools />
      </>
    );
  else if (route === "/swap")
    page = (
      <>
        <Swap />
        <TokenTools />
      </>
    );
  else if (route === "/agents") page = <Agents />;
  else if (route === "/manual") page = <Manual />;
  else if (isAddress(address, { strict: false }))
    page = (
      <WalletPage
        key={`${address}-${a.account}`}
        address={getAddress(address)}
      />
    );
  else
    page = (
      <SectionHead number="404" title="No drop at this route">
        <a className="button" href="#/">
          Find a wallet ↗
        </a>
      </SectionHead>
    );
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="masthead">
          <a className="brand" href="#/" aria-label="Dead Drop home">
            <Envelope />
            <span>
              Dead Drop<span className="brand-dot">.</span>
            </span>
          </a>
          <div className="masthead-right">
            <span className="edition mono">ETHEREUM / FIELD KIT 001</span>
            <WalletControl />
          </div>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          <div>
            {[
              ["/", "Find a drop"],
              ["/inbox", "My inbox"],
              ["/swap", "Swap"],
              ["/agents", "For agents"],
              ["/manual", "Field manual"],
            ].map(([path, name]) => (
              <a
                key={path}
                href={`#${path}`}
                aria-current={route === path ? "page" : undefined}
              >
                {name}
              </a>
            ))}
          </div>
          <span className="mono network">
            <span className="square" />
            {a.config.chain.name}
          </span>
        </nav>
      </header>
      {a.actions.connect?.error && (
        <div className="global-alert" role="alert">
          {a.actions.connect.error}
        </div>
      )}
      {a.account && !a.correctChain && (
        <div className="global-alert">
          <p>
            You’re connected to another network. Switch to {a.config.chain.name}{" "}
            to use your drop.
          </p>
          <Action
            id="network"
            label={`Switch to ${a.config.chain.name}`}
            onClick={a.switchChain}
          />
        </div>
      )}
      {a.uncertainActions.map(([id, action]) => (
        <div className="global-alert" key={id}>
          <p>
            A submitted transaction still needs confirmation. Keep this tab open
            and check its status before another transaction.
          </p>
          <a
            href={`${a.config.deployment.network.explorer}/tx/${action.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View submitted transaction ↗
          </a>
          <Action
            id={`confirm-${id}`}
            label="Check transaction confirmation"
            onClick={() => a.checkConfirmation(id)}
          />
        </div>
      ))}
      <main id="main" tabIndex={-1} aria-busy={a.isBusy}>
        {page}
      </main>
      <footer>
        <div className="footer-top">
          <a className="brand" href="#/">
            <Envelope small />
            <span>Dead Drop.</span>
          </a>
          <span className="mono small">EVERY WALLET HAS A DEAD DROP.</span>
        </div>
        <details className="deployment-details">
          <summary>
            Deployment & chain status{" "}
            <span>
              {a.verified ? "Verified live" : "Checking / unavailable"}
            </span>
          </summary>
          <div className="deployment-grid">
            <div>
              <p className="hint">
                {a.verified
                  ? "ABI hashes, contract code, token bindings and pool key verified."
                  : "Transaction controls stay disabled until the deployment can be verified."}
              </p>
              {a.readError && (
                <p className="error" role="alert">
                  {a.readError}
                </p>
              )}
              <button className="button" onClick={() => void a.refresh()}>
                Refresh chain state
              </button>
              <p className="hint">
                Public RPC reads refresh every 20 seconds while connected and
                visible.
              </p>
            </div>
            <div>
              {a.config.deployment.contracts.map((c) => (
                <p key={c.name}>
                  {c.name}
                  <br /> <AddressView address={c.address} full />
                </p>
              ))}
              <a href="./imd-deployment.json">Deployment manifest ↗</a>
              <p className="hint mono">
                Source: {a.config.deployment.sourceCommit}
                <br /> Launch: {a.config.deployment.launchId}
              </p>
            </div>
          </div>
        </details>
        <div className="footer-bottom">
          <span>Sealed in your browser. Settled on Ethereum.</span>
          <a href="#/manual">Privacy & the rules ↗</a>
          <a href="./llms.txt">llms.txt ↗</a>
        </div>
      </footer>
    </>
  );
}
