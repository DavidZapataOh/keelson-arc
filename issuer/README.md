# Issuer

Signs compliance credentials and maintains the revocation list.

    ISSUER_PRIVATE_KEY=<32 bytes hex> ADMIN_TOKEN=<32+ chars> REGULATOR_TOKEN=<32+ chars> \
    SANCTIONS_SNAPSHOT=sanctions.json pnpm --filter @keelson/issuer start

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /health`, `GET /issuer` | none | liveness and the issuer public key |
| `GET /revocations` | none | revocation set snapshot (clients download it whole) |
| `POST /credentials` | admin | sign a credential for a subject |
| `POST /revocations` | admin | revoke a credential id |
| `GET /subjects/<subject>` | regulator | the entity reference behind a disclosed subject |

The holder generates a secret and sends only `Poseidon(secret)` as `subject`; the issuer never sees the secret. Before signing, every identifier is hashed and checked against the sanctions snapshot. Keelson does not perform KYC: issue only after your own KYC process has approved the entity, and put your case reference in `entityRef`.

The service listens on `127.0.0.1` by default; run it behind a TLS-terminating proxy. Keep the issuer key in a key-management service in production.
