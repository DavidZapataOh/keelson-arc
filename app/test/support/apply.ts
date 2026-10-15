import { complianceRegistryAbi, settlementAbi } from "@keelson/sdk/abi";
import { type Address, decodeFunctionData, erc20Abi, type Hex } from "viem";
import { ADDRESSES } from "./fakeChain.ts";
import { allowanceKey, partyKey, type World } from "./world.ts";

type Tx = { from?: string; to: Address; data: Hex };

/** What mining a transaction does to the world the room reads, for tests of the wired room. */
export function applyTransaction(
  world: World,
  tx: Tx,
  parties: { token: Address; sender: Address },
) {
  const to = tx.to.toLowerCase();
  const sender = (tx.from ?? parties.sender) as Address;
  if (to === ADDRESSES.compliance.toLowerCase()) {
    const call = decodeFunctionData({ abi: complianceRegistryAbi, data: tx.data });
    if (call.functionName === "attest") world.compliant.add(partyKey(sender));
  } else if (to === ADDRESSES.settlement.toLowerCase()) {
    const call = decodeFunctionData({ abi: settlementAbi, data: tx.data });
    if (call.functionName === "commit") {
      const [, hash] = call.args as [bigint, Hex];
      world.commitments.set(partyKey(sender), hash);
    }
    if (call.functionName === "settle") world.settled = true;
  } else {
    const call = decodeFunctionData({ abi: erc20Abi, data: tx.data });
    if (call.functionName === "approve") {
      const [, amount] = call.args as [Address, bigint];
      world.allowance.set(allowanceKey(tx.to, sender), amount);
    }
  }
  void parties.token;
}
