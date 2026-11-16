# Crowdbar

Crowdsourced progress bar timing API. Apps report how long each phase of a job took; the API returns expected durations so progress bars are accurate. See `SPEC.md`.

## Development

```sh
bun install
bun run lint && bun run typecheck && bun run test && bun run build
```

## Licence

- Everything in this repository is licensed under **AGPL-3.0** (see `LICENSE`), unless a directory has its own `LICENSE` file.
- The SDKs, `packages/sdk` (npm `crowdbar`) and `packages/sdk-python` (PyPI `crowdbar`), are licensed under **MIT**, so you can use them in closed-source apps. They never import from the AGPL packages.
