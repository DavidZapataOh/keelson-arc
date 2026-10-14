# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro, TypeScript and GSAP. Static output only: no server, no API routes, no third-party scripts, no trackers, no cookies. Hosting is undecided, so the build must run on any static host. Brand fonts are self-hosted.

## Users

- **Operators and desk heads** at institutional OTC desks and market makers; **treasury and operations leads** at payment and remittance firms; **crypto-native funds**. They move large stablecoin blocks (from about 100,000 USD) and today agree trades over chat or RFQ and settle by prefunding, so whoever moves first carries the risk. They know the vocabulary (RFQ, block trade, DvP/PvP, prefunding, leg) and are skeptical of crypto marketing.
- **Compliance officers (MLRO)** decide whether a tool enters the stack. They must be able to evidence sanctions screening to an auditor years later, and they distrust any claim that a tool removes their liability.
- **Engineers** verify contracts and add them to custody allowlists (MPC, multisig). They expect verified addresses, an open repository and exportable transactions.
- **Reviewers of the Arc ecosystem** who open the page for a few minutes and judge relevance, technical credibility and quality.

Not for: retail DeFi users, or anyone trying to hide from regulators.

## Product Purpose

Keelson settles an OTC block between two verified institutions on Arc. Both legs settle together or neither does. Terms and identities stay off the public record. Each side proves, per trade, that it holds a valid, non-revoked credential and is not on the sanctions list in use, without revealing who it is. A regulator holding the right key can open the record.

The landing page must make a first-time visitor understand, within seconds, what this is, why it matters, and what to do. The primary action is to open the app. Success is a visitor who can state in one sentence what Keelson does and what it does not do.

## Positioning

The proof of compliance is produced per trade, not once at onboarding, and the record can be opened by a regulator, on Arc today, without trusting hardware enclaves. Neighbors: public RFQ and escrow venues (trades visible on chain), and chat plus prefunding (one side carries settlement risk). Keelson does not make a market, set prices or extend credit.

## Operating Context

OTC blocks are agreed over chat or RFQ, then settled by prefunding, credit lines or delivery-versus-payment where available. Institutions sign contract calls from custody or multisig, not from a browser wallet, so the product must produce transactions that a custody policy can approve. Records may need to stay openable for ten years. Compliance teams ask which list and which version were used, and when.

## Capabilities and Constraints

Built and tested in the repository: a zero-knowledge compliance circuit (Groth16), the settlement and compliance registry contracts, a credential issuer with sanctions screening and revocation, a sanctions list pipeline and keeper, an SDK, CCTP v2 helpers and an end-to-end suite on a local Arc node.

Not done and not to be implied as done: mainnet deployment, the web app (its address is undecided), an independent audit, the custody design of the regulator key, and acceptance of the credential issuer by institutions. Terms are revealed at settlement. The per-trade proof covers exact-identifier non-membership; fuzzy name screening is the issuer's job off chain. Keelson is independent of Circle and Arc and is not an official product of either.

## Brand Commitments

- Name: Keelson. Tagline: "Both legs, or neither."
- Logo: the Split K (a graphite stem and a vermilion chevron separated by a gap) with the lowercase wordmark; vector files exist.
- Palette and type are binding: bone `#F2F0EA`, graphite `#17181B`, one vermilion `#FF4B1F` (text on a vermilion fill is graphite; vermilion is never small text on bone), Instrument Sans and Geist Mono. No serif.
- Signature idea: redaction bars that open. Privacy is shown as a specific, openable state, never as fog, glass or padlocks.
- Voice: precise, plain, accountable, in English; the vocabulary of the desk. Never: "trustless", "compliant by law", "risk-free", "guarantees compliance".
- It must not look like Circle or Arc (no lavender gradients, white 20 px cards, pastel 3D, violet accents, Circular or Space Grotesk).

## Evidence on Hand

Real and citable: the open repository, CI results, measured figures from the benchmark suite (circuit size, proving time, on-chain verification gas) and the test counts. Absent and not to be fabricated: customers, volumes, testimonials, audits, regulator acceptance, mainnet addresses and any live usage. Demonstration data is allowed only when labeled synthetic.

## Product Principles

1. Show the mechanism, do not describe it: the visitor should watch a trade settle or not settle.
2. Say plainly what Keelson does not do, but only where it matters (the footer disclosures and the relevant claims), not as a section of its own.
3. Every number carries its date and its basis.
4. Privacy is a state with an owner: show what the market, the counterparty and the regulator can each see.
5. Dynamic but accountable: motion explains the product or it does not ship.

## Accessibility & Inclusion

WCAG 2.2 AA at minimum: contrast of 4.5:1 for text, visible 2 px focus, full keyboard use, 44 px targets, and `prefers-reduced-motion` honored (redaction bars shown open, no reactive field). The page must stay fast on a mid-range phone.
