# Crowdbar specification

Version: draft 2, 2026-11-16. Owner decisions are marked **Decided**; everything else is a design choice explained in `tasks/plan.md`.

## Objective

Crowdbar is a crowdsourced progress bar timing API. Apps report how long each phase of a long-running job really took; Crowdbar aggregates those timings and returns expected durations, so the next user sees an accurate progress bar and ETA.

Success means: on the demo, a bar driven by Crowdbar has a lower ETA error than a naive linear bar from the second run onwards.

## Users

- **Developers** sign in to a dashboard, create projects, define bars and phases, and read stats.
- **Their apps** use the SDK (or raw HTTP) to report runs and read estimates.

## Concepts

- **Project:** owned by one developer. Has a public key (safe to ship in client apps) and a secret key (server-side only). Has a "restrict estimates" setting, off by default. **Decided.**
- **Bar:** a named progress bar inside a project, identified by a slug unique in the project. Has a "minimum runs before serving an estimate" setting, default 1. **Decided.**
- **Phase:** an ordered step of a bar, identified by a slug unique in the bar.
- **Run:** one execution of a bar: a duration in milliseconds for each phase, and an optional segment.
- **Segment:** an optional short label on a run (for example `mobile`), giving separate estimates per label, with fallback to the bar's global estimate when the segment has too few runs.
- **Estimate:** per phase, p50 and p90 duration and sample count.

## Public API

Base URL: `https://api.crowdbar.dev/v1`. **Decided** (domain). JSON in and out. CORS open. The project is identified by a key in `Authorization: Bearer <key>`. Either key can report runs. Either key can read estimates, unless the project restricts estimates, in which case only the secret key can and the public key gets `403`.

### Report a run

`POST /runs`

```json
{
	"bar": "video-export",
	"segment": "mobile",
	"phases": [
		{ "phase": "decode", "ms": 1240 },
		{ "phase": "encode", "ms": 8730 },
		{ "phase": "upload", "ms": 2105 }
	]
}
```

Rules for the phases of a run:

- A run may skip phases the bar defines; only the phases it reports are counted.
- Phases the bar does not define are ignored, not rejected, and the `202` response lists them, so renaming or removing a phase in the dashboard never makes older app versions lose whole runs. Both SDKs log one console warning per bar when a response lists ignored phases, so typos stay visible.
- Each counted phase's duration must be from 0 ms to 7 days (604,800,000 ms).

```json
{ "ignored": ["resize"] }
```

Responses: `202` accepted, with `ignored` (empty when every phase is known); `400` malformed body; `401` unknown key; `404` unknown bar; `422` no reported phase is defined by the bar, or a counted duration is out of bounds; `429` rate limited.

### Read an estimate

`GET /bars/{bar}/estimate?segment=mobile`

```json
{
	"bar": "video-export",
	"segment": "mobile",
	"fallback": false,
	"ready": true,
	"phases": [
		{ "phase": "decode", "p50": 1200, "p90": 2100, "samples": 57 },
		{ "phase": "encode", "p50": 8400, "p90": 13900, "samples": 57 },
		{ "phase": "upload", "p50": 2000, "p90": 4800, "samples": 57 }
	]
}
```

`ready` is false, with no durations, when the bar has fewer runs than its minimum-runs setting. `fallback` is true when a segment was requested but the global estimate was served. Responses are cacheable for a short TTL.

## SDKs

Both SDKs are headless: they give progress and remaining time, and the developer draws the bar. **Decided.** Both are MIT licensed.

### TypeScript (npm package `crowdbar`)

Intended shape; exact names may change during Task 4.

```ts
import { Crowdbar } from "crowdbar";

const crowdbar = new Crowdbar({ key: "cb_pub_..." });
const run = await crowdbar.start("video-export", { segment: "mobile" });

run.phase("decode"); // starts decode
run.phase("encode"); // ends decode, starts encode
run.phase("upload");
run.finish(); // ends upload, sends the report

run.onProgress(({ progress, remainingMs, ready }) => {
	/* draw the bar */
});
```

### Python (PyPI package `crowdbar`)

For server-side jobs, scripts and CLIs. Standard library only, Python 3.10 or later.

```python
from crowdbar import Crowdbar

crowdbar = Crowdbar(key="cb_sec_...")

with crowdbar.run("video-export", segment="gpu") as run:
    with run.phase("decode"):
        decode()
    with run.phase("encode"):
        encode()
    print(run.progress, run.remaining_ms)
```

### Rules for both

- It never throws into, or blocks, the host app. If the API is unreachable, `ready` is false and the host keeps running.
- It caches the last estimate locally and reports runs fire-and-forget.
- Progress never goes backwards and never reaches 1 before `finish()`.

## Dashboard (`https://crowdbar.dev`)

- Sign-in with Better Auth through its SvelteKit integration. GitHub and Google providers. **Decided.**
- Create, list and delete projects; show and copy the project key.
- Create bars; add, rename and reorder phases; set minimum runs per bar.
- Per bar: per-phase sample count, p50, p90; a copyable SDK snippet.
- Per project: optional allowed-origins list; "restrict estimates" toggle; secret key shown once and rotatable.
- Public pages: landing page with a live demo, quickstart docs, privacy page.

## Demo

A simulated three-phase job where each phase sleeps for a random time within its own range. **Decided.** Two bars side by side (naive linear vs Crowdbar), with the measured ETA error of each. A high-variance mode multiplies the ranges by a hidden factor to show what segments are for.

## Non-goals for v1

Billing, teams and roles, SDKs beyond TypeScript and Python, any ready-made UI component, numeric regressors (input size), raw event storage or export.

## Tech stack

- **Runtime and hosting:** Cloudflare Workers. **Decided.**
- **API:** Hono, in its own Worker at `api.crowdbar.dev`.
- **Web:** SvelteKit, Tailwind CSS, shadcn-svelte, Cloudflare adapter, at `crowdbar.dev`. **Decided.**
- **Auth:** Better Auth with the SvelteKit integration, Drizzle adapter on D1. **Decided.**
- **Config storage:** D1 through Drizzle.
- **Timing storage:** one Durable Object per bar holding log-scale histograms. No raw events.
- **Package manager and script runner:** Bun, with Bun workspaces. **Decided.**
- **Tests:** Vitest (Workers pool for the API), run through `bun run test`.
- **Repository:** `github.com/crowdbar/crowdbar`, open source. **Decided.** MIT for the SDKs, AGPL-3.0 for everything else. **Decided.**
- **Python SDK tooling:** uv, pytest, ruff.

## Project structure

```
apps/api        Hono Worker: public API, Durable Object
apps/web        SvelteKit: landing, docs, demo, dashboard
packages/core   Pure histogram and quantile maths
packages/db     Drizzle schema and D1 migrations
packages/sdk    TypeScript SDK, published to npm as "crowdbar" (MIT)
packages/sdk-python   Python SDK, published to PyPI as "crowdbar" (MIT)
tasks/          plan.md and todo.md
```

## Privacy and abuse

- Stored: phase durations aggregated into histograms, segment labels, project config, developer accounts.
- Never stored: end-user identifiers, IP addresses, raw runs.
- Ingestion is rate limited per key and per client; durations outside sane bounds are rejected; quantiles limit the effect of outliers.

## Boundaries

- **Always:** use Bun for JavaScript and uv for Python; run lint, typecheck and tests before calling a task done; check current official docs before installing or configuring Wrangler, the Workers Vitest pool, Better Auth, Drizzle and shadcn-svelte.
- **Ask first:** changing the public API contract above, adding a dependency with a non-permissive licence, any production deploy, DNS or secret changes.
- **Never:** store IP addresses or end-user identifiers; commit secrets; use npm, pnpm or yarn; import AGPL packages (`packages/core`, `packages/db`) from an SDK.
