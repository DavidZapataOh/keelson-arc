pragma circom 2.2.3;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

template MerkleRoot(depth) {
    signal input leaf;
    signal input siblings[depth];
    signal input pathBits[depth];
    signal output root;

    signal nodes[depth + 1];
    component mux[depth];
    component hash[depth];

    nodes[0] <== leaf;
    for (var i = 0; i < depth; i++) {
        pathBits[i] * (pathBits[i] - 1) === 0;

        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== nodes[i];
        mux[i].c[0][1] <== siblings[i];
        mux[i].c[1][0] <== siblings[i];
        mux[i].c[1][1] <== nodes[i];
        mux[i].s <== pathBits[i];

        hash[i] = Poseidon(2);
        hash[i].inputs[0] <== mux[i].out[0];
        hash[i].inputs[1] <== mux[i].out[1];
        nodes[i + 1] <== hash[i].out;
    }
    root <== nodes[depth];
}
