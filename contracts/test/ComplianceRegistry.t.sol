// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {RootRegistry} from "../src/RootRegistry.sol";
import {IComplianceVerifier} from "../src/interfaces/IComplianceVerifier.sol";
import {ComplianceVerifier} from "../src/verifiers/ComplianceVerifier.sol";
import {Fixtures, ProofFixture} from "./utils/Fixtures.sol";

contract ComplianceRegistryTest is Test {
    uint256 internal constant TRADE_ID = 1;
    address internal constant PARTY_A = address(uint160(0xa11ce));
    address internal constant PARTY_B = address(uint160(0xb0b));

    address internal owner = makeAddr("owner");
    RootRegistry internal issuers;
    RootRegistry internal sanctions;
    RootRegistry internal revocations;
    ComplianceRegistry internal registry;
    uint256 internal validAt;
    uint256 internal regulatorX;
    uint256 internal regulatorY;

    ProofFixture internal a;
    ProofFixture internal b;
    ProofFixture internal alias_;

    event Attested(
        uint256 indexed tradeId,
        address indexed party,
        uint256 nullifier,
        uint64 sanctionsVersion,
        uint256 c1x,
        uint256 c1y,
        uint256 c2
    );

    function setUp() public {
        string memory json = Fixtures.json();
        validAt = vm.parseJsonUint(json, ".validAt");
        regulatorX = vm.parseJsonUint(json, ".regulatorKey.x");
        regulatorY = vm.parseJsonUint(json, ".regulatorKey.y");
        a = Fixtures.proof("partyA");
        b = Fixtures.proof("partyB");
        alias_ = Fixtures.proof("partyAAlias");

        vm.warp(validAt + 30);
        issuers = new RootRegistry(owner, 0, 1 hours);
        sanctions = new RootRegistry(owner, 1 days, 1 hours);
        revocations = new RootRegistry(owner, 1 days, 1 hours);
        vm.startPrank(owner);
        issuers.publish(vm.parseJsonUint(json, ".roots.issuers"));
        sanctions.publish(vm.parseJsonUint(json, ".roots.sanctions"));
        revocations.publish(vm.parseJsonUint(json, ".roots.revocations"));
        vm.stopPrank();

        registry = new ComplianceRegistry(
            owner,
            IComplianceVerifier(address(new ComplianceVerifier())),
            issuers,
            sanctions,
            revocations,
            ComplianceRegistry.Policy({minTier: 1, maxProofAge: 1 hours, attestationTtl: 1 days})
        );
        vm.prank(owner);
        registry.setRegulatorKey(regulatorX, regulatorY);
    }

    function _attest(ProofFixture memory p) internal {
        registry.attest(p.a, p.b, p.c, p.signals);
    }

    function test_AttestRecordsPassForTheProofAddress() public {
        vm.expectEmit(true, true, false, true);
        emit Attested(TRADE_ID, PARTY_A, a.signals[0], 1, a.signals[1], a.signals[2], a.signals[3]);
        _attest(a);

        assertTrue(registry.isCompliant(TRADE_ID, PARTY_A));
        assertFalse(registry.isCompliant(TRADE_ID, PARTY_B));
        assertFalse(registry.isCompliant(TRADE_ID + 1, PARTY_A));
        ComplianceRegistry.Attestation memory record = registry.attestationOf(TRADE_ID, PARTY_A);
        assertEq(record.attestedAt, block.timestamp);
        assertEq(record.sanctionsVersion, 1);
    }

    function test_AnyoneCanSubmitAPartyProof() public {
        vm.prank(makeAddr("relayer"));
        _attest(b);
        assertTrue(registry.isCompliant(TRADE_ID, PARTY_B));
    }

    function test_RejectsReplayOfTheSameProof() public {
        _attest(a);
        vm.expectRevert(ComplianceRegistry.NullifierUsed.selector);
        _attest(a);
    }

    function test_OneCredentialCannotAttestBothSidesOfATrade() public {
        _attest(a);
        vm.expectRevert(ComplianceRegistry.NullifierUsed.selector);
        _attest(alias_);
    }

    function test_RejectsAnyAlteredSignal() public {
        for (uint256 i = 0; i < 13; i++) {
            ProofFixture memory p = a;
            p.signals[i] += 1;
            vm.expectRevert();
            registry.attest(p.a, p.b, p.c, p.signals);
        }
    }

    function test_RejectsTradingAddressAboveTwentyBytes() public {
        ProofFixture memory p = a;
        p.signals[5] = uint256(type(uint160).max) + 1;
        vm.expectRevert(ComplianceRegistry.AddressOutOfRange.selector);
        registry.attest(p.a, p.b, p.c, p.signals);
    }

    function test_RejectsRootsThatAreNotAccepted() public {
        vm.prank(owner);
        registry.setPolicy(ComplianceRegistry.Policy({minTier: 1, maxProofAge: 1 days, attestationTtl: 1 days}));
        vm.prank(owner);
        sanctions.publish(5);
        vm.warp(block.timestamp + 1 hours + 1);
        vm.expectRevert(ComplianceRegistry.RootNotAccepted.selector);
        _attest(a);
    }

    function test_AcceptsAReplacedRootDuringGrace() public {
        vm.prank(owner);
        sanctions.publish(5);
        _attest(a);
        assertEq(registry.attestationOf(TRADE_ID, PARTY_A).sanctionsVersion, 1);
    }

    function test_RejectsStaleSanctionsListUntilRefreshed() public {
        vm.prank(owner);
        registry.setPolicy(ComplianceRegistry.Policy({minTier: 1, maxProofAge: 3 days, attestationTtl: 1 days}));
        vm.warp(validAt + 2 days);
        vm.prank(owner);
        revocations.refresh();

        vm.expectRevert(ComplianceRegistry.RootNotAccepted.selector);
        _attest(a);

        vm.prank(owner);
        sanctions.refresh();
        _attest(a);
    }

    function test_RejectsProofFromTheFutureOrTooOld() public {
        vm.warp(validAt - 1);
        vm.expectRevert(ComplianceRegistry.ProofNotCurrent.selector);
        _attest(a);

        vm.warp(validAt + 1 hours);
        _attest(a);
        vm.warp(validAt + 1 hours + 1);
        vm.expectRevert(ComplianceRegistry.ProofNotCurrent.selector);
        _attest(b);
    }

    function test_EnforcesTheMinimumTierPolicy() public {
        vm.prank(owner);
        registry.setPolicy(ComplianceRegistry.Policy({minTier: 2, maxProofAge: 1 hours, attestationTtl: 1 days}));
        vm.expectRevert(ComplianceRegistry.TierTooLow.selector);
        _attest(a);
    }

    function test_RejectsAProofForAnotherRegulatorKey() public {
        // Baby Jubjub base point, a valid curve point that differs from the registered key
        vm.prank(owner);
        registry.setRegulatorKey(
            5299619240641551281634865583518297030282874472190772894086521144482721001553,
            16950150798460657717958625567821834550301663161624707787222815936182638968203
        );
        vm.expectRevert(ComplianceRegistry.WrongRegulatorKey.selector);
        _attest(a);
    }

    function test_AttestationsExpire() public {
        _attest(a);
        vm.warp(block.timestamp + 1 days);
        assertTrue(registry.isCompliant(TRADE_ID, PARTY_A));
        vm.warp(block.timestamp + 1);
        assertFalse(registry.isCompliant(TRADE_ID, PARTY_A));
    }

    function test_OnlyTheOwnerSetsPolicyAndKey() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        registry.setPolicy(ComplianceRegistry.Policy({minTier: 0, maxProofAge: 0, attestationTtl: 0}));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        registry.setRegulatorKey(regulatorX, regulatorY);
    }

    function test_RegulatorKeyMustBeOnTheCurveAndNotTheIdentity() public {
        vm.startPrank(owner);
        vm.expectRevert(ComplianceRegistry.InvalidRegulatorKey.selector);
        registry.setRegulatorKey(1, 2);
        vm.expectRevert(ComplianceRegistry.InvalidRegulatorKey.selector);
        registry.setRegulatorKey(0, 1);
        vm.expectRevert(ComplianceRegistry.InvalidRegulatorKey.selector);
        registry.setRegulatorKey(regulatorX, regulatorY + 1);
        vm.stopPrank();
    }
}
