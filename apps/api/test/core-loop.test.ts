import { evictDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const base = "https://api.crowdbar.dev/v1";

function postRun(body: unknown) {
	return exports.default.fetch(`${base}/runs`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

async function estimate(bar: string) {
	const res = await exports.default.fetch(`${base}/bars/${bar}/estimate`);
	expect(res.status).toBe(200);
	return res.json() as Promise<{ ready: boolean; phases: unknown[] }>;
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

		expect(await estimate("export-a")).toEqual({
			bar: "export-a",
			segment: null,
			fallback: false,
			ready: true,
			phases: [
				{ phase: "decode", p50: 200, p90: 200, samples: 3 },
				{ phase: "encode", p50: 2000, p90: 2000, samples: 3 },
			],
		});
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
		["negative duration", { bar: "b", phases: [{ phase: "a", ms: -1 }] }],
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
		await evictDurableObject(env.BAR.getByName("export-d"));
		expect((await estimate("export-d")).phases).toEqual([
			{ phase: "a", p50: 40, p90: 40, samples: 1 },
		]);
	});

	it("allows cross-origin calls", async () => {
		const res = await exports.default.fetch(`${base}/bars/x/estimate`, {
			headers: { Origin: "https://example.com" },
		});
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});
});
