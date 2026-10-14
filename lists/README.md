# Lists

Builds the sanctions snapshot that credentials are screened against.

    pnpm --filter @keelson/lists build:list --out sanctions.json
    pnpm --filter @keelson/lists test
    pnpm --filter @keelson/lists test:live

The source is the OFAC Specially Designated Nationals list in its advanced XML form. Three kinds of structured identifier are extracted: identity document numbers, digital currency addresses and SWIFT/BIC or D-U-N-S numbers. Each is hashed to 248 bits (`keccak256("keelson.sanctions.v1:<kind>:<normalized value>") >> 8`) and the sorted hashes form a Merkle set whose root is published on-chain.

A snapshot is self-verifying: `openSnapshot` recomputes the root from the values. Clients download the whole snapshot and prove locally, so nobody learns which identifier is being screened.

Names, dates of birth and other unstructured data are not part of the set. Screening them is the credential issuer's responsibility.
