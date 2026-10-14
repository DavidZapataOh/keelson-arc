// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {RootRegistry} from "../src/RootRegistry.sol";
import {Settlement} from "../src/Settlement.sol";
import {IComplianceVerifier} from "../src/interfaces/IComplianceVerifier.sol";
import {ComplianceVerifier} from "../src/verifiers/ComplianceVerifier.sol";

/// @notice Deploys the whole system from the broadcasting account, which becomes the owner of every contract.
/// Configuration comes from the environment: REGULATOR_KEY_X, REGULATOR_KEY_Y, MIN_TIER, MAX_PROOF_AGE,
/// ATTESTATION_TTL, LIST_MAX_AGE and ROOT_GRACE.
contract Deploy is Script {
    function run() external {
        uint256 regulatorX = vm.envUint("REGULATOR_KEY_X");
        uint256 regulatorY = vm.envUint("REGULATOR_KEY_Y");
        ComplianceRegistry.Policy memory policy = ComplianceRegistry.Policy({
            minTier: uint8(vm.envUint("MIN_TIER")),
            maxProofAge: uint64(vm.envUint("MAX_PROOF_AGE")),
            attestationTtl: uint64(vm.envUint("ATTESTATION_TTL"))
        });
        uint64 listMaxAge = uint64(vm.envUint("LIST_MAX_AGE"));
        uint64 grace = uint64(vm.envUint("ROOT_GRACE"));

        vm.startBroadcast();
        address owner = msg.sender;
        ComplianceVerifier verifier = new ComplianceVerifier();
        RootRegistry issuers = new RootRegistry(owner, 0, grace);
        RootRegistry sanctions = new RootRegistry(owner, listMaxAge, grace);
        RootRegistry revocations = new RootRegistry(owner, listMaxAge, grace);
        ComplianceRegistry compliance = new ComplianceRegistry(
            owner, IComplianceVerifier(address(verifier)), issuers, sanctions, revocations, policy
        );
        compliance.setRegulatorKey(regulatorX, regulatorY);
        new Settlement(compliance);
        vm.stopBroadcast();
    }
}
