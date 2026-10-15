# Deploy

`Dockerfile` builds one container that runs the credential issuer and the keeper together. The issuer serves
the public endpoints, the lists the keeper publishes, and (when `DEMO_MODE=testnet`) a faucet of demo
credentials for test networks.

| Variable | Purpose |
| --- | --- |
| `ISSUER_PRIVATE_KEY`, `ADMIN_TOKEN`, `REGULATOR_TOKEN` | issuer secrets |
| `KEEPER_PRIVATE_KEY`, `RPC_URL`, `SANCTIONS_REGISTRY`, `REVOCATIONS_REGISTRY` | keeper account and registries |
| `DATA_DIR`, `DB_PATH` | paths on a persistent volume |
| `ALLOWED_ORIGIN` | the origins of the app that calls the issuer from a browser, separated by commas |
| `DEMO_MODE=testnet` | enables `POST /demo/credentials`; never set on mainnet |
| `DEMO_TIER`, `DEMO_JURISDICTION`, `DEMO_VALIDITY_SECONDS`, `DEMO_PER_HOUR`, `DEMO_PER_DAY` | what a demo credential carries and how often one client or all clients may ask; all required with `DEMO_MODE` |

The issuer reads the sanctions snapshot at start, so restart it after a new snapshot when screening must use it.
