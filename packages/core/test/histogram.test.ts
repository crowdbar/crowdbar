import { describe, expect, it } from "vitest";
import { add, count, empty, type Histogram, quantile } from "../src";

// Seeded PRNG so failures are reproducible.
function mulberry32(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function exactQuantile(samples: number[], q: number) {
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
}

function fill(samples: number[]): Histogram {
	return samples.reduce(add, empty());
}

const rand = mulberry32(42);
const normal = () =>
	Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

const distributions: Record<string, () => number> = {
	uniform: () => 500 + rand() * 1000,
	exponential: () => -2000 * Math.log(1 - rand()),
	lognormal: () => Math.exp(8 + 0.8 * normal()),
	"very short": () => 1 + rand() * 20,
	"very long": () => 3_600_000 * (1 + rand()),
};

describe("quantile", () => {
	for (const [name, sample] of Object.entries(distributions)) {
		it(`is within 5% of the exact p50 and p90 for a ${name} distribution`, () => {
			const samples = Array.from({ length: 5000 }, sample);
			const h = fill(samples);
			for (const q of [0.5, 0.9]) {
				const exact = exactQuantile(samples, q);
				expect(Math.abs(quantile(h, q) - exact) / exact).toBeLessThan(0.05);
			}
		});
	}

	it("barely moves p50 when one extreme outlier joins 100 samples", () => {
		const samples = Array.from({ length: 100 }, (_, i) => 1000 + i * 10);
		const before = quantile(fill(samples), 0.5);
		const after = quantile(fill([...samples, 1e9]), 0.5);
		expect(Math.abs(after - before) / before).toBeLessThan(0.05);
	});

	it("handles zero durations", () => {
		expect(quantile(fill([0, 0, 0]), 0.5)).toBe(0);
	});

	it("is NaN for an empty histogram", () => {
		expect(quantile(empty(), 0.5)).toBeNaN();
	});
});

describe("add", () => {
	it("counts samples without mutating its input", () => {
		const h = empty();
		const h2 = add(h, 120);
		expect(count(h)).toBe(0);
		expect(count(h2)).toBe(1);
	});

	it("survives a JSON round trip", () => {
		const h = fill([10, 200, 3000]);
		const restored = JSON.parse(JSON.stringify(h)) as Histogram;
		expect(quantile(restored, 0.5)).toBe(quantile(h, 0.5));
	});
});
