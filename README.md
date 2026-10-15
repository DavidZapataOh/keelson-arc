<p align="center">
  <img src="app/public/keelson-symbol.svg" alt="Keelson" width="14%" />
</p>

<h1 align="center">Keelson</h1>

<p align="center">
  <strong>Private, compliant, atomic OTC settlement on Arc</strong>
</p>

<p align="center">
  Both legs, or neither.
</p>

<p align="center">
  <a href="https://app.keelson.finance">App</a> · <a href="https://keelson.finance">Site</a> · <a href="#how-it-works">How it works</a> · <a href="#try-it">Try it</a> · <a href="#deployed-contracts">Contracts</a> · <a href="#getting-started">Run locally</a>
</p>

---

## The problem

Two desks agree a block of 100,000 USD or more over chat or an RFQ. Someone has to move first.

| Approach | Atomic | Terms hidden before settlement | Compliance proof per trade | No custody |
|---|:---:|:---:|:---:|:---:|
| Chat and prefunding | No | Yes | No | No |
| Public onchain swap | Yes | No | No | Yes |
| Keelson | Yes | Yes | Yes | Yes |

Prefunding leaves the risk with whoever pays first. A public swap removes that risk but shows the market the size and price before the trade closes, and shows who is on each side. Keelson settles both legs in one transaction, keeps the terms as a hash until that transaction, and gives every trade a zero-knowledge proof that both parties passed the same checks.

---

## How it works

Two counterparties agree the terms off-chain, then use Keelson to settle them.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          KEELSON                                     │
│                                                                      │
│  ┌────────────┐   ┌────────────┐   ┌──────────────────────────────┐  │
│  │  Party A   │   │  Party B   │   │  Issuer + keeper             │  │
│  │  (seller)  │   │  (buyer)   │   │                              │  │
│  │            │   │            │   │  Signs credentials after its │  │
│  │ 1. Prove   │   │ 1. Prove   │   │  own KYC and screening       │  │
│  │ 2. Approve │   │ 2. Approve │   │                              │  │
│  │ 3. Commit  │   │ 3. Commit  │   │  Publishes the sanctions and │  │
│  │            │   │            │   │  revocation lists each round │  │
│  └─────┬──────┘   └─────┬──────┘   └──────────────┬───────────────┘  │
│        │                │                          │                 │
│        ▼                ▼                          ▼                 │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │  ComplianceRegistry · RootRegistry (x3) · Settlement        │    │
│   │                                                             │    │
│   │  attest(proof) → commit(termsHash) → settle(terms, salt)    │    │
│   └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Settlement moves both legs in one transaction, or reverts.          │
└──────────────────────────────────────────────────────────────────────┘
```

1. Prove. Each party holds a credential signed by an issuer after the issuer's own KYC. For every trade the party proves in zero knowledge that the credential is valid, has not been revoked and is not on the sanctions list in use. The browser generates the proof and the `ComplianceRegistry` verifies it.
2. Commit. Both parties commit to the hash of the same terms. The terms stay off chain.
3. Settle. When both attestations and both commitments match, `Settlement` reveals the terms, checks them against the commitments and moves both legs in one transaction. It holds no funds.

A regulator holding the right key can open the identity behind a proof. The record states which lists and which versions were used, and when.

Every step can be sent from a connected wallet or exported as the exact transaction for a custody policy to review and sign.

---

## Try it

The app opens on Arc mainnet. The selector in the top bar switches to Arc testnet, where the steps below need no setup beyond a wallet.

1. Open **[app.keelson.finance](https://app.keelson.finance)**, choose **ARC TESTNET** and connect a wallet. The app adds or switches the network for you.
2. Use **Get test funds** in the top bar to fund two wallets from the Circle faucet.
3. In **Credential**, create your vault and press **Get a demo credential**. The testnet issuer screens the wallet address against the OFAC list before it signs.
4. In **Trades**, the seller chooses the amounts, the tokens and the counterparty and creates the trade. The private link carries the terms and the salt.
5. The buyer opens the link with the second wallet. Each side runs prove, approve and commit. The proof takes about a second in the browser.
6. Either party presses **Settle both legs**.

Prefer to read it first? Open any trade read-only from the connect screen, or look at the **Lists** page to see the roots the contracts currently accept.

---

## Arc and Circle in Keelson

| Piece | How Keelson uses it | Where |
|---|---|---|
| USDC and EURC on Arc | The legs a trade swaps; the app offers both by default | [`sdk/src/arc.ts`](sdk/src/arc.ts) |
| USDC as gas | Fee parameters follow Arc's fee floor, so every transaction prices correctly | [`sdk/src/fees.ts`](sdk/src/fees.ts) |
| Multicall3 | The app batches its reads of a trade into one call | [`app/src/deployment/load.ts`](app/src/deployment/load.ts) |
| Safe v1.4.1 | Owns the issuers and compliance registries, 2 of 3 | [`docs/MAINNET.md`](docs/MAINNET.md) |
| CCTP v2 | SDK helpers to bring USDC in from, and send it to, other chains | [`sdk/src/cctp.ts`](sdk/src/cctp.ts) |

---

## Deployed contracts

### Arc mainnet (chain 5042)

| Contract | Address |
|---|---|
| Settlement | [`0x66043b1032185ea353a09743f3a435be2be19233`](https://explorer.arc.io/address/0x66043b1032185ea353a09743f3a435be2be19233) |
| ComplianceRegistry | [`0xea87476f4c60681eea847628c5ee0fb39a7e4b06`](https://explorer.arc.io/address/0xea87476f4c60681eea847628c5ee0fb39a7e4b06) |
| ComplianceVerifier | [`0xe7fa55063b4c36d0e12c3800a90b762ec9aee645`](https://explorer.arc.io/address/0xe7fa55063b4c36d0e12c3800a90b762ec9aee645) |
| RootRegistry, issuers | [`0x2b91f42d3ecc2800bea86d67ecc75ecc518662bc`](https://explorer.arc.io/address/0x2b91f42d3ecc2800bea86d67ecc75ecc518662bc) |
| RootRegistry, sanctions | [`0xe891b80b62810a9702374daa93ef2b58d2da302e`](https://explorer.arc.io/address/0xe891b80b62810a9702374daa93ef2b58d2da302e) |
| RootRegistry, revocations | [`0x8c6c7099a9dcfa2cb976f31cbee3c91b604c25f3`](https://explorer.arc.io/address/0x8c6c7099a9dcfa2cb976f31cbee3c91b604c25f3) |
| Safe (2 of 3), owner of issuers and compliance | [`0xF30A197521015234d13B6EC0fc374BADF7777bEa`](https://explorer.arc.io/address/0xF30A197521015234d13B6EC0fc374BADF7777bEa) |
| Keeper, owner of sanctions and revocations | [`0x218a2D89E403F229c891Db2A1bD06C0C980c1e60`](https://explorer.arc.io/address/0x218a2D89E403F229c891Db2A1bD06C0C980c1e60) |

The record is [`deployments/arc-mainnet.json`](deployments/arc-mainnet.json). One command reads the chain and checks code, wiring, owners, policy, regulator key, registry limits, published roots and the verifier's executable code against the one compiled from this repository:

```bash
pnpm --filter @keelson/sdk audit-deployment ../deployments/arc-mainnet.json --roots
```

### Arc testnet (chain 5042002)

| Contract | Address |
|---|---|
| Settlement | [`0x3df92c89a8607a5ebc1aad9392438106b9878d27`](https://explorer.testnet.arc.io/address/0x3df92c89a8607a5ebc1aad9392438106b9878d27) |
| ComplianceRegistry | [`0x8c6c7099a9dcfa2cb976f31cbee3c91b604c25f3`](https://explorer.testnet.arc.io/address/0x8c6c7099a9dcfa2cb976f31cbee3c91b604c25f3) |

### Contract sources

| File | Lines | Description |
|---|:---:|---|
| [`contracts/src/Settlement.sol`](contracts/src/Settlement.sol) | 74 | Atomic delivery versus payment between two attested parties. Hash commitments, one transaction, no custody. |
| [`contracts/src/ComplianceRegistry.sol`](contracts/src/ComplianceRegistry.sol) | 156 | Verifies the Groth16 proof, checks the lists and the policy, records the attestation per trade and address. |
| [`contracts/src/RootRegistry.sol`](contracts/src/RootRegistry.sol) | 71 | Versioned Merkle roots with a grace period and a maximum age. One instance each for issuers, sanctions and revocations. |
| [`contracts/src/verifiers/ComplianceVerifier.sol`](contracts/src/verifiers/ComplianceVerifier.sol) | 171 | Groth16 verifier generated from the ceremony's verification key. |

---

## The proof

One circuit, [`circuits/main/compliance.circom`](circuits/main/compliance.circom), proves per trade that the holder has an unexpired credential signed by a key in the issuers tree, at or above the minimum tier, not in the revocations list, with no identifier in the sanctions list. It binds the proof to the trading address and the trade through a nullifier, and encrypts the holder's subject to the regulator's key.

| | |
|---|---|
| Constraints | 25,378 |
| Public signals | 13 |
| Proving time in the browser | about 0.9 s |
| Onchain verification | Groth16 on BN254 |
| Powers of Tau | 2^16 |

The proving key comes from the ceremony in [`circuits/ceremony/compliance/`](circuits/ceremony/compliance/). Anyone can recompile the circuit and check the final key, the witness generator and every recorded hash against the transcript:

```bash
pnpm --filter @keelson/circuits ceremony verify
```

The lists are downloaded whole, so no request carries an identifier, a subject or a path. The sanctions list is the OFAC SDN list, 23,897 identifiers in the current snapshot.

---

## Architecture

```
            ┌─────────────────────────────────────────┐
            │   App (Vite, React)                     │
            │   Wallet · Vault · Lists · Trade room   │
            │   Prover in a worker, circuit by hash   │
            └───────────┬───────────────┬─────────────┘
                        │               │
          ┌─────────────▼──────┐   ┌────▼───────────────────────┐
          │  Arc contracts     │   │  Issuer + keeper           │
          │                    │   │                            │
          │  Settlement        │   │  Issuer: signs credentials,│
          │  ComplianceRegistry│   │  revokes, screens          │
          │  RootRegistry x3   │◄──┤  Keeper: publishes the     │
          │  ComplianceVerifier│   │  sanctions and revocation  │
          └─────────▲──────────┘   │  roots and serves the lists│
                    │              └────────────────────────────┘
          ┌─────────┴──────────┐
          │  Safe 2 of 3       │  owns issuers and compliance
          └────────────────────┘
```

---

## Packages

| Package | What it is |
|---|---|
| [`contracts`](contracts) | Foundry project: settlement, compliance and root registries, the verifier, deploy script and tests |
| [`circuits`](circuits) | The compliance circuit, its key ceremony and the build tooling |
| [`sdk`](sdk) | TypeScript client: credentials, trees, proofs, calldata, fees, CCTP and the deployment audit |
| [`lists`](lists) | Builds the sanctions snapshot from the OFAC SDN list as a verifiable Merkle tree |
| [`issuer`](issuer) | The credential issuer: screening, signing, revocation, regulator lookup |
| [`keeper`](keeper) | Publishes and refreshes the sanctions and revocation roots and serves the lists |
| [`app`](app) | The web app: wallet, encrypted vault, in-browser prover, trade room, export for custody |
| [`landing`](landing) | The public site |
| [`e2e`](e2e) | End-to-end tests against a local Arc node and a fork of Arc mainnet |
| [`deploy`](deploy) | Container that runs the issuer and the keeper together |
| [`docs`](docs) | The mainnet launch procedure |

---

## Tests

| Suite | Tests |
|---|:---:|
| Contracts (Foundry on Arc's runtime, with invariants and a mainnet fork) | 67 |
| Circuits (constraints, proofs, calldata, ceremony, keys) | 48 |
| SDK | 54 |
| App (unit) | 131 |
| App (browser: shell, credential and room, a local node with real contracts, and the live site) | 8 |
| Issuer | 30 |
| Lists | 14 |
| Keeper | 15 |
| End to end (settlement through the SDK, keeper, ownership handover on a fork) | 14 |

CI runs lint, typecheck and the tests on every push.

---

## Getting started

### Prerequisites

- Node 24 and pnpm
- Arc Foundry (`arc-forge`, `arc-anvil`, `arc-cast`), at the commit pinned in [`scripts/doctor.sh`](scripts/doctor.sh)
- [circom](https://docs.circom.io/getting-started/installation/) 2.2.3

`pnpm run doctor` checks all three.

### 1. Install

```bash
git clone https://github.com/DavidZapataOh/keelson-arc.git
cd keelson-arc
pnpm install
```

### 2. Test

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts
```

### 3. Run the app against Arc testnet

```bash
pnpm --filter @keelson/app dev
```

Open the address Vite prints. The app reads its network from a deployment file; [`app/README.md`](app/README.md) describes the format and how to build a site for one or both networks.

### 4. Run the services

```bash
docker build -f deploy/Dockerfile -t keelson .
```

[`deploy/README.md`](deploy/README.md) lists the variables the issuer and the keeper need.

### 5. Deploy

[`docs/MAINNET.md`](docs/MAINNET.md) covers the ceremony, the deployment with the Safe and the keeper as owners, the audit and publishing the app.

---

## Tech stack

| Layer | Technology |
|---|---|
| Contracts | Solidity 0.8.37, Foundry for Arc, OpenZeppelin |
| Circuits | Circom 2.2.3, Groth16, snarkjs 0.7.6 |
| Client | TypeScript, viem |
| App | Vite, React, a Web Worker prover, Playwright |
| Services | Node, SQLite |
| Network | Arc mainnet and Arc testnet |

---

## Privacy model

| Data | Visibility |
|---|---|
| Trade terms before settlement | A hash on chain. The terms and the salt travel only in the private link |
| Who is behind a trading address | Not on chain. The proof shows the checks passed; the regulator's key can open the identity |
| The credential and its secret | Created and kept in the browser, encrypted with a passphrase |
| Sanctions and revocation lookups | None. The lists are downloaded whole, so no query names an identifier |
| Which lists and versions a proof used | Recorded with the attestation |
| Terms at settlement | Revealed by the `settle` call, which moves both legs |

---

<p align="center">
  Keelson is independent of Circle and Arc and is not an official product of either.
</p>
