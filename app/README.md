# App

The web app for settling a trade between two verified parties on Arc.

    pnpm --filter @keelson/app dev

The app reads one deployment file at startup (`/deployment.json`, or the URL in `VITE_DEPLOYMENT_URL`):

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

Before showing anything usable it checks that the endpoint serves Arc, that every address holds a contract, and that the contracts point at each other.

| Script | Purpose |
| --- | --- |
| `pnpm --filter @keelson/app test` | unit and component tests |
| `pnpm --filter @keelson/app test:e2e` | browser tests (build, preview and drive Chrome) |
| `pnpm --filter @keelson/app build` | static files in `dist` |

No third-party scripts and no trackers: the page ships its own fonts and talks only to the configured endpoints.
