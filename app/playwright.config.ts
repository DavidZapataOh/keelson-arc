import { defineConfig } from "@playwright/test";

const external = process.env.E2E_BASE_URL;
const real = Boolean(process.env.E2E_REAL);
const testnet = Boolean(process.env.E2E_TESTNET);

const app = {
  command:
    "./node_modules/.bin/vite build --outDir dist && exec ./node_modules/.bin/vite preview --outDir dist --host 127.0.0.1 --port 4391",
  url: "http://127.0.0.1:4391",
  reuseExistingServer: false,
};

const local = {
  command: "node scripts/serve-real.ts",
  url: "http://127.0.0.1:4392",
  reuseExistingServer: false,
  timeout: 900_000,
};

const remote = {
  command: "node scripts/serve-testnet.ts",
  url: "http://127.0.0.1:4393",
  reuseExistingServer: false,
  timeout: 900_000,
};

export default defineConfig({
  reporter: "list",
  testDir: "e2e",
  use: { channel: "chrome" },
  projects: testnet
    ? [
        {
          name: "testnet",
          testMatch: /testnet\.spec\.ts/,
          timeout: 900_000,
          use: { baseURL: "http://127.0.0.1:4393" },
        },
      ]
    : real
      ? [
          {
            name: "real",
            testMatch: /real\.spec\.ts/,
            timeout: 600_000,
            use: { baseURL: "http://127.0.0.1:4392" },
          },
        ]
      : [
          {
            name: "app",
            testIgnore: /(real|testnet)\./,
            use: { baseURL: external ?? "http://127.0.0.1:4391" },
          },
        ],
  webServer: external ? undefined : testnet ? remote : real ? local : app,
});
