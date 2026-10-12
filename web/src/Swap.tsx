import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useApp } from "./state";
import {
  Action,
  AddressView,
  Field,
  SectionHead,
  WalletGate,
} from "./components";
import {
  amount,
  displayAmount,
  erc20Abi,
  permitAbi,
  routerAbi,
  same,
  swapInput,
} from "./protocol";
import { quote, requireFresh, type Quote } from "./quote";
import { useRemote } from "./useRemote";
export function Swap() {
  const a = useApp();
  const { config, account } = a;
  const network = config.deployment.network;
  const [selling, setSelling] = useState(false);
  const [value, setValue] = useState("");
  const [slippage, setSlippage] = useState("1");
  const [q, setQ] = useState<Quote>();
  const [now, setNow] = useState(Date.now());
  const token = selling ? config.token.address : network.pairToken.address;
  const inputSymbol = selling ? "DROP" : "IMD";
  const decimals = selling ? 18 : network.pairToken.decimals;
  const outputSymbol = selling ? "IMD" : "DROP";
  const outDecimals = selling ? network.pairToken.decimals : 18;
  let total = 0n;
  try {
    total = amount(value, decimals);
  } catch {
    /* validation occurs on quote */
  }
  useEffect(() => {
    setQ(undefined);
  }, [selling, value, slippage]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const allow = useRemote(async () => {
    if (!account) return undefined;
    const [erc20, permit] = await Promise.all([
      a.read<bigint>({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, network.uniswapV4.permit2],
      }),
      a.read<[bigint, number, number]>({
        address: network.uniswapV4.permit2,
        abi: permitAbi,
        functionName: "allowance",
        args: [account, token, network.uniswapV4.universalRouter],
      }),
    ]);
    return { erc20, permit };
  }, [account, token, a.revision]);
  const fresh =
    q &&
    now - q.created < 60000 &&
    q.amount === total &&
    same(q.input, token) &&
    q.slippage === slippage;
  const balance = selling ? a.stats?.dropBalance : a.stats?.imdBalance;
  const insufficient = balance !== undefined && balance < total;
  const approveToken = !allow.data || allow.data.erc20 < total;
  const approveRouter =
    !allow.data ||
    allow.data.permit[0] < total ||
    Number(allow.data.permit[1]) < Math.floor(now / 1000) + 120;
  const checked = () =>
    requireFresh(q, token, amount(value, decimals), slippage);
  return (
    <>
      <SectionHead number="03" title="Exchange in the open">
        <p>
          Swap IMD and DROP on the attested launch pool. Sending a note already
          buys DROP; this is a separate exchange.
        </p>
      </SectionHead>
      <div className="two-col">
        <div className="panel">
          <div className="row between">
            <h2>
              {inputSymbol} → {outputSymbol}
            </h2>
            <button
              className="button"
              onClick={() => {
                setSelling((v) => !v);
                setValue("");
              }}
            >
              Reverse pair ⇄
            </button>
          </div>
          <Field
            id="swap-amount"
            label={`You pay · ${inputSymbol}`}
            value={value}
            onChange={setValue}
            hint={`Available: ${displayAmount(balance, decimals)} ${inputSymbol}`}
          />
          <Field
            id="swap-slippage"
            label="Maximum slippage · %"
            value={slippage}
            onChange={setSlippage}
            hint="0.1–5%. Default 1%. Network gas is paid separately in ETH."
          />
          {insufficient && (
            <p className="notice">Your {inputSymbol} balance is too low.</p>
          )}
          {q && same(q.input, token) && q.amount === total && (
            <div className="quote">
              <p>
                Quote{" "}
                <strong>
                  {displayAmount(q.out, outDecimals)} {outputSymbol}
                </strong>
              </p>
              <p>
                Minimum received{" "}
                <strong>
                  {formatUnits(q.min, outDecimals)} {outputSymbol}
                </strong>
              </p>
              <p className="hint">
                {fresh
                  ? `Expires in ${Math.max(0, 60 - Math.floor((now - q.created) / 1000))}s`
                  : "Expired. Get a new quote."}
              </p>
            </div>
          )}
          <WalletGate>
            {!fresh ? (
              <Action
                id="quote-swap"
                label="Get swap quote"
                disabled={insufficient}
                onClick={() =>
                  a.run("quote-swap", async () =>
                    setQ(
                      await quote(
                        config,
                        token,
                        amount(value, decimals),
                        slippage,
                      ),
                    ),
                  )
                }
              />
            ) : approveToken ? (
              <>
                <p>
                  Step 1 · Approve exactly {value} {inputSymbol} to Permit2.
                </p>
                <Action
                  id="approve-swap-token"
                  label={`Approve ${inputSymbol} to Permit2`}
                  disabled={insufficient || allow.loading || !!allow.error}
                  onClick={() =>
                    a.transact("approve-swap-token", () => {
                      checked();
                      return {
                        address: token,
                        abi: erc20Abi,
                        functionName: "approve",
                        args: [network.uniswapV4.permit2, total],
                      };
                    })
                  }
                />
              </>
            ) : approveRouter ? (
              <>
                <p>
                  Step 2 · Authorize the Universal Router for this amount, for
                  20 minutes.
                </p>
                <Action
                  id="approve-swap-router"
                  label="Authorize router in Permit2"
                  disabled={insufficient}
                  onClick={() =>
                    a.transact("approve-swap-router", () => {
                      checked();
                      return {
                        address: network.uniswapV4.permit2,
                        abi: permitAbi,
                        functionName: "approve",
                        args: [
                          token,
                          network.uniswapV4.universalRouter,
                          total,
                          Math.floor(Date.now() / 1000) + 1200,
                        ],
                      };
                    })
                  }
                />
              </>
            ) : (
              <>
                <p>
                  Final step · Swap {value} {inputSymbol}. The router call is
                  simulated before your wallet opens.
                </p>
                <Action
                  id="swap"
                  label={`Swap ${inputSymbol} for ${outputSymbol}`}
                  disabled={insufficient}
                  onClick={() =>
                    a
                      .transact("swap", async () => {
                        const current = checked();
                        return {
                          address: network.uniswapV4.universalRouter,
                          abi: routerAbi,
                          functionName: "execute",
                          args: [
                            "0x10",
                            [
                              swapInput(
                                config.deployment.poolKey,
                                token,
                                current.amount,
                                current.min,
                                network.uniswapV4.extendedSwapParams,
                              ),
                            ],
                            BigInt(Math.floor(Date.now() / 1000) + 1200),
                          ],
                          value: 0n,
                        };
                      })
                      .then((ok) => {
                        if (ok) setQ(undefined);
                      })
                  }
                />
              </>
            )}
          </WalletGate>
          {allow.error && (
            <p role="alert" className="error">
              Cannot read allowances: {allow.error}
            </p>
          )}
          <p className="hint">
            USD context is unavailable. Quotes reflect this pool, including its
            fee.
          </p>
        </div>
        <aside className="panel plain">
          <p className="eyebrow">Pool coordinates</p>
          <h2>One pool. Exact key.</h2>
          <dl className="receipt">
            <div>
              <dt>Pool fee</dt>
              <dd>{config.deployment.poolKey.fee / 10000}%</dd>
            </div>
            <div>
              <dt>Tick spacing</dt>
              <dd>{config.deployment.poolKey.tickSpacing}</dd>
            </div>
          </dl>
          <p>Universal Router</p>
          <AddressView address={network.uniswapV4.universalRouter} full />
          <p>Permit2</p>
          <AddressView address={network.uniswapV4.permit2} full />
          <p className="hint">
            Amounts are approved separately. No unlimited approvals. A failed
            simulation stops the signature request.
          </p>
        </aside>
      </div>
    </>
  );
}
