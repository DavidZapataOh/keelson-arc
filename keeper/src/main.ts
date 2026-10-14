import { SANCTIONS_DEPTH } from "@keelson/sdk";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "./config.ts";
import { Keeper } from "./keeper.ts";
import { RootPublisher } from "./publisher.ts";
import { syncRevocations } from "./revocations.ts";
import { syncSanctions } from "./sanctions.ts";

const config = loadConfig(process.env);
const probe = createPublicClient({ transport: http(config.rpcUrl) });
const chain = defineChain({
  id: await probe.getChainId(),
  name: "keeper-chain",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});
const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
const wallet = createWalletClient({
  account: privateKeyToAccount(config.privateKey),
  chain,
  transport: http(config.rpcUrl),
});

const sanctions = new RootPublisher(publicClient, wallet, config.sanctionsRegistry);
const revocations = new RootPublisher(publicClient, wallet, config.revocationsRegistry);

const keeper = new Keeper([
  {
    name: "sanctions",
    run: () =>
      syncSanctions({
        source: config.sanctionsSource,
        depth: SANCTIONS_DEPTH,
        publisher: sanctions,
        dataDir: config.dataDir,
      }),
  },
  {
    name: "revocations",
    run: () =>
      syncRevocations({
        url: `${config.issuerUrl}/revocations`,
        publisher: revocations,
        dataDir: config.dataDir,
      }),
  },
]);

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => controller.abort());
await keeper.run(config.intervalSeconds * 1000, controller.signal);
