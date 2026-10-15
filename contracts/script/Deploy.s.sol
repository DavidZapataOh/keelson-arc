// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {RootRegistry} from "../src/RootRegistry.sol";
import {Settlement} from "../src/Settlement.sol";
import {IComplianceVerifier} from "../src/interfaces/IComplianceVerifier.sol";
import {ComplianceVerifier} from "../src/verifiers/ComplianceVerifier.sol";

struct Config {
    uint256 regulatorX;
    uint256 regulatorY;
    ComplianceRegistry.Policy policy;
    uint64 listMaxAge;
    uint64 grace;
    address safe;
    address keeper;
}

struct Deployed {
    ComplianceVerifier verifier;
    RootRegistry issuers;
    RootRegistry sanctions;
    RootRegistry revocations;
    ComplianceRegistry compliance;
    Settlement settlement;
}

error OwnersMustBeBothSetOrBothUnset();
error KeeperMustNotBeTheSafe();

/// @notice Deploys the whole system from the calling account, `owner`, which owns every contract until the
/// nominated owners accept: `safe` for the issuers registry and the compliance registry, `keeper` for the
/// two registries it keeps up to date. Both are optional, and must be given together.
library Deployer {
    function deploy(Config memory config, address owner) internal returns (Deployed memory d) {
        if ((config.safe == address(0)) != (config.keeper == address(0))) revert OwnersMustBeBothSetOrBothUnset();
        if (config.safe == config.keeper && config.safe != address(0)) revert KeeperMustNotBeTheSafe();

        d.verifier = new ComplianceVerifier();
        d.issuers = new RootRegistry(owner, 0, config.grace);
        d.sanctions = new RootRegistry(owner, config.listMaxAge, config.grace);
        d.revocations = new RootRegistry(owner, config.listMaxAge, config.grace);
        d.compliance = new ComplianceRegistry(
            owner, IComplianceVerifier(address(d.verifier)), d.issuers, d.sanctions, d.revocations, config.policy
        );
        d.compliance.setRegulatorKey(config.regulatorX, config.regulatorY);
        d.settlement = new Settlement(d.compliance);

        if (config.safe != address(0)) {
            d.issuers.transferOwnership(config.safe);
            d.compliance.transferOwnership(config.safe);
            d.sanctions.transferOwnership(config.keeper);
            d.revocations.transferOwnership(config.keeper);
        }
    }
}

/// @notice Configuration comes from the environment: REGULATOR_KEY_X, REGULATOR_KEY_Y, MIN_TIER, MAX_PROOF_AGE,
/// ATTESTATION_TTL, LIST_MAX_AGE and ROOT_GRACE, plus SAFE and KEEPER if ownership is to be handed over.
contract Deploy is Script {
    function run() external returns (Deployed memory deployed) {
        Config memory config = Config({
            regulatorX: vm.envUint("REGULATOR_KEY_X"),
            regulatorY: vm.envUint("REGULATOR_KEY_Y"),
            policy: ComplianceRegistry.Policy({
                minTier: uint8(vm.envUint("MIN_TIER")),
                maxProofAge: uint64(vm.envUint("MAX_PROOF_AGE")),
                attestationTtl: uint64(vm.envUint("ATTESTATION_TTL"))
            }),
            listMaxAge: uint64(vm.envUint("LIST_MAX_AGE")),
            grace: uint64(vm.envUint("ROOT_GRACE")),
            safe: vm.envOr("SAFE", address(0)),
            keeper: vm.envOr("KEEPER", address(0))
        });
        vm.startBroadcast();
        deployed = Deployer.deploy(config, msg.sender);
        vm.stopBroadcast();
    }
}
