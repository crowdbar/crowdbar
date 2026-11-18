import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { MAX_SEGMENTS } from "../src/bar-object";
import { seedProject } from "./seed";

const seeded = await seedProject(
	Object.fromEntries(
		["seg-a", "seg-b", "seg-c", "seg-d"].map((b) => [b, ["a"]]),
	),
);

function postRun(bar: string, ms: number, segment?: string) {
	return seeded.postRun({ bar, segment, phases: [{ phase: "a", ms }] });
}

async function estimate(bar: string, segment?: string) {
	const res = await seeded.getEstimate(bar, segment);
	expect(res.status).toBe(200);
	return res.json() as Promise<{
		segment: string | null;
		fallback: boolean;
		ready: boolean;
		phases: { phase: string; p50: number; samples: number }[];
	}>;
}

describe("segments", () => {
	it("serves a segment's own estimate, and the global one counts every run", async () => {
		await postRun("seg-a", 1000, "slow");
		await postRun("seg-a", 1000, "slow");
		await postRun("seg-a", 100, "fast");

		const slow = await estimate("seg-a", "slow");
		expect(slow).toMatchObject({ segment: "slow", fallback: false });
		expect(slow.phases[0].samples).toBe(2);
		expect(Math.abs(slow.phases[0].p50 - 1000) / 1000).toBeLessThan(0.05);

		const global = await estimate("seg-a");
		expect(global).toMatchObject({ segment: null, fallback: false });
		expect(global.phases[0].samples).toBe(3);
	});

	it("falls back to the global estimate when the segment has too few samples", async () => {
		await postRun("seg-b", 500);
		const res = await estimate("seg-b", "unseen");
		expect(res).toMatchObject({
			segment: "unseen",
			fallback: true,
			ready: true,
		});
		expect(res.phases[0].samples).toBe(1);

		await postRun("seg-b", 100, "rare");
		const stub = env.BAR.getByName(seeded.barIds["seg-b"]);
		expect(await stub.estimate("rare", 2)).toMatchObject({ fallback: true });
		expect(await stub.estimate("rare", 1)).toMatchObject({ fallback: false });
	});

	it("counts runs beyond the segment cap towards the global histogram only", async () => {
		for (let i = 0; i < MAX_SEGMENTS; i++) await postRun("seg-c", 10, `s${i}`);
		expect((await postRun("seg-c", 10, "one-too-many")).status).toBe(202);
		expect(await estimate("seg-c", "one-too-many")).toMatchObject({
			fallback: true,
		});
		expect((await estimate("seg-c")).phases[0].samples).toBe(MAX_SEGMENTS + 1);
		// Existing segments keep receiving runs.
		await postRun("seg-c", 10, "s0");
		expect((await estimate("seg-c", "s0")).phases[0].samples).toBe(2);
	});

	it.each([
		["empty", ""],
		["not a string", 3],
		["too long", "x".repeat(65)],
	])("rejects a %s segment on report with 400", async (_, segment) => {
		const res = await seeded.postRun({
			bar: "seg-d",
			segment,
			phases: [{ phase: "a", ms: 1 }],
		});
		expect(res.status).toBe(400);
	});

	it("rejects an invalid segment on estimate with 400", async () => {
		const res = await seeded.getEstimate("seg-d", "x".repeat(65));
		expect(res.status).toBe(400);
	});
});
