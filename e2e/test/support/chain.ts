import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { type Deployment, feeParams, readBroadcast } from "@keelson/sdk";
import {
  type Chain,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  type PublicClient,
  toHex,
  type WalletClient,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const contracts = resolve(new URL("../../../contracts", import.meta.url).pathname);

// Foundry's well-known development mnemonic: these accounts are funded on the local node and hold nothing anywhere else.
const MNEMONIC = "test test test test test test test test test test test junk";
const ACCOUNTS = { owner: 0, seller: 1, buyer: 2 } as const;
const account = (actor: keyof typeof ACCOUNTS) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: ACCOUNTS[actor] });

export type Actor = keyof typeof ACCOUNTS;

const freePort = () =>
  new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolvePort(port));
    });
  });

export type LocalChain = {
  url: string;
  chain: Chain;
  publicClient: PublicClient;
  wallet: (actor: Actor) => WalletClient;
  stop: () => void;
};

/** Starts a local Arc node (`arc-anvil --network arc`) on a free port. */
export async function startChain(): Promise<LocalChain> {
  const port = await freePort();
  const child: ChildProcess = spawn(
    "arc-anvil",
    ["--network", "arc", "--port", String(port), "--silent"],
    {
      stdio: "ignore",
    },
  );
  const url = `http://127.0.0.1:${port}`;
  const chain = defineChain({
    id: 31337,
    name: "Local Arc",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(url) });

  for (let attempt = 0; ; attempt++) {
    try {
      await publicClient.getChainId();
      break;
    } catch (error) {
      if (attempt > 100) throw error;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return {
    url,
    chain,
    publicClient,
    wallet: (actor) =>
      createWalletClient({
        account: account(actor),
        chain,
        transport: http(url),
      }),
    stop: () => child.kill(),
  };
}

/** Deploys the whole system with the contracts' own deploy script and reads the addresses back. */
export function deploySystem(
  chain: LocalChain,
  env: { regulatorKeyX: bigint; regulatorKeyY: bigint },
): Deployment {
  execFileSync(
    "arc-forge",
    [
      "script",
      "script/Deploy.s.sol",
      "--network",
      "arc",
      "--rpc-url",
      chain.url,
      "--broadcast",
      "--private-key",
      toHex(account("owner").getHdKey().privateKey as Uint8Array),
    ],
    {
      cwd: contracts,
      stdio: "pipe",
      env: {
        ...process.env,
        REGULATOR_KEY_X: env.regulatorKeyX.toString(),
        REGULATOR_KEY_Y: env.regulatorKeyY.toString(),
        MIN_TIER: "1",
        MAX_PROOF_AGE: "3600",
        ATTESTATION_TTL: "86400",
        LIST_MAX_AGE: "86400",
        ROOT_GRACE: "3600",
      },
    },
  );
  const broadcast = JSON.parse(
    readFileSync(`${contracts}/broadcast/Deploy.s.sol/${chain.chain.id}/run-latest.json`, "utf8"),
  );
  return readBroadcast(broadcast);
}

/** Deploys the test-only ERC-20 from the compiled artifacts and mints to the given holder. */
export async function deployToken(chain: LocalChain, name: string): Promise<Hex> {
  const artifact = JSON.parse(
    readFileSync(`${contracts}/out/TestToken.sol/TestToken.json`, "utf8"),
  );
  const wallet = chain.wallet("owner");
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [name],
    account: wallet.account as NonNullable<typeof wallet.account>,
    chain: chain.chain,
    ...(await feeParams(chain.publicClient)),
  });
  const receipt = await chain.publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress as Hex;
}

export const tokenAbi = (() =>
  JSON.parse(readFileSync(`${contracts}/out/TestToken.sol/TestToken.json`, "utf8")).abi)();
