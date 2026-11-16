// Log-scale histogram: bucket i >= 1 holds durations in [GROWTH^(i-1), GROWTH^i) ms,
// bucket 0 holds durations under 1 ms. Reading a bucket at its geometric midpoint
// keeps the quantile error under sqrt(GROWTH) - 1, about 2.5%.
const GROWTH = 1.05;
const LOG_GROWTH = Math.log(GROWTH);

// Sparse, plain JSON so it can be stored as is.
export type Histogram = { buckets: Record<number, number> };

export function empty(): Histogram {
	return { buckets: {} };
}

function bucketOf(ms: number): number {
	return ms < 1 ? 0 : 1 + Math.floor(Math.log(ms) / LOG_GROWTH);
}

function midpointOf(bucket: number): number {
	return bucket === 0 ? 0 : GROWTH ** (bucket - 0.5);
}

export function add(histogram: Histogram, ms: number): Histogram {
	const i = bucketOf(ms);
	return {
		buckets: { ...histogram.buckets, [i]: (histogram.buckets[i] ?? 0) + 1 },
	};
}

export function count(histogram: Histogram): number {
	let n = 0;
	for (const c of Object.values(histogram.buckets)) n += c;
	return n;
}

// Nearest-rank quantile, q in [0, 1]. NaN when the histogram is empty.
export function quantile(histogram: Histogram, q: number): number {
	const rank = Math.max(1, Math.ceil(q * count(histogram)));
	let seen = 0;
	const buckets = Object.keys(histogram.buckets)
		.map(Number)
		.sort((a, b) => a - b);
	for (const i of buckets) {
		seen += histogram.buckets[i];
		if (seen >= rank) return midpointOf(i);
	}
	return Number.NaN;
}
