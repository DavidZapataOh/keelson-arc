import { complianceRegistryAbi, settlementAbi } from "@keelson/sdk/abi";
import { arc as arcChain } from "@keelson/sdk/arc";
import { type Address, createPublicClient, http, isAddressEqual, type PublicClient } from "viem";
import { DeploymentError, type DeploymentFile, parseDeploymentFile } from "./schema.ts";

export { DeploymentError, type DeploymentFile };

export async function fetchDeploymentFile(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<DeploymentFile> {
  let response: Response;
  try {
    response = await fetcher(url, { cache: "no-store" });
  } catch {
    throw new DeploymentError("unreachable", "the deployment file could not be reached");
  }
  if (!response.ok) {
    throw new DeploymentError("unreachable", `the deployment file answered ${response.status}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DeploymentError("invalid-file", "the deployment file is not JSON");
  }
  return parseDeploymentFile(body);
}

async function same(read: Promise<Address>, expected: Address, name: string) {
  const actual = await read;
  if (!isAddressEqual(actual, expected)) {
    throw new DeploymentError(
      "wrong-link",
      `${name} does not match the contract it should point to`,
    );
  }
}

export async function verifyDeployment(file: DeploymentFile, client: PublicClient) {
  if (file.chainId !== arcChain.id) {
    throw new DeploymentError("wrong-chain", "the deployment is not for Arc");
  }
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch {
    throw new DeploymentError("unreachable", "the RPC endpoint could not be reached");
  }
  if (chainId !== file.chainId) {
    throw new DeploymentError("wrong-chain", "the RPC endpoint serves a different chain");
  }

  const addresses = [
    ["verifier", file.verifier],
    ["issuers", file.issuers],
    ["sanctions", file.sanctions],
    ["revocations", file.revocations],
    ["compliance", file.compliance],
    ["settlement", file.settlement],
  ] as const;
  const codes = await Promise.all(addresses.map(([, address]) => client.getCode({ address })));
  addresses.forEach(([name], i) => {
    const code = codes[i];
    if (!code || code === "0x") {
      throw new DeploymentError("no-code", `${name} has no contract at its address`);
    }
  });

  const read = (name: "verifier" | "issuers" | "sanctions" | "revocations") =>
    client.readContract({
      address: file.compliance,
      abi: complianceRegistryAbi,
      functionName: name,
    }) as Promise<Address>;
  try {
    await Promise.all([
      same(read("verifier"), file.verifier, "verifier"),
      same(read("issuers"), file.issuers, "issuers"),
      same(read("sanctions"), file.sanctions, "sanctions"),
      same(read("revocations"), file.revocations, "revocations"),
      same(
        client.readContract({
          address: file.settlement,
          abi: settlementAbi,
          functionName: "compliance",
        }) as Promise<Address>,
        file.compliance,
        "settlement",
      ),
    ]);
  } catch (error) {
    if (error instanceof DeploymentError) throw error;
    throw new DeploymentError("wrong-link", "an address is not the contract it should be");
  }
}

export async function loadDeployment(
  url: string,
  makeClient: (rpcUrl: string) => PublicClient = (rpcUrl) =>
    createPublicClient({ chain: arcChain, transport: http(rpcUrl) }),
): Promise<{ file: DeploymentFile; client: PublicClient }> {
  const file = await fetchDeploymentFile(url);
  const client = makeClient(file.rpcUrl);
  await verifyDeployment(file, client);
  return { file, client };
}
