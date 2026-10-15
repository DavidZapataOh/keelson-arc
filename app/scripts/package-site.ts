import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { arc } from "@keelson/sdk/arc";
import { arcTestnet } from "viem/chains";
import { developmentKeys, type Keys, productionKeys } from "../../circuits/scripts/keys.ts";

const { values } = parseArgs({
  options: {
    mainnet: { type: "string" },
    testnet: { type: "string" },
    out: { type: "string", default: "dist-site" },
  },
});
if (!values.mainnet && !values.testnet) {
  throw new Error("usage: package-site.ts [--mainnet <file>] [--testnet <file>] [--out <dir>]");
}

type Deployment = { chainId: number; rpcUrl: string; assetsUrl: string };

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const out = resolve(values.out as string);

async function keysFor(id: "mainnet" | "testnet"): Promise<Keys> {
  if (id === "testnet") return developmentKeys();
  const keys = await productionKeys();
  if (keys.source !== "ceremony") {
    throw new Error("Arc mainnet needs the keys of a published ceremony, not development keys");
  }
  return keys;
}

const networks = [];
for (const id of ["mainnet", "testnet"] as const) {
  const file = values[id];
  if (!file) continue;
  const deployment = JSON.parse(readFileSync(file, "utf8")) as Deployment;
  const expected = id === "mainnet" ? arc.id : arcTestnet.id;
  if (deployment.chainId !== expected) {
    throw new Error(`the ${id} deployment is for chain ${deployment.chainId}, not ${expected}`);
  }
  networks.push({ id, deployment, keys: await keysFor(id) });
}

// The app pins exactly these files by hash, per network.
const pinned = Object.fromEntries(
  networks.map(({ id, keys }) => [id, { wasm: sha(keys.wasm), zkey: sha(keys.zkey) }]),
);

execFileSync("./node_modules/.bin/vite", ["build", "--outDir", out, "--emptyOutDir"], {
  stdio: "inherit",
  env: { ...process.env, VITE_NETWORKS: JSON.stringify(pinned) },
});

const rewrites: { source: string; destination: string }[] = [];
for (const { id, deployment, keys } of networks) {
  mkdirSync(join(out, "circuit", id), { recursive: true });
  copyFileSync(keys.wasm, join(out, "circuit", id, "compliance.wasm"));
  copyFileSync(keys.zkey, join(out, "circuit", id, "compliance.zkey"));

  const remoteRpc = new URL(deployment.rpcUrl).protocol === "https:";
  const published = {
    ...deployment,
    assetsUrl: `${new URL(deployment.assetsUrl).origin}/circuit/${id}`,
    ...(remoteRpc ? { rpcFallbackPath: `/rpc/${id}` } : {}),
  };
  writeFileSync(join(out, `deployment.${id}.json`), `${JSON.stringify(published, null, 2)}\n`);
  if (remoteRpc) rewrites.push({ source: `/rpc/${id}`, destination: deployment.rpcUrl });
}

const headers = (source: string, items: Record<string, string>) => ({
  source,
  headers: Object.entries(items).map(([key, value]) => ({ key, value })),
});
writeFileSync(
  join(out, "vercel.json"),
  `${JSON.stringify(
    {
      rewrites,
      headers: [
        headers("/(.*)", { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }),
        headers("/assets/(.*)", { "Cache-Control": "public, max-age=31536000, immutable" }),
        headers("/circuit/(.*)", { "Cache-Control": "public, max-age=86400" }),
        headers("/deployment.(.*).json", { "Cache-Control": "no-cache" }),
      ],
    },
    null,
    2,
  )}\n`,
);
rmSync(join(out, ".vite"), { recursive: true, force: true });
console.log(`site packaged in ${out} for ${networks.map(({ id }) => id).join(" and ")}`);
process.exit(0);
