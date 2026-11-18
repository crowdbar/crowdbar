# Crowdbar task list

See `tasks/plan.md` for architecture decisions, risks and open questions.

Package manager and script runner: **Bun** (never npm, pnpm or yarn). Commands assumed throughout (created in Task 1): `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`. For a focused run: `bun run --filter './apps/api' test`. Tests run on Vitest through `bun run test`; do not use `bun test`, which is Bun's own runner and cannot run the Workers test pool.

---

## Phase 0: Foundation

## Task 1: Monorepo scaffold with CI and a deployed health endpoint

**Description:** Initialise the git repository (remote: `github.com/crowdbar/crowdbar`) and create the Bun workspace with `apps/api`, `apps/web`, `packages/sdk`, `packages/core` and `packages/db` as empty but buildable packages. The API Worker (Hono) serves `GET /v1/health`. CI runs lint, typecheck, test and build on every push using Bun. Add the licence files: AGPL-3.0 in the root `LICENSE` (covers everything by default), MIT in `packages/sdk/LICENSE`, and a README section saying which licence applies where. Check current Wrangler and Workers Vitest docs before installing.

**Acceptance criteria:**

- [x] (preview: https://main-crowdbar-api.nifle.workers.dev/v1/health) `GET /v1/health` returns `200 {"ok":true}` locally and on a deployed preview Worker (production route `api.crowdbar.dev` is configured but not required yet)
- [x] (passes on main; failure on type errors checked locally) CI fails on a lint, type or test error and passes on main
- [x] Each package builds on its own with `bun run --filter '<path>' build`, and `bun install` from a clean clone succeeds with a committed `bun.lock`

**Verification:**

- [x] Tests pass: `bun run test`
- [x] Build succeeds: `bun run build`
- [x] Manual check: `curl` the deployed preview URL

**Dependencies:** None

**Files likely touched:**

- `package.json` (with `workspaces`), `bun.lock`, `tsconfig.base.json`, `LICENSE`, `packages/sdk/LICENSE`, `README.md`
- `apps/api/src/index.ts`, `apps/api/wrangler.jsonc`
- `.github/workflows/ci.yml`

**Estimated scope:** Medium

---

## Phase 1: Core loop

## Task 2: Report a run and read an estimate for one bar

**Description:** Walking skeleton of the whole product. `POST /v1/runs` accepts a bar id and a duration per phase; a Durable Object for that bar stores a running aggregate; `GET /v1/bars/:bar/estimate` returns it. No auth, no D1, and the aggregate may be a simple mean for now. CORS is open, because browser apps on any origin call this API.

**Acceptance criteria:**

- [x] Posting runs for a bar changes what the estimate endpoint returns for that bar and no other
- [x] Malformed bodies (missing phases, negative or non-numeric durations) return `400` with an error message
- [x] State survives a Worker restart (it is in Durable Object storage, not memory)

**Verification:**

- [x] Tests pass: `bun run --filter './apps/api' test`
- [x] Manual check: post three runs with `curl`, read the estimate

**Dependencies:** Task 1

**Files likely touched:**

- `apps/api/src/routes/runs.ts`, `apps/api/src/routes/estimate.ts`
- `apps/api/src/bar-object.ts`
- `apps/api/test/core-loop.test.ts`

**Estimated scope:** Medium

## Task 3: Histogram quantiles with a minimum-sample rule

**Description:** Replace the mean with a log-scale histogram per phase in `packages/core`, as pure functions (`add(histogram, ms)`, `quantile(histogram, q)`). The Durable Object uses it; the estimate returns p50, p90 and sample count per phase, and returns no estimate below the minimum sample count. The minimum is a parameter with a default of 1; it becomes a per-bar dashboard setting in Task 7.

**Acceptance criteria:**

- [x] On generated samples from known distributions, p50 and p90 are within 5% of the exact values
- [x] A single extreme outlier among 100 samples moves p50 by less than 5%
- [x] Below the minimum sample count the estimate response has `ready: false` and carries no durations; with the default of 1, a single run is enough to get an estimate

**Verification:**

- [x] Tests pass: `bun run --filter './packages/core' test` and `bun run --filter './apps/api' test`
- [x] Manual check: none needed

**Dependencies:** Task 2

**Files likely touched:**

- `packages/core/src/histogram.ts`, `packages/core/test/histogram.test.ts`
- `apps/api/src/bar-object.ts`

**Estimated scope:** Small

## Task 4: TypeScript SDK that reports phases and reads estimates

**Description:** `packages/sdk` exposes a client: create a run for a bar, mark each phase start and end, finish. It fetches the estimate before the run, caches it locally, and exposes a progress value (0 to 1) and remaining time computed from the estimate and elapsed time. Reports are sent without blocking. The SDK is headless: it gives numbers, the developer draws the bar. It is MIT licensed, so it must not import from the AGPL packages (`packages/core`, `packages/db`); anything shared is duplicated or lives in the SDK.

**Acceptance criteria:**

- [x] A complete run produces exactly one `POST /v1/runs` with a duration for every phase
- [x] With the API unreachable, the SDK throws nothing, exposes "no estimate", and the host code keeps running
- [x] Progress never goes backwards and never reaches 1 before `finish()`

**Verification:**

- [x] Tests pass: `bun run --filter './packages/sdk' test`
- [x] Build succeeds: `bun run --filter './packages/sdk' build` (ESM output with types)

**Dependencies:** Task 3

**Files likely touched:**

- `packages/sdk/src/client.ts`, `packages/sdk/src/progress.ts`
- `packages/sdk/test/client.test.ts`

**Estimated scope:** Medium

## Task 5: Demo page comparing a Crowdbar bar with a naive bar

**Description:** A static page that runs a simulated three-phase job where each phase is a sleep of random length drawn from its own range (for example 0.5–1.5 s, 2–6 s, 1–2 s). It shows two bars side by side: a naive linear bar and one driven by the SDK. It records the ETA error of each across runs and displays the comparison.

**Acceptance criteria:**

- [x] From the second run onwards, the Crowdbar bar's mean ETA error is displayed next to the naive bar's
- [x] The simulation has a "high variance" mode where the sleep ranges depend on a hidden factor (for example a "slow device" flag that triples them), to expose the context problem
- [x] (preview API redeployed 2026-11-18; segment estimates served there) The page works against the deployed preview API

**Verification:**

- [x] Build succeeds: `bun run build`
- [x] Manual check: run the demo 30 times in each mode and note both error figures (see Checkpoint A)

**Dependencies:** Task 4

**Files likely touched:**

- `apps/web/src/routes/demo/+page.svelte`
- `apps/web/src/lib/simulated-job.ts`

**Estimated scope:** Small

## Checkpoint A: Is the estimate good enough? (go / no-go)

- [x] All tests pass, all packages build
- [x] Demo figures recorded: Crowdbar vs naive ETA error, normal and high-variance modes
- [x] Decision with human: continue as planned, pull Task 10 (segments) forward, or stop

Figures (2026-11-16, 30 runs per mode, mean ETA error as a share of run duration):

| Mode          | Naive | Crowdbar |
| ------------- | ----- | -------- |
| Normal        | 48%   | 13%      |
| High variance | 48%   | 50%      |

Decision: go for normal mode; the global estimate fails in high-variance mode. Continue, but reorder: Task 10 (segments) and the new Task 10b (pace correction) run now, then Checkpoint A2, then Task 6.

---

## Phase 1b: Context (pulled forward)

## Task 10: Segmented estimates with global fallback

**Description:** Runs and estimate requests accept an optional `segment` string. The Durable Object keeps a histogram per segment as well as the global one. An estimate for a segment below the minimum sample count falls back to the global estimate and says so.

**Acceptance criteria:**

- [x] (13% with segments vs 35% without, see Checkpoint A2) In the demo's high-variance mode, passing the hidden factor as the segment reduces ETA error compared with no segment
- [x] A segment with too few samples returns the global estimate with a `fallback: true` marker
- [x] (cap: 100 segments per bar) The number of segments per bar is capped; runs beyond the cap count towards the global histogram only

**Verification:**

- [x] Tests pass: `bun run --filter './apps/api' test` and `bun run --filter './packages/sdk' test`
- [x] Manual check: rerun the demo comparison in high-variance mode with segments on

**Dependencies:** Task 3 (pulled forward after Checkpoint A, runs before Task 6)

**Files likely touched:**

- `apps/api/src/bar-object.ts`, `apps/api/src/routes/estimate.ts`, `apps/api/src/routes/runs.ts`
- `packages/sdk/src/client.ts`
- `apps/web/src/lib/simulated-job.ts`

**Estimated scope:** Medium

## Task 10b: Pace correction in the SDK (closed, not done)

**Status:** Closed on 2026-11-16 after measurement: it failed the normal and independent-phases criteria and was removed from the SDK and the demo. The reason and figures are in `tasks/plan.md` (Architecture Decisions). The demo keeps the independent-phases mode.

**Description:** When a run's completed phases took longer or shorter than their estimates, the SDK scales the estimates of the remaining phases by a damped ratio of actual to estimated time so far. SDK only; no API change. The damping is a single constant, and the feature is switchable. The demo gains an "independent phases" mode (each phase has its own hidden slow/fast factor) and shows four figures per mode: naive, Crowdbar, Crowdbar + pace correction, and Crowdbar + segments (where a segment applies).

**Acceptance criteria:**

- [x] (22% vs naive 48% and Crowdbar 35%) In high-variance mode without segments, mean ETA error is clearly below both the naive bar and uncorrected Crowdbar
- [ ] (FAILED: 15.5% vs 12.4%, +3.1 points) In normal mode, error is no worse than uncorrected Crowdbar (within 2 percentage points)
- [ ] (FAILED: 30.6% vs 24.5%, +6.2 points) In independent-phases mode, error is no worse than uncorrected Crowdbar (within 2 percentage points)

**Verification:**

- [x] Tests pass: `bun run --filter './packages/sdk' test` and `bun run --filter './apps/web' test`
- [x] Manual check: 30 runs per mode, full table of the four figures for all three modes

**Dependencies:** Task 10

**Files likely touched:**

- `packages/sdk/src/progress.ts`, `packages/sdk/src/client.ts`
- `apps/web/src/lib/simulated-job.ts`, `apps/web/src/routes/demo/+page.svelte`

**Estimated scope:** Small

## Checkpoint A2: Segments and pace correction measured

- [x] Full results table for all three modes shown to the human before Task 6
- [x] If pace correction fails the normal or independent-phases criterion, report the numbers without further tuning and wait
- [x] Decision with human on pace correction and on starting Task 6: pace correction dropped, segments kept, Task 6 next

Figures (2026-11-16): mean ETA error as a share of run duration, averaged over 5 sets of 30 runs per mode on a fresh bar each, against a local API with a simulated clock (same SDK and job code as the demo). `PACE_DAMPING` = 0.5, chosen before measuring.

| Mode               | Naive | Crowdbar | + pace correction | + segments |
| ------------------ | ----- | -------- | ----------------- | ---------- |
| Normal             | 48.1% | 12.4%    | 15.5%             | n/a        |
| High variance      | 48.0% | 35.4%    | 22.0%             | 13.1%      |
| Independent phases | 48.7% | 24.5%    | 30.6%             | n/a        |

---

## Phase 2: Projects, bars and phases

## Task 6: Developer signs in and creates a project with a key

**Description:** Authentication uses Better Auth with its SvelteKit integration, on D1 through Drizzle (Better Auth has no direct D1 adapter). `packages/db` holds the Drizzle schema: Better Auth's tables plus projects. The dashboard has sign-in (GitHub and Google providers), a project list and a "new project" form. Creating a project generates a public key shown in the UI. On Workers the D1 binding only exists per request, so the auth instance is created per request in `hooks.server.ts`. Check current Better Auth, Drizzle and shadcn-svelte docs before installing.

**Acceptance criteria:**

- [x] (checked in the hook, so form actions are covered; verified locally and on the preview) A signed-out visitor is redirected to sign-in from any dashboard route
- [x] (db tests, seeded sessions against the local app, and real OAuth sign-in on the preview) A signed-in developer can create a project and sees it, with its key, after reload
- [x] (db tests, plus seeded sessions: 404 on another developer's project) A developer cannot see or open another developer's project

**Verification:**

- [x] Tests pass: `bun run --filter './apps/web' test` and `bun run --filter './packages/db' test`
- [x] Manual check: sign in with two accounts and confirm isolation (confirmed on the preview, 2026-11-17)

**Dependencies:** Task 1 (Checkpoint A passed)

**Files likely touched:**

- `packages/db/src/schema.ts`, `packages/db/migrations/0000_auth_projects.sql`
- `apps/web/src/lib/server/auth.ts`, `apps/web/src/hooks.server.ts`
- `apps/web/src/routes/(app)/projects/+page.svelte`, `+page.server.ts`

**Estimated scope:** Medium

## Task 7: Developer defines bars and ordered phases

**Description:** Schema for bars and phases. On a project page the developer can add a bar (name and slug), add phases to it, rename them and reorder them. Each bar has a "minimum runs before serving an estimate" setting, default 1.

**Acceptance criteria:**

- [x] (db tests and local end-to-end; slugs are 1 to 64 of `a-z 0-9 - _`, starting with a letter or digit) Bar slugs are unique within a project and phase slugs unique within a bar; duplicates show a form error
- [x] (db tests and local end-to-end; reorder is move up/down, rename changes the name but never the slug) Phase order and the bar's minimum-runs setting persist after reload
- [x] (`sdkSnippet` unit tests and local end-to-end) The bar page shows a copyable SDK snippet with the project key, bar slug and phase slugs filled in

**Verification:**

- [x] Tests pass: `bun run --filter './apps/web' test` (and `./packages/db`)
- [x] Manual check: create a bar with three phases, reorder, reload (confirmed on the preview, 2026-11-18)

**Dependencies:** Task 6

**Files likely touched:**

- `packages/db/src/schema.ts`, `packages/db/migrations/0001_bars_phases.sql`
- `apps/web/src/routes/(app)/projects/[id]/+page.svelte`, `+page.server.ts`
- `apps/web/src/routes/(app)/projects/[id]/bars/[bar]/+page.svelte`, `+page.server.ts`

**Estimated scope:** Medium

## Task 8: API accepts only valid keys, bars and phases

**Description:** The API Worker reads D1. `POST /v1/runs` and the estimate endpoint require a valid project key and a bar that belongs to that project; reported phases must match the bar's defined phases, and the estimate honours the bar's minimum-runs setting. The Durable Object is addressed by project and bar. The SDK takes the key in its constructor.

**Acceptance criteria:**

- [x] (`test/validation.test.ts`; a run may skip defined phases but never report an undefined one; durations must be 0 ms to 7 days, else `422`) Unknown key returns `401`; unknown bar returns `404`; phases that do not match the definition return `422`
- [x] (the Durable Object is addressed by bar id) Two projects with the same bar slug have fully separate estimates
- [ ] (pending the manual check; the demo reads the key from `VITE_CROWDBAR_KEY`) The demo page works with a real project created in the dashboard

**Verification:**

- [x] Tests pass: `bun run --filter './apps/api' test` and `bun run --filter './packages/sdk' test`
- [ ] Manual check: run the demo against a dashboard-created project

**Dependencies:** Task 2, Task 7

**Files likely touched:**

- `apps/api/src/middleware/project-key.ts`
- `apps/api/src/routes/runs.ts`, `apps/api/src/routes/estimate.ts`
- `packages/sdk/src/client.ts`
- `apps/api/test/validation.test.ts`

**Estimated scope:** Medium

## Task 9: Dashboard shows per-phase stats for a bar

**Description:** The bar page shows, per phase, sample count, p50 and p90, and whether the minimum sample count has been reached. The dashboard reads this from the bar's Durable Object through a service binding to the API Worker.

**Acceptance criteria:**

- [ ] Stats match what the public estimate endpoint returns for the same bar
- [ ] A bar with no runs shows an empty state with the SDK snippet, not zeros; a bar below its minimum-runs setting shows how many runs are still needed
- [ ] Stats are only visible to the project's owner
- [ ] Per-segment stats: each segment is listed with its run count, p50 and p90 per phase, and whether it is served directly or falls back to the global estimate

**Verification:**

- [ ] Tests pass: `bun run --filter './apps/web' test`
- [ ] Manual check: run the demo, refresh the bar page, compare figures

**Dependencies:** Task 8

**Files likely touched:**

- `apps/api/src/routes/internal-stats.ts`
- `apps/web/src/routes/(app)/projects/[project]/bars/[bar]/+page.server.ts`, `+page.svelte`

**Estimated scope:** Small

## Task 9b: Automatic deployment from GitHub

**Description:** GitHub Actions deploys both Workers after lint, typecheck, test and build pass in the same workflow (not Cloudflare's dashboard Git integration). Two Wrangler environments, `staging` and `production`, each with its own Workers and D1 database. Every push to `main` applies pending D1 migrations to staging, then deploys the API Worker, then the web Worker, at `api.staging.crowdbar.dev` and `staging.crowdbar.dev`. Production runs the same steps on a manual `workflow_dispatch`, gated by a GitHub `production` environment with the owner as required reviewer, at `api.crowdbar.dev` and `crowdbar.dev`. Pull requests run the checks only and never deploy. Deploys use `cloudflare/wrangler-action@v4` with `packageManager: bun`. Previews (`wrangler preview`) stay as they are.

**Acceptance criteria:**

- [ ] A push to `main` with a failing test deploys nothing
- [ ] A push to `main` with passing checks updates staging, and `curl https://api.staging.crowdbar.dev/v1/health` returns `200`
- [ ] Production cannot deploy without the owner's approval in GitHub

**Verification:**

- [ ] Push a commit with a deliberately failing test on a throwaway branch merged to `main` (or observe a real failure) and confirm the deploy jobs are skipped
- [ ] After a green push, staging health returns `200` and sign-in works on `staging.crowdbar.dev`
- [ ] Trigger the production workflow and confirm it waits for approval

**Dependencies:** Task 8. Owner setup first: Cloudflare API token, GitHub secrets and environments, staging and production OAuth callbacks, production D1 database.

**Files likely touched:**

- `.github/workflows/ci.yml` (checks, then staging deploy) and `.github/workflows/deploy-production.yml`
- `apps/api/wrangler.jsonc`, `apps/web/wrangler.jsonc` (`env.staging`, `env.production`)

**Estimated scope:** Medium

## Checkpoint B: End-to-end with a real project

- [ ] All tests pass, all packages build
- [ ] Full flow works on the preview deployment: sign in → project → bar and phases → SDK reports → stats appear → next run shows an accurate bar
- [ ] Review with human before proceeding

---

## Phase 3: Quality and hardening

## Task 11: Edge caching of estimates

**Description:** Estimate responses are cached at the edge with a short TTL and proper cache headers, so most reads never reach the Durable Object. The SDK respects the same TTL for its local cache.

**Acceptance criteria:**

- [ ] A second estimate request within the TTL is served from cache (verified by a response header)
- [ ] A new estimate becomes visible no later than the TTL after the runs that changed it
- [ ] Responses for different keys, bars and segments never share a cache entry

**Verification:**

- [ ] Tests pass: `bun run --filter './apps/api' test`
- [ ] Manual check: inspect headers on two consecutive requests to the preview deployment

**Dependencies:** Task 8

**Files likely touched:**

- `apps/api/src/routes/estimate.ts`
- `packages/sdk/src/client.ts`
- `apps/api/test/cache.test.ts`

**Estimated scope:** Small

## Task 12: Abuse protection on ingestion

**Description:** Rate-limit `POST /v1/runs` per key and per client. Reject durations outside sane bounds (non-positive, or above a per-request maximum). Let a project set an allowed-origins list in the dashboard, enforced by the API. No IP addresses are stored.

**Acceptance criteria:**

- [ ] Exceeding the rate limit returns `429` and the run is not counted
- [ ] Out-of-bounds durations return `422` and do not alter the histogram
- [ ] With an origin allow-list set, a request from another origin is rejected

**Verification:**

- [ ] Tests pass: `bun run --filter './apps/api' test`
- [ ] Manual check: flood the preview endpoint with a loop and confirm `429`

**Dependencies:** Task 8

**Files likely touched:**

- `apps/api/src/middleware/rate-limit.ts`, `apps/api/src/middleware/origin.ts`
- `apps/api/src/routes/runs.ts`
- `packages/db/migrations/0003_allowed_origins.sql`
- `apps/web/src/routes/(app)/projects/[project]/settings/+page.svelte`, `+page.server.ts`

**Estimated scope:** Medium

## Task 13: Project can restrict who reads its estimates

**Description:** Each project gets a secret key for server-side use, alongside its public key. A project setting "Restrict estimates" makes the estimate endpoint require the secret key; the public key can then still report runs but not read estimates. The dashboard explains the consequence: with the restriction on, browser and mobile apps must fetch estimates through the developer's own backend. The secret key is shown once at creation, stored hashed, and can be rotated.

**Acceptance criteria:**

- [ ] With the restriction on, an estimate request with the public key returns `403`, and the same request with the secret key returns the estimate; reporting runs with the public key still works
- [ ] With the restriction off (the default), behaviour is unchanged from Task 8
- [ ] A restricted estimate is never served from the edge cache to a request that lacks the secret key; rotating the secret key invalidates the old one immediately

**Verification:**

- [ ] Tests pass: `bun run --filter './apps/api' test` and `bun run --filter './apps/web' test`
- [ ] Manual check: toggle the setting on the preview and call the estimate endpoint with each key

**Dependencies:** Task 8, Task 11

**Files likely touched:**

- `packages/db/src/schema.ts`, `packages/db/migrations/0004_secret_key_restrict.sql`
- `apps/api/src/middleware/project-key.ts`, `apps/api/src/routes/estimate.ts`
- `apps/web/src/routes/(app)/projects/[project]/settings/+page.svelte`, `+page.server.ts`

**Estimated scope:** Medium

## Checkpoint C: Safe to expose publicly

- [ ] All tests pass, all packages build
- [ ] Flooding and garbage-data attempts against the preview do not move estimates
- [ ] Review with human before proceeding

---

## Phase 4: Launch

## Task 14: Project deletion and privacy page

**Description:** A developer can delete a bar or a whole project; this removes its D1 rows and the stored histograms. A privacy page states what is collected (durations, segment labels) and what is not (IP addresses, user identifiers).

**Acceptance criteria:**

- [ ] After deleting a project, its key returns `401` and its Durable Object storage is empty
- [ ] Deletion requires typing the project name to confirm
- [ ] The privacy page matches actual behaviour (checked against API logging configuration)

**Verification:**

- [ ] Tests pass: `bun run test`
- [ ] Manual check: delete a project on the preview and call the API with its old key

**Dependencies:** Task 9

**Files likely touched:**

- `apps/web/src/routes/(app)/projects/[project]/settings/+page.server.ts`
- `apps/api/src/bar-object.ts`, `apps/api/src/routes/internal-delete.ts`
- `apps/web/src/routes/privacy/+page.svelte`

**Estimated scope:** Medium

## Task 15: Python SDK that reports phases and reads estimates

**Description:** A headless Python library in `packages/sdk-python`, MIT licensed, published to PyPI as `crowdbar`, for server-side jobs, scripts and CLIs. It mirrors the TypeScript SDK's behaviour with context managers (`with crowdbar.run("bar") as run:` and `with run.phase("decode"):`), exposes progress and remaining time, and accepts either a public or a secret key. No runtime dependencies (standard library only), Python 3.10 or later. Tooling is uv, pytest and ruff, with its own CI job; it is not part of the Bun workspace.

**Acceptance criteria:**

- [ ] A complete run produces exactly one `POST /v1/runs` with a duration for every phase, sent from a background thread
- [ ] With the API unreachable or slow, the library raises nothing into the host code and adds no more than a short bounded delay at exit
- [ ] The same contract test cases pass against the TypeScript and Python SDKs (shared JSON fixtures)

**Verification:**

- [ ] Tests pass: `uv run pytest` in `packages/sdk-python`
- [ ] Build succeeds: `uv build` produces a wheel that installs in a clean virtual environment
- [ ] Manual check: run a sample script against the preview API and see the run in the dashboard

**Dependencies:** Task 8, Task 13

**Files likely touched:**

- `packages/sdk-python/pyproject.toml`, `packages/sdk-python/LICENSE`
- `packages/sdk-python/src/crowdbar/client.py`, `packages/sdk-python/src/crowdbar/progress.py`
- `packages/sdk-python/tests/test_client.py`
- `.github/workflows/ci.yml`

**Estimated scope:** Medium

## Task 16: Landing page, quickstart docs and package publishing

**Description:** A landing page with the live demo from Task 5, a quickstart in TypeScript and Python (create project, install SDK, five lines of code), an API reference for the two public endpoints, the TypeScript SDK published to npm as `crowdbar` and the Python SDK published to PyPI as `crowdbar`.

**Acceptance criteria:**

- [ ] Following the quickstart from a clean directory produces a working bar against production
- [ ] `bun add crowdbar` in a fresh project installs the TypeScript SDK from the npm registry with types, and `uv add crowdbar` installs the Python SDK from PyPI
- [ ] Production is live on `crowdbar.dev` (site and dashboard) and `api.crowdbar.dev` (API)
- [ ] The quickstart explains segments and tells developers to pass one whenever they know a factor that makes runs slower (device class, file size bucket, region), citing the demo's high-variance figures: 35% mean ETA error without a segment, 13% with one

**Verification:**

- [ ] Build succeeds: `bun run build`
- [ ] Manual check: a person who has not seen the project follows the quickstart unaided

**Dependencies:** Checkpoint C, Task 14, Task 15

**Files likely touched:**

- `apps/web/src/routes/+page.svelte`, `apps/web/src/routes/docs/+page.svelte`
- `packages/sdk/package.json`, `packages/sdk/README.md`, `packages/sdk-python/README.md`
- `apps/api/wrangler.jsonc`, `apps/web/wrangler.jsonc`

**Estimated scope:** Medium

## Checkpoint D: Launch ready

- [ ] All acceptance criteria met across tasks
- [ ] Open questions in `tasks/plan.md` all answered
- [ ] Final review with human
