// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @dev Groth16 verifier for a circuit with 13 public signals. Generated from its verification key.
contract ComplianceVerifier {
    uint256 private constant SCALAR_FIELD = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001;
    uint256 private constant BASE_FIELD = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47;

    // EIP-1108 prices with headroom, so malformed points cannot burn the caller's whole gas limit.
    uint256 private constant ECADD_GAS = 500;
    uint256 private constant ECMUL_GAS = 7_000;
    uint256 private constant ECPAIRING_GAS = 200_000;

    uint256 private constant ALPHA_X = 0x2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e2;
    uint256 private constant ALPHA_Y = 0x14bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926;
    uint256 private constant BETA_X1 = 0x0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c;
    uint256 private constant BETA_X0 = 0x0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab;
    uint256 private constant BETA_Y1 = 0x304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a7;
    uint256 private constant BETA_Y0 = 0x1739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8;
    uint256 private constant GAMMA_X1 = 0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2;
    uint256 private constant GAMMA_X0 = 0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed;
    uint256 private constant GAMMA_Y1 = 0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b;
    uint256 private constant GAMMA_Y0 = 0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa;
    uint256 private constant DELTA_X1 = 0x004cdbc6b50c21662dd4a7b64ae43386aa3aa7ed038a267c5b226984bfb91534;
    uint256 private constant DELTA_X0 = 0x01e1beb5ea77e309df6002bb5c8988606b71fceda07d96f2692faed2c3645284;
    uint256 private constant DELTA_Y1 = 0x18d58464170bd373a1ef45bfe593ee641845124698c1667f68f7aef15040c44c;
    uint256 private constant DELTA_Y0 = 0x00fda328094d3777957854d4f7775b34b090c701c98a72430a8a7948db0b4456;
    uint256 private constant IC0_X = 0x22f811b344be730b52114f60bf01fb010482fa7f309e8c28b7a10b7282ca9741;
    uint256 private constant IC0_Y = 0x06cc9c89d32a3da4903d55b7834ae781c3c20c95cd1e5d62d2076feba065edfd;
    uint256 private constant IC1_X = 0x2fdf0a0c8b440e0c96607283c0667b0aa615d4eeb2f6e7280a64015c965bf7bf;
    uint256 private constant IC1_Y = 0x01cb436015d8756e5b86642d3478b46eabb8728ff09db82a033a9728d10a0a36;
    uint256 private constant IC2_X = 0x2145a2e73df0f92f8293b3e8ff59eaa1bc778a906c11d2f07cc8bdcbdd2585be;
    uint256 private constant IC2_Y = 0x026b0395c9328fc2f364ddea03a1c98ac88a5514411467ebf46127703f1d265e;
    uint256 private constant IC3_X = 0x0a3452fdf79da88c683ae686ac9658b7c94048a924d2a53be2b24b39bb57b5a2;
    uint256 private constant IC3_Y = 0x26770e4debbe6bee73d201eaef93e3368691410d62c96760561949e5e9354fd0;
    uint256 private constant IC4_X = 0x07c723c1a58589eef4b37a85c422be564cd7ad71940840f824a6a3c4864325f0;
    uint256 private constant IC4_Y = 0x2871d16039fa628df76290f94c53aca758ef8aff1e257dbbcf40c25a62fef3c6;
    uint256 private constant IC5_X = 0x1a492ee39fcb33d96cb4ec4681432b4cb53254e79f77efd6b0cd857ce31d8b97;
    uint256 private constant IC5_Y = 0x0639efc8101cd89d627167505e5d41834c723e4c4dfeb772be10fe9015688ccb;
    uint256 private constant IC6_X = 0x1b10ae63c2767aa46fbc24d0bd36ae4d01925ffed311d184176f1a1223fa371f;
    uint256 private constant IC6_Y = 0x2a44064fb0e639ff110d909d47a27dfb1e3db1bcc0bf40b1ba32fb695566648c;
    uint256 private constant IC7_X = 0x2d0dde68ab0bde963c2b20a06996ec51cbb3f660409217544c51cd0c0db12a25;
    uint256 private constant IC7_Y = 0x1d733a93224ee24306072360cd805d4439484e393753d9994ee49a2d6a227113;
    uint256 private constant IC8_X = 0x03f6590172434150f9cedf710efc5c4a7e86ee8455fdb40c9bccf78fccae989e;
    uint256 private constant IC8_Y = 0x19ee3de09f876ce3e32409430fa8a5b5e6af0e7b1de899ba88f50ad63de8bfdf;
    uint256 private constant IC9_X = 0x26aadabe27774afad97c22926816bbeaf20ec3fc49b8d28d97f4a40b48f57d32;
    uint256 private constant IC9_Y = 0x11a61b5dd3dc7db8610ce2c115f64d42459450276b2a0a2bdc4e43bf7ba0eb21;
    uint256 private constant IC10_X = 0x15b6586d85505af0610dc10fcd05f3a22ac17db203c4a3caad249da1e9c683f2;
    uint256 private constant IC10_Y = 0x1632b8884352f3dae39de039ade22d303203a225850037de9b289079131d196c;
    uint256 private constant IC11_X = 0x1ce5e04c2366a61fa3e347dbf92802e19b8096b5b688153cef36fb9cc9fa24da;
    uint256 private constant IC11_Y = 0x277b0e44a1669ef83164e82a28c14f5b59047fdfe506eea4ca6234e89805edc3;
    uint256 private constant IC12_X = 0x1e616259aea3a4ce5535702d3cf5f25f4aea0cec078877c74fe63d83a2a1c8d0;
    uint256 private constant IC12_Y = 0x0665dee7cdcddb8e32f2e1d7b9a71bcff1d42ce5104132814c643308a4fe15d8;
    uint256 private constant IC13_X = 0x0f560adedb3550e9c94436d42f30af45d5a7caaeb35ae7ab338ed0077353d452;
    uint256 private constant IC13_Y = 0x0e339878aeef81c562b1ec82a0f7aef5c09a597c28d1f32884391d300f3c8e64;

    /// @return valid True if the proof is valid for the public signals. Malformed points revert.
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[13] calldata signals
    ) external view returns (bool valid) {
        assembly ("memory-safe") {
            for { let i := 0 } lt(i, 13) { i := add(i, 1) } {
                if iszero(lt(calldataload(add(signals, shl(5, i))), SCALAR_FIELD)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            let m := mload(0x40)
            mstore(m, IC0_X)
            mstore(add(m, 0x20), IC0_Y)
            mstore(add(m, 0x40), IC1_X)
            mstore(add(m, 0x60), IC1_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 0)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC2_X)
            mstore(add(m, 0x60), IC2_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 32)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC3_X)
            mstore(add(m, 0x60), IC3_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 64)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC4_X)
            mstore(add(m, 0x60), IC4_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 96)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC5_X)
            mstore(add(m, 0x60), IC5_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 128)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC6_X)
            mstore(add(m, 0x60), IC6_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 160)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC7_X)
            mstore(add(m, 0x60), IC7_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 192)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC8_X)
            mstore(add(m, 0x60), IC8_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 224)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC9_X)
            mstore(add(m, 0x60), IC9_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 256)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC10_X)
            mstore(add(m, 0x60), IC10_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 288)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC11_X)
            mstore(add(m, 0x60), IC11_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 320)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC12_X)
            mstore(add(m, 0x60), IC12_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 352)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }
            mstore(add(m, 0x40), IC13_X)
            mstore(add(m, 0x60), IC13_Y)
            mstore(add(m, 0x80), calldataload(add(signals, 384)))
            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }
            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }

            let p := add(m, 0x100)
            let ay := calldataload(add(a, 0x20))
            mstore(p, calldataload(a))
            mstore(add(p, 0x20), mod(sub(BASE_FIELD, mod(ay, BASE_FIELD)), BASE_FIELD))
            calldatacopy(add(p, 0x40), b, 0x80)

            mstore(add(p, 192), ALPHA_X)
            mstore(add(p, 224), ALPHA_Y)
            mstore(add(p, 256), BETA_X1)
            mstore(add(p, 288), BETA_X0)
            mstore(add(p, 320), BETA_Y1)
            mstore(add(p, 352), BETA_Y0)

            mstore(add(p, 0x180), mload(m))
            mstore(add(p, 0x1a0), mload(add(m, 0x20)))
            mstore(add(p, 448), GAMMA_X1)
            mstore(add(p, 480), GAMMA_X0)
            mstore(add(p, 512), GAMMA_Y1)
            mstore(add(p, 544), GAMMA_Y0)

            calldatacopy(add(p, 0x240), c, 0x40)
            mstore(add(p, 640), DELTA_X1)
            mstore(add(p, 672), DELTA_X0)
            mstore(add(p, 704), DELTA_Y1)
            mstore(add(p, 736), DELTA_Y0)

            if iszero(staticcall(ECPAIRING_GAS, 8, p, 0x300, p, 0x20)) { revert(0, 0) }
            valid := mload(p)
        }
    }
}
