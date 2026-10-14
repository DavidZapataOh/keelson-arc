// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Settlement} from "../src/Settlement.sol";
import {System} from "./utils/System.sol";

/// @dev Settles with the real USDC and EURC deployed on Arc.
contract SettlementForkTest is System {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    IERC20 internal constant EURC = IERC20(0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1);
    bytes32 internal constant SALT = keccak256("fork");

    function setUp() public {
        vm.createSelectFork("arc");
        _deploySystem();
    }

    function test_SettlesEurcAgainstUsdc() public {
        deal(address(EURC), SELLER, 1_000e6);
        vm.deal(BUYER, 1_200e18);
        vm.prank(SELLER);
        EURC.approve(address(settlement), type(uint256).max);
        vm.prank(BUYER);
        USDC.approve(address(settlement), type(uint256).max);

        Settlement.Terms memory terms = Settlement.Terms({
            seller: SELLER,
            buyer: BUYER,
            sellToken: address(EURC),
            sellAmount: 1_000e6,
            payToken: address(USDC),
            payAmount: 1_150e6,
            expiry: uint64(block.timestamp + 1 hours)
        });
        bytes32 hash = settlement.hashTerms(TRADE_ID, terms, SALT);
        vm.prank(SELLER);
        settlement.commit(TRADE_ID, hash);
        vm.prank(BUYER);
        settlement.commit(TRADE_ID, hash);

        settlement.settle(TRADE_ID, terms, SALT);

        assertEq(EURC.balanceOf(BUYER), 1_000e6);
        assertEq(USDC.balanceOf(SELLER), 1_150e6);
        assertEq(USDC.balanceOf(BUYER), 50e6);
        assertEq(SELLER.balance, 1_150e18, "native balance carries 18 decimals");
    }

    function test_USDCSettlementIsAtomicWhenTheBuyerCannotPay() public {
        deal(address(EURC), SELLER, 1_000e6);
        vm.deal(BUYER, 100e18);
        vm.prank(SELLER);
        EURC.approve(address(settlement), type(uint256).max);
        vm.prank(BUYER);
        USDC.approve(address(settlement), type(uint256).max);

        Settlement.Terms memory terms = Settlement.Terms({
            seller: SELLER,
            buyer: BUYER,
            sellToken: address(EURC),
            sellAmount: 1_000e6,
            payToken: address(USDC),
            payAmount: 1_150e6,
            expiry: uint64(block.timestamp + 1 hours)
        });
        bytes32 hash = settlement.hashTerms(TRADE_ID, terms, SALT);
        vm.prank(SELLER);
        settlement.commit(TRADE_ID, hash);
        vm.prank(BUYER);
        settlement.commit(TRADE_ID, hash);

        vm.expectRevert();
        settlement.settle(TRADE_ID, terms, SALT);
        assertEq(EURC.balanceOf(SELLER), 1_000e6);
        assertEq(USDC.balanceOf(BUYER), 100e6);
    }
}
