// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ArcForkTest is Test {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    IERC20 internal constant EURC = IERC20(0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1);

    function setUp() public {
        vm.createSelectFork("arc");
    }

    function test_UsdcErc20ViewMirrorsTheNativeBalance() public {
        address holder = makeAddr("holder");
        vm.deal(holder, 5e18);
        assertEq(USDC.balanceOf(holder), 5e6);
    }

    function test_UsdcTransferFromMovesTheNativeBalance() public {
        address from = makeAddr("from");
        address to = makeAddr("to");
        vm.deal(from, 5e18);
        vm.prank(from);
        USDC.approve(address(this), 3e6);
        assertTrue(USDC.transferFrom(from, to, 3e6));
        assertEq(USDC.balanceOf(to), 3e6);
        assertEq(to.balance, 3e18);
    }

    function test_EurcCanBeFunded() public {
        address holder = makeAddr("holder");
        deal(address(EURC), holder, 7e6);
        assertEq(EURC.balanceOf(holder), 7e6);
    }
}
