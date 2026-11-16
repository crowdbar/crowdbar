<script lang="ts">
import { Crowdbar } from "crowdbar";
import {
	compareRun,
	type Mode,
	naiveRemaining,
	PHASES,
	planRun,
	type Tick,
} from "#lib/simulated-job.js";

// shortcut: defaults to the preview API; switch to the SDK default (api.crowdbar.dev) at launch.
const API =
	import.meta.env.VITE_CROWDBAR_API ??
	"https://main-crowdbar-api.nifle.workers.dev/v1";
const TICK_MS = 100;
const FAST_FORWARD = 5;

// Every bar the demo scores; "segmented" only exists where the app could know the hidden factor.
const BARS = {
	naive: "Naive bar",
	crowdbar: "Crowdbar",
	segmented: "Crowdbar + segments",
} as const;
type Bar = keyof typeof BARS;

type Result = {
	hidden: string;
	seconds: number;
	errors: Partial<Record<Bar, number>> | null;
};

let mode = $state<Mode>("normal");
let running = $state(false);
let remainingRuns = $state(0);
let current = $state<{
	phase: string;
	bars: { bar: Bar; progress: number; eta: number | null }[];
} | null>(null);
let results = $state<Record<Mode, Result[]>>({
	normal: [],
	"high-variance": [],
	independent: [],
});

const scored = $derived(results[mode].filter((r) => r.errors !== null));
const scoredBars = $derived(
	(Object.keys(BARS) as Bar[]).filter(
		(b) => scored[0]?.errors?.[b] !== undefined,
	),
);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (x: number | undefined) =>
	x === undefined ? "—" : `${Math.round(x * 100)}%`;
const secs = (ms: number | null) =>
	ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`;

// speed > 1 fast-forwards: all durations stay in job time, only the wait is shorter.
async function runOnce(m: Mode, speed: number) {
	const plan = planRun(m);
	const clock = () => performance.now() * speed;
	const options = { baseUrl: API, now: clock };
	const bar = `demo-${m}`;
	// New clients per run, so each run picks up the estimate that the previous runs produced.
	const [crowdbar, segmented] = await Promise.all([
		new Crowdbar(options).start(bar),
		plan.segment === undefined
			? undefined
			: new Crowdbar(options).start(bar, { segment: plan.segment }),
	]);
	const runs = { crowdbar, ...(segmented && { segmented }) };
	const ticks: Tick[] = [];
	let phasesDone = 0;
	const start = clock();
	const snapshot = () => {
		const elapsedMs = clock() - start;
		return [
			{
				bar: "naive" as Bar,
				progress: phasesDone / PHASES.length,
				eta: naiveRemaining(elapsedMs, phasesDone, PHASES.length),
			},
			...Object.entries(runs).map(([bar, run]) => {
				const p = run.progress();
				return { bar: bar as Bar, progress: p.progress, eta: p.remainingMs };
			}),
		];
	};
	// Score once per 100 ms of job time (faster in real time when fast-forwarding); draw every frame so the bars move smoothly.
	const timer = setInterval(() => {
		const elapsedMs = clock() - start;
		ticks.push({
			elapsedMs,
			etas: Object.fromEntries(snapshot().map((b) => [b.bar, b.eta])),
		});
	}, TICK_MS / speed);
	let frame = 0;
	const draw = () => {
		current = {
			phase: PHASES[Math.min(phasesDone, PHASES.length - 1)].phase,
			bars: snapshot(),
		};
		frame = requestAnimationFrame(draw);
	};
	draw();
	try {
		for (const { phase, ms } of plan.durations) {
			for (const run of Object.values(runs)) run.phase(phase);
			await sleep(ms / speed);
			phasesDone++;
		}
	} finally {
		clearInterval(timer);
		cancelAnimationFrame(frame);
		// Only one run reports, so each simulated job counts once. The segmented one also feeds the global estimate.
		(segmented ?? crowdbar).finish();
	}
	const totalMs = clock() - start;
	const slow = plan.durations.filter((d) => d.slow).map((d) => d.phase);
	results[m].push({
		hidden:
			m === "high-variance"
				? slow.length > 0
					? "slow device"
					: "—"
				: slow.join(", ") || "—",
		seconds: Math.round(totalMs / 100) / 10,
		errors: compareRun(ticks, totalMs),
	});
	current = null;
}

async function runMany(n: number, speed = 1) {
	running = true;
	remainingRuns = n;
	const m = mode;
	try {
		while (remainingRuns > 0) {
			await runOnce(m, speed);
			remainingRuns--;
			// The SDK reports without waiting; give the report time to land before the next run reads the estimate.
			if (remainingRuns > 0) await sleep(500);
		}
	} finally {
		running = false;
		remainingRuns = 0;
	}
}
</script>

<svelte:head><title>Crowdbar demo</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-8 p-6">
	<header class="space-y-2">
		<h1 class="text-3xl font-bold">Crowdbar demo</h1>
		<p class="text-gray-700">
			A fake job runs three phases ({PHASES.map((p) => `${p.phase} ${p.min / 1000}–${p.max / 1000} s`).join(", ")}). The naive bar gives each
			phase an equal share and extrapolates its ETA. The Crowdbar bar uses durations reported by every previous run, including other visitors'.
		</p>
	</header>

	<fieldset class="flex flex-wrap gap-4" disabled={running}>
		<legend class="mb-2 font-semibold">Mode</legend>
		<label class="flex items-center gap-2"><input type="radio" bind:group={mode} value="normal" /> Normal</label>
		<label class="flex items-center gap-2">
			<input type="radio" bind:group={mode} value="high-variance" /> High variance (half the runs are on a hidden slow device, 3× slower)
		</label>
		<label class="flex items-center gap-2">
			<input type="radio" bind:group={mode} value="independent" /> Independent phases (each phase is 3× slower on its own, half the time)
		</label>
	</fieldset>

	<div class="flex gap-3">
		<button class="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={running} onclick={() => runMany(1)}>Run the job</button>
		<button class="rounded border px-4 py-2 disabled:opacity-50" disabled={running} onclick={() => runMany(10, FAST_FORWARD)}>Run 10 times ({FAST_FORWARD}× speed)</button>
		{#if remainingRuns > 1}<button class="rounded border px-4 py-2" onclick={() => (remainingRuns = 1)}>Stop after this run</button>{/if}
	</div>

	<section class="space-y-4" aria-live="polite">
		{#each current?.bars ?? [{ bar: "naive" as Bar, progress: 0, eta: null }, { bar: "crowdbar" as Bar, progress: 0, eta: null }] as bar (bar.bar)}
			<div>
				<div class="flex justify-between text-sm">
					<span class="font-medium">{BARS[bar.bar]}</span>
					<span>{pct(bar.progress)} · ETA {secs(bar.eta)}</span>
				</div>
				<div class="h-4 overflow-hidden rounded bg-gray-200" role="progressbar" aria-label={BARS[bar.bar]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar.progress * 100)}>
					<div class="h-full bg-blue-600" style:width={`${bar.progress * 100}%`}></div>
				</div>
			</div>
		{/each}
		{#if current}<p class="text-sm text-gray-600">Running phase: {current.phase}</p>{/if}
	</section>

	<section class="space-y-2">
		<h2 class="text-xl font-semibold">Mean ETA error ({mode})</h2>
		{#if scored.length === 0}
			<p class="text-gray-700">Shown from the run after Crowdbar has data for this mode. Run the job at least twice.</p>
		{:else}
			<dl class="grid grid-cols-2 gap-4">
				{#each scoredBars as bar (bar)}
					<div class="rounded border p-4">
						<dt class="text-sm text-gray-600">{BARS[bar]}</dt>
						<dd class="text-2xl font-bold">{pct(mean(scored.map((r) => r.errors?.[bar] ?? 0)))}</dd>
					</div>
				{/each}
			</dl>
			<p class="text-sm text-gray-600">
				Over {scored.length} scored run{scored.length === 1 ? "" : "s"}. Error is |predicted − actual remaining time| as a share of the run's duration, averaged
				from the end of the first phase (before that the naive bar has no ETA). Segments use estimates from runs on the same kind of device.
			</p>
		{/if}
	</section>

	{#if results[mode].length > 0}
		<section>
			<h2 class="mb-2 text-xl font-semibold">Runs</h2>
			<table class="w-full text-left text-sm">
				<thead><tr><th>#</th><th>Duration</th>{#if mode !== "normal"}<th>Slow</th>{/if}{#each scoredBars as bar (bar)}<th>{BARS[bar]}</th>{/each}</tr></thead>
				<tbody>
					{#each results[mode] as r, i (i)}
						<tr>
							<td>{i + 1}</td>
							<td>{r.seconds} s</td>
							{#if mode !== "normal"}<td>{r.hidden}</td>{/if}
							{#if r.errors === null}<td colspan={Math.max(1, scoredBars.length)}>no Crowdbar estimate yet</td>{:else}{#each scoredBars as bar (bar)}<td>{pct(r.errors[bar])}</td>{/each}{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</main>
