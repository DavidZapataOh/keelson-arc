# App

The web app for settling a trade between two verified parties on Arc.

    pnpm --filter @keelson/app dev

The app reads a deployment file at startup. A site built for several networks serves one file per network, `/deployment.mainnet.json` and `/deployment.testnet.json`, and the top bar lets the visitor choose; Arc mainnet is the default when the site includes it. A single-network build reads `/deployment.json`, or the URL in `VITE_DEPLOYMENT_URL`. A file looks like this:

```json
{
  "chainId": 5042,
  "verifier": "0x…",
  "issuers": "0x…",
  "sanctions": "0x…",
  "revocations": "0x…",
  "compliance": "0x…",
  "settlement": "0x…",
  "rpcUrl": "https://…",
  "issuerUrl": "https://…",
  "listsUrl": "https://…",
  "assetsUrl": "https://…"
}
```

Optional fields: `tokens` (the tokens the trade form offers, USDC and EURC on Arc by default), `demo` (the issuer hands out demo credentials), `faucetUrl` (a link to test funds shown in the top bar) and `rpcFallbackPath` (a path on the app's own origin that forwards to the RPC, used when a browser blocks the RPC domain).

Before showing anything usable it checks that the endpoint serves Arc, that every address holds a contract, and that the contracts point at each other.

| Script | Purpose |
| --- | --- |
| `pnpm --filter @keelson/app test` | unit and component tests |
| `pnpm --filter @keelson/app test:e2e` | browser tests (build, preview and drive Chrome) |
| `pnpm --filter @keelson/app build` | static files in `dist` |
| `pnpm --filter @keelson/app exec node scripts/package-site.ts --mainnet <file> --testnet <file>` | a site for both networks, each with its own circuit files pinned by hash (either flag alone builds a site for one) |

Each network keeps its own vault in the browser, and mainnet is only packaged with the keys of a published ceremony.

No third-party scripts and no trackers: the page ships its own fonts and talks only to the configured endpoints.
