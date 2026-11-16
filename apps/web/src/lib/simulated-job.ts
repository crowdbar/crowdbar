// A fake three-phase job used by the demo to compare Crowdbar bars with a naive one.

export type Mode = "normal" | "high-variance" | "independent";

export const PHASES = [
	{ phase: "decode", min: 500, max: 1500 },
	{ phase: "encode", min: 2000, max: 6000 },
	{ phase: "upload", min: 1000, max: 2000 },
];

// In high-variance mode, half the runs are on a hidden "slow device" that triples every phase.
// In independent mode, each phase is tripled on its own with probability one half.
export const SLOW_FACTOR = 3;

export function planRun(mode: Mode, rand: () => number = Math.random) {
	const slowDevice = mode === "high-variance" && rand() < 0.5;
	const durations = PHASES.map(({ phase, min, max }) => {
		const slow = slowDevice || (mode === "independent" && rand() < 0.5);
		const factor = slow ? SLOW_FACTOR : 1;
		return {
			phase,
			slow,
			ms: Math.round((min + rand() * (max - min)) * factor),
		};
	});
	// The app knows its device, so the hidden factor can be a segment; per-phase factors cannot.
	const segment =
		mode === "high-variance" ? (slowDevice ? "slow" : "fast") : undefined;
	return { segment, durations };
}

// What a typical progress bar does: equal weight per phase, ETA by linear extrapolation.
export function naiveRemaining(
	elapsedMs: number,
	phasesDone: number,
	phaseCount: number,
): number | null {
	if (phasesDone === 0) return null;
	const progress = phasesDone / phaseCount;
	return Math.round((elapsedMs * (1 - progress)) / progress);
}

export type Tick = { elapsedMs: number; etas: Record<string, number | null> };

// Mean absolute ETA error of each bar as a share of the run's real duration, over ticks where every bar shows an ETA.
export function compareRun(
	ticks: Tick[],
	totalMs: number,
): Record<string, number> | null {
	const all = ticks.filter((t) =>
		Object.values(t.etas).every((e) => e !== null),
	);
	if (all.length === 0) return null;
	return Object.fromEntries(
		Object.keys(all[0].etas).map((bar) => [
			bar,
			all.reduce(
				(sum, t) =>
					sum +
					Math.abs((t.etas[bar] as number) - (totalMs - t.elapsedMs)) / totalMs,
				0,
			) / all.length,
		]),
	);
}
