// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ComplianceVerifier} from "../src/verifiers/ComplianceVerifier.sol";
import {Fixtures, ProofFixture} from "./utils/Fixtures.sol";

contract ComplianceVerifierTest is Test {
    ComplianceVerifier internal verifier;
    ProofFixture internal p;

    function setUp() public {
        verifier = new ComplianceVerifier();
        p = Fixtures.proof("partyA");
    }

    function test_AcceptsValidProof() public view {
        assertTrue(verifier.verifyProof(p.a, p.b, p.c, p.signals));
    }

    function test_RejectsAnyAlteredSignal() public view {
        for (uint256 i = 0; i < 13; i++) {
            uint256[13] memory s = p.signals;
            s[i] += 1;
            assertFalse(verifier.verifyProof(p.a, p.b, p.c, s), "signal not bound");
        }
    }

    function test_RejectsSignalOutsideTheField() public view {
        uint256[13] memory s = p.signals;
        s[0] += 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        assertFalse(verifier.verifyProof(p.a, p.b, p.c, s));
    }

    function test_RejectsAlteredProofElements() public view {
        uint256[2] memory a = p.a;
        a[0] = 1;
        a[1] = 2;
        assertFalse(verifier.verifyProof(a, p.b, p.c, p.signals));
        uint256[2] memory c = p.c;
        c[0] = 1;
        c[1] = 2;
        assertFalse(verifier.verifyProof(p.a, p.b, c, p.signals));
    }

    function test_RevertsOnPointsOffTheCurve() public {
        uint256[2] memory a = p.a;
        a[1] += 1;
        vm.expectRevert();
        verifier.verifyProof(a, p.b, p.c, p.signals);
    }

    function test_VerificationGas() public view {
        ProofFixture memory f = p;
        uint256 before = gasleft();
        verifier.verifyProof(f.a, f.b, f.c, f.signals);
        assertLt(before - gasleft(), 275_000);
    }

    function test_MalformedPointsCannotBurnTheGasLimit() public view {
        ProofFixture memory f = p;
        f.a[1] += 1;
        uint256 before = gasleft();
        try verifier.verifyProof{gas: 5_000_000}(f.a, f.b, f.c, f.signals) returns (bool) {
            revert("expected a revert");
        } catch {}
        assertLt(before - gasleft(), 300_000);
    }
}
