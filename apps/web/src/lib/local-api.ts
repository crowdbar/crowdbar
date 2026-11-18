import { add, count, empty, type Histogram, quantile } from "@crowdbar/core";

// The demo's "just you" mode: a stand-in for the two public endpoints, kept in this browser.
// Same histogram maths as the API's Durable Object, so the bar behaves the same.
type Phases = { phase: string; histogram: Histogram }[];
type Store = Record<
	string,
	{ global: Phases; segments: Record<string, Phases> }
>;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "crowdbar-demo-runs";

function merge(phases: Phases, run: { phase: string; ms: number }[]) {
	for (const { phase, ms } of run) {
		const found = phases.find((p) => p.phase === phase);
		if (found) found.histogram = add(found.histogram, ms);
		else phases.push({ phase, histogram: add(empty(), ms) });
	}
}

function estimateFrom(phases: Phases | undefined) {
	const ready = !!phases && phases.length > 0;
	return {
		ready,
		phases: ready
			? phases.map(({ phase, histogram }) => ({
					phase,
					p50: Math.round(quantile(histogram, 0.5)),
					p90: Math.round(quantile(histogram, 0.9)),
					samples: count(histogram),
				}))
			: [],
	};
}

export function localApi(storage: StorageLike) {
	const load = (): Store => JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");

	async function fetch(input: RequestInfo | URL, init?: RequestInit) {
		const url = new URL(input instanceof Request ? input.url : input);
		const store = load();
		if (init?.method === "POST" && url.pathname.endsWith("/runs")) {
			const { bar, segment, phases } = JSON.parse(String(init.body));
			store[bar] ??= { global: [], segments: {} };
			merge(store[bar].global, phases);
			if (segment !== undefined) {
				store[bar].segments[segment] ??= [];
				merge(store[bar].segments[segment], phases);
			}
			storage.setItem(STORAGE_KEY, JSON.stringify(store));
			return new Response(null, { status: 202 });
		}
		const bar = decodeURIComponent(
			/\/bars\/([^/]+)\/estimate$/.exec(url.pathname)?.[1] ?? "",
		);
		const segment = url.searchParams.get("segment");
		const own =
			segment === null
				? undefined
				: estimateFrom(store[bar]?.segments[segment]);
		const estimate = own?.ready ? own : estimateFrom(store[bar]?.global);
		return Response.json({
			bar,
			segment,
			fallback: segment !== null && !own?.ready,
			...estimate,
		});
	}

	return { fetch, reset: () => storage.removeItem(STORAGE_KEY) };
}
