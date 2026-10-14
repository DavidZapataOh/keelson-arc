pragma circom 2.2.3;

include "../../lib/sorted_non_membership.circom";

component main {public [root, value]} = SortedNonMembership(8);
