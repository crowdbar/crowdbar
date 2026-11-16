import { describe, expect, it, vi } from "vitest";
import { Crowdbar, type Progress } from "../src";

const estimate = {
	bar: "export",
	segment: null,
	fallback: false,
	ready: true,
	phases: [
		{ phase: "decode", p50: 1000, p90: 2000, samples: 10 },
		{ phase: "encode", p50: 3000, p90: 5000, samples: 10 },
	],
};

function setup(estimateResponse: () => Promise<Response>) {
	let now = 0;
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (init?.method === "POST") return new Response(null, { status: 202 });
		void input;
		return estimateResponse();
	});
	const crowdbar = new Crowdbar({
		key: "cb_pub_test",
		baseUrl: "https://api.test/v1",
		fetch,
		now: () => now,
	});
	const posts = () =>
		fetch.mock.calls.filter(([, init]) => init?.method === "POST");
	return { crowdbar, fetch, posts, tick: (ms: number) => (now += ms) };
}

const ok = () => Promise.resolve(Response.json(estimate));

describe("Crowdbar", () => {
	it("sends exactly one report with a duration for every phase", async () => {
		const { crowdbar, posts, tick } = setup(ok);
		const run = await crowdbar.start("export", { segment: "mobile" });
		run.phase("decode");
		tick(1200);
		run.phase("encode");
		tick(2800);
		run.finish();
		run.finish();

		expect(posts()).toHaveLength(1);
		const [url, init] = posts()[0];
		expect(url).toBe("https://api.test/v1/runs");
		expect(new Headers(init?.headers).get("Authorization")).toBe(
			"Bearer cb_pub_test",
		);
		expect(JSON.parse(init?.body as string)).toEqual({
			bar: "export",
			segment: "mobile",
			phases: [
				{ phase: "decode", ms: 1200 },
				{ phase: "encode", ms: 2800 },
			],
		});
	});

	it("reuses the cached estimate for the next run", async () => {
		const { crowdbar, fetch } = setup(ok);
		await crowdbar.start("export");
		await crowdbar.start("export");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it.each([
		[
			"the API is unreachable",
			() => Promise.reject(new TypeError("fetch failed")),
		],
		[
			"the API returns an error",
			() => Promise.resolve(new Response("oops", { status: 500 })),
		],
		["the API returns garbage", () => Promise.resolve(new Response("{}"))],
	])("exposes no estimate and throws nothing when %s", async (_, response) => {
		const { crowdbar, posts, tick } = setup(response);
		const run = await crowdbar.start("export");
		expect(run.progress()).toEqual({
			ready: false,
			progress: 0,
			remainingMs: null,
		});
		run.phase("decode");
		tick(100);
		expect(run.progress().ready).toBe(false);
		expect(() => run.finish()).not.toThrow();
		expect(posts()).toHaveLength(1);
	});

	it("does not wait long for a slow API", async () => {
		const fast = new Crowdbar({
			baseUrl: "https://api.test/v1",
			fetch: (_input, init) =>
				new Promise((_, reject) =>
					init?.signal?.addEventListener("abort", () =>
						reject(init.signal?.reason),
					),
				),
			timeoutMs: 20,
		});
		const run = await fast.start("export");
		expect(run.progress().ready).toBe(false);
	});

	it("never moves progress backwards and only reaches 1 on finish", async () => {
		const { crowdbar, tick } = setup(ok);
		const run = await crowdbar.start("export");
		const seen: number[] = [];
		const sample = () => seen.push(run.progress().progress);

		run.phase("decode");
		for (let i = 0; i < 30; i++) {
			tick(100); // decode overruns its 1 s estimate threefold
			sample();
		}
		run.phase("encode");
		sample();
		for (let i = 0; i < 10; i++) {
			tick(100); // encode is much faster than its 3 s estimate
			sample();
		}
		run.phase("unknown-extra-phase");
		for (let i = 0; i < 10; i++) {
			tick(1000);
			sample();
		}

		for (let i = 1; i < seen.length; i++)
			expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
		expect(Math.max(...seen)).toBeLessThan(1);
		run.finish();
		expect(run.progress()).toEqual({
			ready: true,
			progress: 1,
			remainingMs: 0,
		});
	});

	it("estimates progress and remaining time from the p50 of each phase", async () => {
		const { crowdbar, tick } = setup(ok);
		const run = await crowdbar.start("export");
		run.phase("decode");
		tick(500);
		expect(run.progress()).toEqual({
			ready: true,
			progress: 0.125,
			remainingMs: 3500,
		});
		run.phase("encode");
		tick(1500);
		expect(run.progress()).toEqual({
			ready: true,
			progress: 0.625,
			remainingMs: 1500,
		});
	});

	it("notifies progress listeners and swallows their errors", async () => {
		vi.useFakeTimers();
		try {
			const { crowdbar } = setup(ok);
			const run = await crowdbar.start("export");
			const updates: Progress[] = [];
			run.onProgress((p) => {
				updates.push(p);
				throw new Error("listener bug");
			});
			run.phase("decode");
			vi.advanceTimersByTime(250);
			run.finish();
			vi.advanceTimersByTime(1000);
			const count = updates.length;
			expect(count).toBeGreaterThan(1);
			expect(updates.at(-1)?.progress).toBe(1);
			vi.advanceTimersByTime(1000);
			expect(updates.length).toBe(count);
		} finally {
			vi.useRealTimers();
		}
	});
});
