# Crowdbar

Crowdsourced progress bar timing API. Apps report how long each phase of a job took; the API returns expected durations so progress bars are accurate.

## Where things are

- `SPEC.md`: what we are building, the public API contract, boundaries. Read it first.
- `tasks/plan.md`: architecture decisions, risks, open questions.
- `tasks/todo.md`: ordered tasks with acceptance criteria. Work through them in order, one at a time, ticking boxes as they pass. Stop at each checkpoint for human review.

## Current state

Task 1 code is done (scaffold, `GET /v1/health`, CI, licences). CI passes on GitHub. Still pending for Task 1: the preview deploy (`bun run --filter './apps/api' deploy:preview`, needs `wrangler login`). Next coding step is Task 2.

Lint is Biome (`bun run lint`). Worker tests use `@cloudflare/vitest-plugin` (the successor to `@cloudflare/vitest-pool-workers`) with `exports` from `cloudflare:workers`.

## Rules

- Use **Bun** for everything: `bun install`, `bun add`, `bun run <script>`, `bunx`. Never npm, pnpm or yarn.
- Tests run on Vitest: `bun run test`. Do not use `bun test` (Bun's own runner cannot run the Cloudflare Workers test pool).
- Focused runs: `bun run --filter './apps/api' test`.
- Before installing or configuring Wrangler, the Workers Vitest pool, Better Auth, Drizzle or shadcn-svelte, check their current official docs. APIs in this area change often.
- The Python SDK (`packages/sdk-python`) is outside the Bun workspace and uses uv: `uv run pytest`, `uv build`.
- Licences: AGPL-3.0 for everything except the two SDKs, which are MIT. An SDK must never import from `packages/core` or `packages/db`.
- Worker code uses Web APIs only; no Bun-specific or Node-only APIs in `apps/` or `packages/core`.
- Do not change the public API contract in `SPEC.md` without asking.
- Never store IP addresses or end-user identifiers. Never commit secrets.
- Ask before any production deploy, DNS change or secret change.

## Layout

```
apps/api        Hono Worker (api.crowdbar.dev): public API, Durable Object per bar
apps/web        SvelteKit + Tailwind + shadcn-svelte (crowdbar.dev): site and dashboard
packages/core   Pure histogram and quantile maths
packages/db     Drizzle schema and D1 migrations (shared by both Workers)
packages/sdk    TypeScript SDK, published to npm as "crowdbar" (MIT, headless)
packages/sdk-python   Python SDK, published to PyPI as "crowdbar" (MIT, headless)
```

Repository: `github.com/crowdbar/crowdbar`.
