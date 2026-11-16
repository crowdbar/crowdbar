// A fake three-phase job used by the demo to compare a Crowdbar bar with a naive one.

export type Mode = "normal" | "high-variance";

export const PHASES = [
	{ phase: "decode", min: 500, max: 1500 },
	{ phase: "encode", min: 2000, max: 6000 },
	{ phase: "upload", min: 1000, max: 2000 },
];

// In high-variance mode, half the runs are on a hidden "slow device" that triples every phase.
export const SLOW_FACTOR = 3;

export function planRun(mode: Mode, rand: () => number = Math.random) {
	const slow = mode === "high-variance" && rand() < 0.5;
	const factor = slow ? SLOW_FACTOR : 1;
	const durations = PHASES.map(({ phase, min, max }) => ({
		phase,
		ms: Math.round((min + rand() * (max - min)) * factor),
	}));
	return { slow, durations };
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

export type Tick = {
	elapsedMs: number;
	crowdbar: number | null;
	naive: number | null;
};

// Mean absolute ETA error as a share of the run's real duration, over ticks where both bars show an ETA.
export function compareRun(ticks: Tick[], totalMs: number) {
	const both = ticks.filter((t) => t.crowdbar !== null && t.naive !== null);
	if (both.length === 0) return null;
	const meanError = (eta: (t: Tick) => number) =>
		both.reduce(
			(sum, t) => sum + Math.abs(eta(t) - (totalMs - t.elapsedMs)) / totalMs,
			0,
		) / both.length;
	return {
		crowdbar: meanError((t) => t.crowdbar as number),
		naive: meanError((t) => t.naive as number),
	};
}
