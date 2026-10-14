pragma circom 2.2.3;

include "../../lib/merkle.circom";

component main {public [leaf]} = MerkleRoot(4);
