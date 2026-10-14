import { defineConfig } from "@playwright/test";

const external = process.env.E2E_BASE_URL;

export default defineConfig({
  reporter: "list",
  testDir: "e2e",
  use: { baseURL: external ?? "http://127.0.0.1:4391", channel: "chrome" },
  webServer: external
    ? undefined
    : {
        command:
          "./node_modules/.bin/vite build && exec ./node_modules/.bin/vite preview --host 127.0.0.1 --port 4391",
        url: "http://127.0.0.1:4391",
        reuseExistingServer: false,
      },
});
