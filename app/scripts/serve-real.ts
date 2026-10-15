import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { productionKeys } from "../../circuits/scripts/keys.ts";

const PORT = "4392";
const vite = "./node_modules/.bin/vite";
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

// The keys the system runs with, then an app build that pins exactly those files.
const circuit = await productionKeys();

execFileSync(vite, ["build", "--outDir", "dist-real"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_CHAIN_ID: "31337",
    VITE_CIRCUIT_WASM_SHA256: sha(circuit.wasm),
    VITE_CIRCUIT_ZKEY_SHA256: sha(circuit.zkey),
  },
});

const preview: ChildProcess = spawn(
  vite,
  ["preview", "--outDir", "dist-real", "--host", "127.0.0.1", "--port", PORT],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    preview.kill();
    process.exit(0);
  });
}
preview.on("exit", (code) => process.exit(code ?? 0));
