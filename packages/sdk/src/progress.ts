export type EstimatePhase = {
	phase: string;
	p50: number;
	p90: number;
	samples: number;
};
export type Progress = {
	ready: boolean;
	progress: number;
	remainingMs: number | null;
};

// A phase that overruns its estimate holds at this share of it rather than completing.
const PHASE_CAP = 0.95;
// Only finish() reaches 1.
const RUN_CAP = 0.99;
// Pace correction moves the remaining estimates this share of the way towards the pace observed so far.
export const PACE_DAMPING = 0.5;

// `done` maps each completed phase to its actual duration.
export function computeProgress(
	estimate: EstimatePhase[],
	done: Map<string, number>,
	current: { phase: string; ms: number } | undefined,
	paceCorrection = false,
): Progress {
	const pace = paceCorrection ? paceFactor(estimate, done) : 1;
	let total = 0;
	let elapsed = 0;
	let remainingMs = 0;
	for (const estimated of estimate) {
		const { phase } = estimated;
		const p50 = done.has(phase) ? estimated.p50 : estimated.p50 * pace;
		total += p50;
		if (done.has(phase)) elapsed += p50;
		else if (phase === current?.phase) {
			elapsed += Math.min(current.ms, PHASE_CAP * p50);
			remainingMs += Math.max(0, p50 - current.ms);
		} else remainingMs += p50;
	}
	const progress = total > 0 ? Math.min(RUN_CAP, elapsed / total) : 0;
	return { ready: true, progress, remainingMs: Math.round(remainingMs) };
}

function paceFactor(estimate: EstimatePhase[], done: Map<string, number>) {
	let actual = 0;
	let expected = 0;
	for (const { phase, p50 } of estimate) {
		const ms = done.get(phase);
		if (ms === undefined) continue;
		actual += ms;
		expected += p50;
	}
	return expected > 0 ? 1 + PACE_DAMPING * (actual / expected - 1) : 1;
}
