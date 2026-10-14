// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Settlement} from "../src/Settlement.sol";
import {System} from "./utils/System.sol";
import {TestToken} from "./utils/TestToken.sol";

contract ReentrantToken is TestToken {
    Settlement internal target;
    uint256 internal tradeId;
    Settlement.Terms internal terms;
    bytes32 internal salt;

    constructor() TestToken("RE") {}

    function arm(Settlement target_, uint256 tradeId_, Settlement.Terms calldata terms_, bytes32 salt_) external {
        target = target_;
        tradeId = tradeId_;
        terms = terms_;
        salt = salt_;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (address(target) != address(0)) target.settle(tradeId, terms, salt);
        return super.transferFrom(from, to, amount);
    }
}

contract SettlementTest is System {
    bytes32 internal constant SALT = keccak256("salt");

    TestToken internal assetToken;
    TestToken internal cashToken;
    Settlement.Terms internal terms;

    event Committed(uint256 indexed tradeId, address indexed party);
    event Settled(uint256 indexed tradeId, uint64 timestamp);

    function setUp() public {
        _deploySystem();

        assetToken = new TestToken("ASSET");
        cashToken = new TestToken("CASH");
        assetToken.mint(SELLER, 1_000e6);
        cashToken.mint(BUYER, 2_000e6);
        vm.prank(SELLER);
        assetToken.approve(address(settlement), type(uint256).max);
        vm.prank(BUYER);
        cashToken.approve(address(settlement), type(uint256).max);

        terms = Settlement.Terms({
            seller: SELLER,
            buyer: BUYER,
            sellToken: address(assetToken),
            sellAmount: 1_000e6,
            payToken: address(cashToken),
            payAmount: 1_500e6,
            expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _commitBoth() internal returns (bytes32 hash) {
        hash = settlement.hashTerms(TRADE_ID, terms, SALT);
        vm.prank(SELLER);
        settlement.commit(TRADE_ID, hash);
        vm.prank(BUYER);
        settlement.commit(TRADE_ID, hash);
    }

    function test_SettlesBothLegsAtomically() public {
        _commitBoth();
        vm.expectEmit(true, false, false, true);
        emit Settled(TRADE_ID, uint64(block.timestamp));
        settlement.settle(TRADE_ID, terms, SALT);

        assertEq(assetToken.balanceOf(BUYER), 1_000e6);
        assertEq(assetToken.balanceOf(SELLER), 0);
        assertEq(cashToken.balanceOf(SELLER), 1_500e6);
        assertEq(cashToken.balanceOf(BUYER), 500e6);
        assertTrue(settlement.settled(TRADE_ID));
    }

    function test_AnyoneCanTriggerSettlement() public {
        _commitBoth();
        vm.prank(makeAddr("relayer"));
        settlement.settle(TRADE_ID, terms, SALT);
        assertTrue(settlement.settled(TRADE_ID));
    }

    function test_CommitRequiresAnAttestation() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(Settlement.NotCompliant.selector);
        settlement.commit(TRADE_ID, bytes32(uint256(1)));

        vm.prank(SELLER);
        vm.expectRevert(Settlement.NotCompliant.selector);
        settlement.commit(TRADE_ID + 1, bytes32(uint256(1)));
    }

    function test_CannotSettleWithoutBothCommitments() public {
        bytes32 hash = settlement.hashTerms(TRADE_ID, terms, SALT);
        vm.prank(SELLER);
        settlement.commit(TRADE_ID, hash);
        vm.expectRevert(Settlement.CommitmentMismatch.selector);
        settlement.settle(TRADE_ID, terms, SALT);
    }

    function test_CannotSettleOnDifferentTermsOrSalt() public {
        _commitBoth();

        Settlement.Terms memory cheaper = terms;
        cheaper.payAmount = 1_000e6;
        vm.expectRevert(Settlement.CommitmentMismatch.selector);
        settlement.settle(TRADE_ID, cheaper, SALT);

        vm.expectRevert(Settlement.CommitmentMismatch.selector);
        settlement.settle(TRADE_ID, terms, keccak256("other"));
    }

    function test_PartiesCommittingToDifferentHashesDoNotMatch() public {
        bytes32 hash = settlement.hashTerms(TRADE_ID, terms, SALT);
        vm.prank(SELLER);
        settlement.commit(TRADE_ID, hash);
        vm.prank(BUYER);
        settlement.commit(TRADE_ID, bytes32(uint256(7)));
        vm.expectRevert(Settlement.CommitmentMismatch.selector);
        settlement.settle(TRADE_ID, terms, SALT);
    }

    function test_CommitmentIsBoundToTheTradeAndTheContract() public {
        bytes32 hash = _commitBoth();
        assertTrue(hash != settlement.hashTerms(TRADE_ID + 1, terms, SALT));
        Settlement other = new Settlement(compliance);
        assertTrue(hash != other.hashTerms(TRADE_ID, terms, SALT));
    }

    function test_CannotSettleTwice() public {
        _commitBoth();
        settlement.settle(TRADE_ID, terms, SALT);
        vm.expectRevert(Settlement.AlreadySettled.selector);
        settlement.settle(TRADE_ID, terms, SALT);
        vm.prank(SELLER);
        vm.expectRevert(Settlement.AlreadySettled.selector);
        settlement.commit(TRADE_ID, bytes32(0));
    }

    function test_CannotSettleAfterExpiry() public {
        _commitBoth();
        vm.warp(terms.expiry);
        settlement.settle(TRADE_ID, terms, SALT);

        Settlement.Terms memory t2 = terms;
        t2.expiry = uint64(block.timestamp - 1);
        vm.expectRevert(Settlement.Expired.selector);
        settlement.settle(TRADE_ID + 1, t2, SALT);
    }

    function test_CannotSettleOnceAnAttestationExpires() public {
        terms.expiry = uint64(block.timestamp + 2 days);
        _commitBoth();
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert(Settlement.NotCompliant.selector);
        settlement.settle(TRADE_ID, terms, SALT);
    }

    function test_AFailingLegRevertsTheWholeSettlement() public {
        _commitBoth();
        vm.prank(BUYER);
        cashToken.approve(address(settlement), 0);
        vm.expectRevert();
        settlement.settle(TRADE_ID, terms, SALT);

        assertFalse(settlement.settled(TRADE_ID));
        assertEq(assetToken.balanceOf(SELLER), 1_000e6, "seller leg must be rolled back");
        assertEq(cashToken.balanceOf(BUYER), 2_000e6);
    }

    function test_SellerAndBuyerMustDiffer() public {
        Settlement.Terms memory t = terms;
        t.buyer = SELLER;
        vm.expectRevert(Settlement.SamePartyOnBothSides.selector);
        settlement.settle(TRADE_ID, t, SALT);
    }

    function test_SettlementHoldsNoFunds() public {
        _commitBoth();
        settlement.settle(TRADE_ID, terms, SALT);
        assertEq(assetToken.balanceOf(address(settlement)), 0);
        assertEq(cashToken.balanceOf(address(settlement)), 0);
    }

    function test_TokenCallbackCannotReenterSettle() public {
        ReentrantToken evil = new ReentrantToken();
        evil.mint(SELLER, 1_000e6);
        vm.prank(SELLER);
        evil.approve(address(settlement), type(uint256).max);

        terms.sellToken = address(evil);
        bytes32 hash = settlement.hashTerms(TRADE_ID, terms, SALT);
        vm.prank(SELLER);
        settlement.commit(TRADE_ID, hash);
        vm.prank(BUYER);
        settlement.commit(TRADE_ID, hash);
        evil.arm(settlement, TRADE_ID, terms, SALT);

        vm.expectRevert();
        settlement.settle(TRADE_ID, terms, SALT);
        assertFalse(settlement.settled(TRADE_ID));
    }

    function testFuzz_SettlementConservesTokens(uint96 sellAmount, uint96 payAmount) public {
        terms.sellAmount = sellAmount;
        terms.payAmount = payAmount;
        assetToken.mint(SELLER, sellAmount);
        cashToken.mint(BUYER, payAmount);
        uint256 assetBefore = assetToken.totalSupply();
        uint256 cashBefore = cashToken.totalSupply();
        _commitBoth();
        settlement.settle(TRADE_ID, terms, SALT);

        assertEq(assetToken.totalSupply(), assetBefore);
        assertEq(cashToken.totalSupply(), cashBefore);
        assertEq(assetToken.balanceOf(BUYER), sellAmount);
        assertGe(cashToken.balanceOf(SELLER), payAmount);
    }
}
