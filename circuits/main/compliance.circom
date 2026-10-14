pragma circom 2.2.3;

include "../compliance.circom";

component main {public [tradeId, tradingAddress, issuersRoot, sanctionsRoot, revocationRoot, minTier, validAt, regulatorKeyX, regulatorKeyY]} = Compliance(4, 18, 16, 2);
