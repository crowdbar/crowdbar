import { describe, expect, it } from "vitest";
import {
	compareRun,
	naiveRemaining,
	PHASES,
	planRun,
	SLOW_FACTOR,
} from "../src/lib/simulated-job";

// Cycles through fixed values so tests are deterministic.
const sequence = (...values: number[]) => {
	let i = 0;
	return () => values[i++ % values.length];
};

describe("planRun", () => {
	it("draws each phase from its own range in normal mode", () => {
		for (const r of [0, 0.5, 0.999]) {
			const run = planRun("normal", () => r);
			expect(run.segment).toBeUndefined();
			run.durations.forEach(({ phase, ms, slow }, i) => {
				expect(slow).toBe(false);
				expect(phase).toBe(PHASES[i].phase);
				expect(ms).toBeGreaterThanOrEqual(PHASES[i].min);
				expect(ms).toBeLessThan(PHASES[i].max);
			});
		}
	});

	it("multiplies every range by the hidden factor on slow runs in high-variance mode", () => {
		const slow = planRun("high-variance", sequence(0.1, 0, 0, 0));
		const fast = planRun("high-variance", sequence(0.9, 0, 0, 0));
		expect(slow.segment).toBe("slow");
		expect(fast.segment).toBe("fast");
		expect(slow.durations.map((d) => d.ms)).toEqual(
			PHASES.map((p) => p.min * SLOW_FACTOR),
		);
		expect(fast.durations.map((d) => d.ms)).toEqual(PHASES.map((p) => p.min));
	});

	it("slows each phase on its own in independent mode, with no segment", () => {
		// Per phase: slow draw, then duration draw.
		const run = planRun("independent", sequence(0.1, 0, 0.9, 0, 0.1, 0));
		expect(run.segment).toBeUndefined();
		expect(run.durations.map((d) => d.slow)).toEqual([true, false, true]);
		expect(run.durations.map((d) => d.ms)).toEqual([
			PHASES[0].min * SLOW_FACTOR,
			PHASES[1].min,
			PHASES[2].min * SLOW_FACTOR,
		]);
	});
});

describe("naiveRemaining", () => {
	it("has no ETA until a phase completes", () => {
		expect(naiveRemaining(500, 0, 3)).toBeNull();
	});

	it("extrapolates linearly with equal weight per phase", () => {
		expect(naiveRemaining(1000, 1, 3)).toBe(2000);
		expect(naiveRemaining(4000, 2, 3)).toBe(2000);
	});
});

describe("compareRun", () => {
	it("averages each bar's ETA error relative to the run's duration over ticks where both have an ETA", () => {
		const errors = compareRun(
			[
				{ elapsedMs: 500, etas: { crowdbar: 9000, naive: null } },
				{ elapsedMs: 2000, etas: { crowdbar: 8000, naive: 4000 } },
				{ elapsedMs: 6000, etas: { crowdbar: 4000, naive: 3000 } },
			],
			10_000,
		);
		// Actual remaining: 8000 then 4000.
		expect(errors).toEqual({ crowdbar: 0, naive: (0.4 + 0.1) / 2 });
	});

	it("returns null when no tick has both ETAs", () => {
		expect(
			compareRun([{ elapsedMs: 1, etas: { crowdbar: null, naive: 5 } }], 100),
		).toBeNull();
	});
});
