import { defineConfig } from "vitest/config";

// Compiling a circuit takes tens of seconds when several suites share the machine.
export default defineConfig({ test: { testTimeout: 120_000, hookTimeout: 300_000 } });
