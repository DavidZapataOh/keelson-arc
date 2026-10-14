pragma circom 2.2.3;

include "../../compliance.circom";

component main {public [tradeId, tradingAddress, issuersRoot, sanctionsRoot, revocationRoot, minTier, validAt, regulatorKeyX, regulatorKeyY]} = Compliance(2, 4, 4, 2);
