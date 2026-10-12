import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { keccak256, toBytes } from "viem";
const root = path.resolve(import.meta.dirname, "../..");
const web = path.join(root, "web");
const dist = path.join(root, "dist");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const hashAbi = (abi) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
const equal = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const assert = (x, msg) => {
  if (!x) throw new Error(msg);
};
const handoff = read(path.join(web, "deployment/handoff.json"));
const network = read(path.join(web, "deployment/network.json"));
for (const [file, expected] of [
  ["deployment.json", handoff],
  ["network.json", network],
]) {
  const pinned = path.join(root, ".imd/reads", file);
  if (fs.existsSync(pinned))
    assert(equal(read(pinned), expected), `${file} differs from pinned input`);
}
assert(
  handoff.version === 1 && handoff.chainId === network.network.chainId,
  "Invalid handoff/network",
);
const base = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts: handoff.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
    abiPath: `abi/${name}.json`,
  })),
  poolKey: handoff.poolKey,
  network: network.network,
  ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}),
};
const walk = (dir, prefix = "") =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      assert(!e.isSymbolicLink(), "Symlinks are not permitted in export");
      const p = prefix + e.name;
      return e.isDirectory() ? walk(path.join(dir, e.name), p + "/") : [p];
    })
    .sort();
if (process.argv[2] === "prepare") {
  fs.mkdirSync(path.join(web, "public/abi"), { recursive: true });
  for (const c of base.contracts) {
    const source = `docs/abi/${c.name}.json`;
    const raw = execFileSync(
      "git",
      ["show", `${handoff.sourceCommit}:${source}`],
      { cwd: root, encoding: "utf8" },
    );
    const abi = JSON.parse(raw);
    assert(Array.isArray(abi), `${c.name} ABI is not an array`);
    assert(hashAbi(abi) === c.abiHash, `${c.name} canonical ABI hash mismatch`);
    assert(
      equal(read(path.join(root, source)), abi),
      `${source} changed from deployed commit`,
    );
    fs.writeFileSync(path.join(web, "public", c.abiPath), raw);
    console.log(`Verified pinned ${c.name}: ${c.abiHash}`);
  }
  fs.writeFileSync(
    path.join(web, "public/history-start.json"),
    JSON.stringify({
      blockNumber: Math.min(...handoff.contracts.map((c) => c.blockNumber)),
    }) + "\n",
  );
} else {
  const files = walk(dist).filter((p) => p !== "imd-deployment.json");
  assert(files.length <= 128, "Too many exported assets");
  let bytes = 0;
  const assets = files.map((p) => {
    assert(
      !p.includes("..") && !p.includes(":") && !p.startsWith("/"),
      "Unsafe path",
    );
    const b = fs.readFileSync(path.join(dist, p));
    bytes += b.length;
    assert(b.length <= 8388608, `Oversize asset ${p}`);
    return { path: p, sha256: createHash("sha256").update(b).digest("hex") };
  });
  assert(
    bytes < 8 * 1024 * 1024,
    "Export exceeds submission budget before source",
  );
  const expected = { ...base, assets };
  if (process.argv[2] === "finalize")
    fs.writeFileSync(
      path.join(dist, "imd-deployment.json"),
      JSON.stringify(expected, null, 2) + "\n",
    );
  const actual = read(path.join(dist, "imd-deployment.json"));
  assert(
    equal(actual, expected),
    "Manifest differs from exact handoff/network or asset inventory",
  );
  assert(files.includes("index.html"), "Missing index");
  for (const c of actual.contracts)
    assert(
      hashAbi(read(path.join(dist, c.abiPath))) === c.abiHash,
      `${c.name}: ABI binding mismatch`,
    );
  assert(
    !fs
      .readFileSync(path.join(dist, "index.html"), "utf8")
      .match(/(?:src|href)="\//),
    "Absolute asset reference",
  );
  console.log(
    `Verified manifest: ${files.length} assets, ${bytes} bytes; exact contract, pool, network and ABI binding.`,
  );
}
