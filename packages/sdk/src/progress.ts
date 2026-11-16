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

export function computeProgress(
	estimate: EstimatePhase[],
	done: Set<string>,
	current: { phase: string; ms: number } | undefined,
): Progress {
	let total = 0;
	let elapsed = 0;
	let remainingMs = 0;
	for (const { phase, p50 } of estimate) {
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
