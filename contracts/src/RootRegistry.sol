// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Publishes the Merkle root of an off-chain set (sanctioned identifiers, issuers or
/// revoked credentials). A replaced root stays acceptable for a grace period so that proofs
/// generated just before an update still verify, and the current root can be required to be fresh.
contract RootRegistry is Ownable2Step {
    uint256 public constant SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @notice Seconds the current root stays acceptable without a publish or refresh. Zero disables the check.
    uint64 public immutable maxAge;
    /// @notice Seconds a replaced root stays acceptable.
    uint64 public immutable grace;

    uint256 public current;
    uint64 public version;
    uint64 public updatedAt;

    struct Record {
        uint64 version;
        uint64 supersededAt;
    }

    mapping(uint256 root => Record) private _records;

    event RootPublished(uint64 indexed version, uint256 root);
    event RootRefreshed(uint64 indexed version, uint64 timestamp);

    error InvalidRoot();
    error RootUnchanged();
    error NothingPublished();

    constructor(address initialOwner, uint64 maxAge_, uint64 grace_) Ownable(initialOwner) {
        maxAge = maxAge_;
        grace = grace_;
    }

    function publish(uint256 root) external onlyOwner {
        if (root == 0 || root >= SCALAR_FIELD) revert InvalidRoot();
        uint256 previous = current;
        if (root == previous) revert RootUnchanged();

        if (previous != 0) _records[previous].supersededAt = uint64(block.timestamp);
        uint64 newVersion = version + 1;
        _records[root] = Record(newVersion, 0);
        current = root;
        version = newVersion;
        updatedAt = uint64(block.timestamp);
        emit RootPublished(newVersion, root);
    }

    /// @notice Confirms the current root is still up to date without changing it.
    function refresh() external onlyOwner {
        if (current == 0) revert NothingPublished();
        updatedAt = uint64(block.timestamp);
        emit RootRefreshed(version, uint64(block.timestamp));
    }

    /// @return The publication number of `root` if proofs against it may be accepted now, else zero.
    function acceptedVersion(uint256 root) external view returns (uint64) {
        Record memory record = _records[root];
        if (record.version == 0) return 0;
        if (root == current) {
            return maxAge == 0 || block.timestamp <= uint256(updatedAt) + maxAge ? record.version : 0;
        }
        return block.timestamp <= uint256(record.supersededAt) + grace ? record.version : 0;
    }
}
