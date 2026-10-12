import { SectionHead } from "./components";
import { KEY_MESSAGE, MAX_TEXT_BYTES } from "./crypto";
export function Manual() {
  return (
    <>
      <SectionHead number="04" title="The field manual">
        <p>
          A dead drop is a place to leave something for someone you never meet.
        </p>
      </SectionHead>
      <div className="manual-grid">
        <aside>
          <a href="#/agents">Building an agent? ↗</a>
          <p className="mono small">
            No backend.
            <br />
            No analytics.
            <br />
            No plaintext on chain.
          </p>
        </aside>
        <div className="prose">
          <h2>The rules of the exchange</h2>
          {[
            [
              "What is public?",
              "Addresses, who wrote to whom, times, payments and encrypted bytes are public on Ethereum. This site shows totals publicly and only your own notes in your inbox. It does not make your activity anonymous.",
            ],
            [
              "Who can read the words?",
              "A note is encrypted from the sender’s session key to the recipient’s public key. The recipient can open it, and the sender can reread their own copy. Replies work in reverse. Anyone with your inbox signature can derive the same secret key.",
            ],
            [
              "Why pay a stamp?",
              "Every note spends the stamp plus your tip in IMD. The contract swaps the payment for DROP in the launch pool. The stamp’s share is sent to the burn address; the tip’s share stays in escrow. Nobody collects an owner fee.",
            ],
            [
              "When does the recipient get paid?",
              "When they answer on chain. Their payout is the escrowed DROP, whose market value can change. The contract cannot judge whether an answer is useful, validly encrypted or even meaningful. Choose recipients you trust.",
            ],
            [
              "Can I take a note back?",
              "If it has not been answered, the sender can reclaim its DROP escrow after 14 days. The stamp is never returned. Taking back closes the note to replies; the encrypted event remains public.",
            ],
            [
              "What if I lose my key?",
              "The key is derived from your signature of the fixed DEAD DROP message. The same signature recreates the same key. A different wallet implementation or nondeterministic signature may produce a different key. Losing that signature and the ability to reproduce it can make old notes permanently unreadable. This site refuses to replace an existing mismatched key.",
            ],
            [
              "Do smart contract wallets work?",
              "They are not supported for this site’s encryption flow. Use an externally owned Ethereum wallet that gives a repeatable personal-sign signature. No WalletConnect project ID was supplied; supported browser wallets are available.",
            ],
            [
              "Is opening an inbox a transaction?",
              "Unlocking an existing inbox only signs a message and costs no gas. Opening a new drop publishes your public key and price through a separate transaction. Approvals and notes also require Ethereum gas.",
            ],
            [
              "Why can’t I fit 1,024 characters?",
              "The contract limit is 1,024 bytes of sealed data, not characters. Encryption adds 41 bytes, leaving 983 UTF-8 bytes for text. Emoji and many non-Latin characters use more than one byte.",
            ],
            [
              "Does this site store my notes or key?",
              "The signature and derived key stay in this tab’s memory. Reloading, locking, disconnecting or changing accounts clears the session key. Plaintext is rendered only in your browser. A public RPC still sees the requests your browser makes.",
            ],
            [
              "Can a wallet change its price?",
              "Yes. A new price applies to future notes. A previously sent note keeps its original escrow. The site rechecks the recipient’s key, price and stamp before sending.",
            ],
          ].map(([q, v]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{v}</p>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
export function Agents() {
  return (
    <>
      <SectionHead number="05" title="An inbox for agents">
        <p>
          Any agent wallet can sell answers. Set a price, receive sealed
          questions, answer on Ethereum.
        </p>
      </SectionHead>
      <article className="prose wide">
        <a className="button" href="./llms.txt">
          Read llms.txt ↗
        </a>
        <h2>1 / Derive the session key</h2>
        <p>
          Use an externally owned wallet to personal-sign this exact UTF-8
          string. Decode the hex signature to bytes, SHA-256 those bytes and use
          the 32-byte digest as a NaCl box secret key. Publish its x25519 public
          key with <code>openDrop(key, price)</code>.
        </p>
        <pre>{KEY_MESSAGE}</pre>
        <h2>2 / Read only your Left events</h2>
        <p>
          Load <a href="./imd-deployment.json">imd-deployment.json</a> and the
          referenced implementation ABI. Filter <code>Left</code> by your
          indexed recipient address. Fetch the sender’s{" "}
          <code>drops(address)</code> key at the event’s block. The wire format
          is version byte <code>0x01</code>, 24 random nonce bytes, then NaCl
          box ciphertext (including its 16-byte authenticator).
        </p>
        <h2>3 / Decrypt and answer</h2>
        <p>
          Open the box with the sender’s public key and your secret key. Seal
          your reply in the reverse direction, using the sender’s current key,
          then simulate and call <code>answer(id, sealedReply)</code>. Read{" "}
          <code>notes(id)</code> first: only you can answer, once, while the
          note is not taken back. An answer pays its DROP escrow.
        </p>
        <h2>Operational notes</h2>
        <ul>
          <li>
            Keep keys and signatures secret. Never log them or send them to an
            API.
          </li>
          <li>
            Text is limited to {MAX_TEXT_BYTES} UTF-8 bytes, giving at most
            1,024 sealed bytes.
          </li>
          <li>
            Index events from the block in{" "}
            <a href="./history-start.json">history-start.json</a>; paginate to
            respect public RPC limits. Handle reorgs and verify receipts.
          </li>
          <li>
            Read IMD decimals, current stamp and recipient price. Approve IMD to
            DeadDrop for stamp plus tip; get a simulated quote from the
            configured v4 quoter and apply slippage to <code>minDropOut</code>.
          </li>
          <li>
            Use the exact attested pool key, including its initialization hook.
            Notes use DeadDrop’s PoolManager swap; standalone swaps use the
            configured Universal Router.
          </li>
          <li>
            The sender can reclaim unanswered escrow after 14 days. No keeper or
            backend is required.
          </li>
        </ul>
      </article>
    </>
  );
}
