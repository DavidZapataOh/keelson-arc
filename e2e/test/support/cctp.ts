import { feeParams } from "@keelson/sdk";
import {
  type Address,
  concatHex,
  createTestClient,
  createWalletClient,
  type Hex,
  http,
  keccak256,
  pad,
  parseAbi,
  serializeSignature,
  toHex,
} from "viem";
import { sign } from "viem/accounts";
import { accountOf, type LocalChain } from "./chain.ts";

const attesterAbi = parseAbi([
  "function attesterManager() view returns (address)",
  "function setSignatureThreshold(uint256 newSignatureThreshold)",
  "function enableAttester(address newAttester)",
]);

const word = (value: bigint | number) => toHex(value, { size: 32 });
const address32 = (address: Address) => pad(address, { size: 32 });

/** Makes the forked MessageTransmitterV2 accept messages signed by the `attester` test account alone. */
export async function trustTestAttester(chain: LocalChain, transmitter: Address) {
  const manager = await chain.publicClient.readContract({
    address: transmitter,
    abi: attesterAbi,
    functionName: "attesterManager",
  });
  const test = createTestClient({ mode: "anvil", chain: chain.chain, transport: http(chain.url) });
  await test.setBalance({ address: manager, value: 10n ** 18n });
  await test.impersonateAccount({ address: manager });
  const wallet = createWalletClient({
    account: manager,
    chain: chain.chain,
    transport: http(chain.url),
  });
  const fees = await feeParams(chain.publicClient);
  const hashes = [
    await wallet.writeContract({
      address: transmitter,
      abi: attesterAbi,
      functionName: "enableAttester",
      args: [accountOf("attester").address],
      ...fees,
    }),
    await wallet.writeContract({
      address: transmitter,
      abi: attesterAbi,
      functionName: "setSignatureThreshold",
      args: [1n],
      ...fees,
    }),
  ];
  for (const hash of hashes) await chain.publicClient.waitForTransactionReceipt({ hash });
  await test.stopImpersonatingAccount({ address: manager });
}

/** A CCTP v2 burn message as another chain's TokenMessengerV2 would have emitted it. */
export function burnMessage(options: {
  sourceDomain: number;
  destinationDomain: number;
  sourceMessenger: Address;
  destinationMessenger: Address;
  burnToken: Address;
  recipient: Address;
  amount: bigint;
  sender: Address;
  nonce: Hex;
}): Hex {
  const body = concatHex([
    "0x00000001",
    address32(options.burnToken),
    address32(options.recipient),
    word(options.amount),
    address32(options.sender),
    word(0),
    word(0),
    word(0),
  ]);
  return concatHex([
    "0x00000001",
    toHex(options.sourceDomain, { size: 4 }),
    toHex(options.destinationDomain, { size: 4 }),
    options.nonce,
    address32(options.sourceMessenger),
    address32(options.destinationMessenger),
    word(0),
    toHex(2000, { size: 4 }),
    toHex(2000, { size: 4 }),
    body,
  ]);
}

/** The attestation the test attester would sign for a message. */
export async function attestTestMessage(message: Hex): Promise<Hex> {
  const key = accountOf("attester").getHdKey().privateKey as Uint8Array;
  return serializeSignature(await sign({ hash: keccak256(message), privateKey: toHex(key) }));
}
