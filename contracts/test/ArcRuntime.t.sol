// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";

contract ArcRuntimeTest is Test {
    function test_NativeValueToZeroAddressFails() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(0).call{value: 1}("");
        assertFalse(ok);
    }
}
