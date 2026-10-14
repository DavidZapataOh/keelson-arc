// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {ComplianceRegistry} from "./ComplianceRegistry.sol";

/// @notice Atomic delivery-versus-payment between two attested parties. Parties bind themselves
/// to the trade terms with a hash commitment; the terms are revealed only in the settlement call,
/// which moves both legs in one transaction and holds no funds.
contract Settlement is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Terms {
        address seller;
        address buyer;
        address sellToken;
        uint256 sellAmount;
        address payToken;
        uint256 payAmount;
        uint64 expiry;
    }

    ComplianceRegistry public immutable compliance;

    mapping(uint256 tradeId => mapping(address party => bytes32)) public commitments;
    mapping(uint256 tradeId => bool) public settled;

    event Committed(uint256 indexed tradeId, address indexed party);
    event Settled(uint256 indexed tradeId, uint64 timestamp);

    error NotCompliant();
    error AlreadySettled();
    error Expired();
    error CommitmentMismatch();
    error SamePartyOnBothSides();

    constructor(ComplianceRegistry compliance_) {
        compliance = compliance_;
    }

    function hashTerms(uint256 tradeId, Terms calldata terms, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, tradeId, terms, salt));
    }

    /// @notice Binds the caller to the hash of the trade terms. Both parties must commit to the same hash.
    function commit(uint256 tradeId, bytes32 termsHash) external {
        if (settled[tradeId]) revert AlreadySettled();
        if (!compliance.isCompliant(tradeId, msg.sender)) revert NotCompliant();
        commitments[tradeId][msg.sender] = termsHash;
        emit Committed(tradeId, msg.sender);
    }

    /// @notice Reveals the terms and swaps both legs. Callable by anyone holding the terms and salt.
    function settle(uint256 tradeId, Terms calldata terms, bytes32 salt) external nonReentrant {
        if (settled[tradeId]) revert AlreadySettled();
        if (block.timestamp > terms.expiry) revert Expired();
        if (terms.seller == terms.buyer) revert SamePartyOnBothSides();

        bytes32 termsHash = hashTerms(tradeId, terms, salt);
        if (commitments[tradeId][terms.seller] != termsHash || commitments[tradeId][terms.buyer] != termsHash) {
            revert CommitmentMismatch();
        }
        if (!compliance.isCompliant(tradeId, terms.seller) || !compliance.isCompliant(tradeId, terms.buyer)) {
            revert NotCompliant();
        }

        settled[tradeId] = true;
        IERC20(terms.sellToken).safeTransferFrom(terms.seller, terms.buyer, terms.sellAmount);
        IERC20(terms.payToken).safeTransferFrom(terms.buyer, terms.seller, terms.payAmount);
        emit Settled(tradeId, uint64(block.timestamp));
    }
}
