// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {RootRegistry} from "../../src/RootRegistry.sol";

contract RootRegistryHandler is Test {
    RootRegistry public immutable registry;
    address internal immutable owner;

    uint256 public publishes;
    uint256[] public roots;

    constructor(RootRegistry registry_, address owner_) {
        require(owner_ != address(0));
        registry = registry_;
        owner = owner_;
    }

    function publish(uint256 root) external {
        root = bound(root, 1, registry.SCALAR_FIELD() - 1);
        if (root == registry.current()) return;
        vm.prank(owner);
        registry.publish(root);
        publishes++;
        roots.push(root);
    }

    function refresh() external {
        if (registry.current() == 0) return;
        vm.prank(owner);
        registry.refresh();
    }

    function advance(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 0, 3 days));
    }

    function rootCount() external view returns (uint256) {
        return roots.length;
    }
}

contract RootRegistryInvariants is Test {
    address internal owner = makeAddr("owner");
    RootRegistry internal registry;
    RootRegistryHandler internal handler;

    function setUp() public {
        registry = new RootRegistry(owner, 1 days, 1 hours);
        handler = new RootRegistryHandler(registry, owner);
        targetContract(address(handler));
    }

    function invariant_VersionCountsPublishes() public view {
        assertEq(registry.version(), handler.publishes());
    }

    function invariant_OnlyTheLatestRootIsCurrent() public view {
        uint256 count = handler.rootCount();
        if (count == 0) return;
        assertEq(registry.current(), handler.roots(count - 1));
    }

    function invariant_AcceptedVersionNeverExceedsTheLatest() public view {
        uint256 count = handler.rootCount();
        for (uint256 i = 0; i < count; i++) {
            assertLe(registry.acceptedVersion(handler.roots(i)), registry.version());
        }
    }

    function invariant_AReplacedRootNeverBecomesAcceptableAgain() public view {
        uint256 count = handler.rootCount();
        if (count < 2) return;
        // every root except the current one is acceptable only inside its own grace window
        for (uint256 i = 0; i + 1 < count; i++) {
            uint256 root = handler.roots(i);
            if (root == registry.current()) continue;
            uint64 accepted = registry.acceptedVersion(root);
            if (accepted != 0) assertLe(accepted, registry.version() - 1);
        }
    }
}
