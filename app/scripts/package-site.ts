import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildCircuit } from "../../circuits/scripts/build.ts";

const { values } = parseArgs({
  options: {
    deployment: { type: "string" },
    out: { type: "string", default: "dist-site" },
  },
});
if (!values.deployment) throw new Error("usage: package-site.ts --deployment <file> [--out <dir>]");

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const out = resolve(values.out as string);
const deployment = JSON.parse(readFileSync(values.deployment, "utf8")) as {
  chainId: number;
  rpcUrl: string;
};
const remoteRpc = new URL(deployment.rpcUrl).protocol === "https:";

// The production circuit with its development keys; the app pins exactly these files by hash.
const circuit = await buildCircuit(
  "compliance",
  new URL("../../circuits/main/compliance.circom", import.meta.url).pathname,
);

execFileSync("./node_modules/.bin/vite", ["build", "--outDir", out, "--emptyOutDir"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_CHAIN_ID: String(deployment.chainId),
    VITE_CIRCUIT_WASM_SHA256: sha(circuit.wasm),
    VITE_CIRCUIT_ZKEY_SHA256: sha(circuit.zkey),
  },
});

mkdirSync(join(out, "circuit"), { recursive: true });
copyFileSync(circuit.wasm, join(out, "circuit/compliance.wasm"));
copyFileSync(circuit.zkey, join(out, "circuit/compliance.zkey"));
const published = remoteRpc ? { ...deployment, rpcFallbackPath: "/rpc" } : deployment;
writeFileSync(join(out, "deployment.json"), `${JSON.stringify(published, null, 2)}\n`);

const headers = (source: string, items: Record<string, string>) => ({
  source,
  headers: Object.entries(items).map(([key, value]) => ({ key, value })),
});
writeFileSync(
  join(out, "vercel.json"),
  `${JSON.stringify(
    {
      rewrites: remoteRpc ? [{ source: "/rpc", destination: deployment.rpcUrl }] : [],
      headers: [
        headers("/(.*)", { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }),
        headers("/assets/(.*)", { "Cache-Control": "public, max-age=31536000, immutable" }),
        headers("/circuit/(.*)", { "Cache-Control": "public, max-age=86400" }),
        headers("/deployment.json", { "Cache-Control": "no-cache" }),
      ],
    },
    null,
    2,
  )}\n`,
);
rmSync(join(out, ".vite"), { recursive: true, force: true });
console.log(`site packaged in ${out}`);
process.exit(0);
