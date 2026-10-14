import { defineConfig } from "vitest/config";

// The CLI tests start a Node process that loads the SDK's cryptography, which is slow on a busy machine.
export default defineConfig({ test: { testTimeout: 60_000 } });
