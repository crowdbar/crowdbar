# Implementation Plan: Crowdbar

Status: draft 3 for review, 2026-11-16. No code has been written. The specification is in `SPEC.md`; task definitions are in `tasks/todo.md`.

## Overview

Crowdbar is a crowdsourced progress bar timing API. A developer creates a project, defines progress bars inside it, and gives each bar an ordered list of phases. Their app reports how long each phase really took through a small SDK; Crowdbar aggregates those timings and returns expected durations, so the next user sees an accurate progress bar and ETA.

## Decisions made by the owner

- **Auth:** Better Auth with its SvelteKit integration, with GitHub and Google sign-in.
- **Open source:** everything, in the `crowdbar` GitHub organisation. MIT for the SDKs, AGPL-3.0 for the server, dashboard and everything else.
- **SDKs:** headless (they give progress and remaining time; the developer draws the bar). TypeScript first, then Python.
- **Estimate visibility:** a project can restrict who reads its estimates.
- **Domain:** `crowdbar.dev` for the site and dashboard, `api.crowdbar.dev` for the API.
- **Minimum runs before serving an estimate:** configurable per bar in the dashboard, default 1.
- **Demo:** simulated job where each phase sleeps for a random time within a range.
- **Tooling:** Bun as package manager and script runner.

## Architecture Decisions

- **One repository, `crowdbar/crowdbar`, with Bun workspaces.** `apps/api`, `apps/web`, `packages/sdk`, `packages/core`, `packages/db`, plus `packages/sdk-python` outside the Bun workspace. The API contract, the SDKs and the dashboard change together, and one developer maintains all of them. The Python SDK stays in this repository so both SDKs run the same contract fixtures in one CI; it can move to its own repository if it gains separate contributors.
- **Licence boundary.** The root `LICENSE` is AGPL-3.0; `packages/sdk` and `packages/sdk-python` carry their own MIT `LICENSE`. The SDKs must not import from AGPL packages, or their MIT licence would be meaningless.
- **Restricting estimates uses a secret key, not obscurity.** A public key ships in client apps, so it cannot keep anything private. A project that restricts its estimates must read them server-side with its secret key and pass them to its own clients.
- **The API is its own Worker (Hono), separate from the dashboard.** A dashboard deploy must never break SDK traffic.
- **Dashboard is SvelteKit with Tailwind and shadcn-svelte, on Workers via the Cloudflare adapter.** It reads and writes config in D1 through its own binding; it does not proxy through the public API.
- **Better Auth runs inside the SvelteKit app, on D1 through Drizzle.** Better Auth has no direct D1 adapter, and Drizzle also serves the rest of the schema. The auth instance is built per request, because Workers bindings only exist per request.
- **D1 holds config only** (auth tables, projects, bars, phases). Schema and migrations live in `packages/db` and are shared by both Workers.
- **Timings are never stored as raw events.** One Durable Object per bar holds a log-scale histogram per phase and per segment. Writes stay cheap and storage stays bounded.
- **No pace correction in the SDK (measured and dropped on 2026-11-16; do not retry without new evidence).** Task 10b scaled the remaining phases by a damped ratio of actual to estimated time so far (damping 0.5, chosen before measuring). Mean ETA error, 5 sets of 30 runs per mode:

  | Mode               | Naive | Crowdbar | + pace correction | + segments |
  | ------------------ | ----- | -------- | ----------------- | ---------- |
  | Normal             | 48.1% | 12.4%    | 15.5%             | n/a        |
  | High variance      | 48.0% | 35.4%    | 22.0%             | 13.1%      |
  | Independent phases | 48.7% | 24.5%    | 30.6%             | n/a        |

  It only helps when one hidden factor slows every phase, and segments fix that case better. When phases vary independently, a run's pace so far is noise, and scaling by it made estimates worse (+3.1 points in normal mode, +6.2 with independent phases). Segments are the remedy for context-dependent durations.

- **Aggregation maths is a pure package (`packages/core`)** with no Cloudflare dependency, so it is unit-testable and portable.
- **Estimates are cached at the edge** with a short TTL.
- **The SDK never blocks the host app.** Local cache, safe fallback, fire-and-forget reports.
- **Bun installs and runs scripts; Vitest runs tests.** The Workers Vitest pool is needed to test Durable Objects and D1, and it does not run under `bun test`. Wrangler itself runs fine when launched through Bun.

## Dependency Graph

```
packages/core (histogram, quantiles)
    │
    └── apps/api: report run ──► Durable Object per bar ──► estimate
            │                                                  │
            │                                                  └── edge cache
            │
            ├── packages/sdk (report + estimate + local cache)
            │       │
            │       └── demo page (Crowdbar bar vs naive bar)
            │
            └── key and bar validation
                    │
packages/db (Drizzle, D1) ─┤
    │                      │
    └── apps/web: Better Auth sign-in ─► projects ─► bars and phases ─► stats view
```

The core loop (report → aggregate → estimate → SDK) has no dependency on auth, D1 or the dashboard. It is also the part that decides whether the product is worth building, so it goes first.

## Task List

### Phase 0: Foundation

- [x] Task 1: Monorepo scaffold with CI and a deployed health endpoint

### Phase 1: Core loop (highest risk, no auth, no dashboard)

- [x] Task 2: Report a run and read an estimate for one bar
- [x] Task 3: Histogram quantiles with a minimum-sample rule
- [x] Task 4: TypeScript SDK that reports phases and reads estimates
- [x] Task 5: Demo page comparing a Crowdbar bar with a naive bar

### Checkpoint A: Is the estimate good enough? (go / no-go)

Passed on 2026-11-16 with a reorder. Mean ETA error over 30 runs: normal mode naive 48%, Crowdbar 13% (go); high-variance mode naive 48%, Crowdbar 50% (the global estimate fails when a hidden factor drives durations).

### Phase 1b: Context (pulled forward)

- [x] Task 10: Segmented estimates with global fallback
- [ ] ~~Task 10b: Pace correction in the SDK~~ Closed, not done: measured and dropped (see Architecture Decisions)

### Checkpoint A2: Segments and pace correction measured, full table reviewed before Task 6

Passed on 2026-11-16: segments kept, pace correction dropped, Task 6 next.

### Phase 2: Projects, bars and phases

- [x] Task 6: Developer signs in and creates a project with a key
- [ ] Task 7: Developer defines bars and ordered phases
- [ ] Task 8: API accepts only valid keys, bars and phases
- [ ] Task 9: Dashboard shows per-phase stats for a bar

### Checkpoint B: End-to-end with a real project

### Phase 3: Quality and hardening

- [ ] Task 11: Edge caching of estimates
- [ ] Task 12: Abuse protection on ingestion
- [ ] Task 13: Project can restrict who reads its estimates

### Checkpoint C: Safe to expose publicly

### Phase 4: Launch

- [ ] Task 14: Project deletion and privacy page
- [ ] Task 15: Python SDK that reports phases and reads estimates
- [ ] Task 16: Landing page, quickstart docs and package publishing

### Checkpoint D: Launch ready

## Parallelisation

- Tasks 2 to 5 are sequential.
- After Checkpoint A, Tasks 10 and 10b ran first (owner decision), then Checkpoint A2, then Tasks 6 and 7.
- Tasks 11 and 12 are independent of each other; Task 13 needs Task 11.
- Tasks 14 and 15 are independent of each other.
- Task 8 needs both Task 2 and Task 7.

## Risks and Mitigations

| Risk                                                                                               | Impact | Mitigation                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimates are no better than a naive bar because durations depend on context                       | High   | Checkpoint A measures this before any dashboard work. Segments (Task 10) are the planned remedy; Task 10 pulled forward after Checkpoint A, SDK pace correction (Task 10b) was measured and dropped. |
| With a minimum of 1 run, one bad or malicious first run sets the estimate                          | Medium | The response carries the sample count so the SDK and dashboard can show low confidence. Developers can raise the minimum per bar.                                                                    |
| Poisoned data from public keys                                                                     | High   | Task 12: bounds validation, rate limits, quantiles, optional origin allow-list per project.                                                                                                          |
| One Durable Object per bar becomes a hotspot for a very popular bar                                | Medium | Histogram updates are tiny. If needed, batch reports in the Worker or shard by segment. Not solved in v1.                                                                                            |
| Better Auth on Workers and D1 needs per-request setup and has had rough edges                      | Medium | Task 6 starts from the current official docs and a known SvelteKit + Drizzle + D1 template.                                                                                                          |
| Bun and Cloudflare tooling drift (Wrangler, Vitest pool config has changed between versions)       | Low    | Task 1 checks current docs; tests run on Vitest, not `bun test`.                                                                                                                                     |
| Google sign-in needs an OAuth consent screen, which Google may review before it works for everyone | Low    | Create the Google Cloud OAuth client early in Task 6; GitHub sign-in works meanwhile.                                                                                                                |
| Cloudflare-specific storage creates lock-in                                                        | Medium | Maths in `packages/core`; storage access behind one small interface in `apps/api`.                                                                                                                   |

## Open Questions

None blocking. All earlier questions were answered on 2026-11-16 and are recorded under "Decisions made by the owner".
