import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { base, seedProject } from "./seed";

const run = (bar: string, phases: [string, number][]) => ({
	bar,
	phases: phases.map(([phase, ms]) => ({ phase, ms })),
});

describe("project keys", () => {
	it.each([
		["no key", undefined],
		["an unknown key", "Bearer cb_pub_nope"],
		["a malformed header", "cb_pub_nope"],
	])("rejects %s with 401 on both endpoints", async (_, authorization) => {
		const headers: Record<string, string> = authorization
			? { Authorization: authorization }
			: {};
		const post = await exports.default.fetch(`${base}/runs`, {
			method: "POST",
			headers,
			body: JSON.stringify(run("export", [["decode", 1]])),
		});
		expect(post.status).toBe(401);
		const get = await exports.default.fetch(`${base}/bars/export/estimate`, {
			headers,
		});
		expect(get.status).toBe(401);
		expect(typeof ((await get.json()) as { error: unknown }).error).toBe(
			"string",
		);
	});
});

describe("bars", () => {
	it("returns 404 for a bar the project has not defined", async () => {
		const { postRun, getEstimate } = await seedProject({ export: ["decode"] });
		expect((await postRun(run("import", [["decode", 1]]))).status).toBe(404);
		expect((await getEstimate("import")).status).toBe(404);
	});

	it("returns 404 for another project's bar", async () => {
		await seedProject({ theirs: ["decode"] });
		const { postRun } = await seedProject({ mine: ["decode"] });
		expect((await postRun(run("theirs", [["decode", 1]]))).status).toBe(404);
	});
});

describe("phases", () => {
	it("accepts a run with all defined phases, in any order", async () => {
		const { postRun } = await seedProject({ export: ["decode", "encode"] });
		const res = await postRun(
			run("export", [
				["encode", 20],
				["decode", 10],
			]),
		);
		expect(res.status).toBe(202);
	});

	it("accepts a run that skipped a defined phase", async () => {
		const { postRun } = await seedProject({ export: ["decode", "encode"] });
		expect((await postRun(run("export", [["decode", 10]]))).status).toBe(202);
	});

	it("rejects a phase the bar does not define with 422 and counts nothing", async () => {
		const { postRun, getEstimate } = await seedProject({ export: ["decode"] });
		const res = await postRun(
			run("export", [
				["decode", 10],
				["upload", 10],
			]),
		);
		expect(res.status).toBe(422);
		expect(((await res.json()) as { error: string }).error).toContain("upload");
		expect(
			((await (await getEstimate("export")).json()) as { ready: boolean })
				.ready,
		).toBe(false);
	});

	it.each([
		["negative", -1],
		["longer than a week", 7 * 24 * 60 * 60 * 1000 + 1],
	])("rejects a %s duration with 422", async (_, ms) => {
		const { postRun } = await seedProject({ export: ["decode"] });
		expect((await postRun(run("export", [["decode", ms]]))).status).toBe(422);
	});
});

describe("estimates", () => {
	it("serves phases in their defined order", async () => {
		const { postRun, getEstimate } = await seedProject({
			export: ["decode", "encode", "upload"],
		});
		await postRun(
			run("export", [
				["upload", 3],
				["encode", 2],
				["decode", 1],
			]),
		);
		const body = (await (await getEstimate("export")).json()) as {
			phases: { phase: string }[];
		};
		expect(body.phases.map((p) => p.phase)).toEqual([
			"decode",
			"encode",
			"upload",
		]);
	});

	it("honours the bar's minimum-runs setting", async () => {
		const { postRun, getEstimate } = await seedProject(
			{ export: ["decode"] },
			{ minRuns: 3 },
		);
		const ready = async () =>
			((await (await getEstimate("export")).json()) as { ready: boolean })
				.ready;
		for (const ms of [10, 20]) await postRun(run("export", [["decode", ms]]));
		expect(await ready()).toBe(false);
		await postRun(run("export", [["decode", 30]]));
		expect(await ready()).toBe(true);
	});

	it("keeps two projects with the same bar slug fully separate", async () => {
		const a = await seedProject({ export: ["decode"] });
		const b = await seedProject({ export: ["decode"] });
		await a.postRun(run("export", [["decode", 100]]));
		await a.postRun(run("export", [["decode", 100]]));
		await b.postRun(run("export", [["decode", 5000]]));
		const read = async (p: typeof a) =>
			(await (await p.getEstimate("export")).json()) as {
				phases: { p50: number; samples: number }[];
			};
		const [ea, eb] = [await read(a), await read(b)];
		expect(ea.phases[0].samples).toBe(2);
		expect(eb.phases[0].samples).toBe(1);
		expect(eb.phases[0].p50).toBeGreaterThan(ea.phases[0].p50 * 10);
	});
});
