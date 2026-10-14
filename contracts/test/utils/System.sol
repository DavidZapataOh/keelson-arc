// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";
import {RootRegistry} from "../../src/RootRegistry.sol";
import {Settlement} from "../../src/Settlement.sol";
import {IComplianceVerifier} from "../../src/interfaces/IComplianceVerifier.sol";
import {ComplianceVerifier} from "../../src/verifiers/ComplianceVerifier.sol";
import {Fixtures, ProofFixture} from "./Fixtures.sol";

/// @dev Deploys the whole system with the fixture roots and attests both fixture parties for trade 1.
abstract contract System is Test {
    uint256 internal constant TRADE_ID = 1;
    address internal constant SELLER = address(uint160(0xa11ce));
    address internal constant BUYER = address(uint160(0xb0b));

    RootRegistry internal issuers;
    RootRegistry internal sanctions;
    RootRegistry internal revocations;
    ComplianceRegistry internal compliance;
    Settlement internal settlement;

    function _deploySystem() internal {
        string memory json = Fixtures.json();
        vm.warp(vm.parseJsonUint(json, ".validAt") + 30);

        issuers = new RootRegistry(address(this), 0, 1 hours);
        sanctions = new RootRegistry(address(this), 1 days, 1 hours);
        revocations = new RootRegistry(address(this), 1 days, 1 hours);
        issuers.publish(vm.parseJsonUint(json, ".roots.issuers"));
        sanctions.publish(vm.parseJsonUint(json, ".roots.sanctions"));
        revocations.publish(vm.parseJsonUint(json, ".roots.revocations"));

        compliance = new ComplianceRegistry(
            address(this),
            IComplianceVerifier(address(new ComplianceVerifier())),
            issuers,
            sanctions,
            revocations,
            ComplianceRegistry.Policy({minTier: 1, maxProofAge: 1 hours, attestationTtl: 1 days})
        );
        compliance.setRegulatorKey(vm.parseJsonUint(json, ".regulatorKey.x"), vm.parseJsonUint(json, ".regulatorKey.y"));
        settlement = new Settlement(compliance);

        ProofFixture memory a = Fixtures.proof("partyA");
        ProofFixture memory b = Fixtures.proof("partyB");
        compliance.attest(a.a, a.b, a.c, a.signals);
        compliance.attest(b.a, b.b, b.c, b.signals);
    }
}
