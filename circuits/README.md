# Circuits

Circom circuits for Keelson and the tooling that builds their Groth16 keys.

    pnpm --filter @keelson/circuits test
    pnpm --filter @keelson/circuits build:circuit <name> <path/to/circuit.circom>

Requires `circom` 2.2.3 on `PATH`. Artifacts are written to `build/<name>/`.

Keys built here come from a public, fixed beacon on top of the Perpetual Powers of Tau ceremony. They are reproducible and meant for development and tests. Keys for deployment come from the circuit-specific ceremony in `ceremony/`, whose transcript can be re-derived from source with `pnpm --filter @keelson/circuits ceremony verify`.
