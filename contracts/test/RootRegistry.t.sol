// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {RootRegistry} from "../src/RootRegistry.sol";

contract RootRegistryTest is Test {
    uint64 internal constant MAX_AGE = 1 days;
    uint64 internal constant GRACE = 1 hours;

    RootRegistry internal registry;
    address internal owner = makeAddr("owner");

    event RootPublished(uint64 indexed version, uint256 root);
    event RootRefreshed(uint64 indexed version, uint64 timestamp);

    function setUp() public {
        vm.warp(1_000_000);
        registry = new RootRegistry(owner, MAX_AGE, GRACE);
    }

    function test_PublishRecordsRootAndVersion() public {
        vm.expectEmit(true, false, false, true);
        emit RootPublished(1, 11);
        vm.prank(owner);
        registry.publish(11);

        assertEq(registry.current(), 11);
        assertEq(registry.version(), 1);
        assertEq(registry.acceptedVersion(11), 1);
    }

    function test_OnlyOwnerCanPublishOrRefresh() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        registry.publish(11);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        registry.refresh();
    }

    function test_RejectsZeroOutOfFieldAndRepeatedRoots() public {
        uint256 field = registry.SCALAR_FIELD();
        vm.startPrank(owner);
        vm.expectRevert(RootRegistry.InvalidRoot.selector);
        registry.publish(0);
        vm.expectRevert(RootRegistry.InvalidRoot.selector);
        registry.publish(field);
        registry.publish(11);
        vm.expectRevert(RootRegistry.RootUnchanged.selector);
        registry.publish(11);
        vm.stopPrank();
    }

    function test_ReplacedRootStaysAcceptableOnlyDuringGrace() public {
        vm.startPrank(owner);
        registry.publish(11);
        registry.publish(22);
        vm.stopPrank();

        assertEq(registry.acceptedVersion(11), 1);
        assertEq(registry.acceptedVersion(22), 2);

        vm.warp(block.timestamp + GRACE);
        assertEq(registry.acceptedVersion(11), 1, "boundary is inclusive");
        vm.warp(block.timestamp + 1);
        assertEq(registry.acceptedVersion(11), 0);
        assertEq(registry.acceptedVersion(22), 2);
    }

    function test_CurrentRootGoesStaleUntilRefreshed() public {
        vm.prank(owner);
        registry.publish(11);

        vm.warp(block.timestamp + MAX_AGE);
        assertEq(registry.acceptedVersion(11), 1, "boundary is inclusive");
        vm.warp(block.timestamp + 1);
        assertEq(registry.acceptedVersion(11), 0, "stale");

        vm.expectEmit(true, false, false, true);
        emit RootRefreshed(1, uint64(block.timestamp));
        vm.prank(owner);
        registry.refresh();
        assertEq(registry.acceptedVersion(11), 1);
    }

    function test_AReplacedRootCanBePublishedAgainWithANewVersion() public {
        vm.startPrank(owner);
        registry.publish(11);
        registry.publish(22);
        registry.publish(11);
        vm.stopPrank();

        assertEq(registry.version(), 3);
        assertEq(registry.acceptedVersion(11), 3);
        assertEq(registry.acceptedVersion(22), 2);
        vm.warp(block.timestamp + GRACE + 1);
        assertEq(registry.acceptedVersion(22), 0);
        assertEq(registry.acceptedVersion(11), 3);
    }

    function test_RootWithoutStalenessLimitNeverExpires() public {
        RootRegistry open = new RootRegistry(owner, 0, GRACE);
        vm.prank(owner);
        open.publish(11);
        vm.warp(block.timestamp + 365 days);
        assertEq(open.acceptedVersion(11), 1);
    }

    function test_UnknownRootsAreNeverAccepted() public {
        assertEq(registry.acceptedVersion(0), 0);
        assertEq(registry.acceptedVersion(123), 0);
        vm.prank(owner);
        registry.publish(11);
        assertEq(registry.acceptedVersion(0), 0);
        assertEq(registry.acceptedVersion(123), 0);
    }

    function test_RefreshNeedsAPublishedRoot() public {
        vm.prank(owner);
        vm.expectRevert(RootRegistry.NothingPublished.selector);
        registry.refresh();
    }

    function test_OwnershipTransfersInTwoSteps() public {
        address next = makeAddr("next");
        vm.prank(owner);
        registry.transferOwnership(next);
        assertEq(registry.owner(), owner);
        vm.prank(next);
        registry.acceptOwnership();
        assertEq(registry.owner(), next);
    }

    function testFuzz_VersionsIncreaseAndOnlyLatestIsCurrent(uint256 first, uint256 second) public {
        first = bound(first, 1, registry.SCALAR_FIELD() - 1);
        second = bound(second, 1, registry.SCALAR_FIELD() - 1);
        vm.assume(first != second);

        vm.startPrank(owner);
        registry.publish(first);
        registry.publish(second);
        vm.stopPrank();

        assertEq(registry.version(), 2);
        assertEq(registry.current(), second);
        assertEq(registry.acceptedVersion(first), 1);
        assertEq(registry.acceptedVersion(second), 2);
    }
}
