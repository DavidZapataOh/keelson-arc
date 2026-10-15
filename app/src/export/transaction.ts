import { complianceRegistryAbi, settlementAbi } from "@keelson/sdk/abi";
import { MIN_FEE_PER_GAS } from "@keelson/sdk/fees";
import {
  type Abi,
  type Address,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  isAddressEqual,
  stringify,
} from "viem";
import { ARC as arc } from "../chain.ts";

export type Call = { to: Address; data: Hex; value?: bigint };

export type ExportedTransaction = {
  chainId: number;
  to: Address;
  data: Hex;
  value: bigint;
  maxFeePerGas: bigint;
};

export type CallDescription = { contract: string; function: string; args: readonly unknown[] };

export function exportTransaction(
  call: Call,
  maxFeePerGas: bigint = MIN_FEE_PER_GAS,
): ExportedTransaction {
  return {
    chainId: arc.id,
    to: call.to,
    data: call.data,
    value: call.value ?? 0n,
    maxFeePerGas: maxFeePerGas > MIN_FEE_PER_GAS ? maxFeePerGas : MIN_FEE_PER_GAS,
  };
}

export const transactionJson = (tx: ExportedTransaction): string => `${stringify(tx, null, 2)}\n`;

type Known = { contracts: { name: string; address: Address; abi: Abi }[] };

/** Names a call the way a custody policy allowlists it: contract and function, with decoded arguments. */
export function describeCall(call: Call, known: Known): CallDescription {
  const match = known.contracts.find((c) => isAddressEqual(c.address, call.to));
  if (!match) throw new Error("the call is not addressed to a known contract");
  const decoded = decodeFunctionData({ abi: match.abi, data: call.data });
  return { contract: match.name, function: decoded.functionName, args: decoded.args ?? [] };
}

export const knownContracts = (deployment: {
  compliance: Address;
  settlement: Address;
}): Known["contracts"] => [
  { name: "ComplianceRegistry", address: deployment.compliance, abi: complianceRegistryAbi },
  { name: "Settlement", address: deployment.settlement, abi: settlementAbi },
];

export const tokenContract = (name: string, address: Address): Known["contracts"][number] => ({
  name,
  address,
  abi: erc20Abi,
});

export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}
