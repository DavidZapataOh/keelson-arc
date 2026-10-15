import { feeParams } from "@keelson/sdk";
import {
  type Address,
  concatHex,
  encodeFunctionData,
  type Hex,
  parseAbi,
  parseEventLogs,
  serializeSignature,
  toHex,
  zeroAddress,
} from "viem";
import { sign } from "viem/accounts";
import { type Actor, accountOf, type LocalChain } from "./chain.ts";

// Safe v1.4.1, deployed at the same addresses on Arc mainnet.
const SAFE_L2 = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";

const factoryAbi = parseAbi([
  "function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "event ProxyCreation(address indexed proxy, address singleton)",
]);

const safeAbi = parseAbi([
  "function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
  "function nonce() view returns (uint256)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)",
]);

/** Creates a Safe through the canonical factory and returns its address. */
export async function createSafe(
  chain: LocalChain,
  creator: Actor,
  owners: Address[],
  threshold: number,
): Promise<Address> {
  const initializer = encodeFunctionData({
    abi: safeAbi,
    functionName: "setup",
    args: [
      owners,
      BigInt(threshold),
      zeroAddress,
      "0x",
      FALLBACK_HANDLER,
      zeroAddress,
      0n,
      zeroAddress,
    ],
  });
  const wallet = chain.wallet(creator);
  const hash = await wallet.writeContract({
    address: PROXY_FACTORY,
    abi: factoryAbi,
    functionName: "createProxyWithNonce",
    args: [SAFE_L2, initializer, BigInt(Date.now())],
    account: wallet.account as NonNullable<typeof wallet.account>,
    chain: chain.chain,
    ...(await feeParams(chain.publicClient)),
  });
  const receipt = await chain.publicClient.waitForTransactionReceipt({ hash });
  const [created] = parseEventLogs({
    abi: factoryAbi,
    logs: receipt.logs,
    eventName: "ProxyCreation",
  });
  return (created as NonNullable<typeof created>).args.proxy;
}

/** Executes a call from the Safe, signed by the given owners (their raw signatures of the Safe transaction hash). */
export async function execFromSafe(
  chain: LocalChain,
  safe: Address,
  submitter: Actor,
  signers: Actor[],
  to: Address,
  data: Hex,
): Promise<Hex> {
  const nonce = await chain.publicClient.readContract({
    address: safe,
    abi: safeAbi,
    functionName: "nonce",
  });
  const safeTxHash = await chain.publicClient.readContract({
    address: safe,
    abi: safeAbi,
    functionName: "getTransactionHash",
    args: [to, 0n, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, nonce],
  });
  const ordered = [...signers].sort((a, b) =>
    BigInt(accountOf(a).address) < BigInt(accountOf(b).address) ? -1 : 1,
  );
  const signatures = concatHex(
    await Promise.all(
      ordered.map(async (actor) =>
        serializeSignature(
          await sign({
            hash: safeTxHash,
            privateKey: toHex(accountOf(actor).getHdKey().privateKey as Uint8Array),
          }),
        ),
      ),
    ),
  );

  const wallet = chain.wallet(submitter);
  const hash = await wallet.writeContract({
    address: safe,
    abi: safeAbi,
    functionName: "execTransaction",
    args: [to, 0n, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, signatures],
    account: wallet.account as NonNullable<typeof wallet.account>,
    chain: chain.chain,
    ...(await feeParams(chain.publicClient)),
  });
  const receipt = await chain.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("the Safe transaction reverted");
  return hash;
}
