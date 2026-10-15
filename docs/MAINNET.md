# Deploying to Arc mainnet

Run by the owner and the other key holders. No step needs a private key to leave the machine it lives on.

## Before you start

- Three or more people for the key ceremony, each on their own machine with this repository checked out and `circom` installed.
- A Safe (2 of 3) created on Arc with three signers of the team. Arc has Safe v1.4.1 deployed: `SafeL2` `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`, proxy factory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`, fallback handler `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99`.
- A fresh account for the keeper, and a fresh deployer funded with a few USDC. A full deployment is about 4.2M gas.
- The regulator's secret, generated and held by the regulator. Only the public key is needed here (`regulatorPublicKey(secret)`).

## 1. Key ceremony

```sh
pnpm --filter @keelson/circuits ceremony start /tmp/ceremony
pnpm --filter @keelson/circuits ceremony contribute /tmp/ceremony "<first contributor>"
# hand /tmp/ceremony to the next contributor, who runs:
pnpm --filter @keelson/circuits ceremony contribute /tmp/ceremony "<name>"
```

Each contribution prints a contribution hash and the key's SHA-256; each contributor publishes theirs. After the last contribution, wait for a Bitcoin or Ethereum block mined afterwards and use its hash as the beacon:

```sh
pnpm --filter @keelson/circuits ceremony finalize /tmp/ceremony <block hash, hex> 10
pnpm --filter @keelson/circuits ceremony verify
```

`verify` recompiles the circuit from source and checks the final key, the witness generator and every recorded hash against `circuits/ceremony/compliance/transcript.json`. Commit that directory.

Until a ceremony is committed the repository runs on reproducible development keys, which must never guard real funds.

## 2. Regenerate the verifier on the new keys

```sh
pnpm --filter @keelson/circuits export:contracts      # prints "generating from the ceremony keys"
cd contracts && arc-forge clean && arc-forge snapshot --network arc && cd ..
pnpm check && pnpm --filter @keelson/e2e test:e2e
```

`pnpm --filter @keelson/circuits test` fails if the committed verifier or the contract fixtures were not generated from the keys in use.

## 3. Deploy

With the deployer key in the environment only for this command:

```sh
export REGULATOR_KEY_X=... REGULATOR_KEY_Y=...
export MIN_TIER=1 MAX_PROOF_AGE=3600 ATTESTATION_TTL=86400 LIST_MAX_AGE=86400 ROOT_GRACE=3600
export SAFE=0x<the Safe> KEEPER=0x<the keeper>
cd contracts
arc-forge script script/Deploy.s.sol --network arc --rpc-url https://rpc.mainnet.arc.io \
  --private-key "$DEPLOYER_KEY" --broadcast
unset DEPLOYER_KEY
```

Six contracts are deployed (`contracts/broadcast/Deploy.s.sol/5042/run-latest.json`) and four ownership transfers are left pending: the Safe for the issuers and compliance registries, the keeper for the sanctions and revocations registries. The deployer owns nothing once they are accepted.

## 4. Accept ownership

The keeper sends `acceptOwnership()` to the sanctions and revocations registries:

```sh
arc-cast send <registry> "acceptOwnership()" --rpc-url https://rpc.mainnet.arc.io --private-key "$KEEPER_KEY"
```

In Safe{Wallet}, two signers propose, sign and execute `acceptOwnership()` on the issuers and compliance registries.

## 5. Record and audit the deployment

Write `deployments/arc-mainnet.json` from the broadcast file (`startBlock` is the deployment's block). Numbers are decimal strings:

```json
{
  "chainId": "5042",
  "rpcUrl": "https://rpc.mainnet.arc.io",
  "explorerUrl": "https://explorer.arc.io",
  "startBlock": "...",
  "deployment": { "verifier": "0x...", "issuers": "0x...", "sanctions": "0x...", "revocations": "0x...", "compliance": "0x...", "settlement": "0x..." },
  "safe": "0x...",
  "keeper": "0x...",
  "policy": { "minTier": "1", "maxProofAge": "3600", "attestationTtl": "86400" },
  "regulatorKey": { "x": "...", "y": "..." },
  "listMaxAge": "86400",
  "grace": "3600"
}
```

```sh
pnpm --filter @keelson/sdk audit deployments/arc-mainnet.json
```

Every line must read `ok`. The audit reads the chain: code at every address, the wiring between contracts, owners and pending owners, the policy, the regulator key, the registries' limits and the verifier's executable code against the one compiled from this repository. It exits non-zero on any failure.

## 6. Verify the sources on the explorer

For each contract, with the compiler settings of `contracts/foundry.toml`:

```sh
arc-forge verify-contract <address> src/<File>.sol:<Contract> --chain-id 5042 \
  --verifier blockscout --verifier-url https://explorer.arc.io/api/ \
  --constructor-args "$(arc-cast abi-encode "<constructor signature>" <arguments>)"
```

`ComplianceVerifier` has no constructor arguments. If the API answers with a bot challenge, use `arc-forge verify-contract --show-standard-json-input` and paste the result into the explorer's contract verification page.

## 7. Start the services and publish the roots

Run the issuer and the keeper as described in `deploy/README.md`, with secrets from a secret store, `ALLOWED_ORIGIN` set to the app's origin and TLS in front of the issuer. Do not set `DEMO_MODE`.

Publish the issuers root once, from the Safe:

```sh
pnpm --filter @keelson/sdk issuers-root "$ISSUER_URL"
```

It prints `publish(uint256) argument: <root>`. In Safe{Wallet}'s transaction builder, call `publish(uint256)` on the issuers registry with that value, collect two signatures and execute. Once the keeper has run a round, audit with the roots:

```sh
pnpm --filter @keelson/sdk audit deployments/arc-mainnet.json --roots
```

## 8. Publish the app

Write a deployment file for mainnet with the addresses, `rpcUrl`, `issuerUrl`, `listsUrl` and `assetsUrl`. Leave out `demo` and `faucetUrl`, and `tokens` too if the app should offer USDC and EURC on Arc. Then package the site with the mainnet file and, if the test network should stay available, the testnet one:

```sh
pnpm --filter @keelson/app exec node scripts/package-site.ts --mainnet <file> --testnet <file> --out dist-site
```

The script builds the app with each network's circuit files pinned by hash, writes `deployment.mainnet.json` and `deployment.testnet.json`, and adds a same-origin RPC path for each network for browsers that block the RPC domain. It refuses to publish mainnet on anything but the keys of a published ceremony. Testnet always uses the development keys its verifier was built from.

The top bar then offers a choice between the two networks, and Arc mainnet is the default. A site packaged with only `--testnet` lists mainnet as not deployed yet and opens on testnet. Each network keeps its own vault in the browser.
