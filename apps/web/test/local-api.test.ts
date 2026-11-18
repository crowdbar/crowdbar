import { Crowdbar } from "crowdbar";
import { describe, expect, it } from "vitest";
import { localApi } from "../src/lib/local-api";

function memoryStorage() {
	const items = new Map<string, string>();
	return {
		getItem: (k: string) => items.get(k) ?? null,
		setItem: (k: string, v: string) => void items.set(k, v),
		removeItem: (k: string) => void items.delete(k),
	};
}

const settle = () => new Promise((r) => setTimeout(r, 0));

async function runJob(
	api: ReturnType<typeof localApi>,
	durations: Record<string, number>,
	segment?: string,
) {
	let now = 0;
	const crowdbar = new Crowdbar({
		key: "local",
		fetch: api.fetch,
		now: () => now,
	});
	const run = await crowdbar.start("demo", { segment });
	const ready = run.progress().ready;
	for (const [phase, ms] of Object.entries(durations)) {
		run.phase(phase);
		now += ms;
	}
	run.finish();
	await settle();
	return ready;
}

describe("localApi", () => {
	it("starts empty, then serves estimates from this browser's runs only", async () => {
		const api = localApi(memoryStorage());
		expect(await runJob(api, { decode: 100, encode: 1000 })).toBe(false);
		expect(await runJob(api, { decode: 300, encode: 3000 })).toBe(true);

		const res = await api.fetch("https://local/v1/bars/demo/estimate");
		const body = (await res.json()) as {
			ready: boolean;
			phases: { phase: string; samples: number }[];
		};
		expect(body.ready).toBe(true);
		expect(body.phases.map((p) => [p.phase, p.samples])).toEqual([
			["decode", 2],
			["encode", 2],
		]);
	});

	it("keeps runs across page loads and forgets them on reset", async () => {
		const storage = memoryStorage();
		await runJob(localApi(storage), { decode: 100 });
		const reloaded = localApi(storage);
		expect(await runJob(reloaded, { decode: 100 })).toBe(true);
		reloaded.reset();
		expect(await runJob(localApi(storage), { decode: 100 })).toBe(false);
	});

	it("serves a segment's own estimate and falls back to the global one", async () => {
		const api = localApi(memoryStorage());
		await runJob(api, { decode: 1000 }, "slow");
		const read = async (segment: string) =>
			(await (
				await api.fetch(
					`https://local/v1/bars/demo/estimate?segment=${segment}`,
				)
			).json()) as { fallback: boolean; phases: { p50: number }[] };
		expect((await read("slow")).fallback).toBe(false);
		expect(await read("fast")).toMatchObject({ fallback: true });
	});
});
