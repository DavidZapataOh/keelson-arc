pragma circom 2.2.3;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";
include "merkle.circom";

// Proves `value` is absent from a sorted Merkle set: some leaf (low, next)
// is in the tree with low < value < next. Values are 248-bit integers.
template SortedNonMembership(depth) {
    signal input root;
    signal input value;
    signal input low;
    signal input next;
    signal input siblings[depth];
    signal input pathBits[depth];

    component valueBits = Num2Bits(248);
    valueBits.in <== value;
    component lowBits = Num2Bits(248);
    lowBits.in <== low;
    component nextBits = Num2Bits(248);
    nextBits.in <== next;

    component above = LessThan(248);
    above.in[0] <== low;
    above.in[1] <== value;
    above.out === 1;

    component below = LessThan(248);
    below.in[0] <== value;
    below.in[1] <== next;
    below.out === 1;

    component leaf = Poseidon(2);
    leaf.inputs[0] <== low;
    leaf.inputs[1] <== next;

    component path = MerkleRoot(depth);
    path.leaf <== leaf.out;
    for (var i = 0; i < depth; i++) {
        path.siblings[i] <== siblings[i];
        path.pathBits[i] <== pathBits[i];
    }
    path.root === root;
}
