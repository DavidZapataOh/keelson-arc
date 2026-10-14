# Keeper

Keeps the on-chain sanctions and revocation roots in step with their sources.

    RPC_URL=... KEEPER_PRIVATE_KEY=... SANCTIONS_REGISTRY=0x... REVOCATIONS_REGISTRY=0x... \
    ISSUER_URL=https://issuer.example DATA_DIR=./data pnpm --filter @keelson/keeper start

Each tick (default every 15 minutes) the keeper rebuilds the sanctions snapshot from the OFAC list, fetches the issuer's revocation snapshot, writes both under `DATA_DIR` (`sanctions-latest.json`, `revocations-latest.json`, plus a versioned sanctions file) and publishes a root only when it changed. Unchanged roots are refreshed every quarter of their maximum age so the registries never go stale. Serve `DATA_DIR` over HTTPS: clients download the snapshots whole.

The keeper account must own the sanctions and revocations registries and nothing else. It refuses a source list older than the last one published and a revocation snapshot that drops a revoked id.
