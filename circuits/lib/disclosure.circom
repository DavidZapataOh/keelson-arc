pragma circom 2.2.3;

include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/escalarmulany.circom";
include "circomlib/circuits/escalarmulfix.circom";
include "circomlib/circuits/poseidon.circom";

// Encrypts `message` to a regulator key with ElGamal over Baby Jubjub:
// (c1, c2) = (r * B8, message + Poseidon(r * regulatorKey)).
template Disclosure() {
    signal input regulatorKeyX;
    signal input regulatorKeyY;
    signal input ephemeral;
    signal input message;
    signal output c1x;
    signal output c1y;
    signal output c2;

    component keyOnCurve = BabyCheck();
    keyOnCurve.x <== regulatorKeyX;
    keyOnCurve.y <== regulatorKeyY;

    component bits = Num2Bits(253);
    bits.in <== ephemeral;

    var base8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];
    component ephemeralPoint = EscalarMulFix(253, base8);
    component shared = EscalarMulAny(253);
    shared.p[0] <== regulatorKeyX;
    shared.p[1] <== regulatorKeyY;
    for (var i = 0; i < 253; i++) {
        ephemeralPoint.e[i] <== bits.out[i];
        shared.e[i] <== bits.out[i];
    }

    component pad = Poseidon(2);
    pad.inputs[0] <== shared.out[0];
    pad.inputs[1] <== shared.out[1];

    c1x <== ephemeralPoint.out[0];
    c1y <== ephemeralPoint.out[1];
    c2 <== message + pad.out;
}
