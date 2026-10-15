// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {
    Config,
    Deployed,
    Deployer,
    KeeperMustNotBeTheSafe,
    OwnersMustBeBothSetOrBothUnset
} from "../script/Deploy.s.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";

contract DeployerHarness {
    function deploy(Config memory config) external returns (Deployed memory) {
        return Deployer.deploy(config, address(this));
    }
}

contract DeployTest is Test {
    address private constant SAFE = address(0x5AFE);
    address private constant KEEPER = address(0xBEEF);

    DeployerHarness private deployer = new DeployerHarness();

    function _config(address safe, address keeper) private pure returns (Config memory) {
        return Config({
            regulatorX: 5299619240641551281634865583518297030282874472190772894086521144482721001553,
            regulatorY: 16950150798460657717958625567821834550301663161624707787222815936182638968203,
            policy: ComplianceRegistry.Policy({minTier: 1, maxProofAge: 1 hours, attestationTtl: 1 days}),
            listMaxAge: 1 days,
            grace: 1 hours,
            safe: safe,
            keeper: keeper
        });
    }

    function test_DeployerKeepsEverythingWhenNoOwnersAreGiven() public {
        Deployed memory d = deployer.deploy(_config(address(0), address(0)));
        assertEq(d.issuers.owner(), address(deployer));
        assertEq(d.compliance.owner(), address(deployer));
        assertEq(d.sanctions.pendingOwner(), address(0));
        assertEq(d.revocations.pendingOwner(), address(0));
    }

    function test_NominatesTheSafeAndTheKeeperButOwnsUntilTheyAccept() public {
        Deployed memory d = deployer.deploy(_config(SAFE, KEEPER));
        assertEq(d.issuers.owner(), address(deployer));
        assertEq(d.issuers.pendingOwner(), SAFE);
        assertEq(d.compliance.pendingOwner(), SAFE);
        assertEq(d.sanctions.pendingOwner(), KEEPER);
        assertEq(d.revocations.pendingOwner(), KEEPER);

        vm.startPrank(SAFE);
        d.issuers.acceptOwnership();
        d.compliance.acceptOwnership();
        vm.startPrank(KEEPER);
        d.sanctions.acceptOwnership();
        d.revocations.acceptOwnership();
        vm.stopPrank();

        assertEq(d.issuers.owner(), SAFE);
        assertEq(d.compliance.owner(), SAFE);
        assertEq(d.sanctions.owner(), KEEPER);
        assertEq(d.revocations.owner(), KEEPER);
    }

    function test_TheKeeperCannotPublishToTheRegistriesTheSafeOwns() public {
        Deployed memory d = deployer.deploy(_config(SAFE, KEEPER));
        vm.prank(SAFE);
        d.issuers.acceptOwnership();
        vm.prank(KEEPER);
        d.sanctions.acceptOwnership();

        vm.prank(KEEPER);
        vm.expectRevert();
        d.issuers.publish(1);
        vm.prank(SAFE);
        vm.expectRevert();
        d.sanctions.publish(1);
    }

    function test_ConfiguresTheRegulatorKeyAndPolicy() public {
        Deployed memory d = deployer.deploy(_config(address(0), address(0)));
        assertEq(
            d.compliance.regulatorKeyX(), 5299619240641551281634865583518297030282874472190772894086521144482721001553
        );
        (uint8 minTier,,) = d.compliance.policy();
        assertEq(minTier, 1);
        assertEq(address(d.settlement.compliance()), address(d.compliance));
    }

    function test_RejectsASingleOwnerAndAKeeperThatIsTheSafe() public {
        vm.expectRevert(OwnersMustBeBothSetOrBothUnset.selector);
        deployer.deploy(_config(SAFE, address(0)));
        vm.expectRevert(OwnersMustBeBothSetOrBothUnset.selector);
        deployer.deploy(_config(address(0), KEEPER));
        vm.expectRevert(KeeperMustNotBeTheSafe.selector);
        deployer.deploy(_config(SAFE, SAFE));
    }
}
