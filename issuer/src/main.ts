import type { AddressInfo } from "node:net";
import { loadConfig } from "./config.ts";
import { startIssuer } from "./start.ts";

const server = await startIssuer(loadConfig(process.env));
const { address, port } = server.address() as AddressInfo;
console.log(`issuer listening on ${address}:${port}`);
