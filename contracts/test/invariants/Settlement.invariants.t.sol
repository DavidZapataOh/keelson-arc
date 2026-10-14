// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Settlement} from "../../src/Settlement.sol";
import {System} from "../utils/System.sol";
import {TestToken} from "../utils/TestToken.sol";

contract SettlementHandler is System {
    TestToken public immutable assetToken;
    TestToken public immutable cashToken;
    Settlement public immutable target;

    struct Deal {
        uint96 sellAmount;
        uint96 payAmount;
        bytes32 salt;
    }

    uint256 public successfulSettlements;
    mapping(uint256 tradeId => Deal) internal deals;
    mapping(uint256 tradeId => uint256) public settlementsOf;
    uint256[] public tradeIds;

    constructor(Settlement target_, TestToken assetToken_, TestToken cashToken_) {
        target = target_;
        assetToken = assetToken_;
        cashToken = cashToken_;
    }

    function fund(uint96 assetAmount, uint96 cashAmount) external {
        assetToken.mint(SELLER, assetAmount);
        cashToken.mint(BUYER, cashAmount);
    }

    function commitBoth(uint256 tradeId, uint96 sellAmount, uint96 payAmount, bytes32 salt) external {
        tradeId = bound(tradeId, 1, 2);
        deals[tradeId] = Deal(sellAmount, payAmount, salt);
        assetToken.mint(SELLER, sellAmount);
        cashToken.mint(BUYER, payAmount);
        Settlement.Terms memory terms = _terms(sellAmount, payAmount);
        bytes32 hash = target.hashTerms(tradeId, terms, salt);
        vm.prank(SELLER);
        try target.commit(tradeId, hash) {} catch {}
        vm.prank(BUYER);
        try target.commit(tradeId, hash) {} catch {}
    }

    function settleCommitted(uint256 tradeId) external {
        tradeId = bound(tradeId, 1, 2);
        Deal memory deal = deals[tradeId];
        assetToken.mint(SELLER, deal.sellAmount);
        cashToken.mint(BUYER, deal.payAmount);
        try target.settle(tradeId, _terms(deal.sellAmount, deal.payAmount), deal.salt) {
            successfulSettlements++;
            settlementsOf[tradeId]++;
        } catch {}
    }

    function settle(uint256 tradeId, uint96 sellAmount, uint96 payAmount, bytes32 salt) external {
        tradeId = bound(tradeId, 1, 2);
        try target.settle(tradeId, _terms(sellAmount, payAmount), salt) {
            successfulSettlements++;
            settlementsOf[tradeId]++;
        } catch {}
    }

    function _terms(uint96 sellAmount, uint96 payAmount) internal view returns (Settlement.Terms memory) {
        return Settlement.Terms({
            seller: SELLER,
            buyer: BUYER,
            sellToken: address(assetToken),
            sellAmount: sellAmount,
            payToken: address(cashToken),
            payAmount: payAmount,
            expiry: uint64(block.timestamp + 1 hours)
        });
    }
}

contract SettlementInvariants is System {
    TestToken internal assetToken;
    TestToken internal cashToken;
    SettlementHandler internal handler;

    function setUp() public {
        _deploySystem();
        assetToken = new TestToken("ASSET");
        cashToken = new TestToken("CASH");
        vm.prank(SELLER);
        assetToken.approve(address(settlement), type(uint256).max);
        vm.prank(BUYER);
        cashToken.approve(address(settlement), type(uint256).max);

        handler = new SettlementHandler(settlement, assetToken, cashToken);
        targetContract(address(handler));
    }

    /// @dev Guards against vacuous invariants: the handler must be able to reach a settlement.
    function test_HandlerReachesASettlement() public {
        handler.commitBoth(1, 5e6, 6e6, keccak256("reach"));
        handler.settleCommitted(1);
        assertEq(handler.successfulSettlements(), 1);
        assertEq(handler.settlementsOf(1), 1);
    }

    function invariant_NoTradeSettlesTwice() public view {
        assertLe(handler.settlementsOf(1), 1);
        assertLe(handler.settlementsOf(2), 1);
    }

    function invariant_SettlementNeverHoldsFunds() public view {
        assertEq(assetToken.balanceOf(address(settlement)), 0);
        assertEq(cashToken.balanceOf(address(settlement)), 0);
    }

    function invariant_OnlyTheTwoPartiesHoldTokens() public view {
        assertEq(assetToken.balanceOf(SELLER) + assetToken.balanceOf(BUYER), assetToken.totalSupply());
        assertEq(cashToken.balanceOf(SELLER) + cashToken.balanceOf(BUYER), cashToken.totalSupply());
    }
}
