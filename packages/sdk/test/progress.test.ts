import { describe, expect, it } from "vitest";
import { computeProgress, PACE_DAMPING } from "../src/progress";

const estimate = [
	{ phase: "decode", p50: 1000, p90: 2000, samples: 10 },
	{ phase: "encode", p50: 3000, p90: 5000, samples: 10 },
	{ phase: "upload", p50: 2000, p90: 3000, samples: 10 },
];
const encodingFor = (ms: number) => ({ phase: "encode", ms });

describe("pace correction", () => {
	it("scales the remaining phases by the damped ratio of actual to estimated time", () => {
		// decode took twice its estimate.
		const done = new Map([["decode", 2000]]);
		const factor = 1 + PACE_DAMPING * (2 - 1);
		const p = computeProgress(estimate, done, encodingFor(1000), true);
		expect(p.remainingMs).toBe(Math.round(5000 * factor - 1000));
	});

	it("also shortens the remaining phases when the run is fast", () => {
		const done = new Map([["decode", 500]]);
		const factor = 1 + PACE_DAMPING * (0.5 - 1);
		const p = computeProgress(estimate, done, encodingFor(0), true);
		expect(p.remainingMs).toBe(Math.round(5000 * factor));
	});

	it("changes nothing when switched off or before a phase completes", () => {
		const slow = new Map([["decode", 2000]]);
		expect(computeProgress(estimate, slow, encodingFor(1000), false)).toEqual(
			computeProgress(estimate, new Map([["decode", 1000]]), encodingFor(1000)),
		);
		expect(
			computeProgress(estimate, new Map(), { phase: "decode", ms: 400 }, true),
		).toEqual(
			computeProgress(estimate, new Map(), { phase: "decode", ms: 400 }),
		);
	});

	it("ignores phases the estimate does not know", () => {
		const done = new Map([
			["decode", 1000],
			["extra", 9000],
		]);
		expect(
			computeProgress(estimate, done, encodingFor(0), true).remainingMs,
		).toBe(5000);
	});
});
