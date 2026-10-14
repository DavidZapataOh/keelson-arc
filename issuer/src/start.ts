import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { openSnapshot } from "@keelson/lists";
import { issuerFromKey } from "@keelson/sdk";
import type { Config } from "./config.ts";
import { createApp } from "./server.ts";
import { IssuerService } from "./service.ts";
import { Store } from "./store.ts";

/** Opens the database and the sanctions snapshot, then starts listening. */
export async function startIssuer(config: Config): Promise<Server> {
  const sanctions = openSnapshot(JSON.parse(readFileSync(config.sanctionsSnapshot, "utf8")));
  const service = new IssuerService(
    issuerFromKey(config.issuerPrivateKey),
    new Store(config.dbPath),
    sanctions,
  );
  const server = createApp(service, config);
  await new Promise<void>((resolve) => server.listen(config.port, config.host, resolve));
  return server;
}
