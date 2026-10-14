// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Vm} from "forge-std/Vm.sol";

struct ProofFixture {
    uint256[2] a;
    uint256[2][2] b;
    uint256[2] c;
    uint256[13] signals;
}

library Fixtures {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function json() internal view returns (string memory) {
        return vm.readFile("test/fixtures/compliance.json");
    }

    function proof(string memory name) internal view returns (ProofFixture memory p) {
        string memory data = json();
        string memory base = string.concat(".proofs.", name);
        uint256[] memory a = vm.parseJsonUintArray(data, string.concat(base, ".a"));
        uint256[] memory c = vm.parseJsonUintArray(data, string.concat(base, ".c"));
        uint256[] memory b0 = vm.parseJsonUintArray(data, string.concat(base, ".b[0]"));
        uint256[] memory b1 = vm.parseJsonUintArray(data, string.concat(base, ".b[1]"));
        uint256[] memory s = vm.parseJsonUintArray(data, string.concat(base, ".signals"));
        p.a = [a[0], a[1]];
        p.b = [[b0[0], b0[1]], [b1[0], b1[1]]];
        p.c = [c[0], c[1]];
        for (uint256 i = 0; i < 13; i++) {
            p.signals[i] = s[i];
        }
    }
}
