pragma circom 2.2.3;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/poseidon.circom";
include "lib/merkle.circom";
include "lib/sorted_non_membership.circom";

// Proves the holder of an issuer-signed credential is eligible to trade:
// credential is signed by a listed issuer, unexpired, above the minimum tier,
// not revoked, and none of its identifiers are on the sanctions list.
template Compliance(issuerDepth, sanctionsDepth, revocationDepth, ids) {
    signal input tradeId;
    signal input tradingAddress;
    signal input issuersRoot;
    signal input sanctionsRoot;
    signal input revocationRoot;
    signal input minTier;
    signal input validAt;
    signal output nullifier;

    signal input secret;
    signal input credentialId;
    signal input tier;
    signal input jurisdiction;
    signal input expiry;
    signal input identifiers[ids];

    signal input issuerAx;
    signal input issuerAy;
    signal input sigS;
    signal input sigR8x;
    signal input sigR8y;
    signal input issuerSiblings[issuerDepth];
    signal input issuerPathBits[issuerDepth];

    signal input sanctionsLow[ids];
    signal input sanctionsNext[ids];
    signal input sanctionsSiblings[ids][sanctionsDepth];
    signal input sanctionsPathBits[ids][sanctionsDepth];

    signal input revocationLow;
    signal input revocationNext;
    signal input revocationSiblings[revocationDepth];
    signal input revocationPathBits[revocationDepth];

    component subject = Poseidon(1);
    subject.inputs[0] <== secret;

    component message = Poseidon(5 + ids);
    message.inputs[0] <== subject.out;
    message.inputs[1] <== credentialId;
    message.inputs[2] <== tier;
    message.inputs[3] <== jurisdiction;
    message.inputs[4] <== expiry;
    for (var i = 0; i < ids; i++) {
        message.inputs[5 + i] <== identifiers[i];
    }

    component signature = EdDSAPoseidonVerifier();
    signature.enabled <== 1;
    signature.Ax <== issuerAx;
    signature.Ay <== issuerAy;
    signature.S <== sigS;
    signature.R8x <== sigR8x;
    signature.R8y <== sigR8y;
    signature.M <== message.out;

    component issuerLeaf = Poseidon(2);
    issuerLeaf.inputs[0] <== issuerAx;
    issuerLeaf.inputs[1] <== issuerAy;
    component issuerPath = MerkleRoot(issuerDepth);
    issuerPath.leaf <== issuerLeaf.out;
    for (var i = 0; i < issuerDepth; i++) {
        issuerPath.siblings[i] <== issuerSiblings[i];
        issuerPath.pathBits[i] <== issuerPathBits[i];
    }
    issuerPath.root === issuersRoot;

    component expiryBits = Num2Bits(64);
    expiryBits.in <== expiry;
    component validAtBits = Num2Bits(64);
    validAtBits.in <== validAt;
    component unexpired = LessThan(64);
    unexpired.in[0] <== validAt;
    unexpired.in[1] <== expiry;
    unexpired.out === 1;

    component tierBits = Num2Bits(8);
    tierBits.in <== tier;
    component minTierBits = Num2Bits(8);
    minTierBits.in <== minTier;
    component tierOk = GreaterEqThan(8);
    tierOk.in[0] <== tier;
    tierOk.in[1] <== minTier;
    tierOk.out === 1;

    component clean[ids];
    for (var k = 0; k < ids; k++) {
        clean[k] = SortedNonMembership(sanctionsDepth);
        clean[k].root <== sanctionsRoot;
        clean[k].value <== identifiers[k];
        clean[k].low <== sanctionsLow[k];
        clean[k].next <== sanctionsNext[k];
        for (var j = 0; j < sanctionsDepth; j++) {
            clean[k].siblings[j] <== sanctionsSiblings[k][j];
            clean[k].pathBits[j] <== sanctionsPathBits[k][j];
        }
    }

    component active = SortedNonMembership(revocationDepth);
    active.root <== revocationRoot;
    active.value <== credentialId;
    active.low <== revocationLow;
    active.next <== revocationNext;
    for (var j = 0; j < revocationDepth; j++) {
        active.siblings[j] <== revocationSiblings[j];
        active.pathBits[j] <== revocationPathBits[j];
    }

    component nullifierHash = Poseidon(2);
    nullifierHash.inputs[0] <== secret;
    nullifierHash.inputs[1] <== tradeId;
    nullifier <== nullifierHash.out;

    signal addressSquare <== tradingAddress * tradingAddress;
}
