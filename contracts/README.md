# Contracts

Run the tests on Arc's runtime:

    arc-forge test --network arc

Gas budgets are enforced against `.gas-snapshot`. After an intentional change, regenerate and commit it:

    arc-forge snapshot --network arc
