import { evictDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { base, seedProject } from "./seed";

const { postRun, getEstimate, barIds } = await seedProject({
	"export-a": ["decode", "encode"],
	"export-b": ["decode", "encode"],
	...Object.fromEntries(
		["b", "export-c", "export-d", "export-e", "export-f"].map((b) => [
			b,
			["a"],
		]),
	),
});

async function estimate(bar: string) {
	const res = await getEstimate(bar);
	expect(res.status).toBe(200);
	return res.json() as Promise<{
		ready: boolean;
		phases: { phase: string; p50: number; p90: number; samples: number }[];
	}>;
}

// Histogram buckets are 5% wide, so estimates are close to, not equal to, the input.
function expectNear(actual: number, expected: number) {
	expect(Math.abs(actual - expected) / expected).toBeLessThan(0.05);
}

describe("core loop", () => {
	it("posting runs changes the estimate for that bar and no other", async () => {
		for (const [decode, encode] of [
			[100, 1000],
			[200, 2000],
			[300, 3000],
		]) {
			const res = await postRun({
				bar: "export-a",
				phases: [
					{ phase: "decode", ms: decode },
					{ phase: "encode", ms: encode },
				],
			});
			expect(res.status).toBe(202);
		}

		const a = await estimate("export-a");
		expect(a.ready).toBe(true);
		expect(a.phases.map((p) => [p.phase, p.samples])).toEqual([
			["decode", 3],
			["encode", 3],
		]);
		expectNear(a.phases[0].p50, 200);
		expectNear(a.phases[0].p90, 300);
		expectNear(a.phases[1].p50, 2000);
		expectNear(a.phases[1].p90, 3000);
		expect(await estimate("export-b")).toEqual({
			bar: "export-b",
			segment: null,
			fallback: false,
			ready: false,
			phases: [],
		});
	});

	it.each([
		["invalid JSON", "{not json"],
		["missing bar", { phases: [{ phase: "a", ms: 1 }] }],
		["missing phases", { bar: "b" }],
		["empty phases", { bar: "b", phases: [] }],
		["non-numeric duration", { bar: "b", phases: [{ phase: "a", ms: "12" }] }],
		["missing phase name", { bar: "b", phases: [{ ms: 1 }] }],
		[
			"duplicate phase",
			{
				bar: "b",
				phases: [
					{ phase: "a", ms: 1 },
					{ phase: "a", ms: 2 },
				],
			},
		],
	])("rejects %s with 400 and an error message", async (_, body) => {
		const res = await postRun(body);
		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: unknown };
		expect(typeof json.error).toBe("string");
	});

	it("does not count rejected runs", async () => {
		await postRun({ bar: "export-c", phases: [{ phase: "a", ms: -5 }] });
		expect((await estimate("export-c")).ready).toBe(false);
	});

	it("keeps state after the Durable Object restarts", async () => {
		await postRun({ bar: "export-d", phases: [{ phase: "a", ms: 40 }] });
		await evictDurableObject(env.BAR.getByName(barIds["export-d"]));
		const d = await estimate("export-d");
		expect(d.ready).toBe(true);
		expect(d.phases[0].samples).toBe(1);
		expectNear(d.phases[0].p50, 40);
	});

	it("serves no durations below the minimum sample count", async () => {
		for (const ms of [10, 20]) {
			await postRun({ bar: "export-e", phases: [{ phase: "a", ms }] });
		}
		const stub = env.BAR.getByName(barIds["export-e"]);
		expect(await stub.estimate(null, 3)).toMatchObject({
			ready: false,
			phases: [],
		});
		expect((await stub.estimate(null, 2)).ready).toBe(true);
	});

	it("serves an estimate after a single run by default", async () => {
		await postRun({ bar: "export-f", phases: [{ phase: "a", ms: 10 }] });
		expect((await estimate("export-f")).ready).toBe(true);
	});

	it("allows cross-origin calls", async () => {
		const res = await exports.default.fetch(`${base}/bars/x/estimate`, {
			headers: { Origin: "https://example.com" },
		});
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});
});
