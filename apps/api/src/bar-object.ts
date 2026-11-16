import { DurableObject } from "cloudflare:workers";
import { add, count, empty, type Histogram, quantile } from "@crowdbar/core";

export type PhaseDuration = { phase: string; ms: number };
export type PhaseEstimate = {
	phase: string;
	p50: number;
	p90: number;
	samples: number;
};
export type Estimate = {
	ready: boolean;
	// True when a segment was requested but the global estimate was served.
	fallback: boolean;
	phases: PhaseEstimate[];
};

// Bounds storage per bar; runs with a new segment past this count towards the global histogram only.
export const MAX_SEGMENTS = 100;

// One instance per bar. Keeps a histogram per phase, never raw runs.
export class BarObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS phase_histograms (
			phase TEXT PRIMARY KEY,
			position INTEGER NOT NULL,
			histogram TEXT NOT NULL
		)`);
		// The global histograms stay in phase_histograms; this table holds the per-segment ones.
		ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS segment_histograms (
			segment TEXT NOT NULL,
			phase TEXT NOT NULL,
			position INTEGER NOT NULL,
			histogram TEXT NOT NULL,
			PRIMARY KEY (segment, phase)
		)`);
	}

	private histograms(segment: string | null) {
		const sql = this.ctx.storage.sql;
		const rows =
			segment === null
				? sql.exec<{ phase: string; histogram: string }>(
						"SELECT phase, histogram FROM phase_histograms ORDER BY position",
					)
				: sql.exec<{ phase: string; histogram: string }>(
						"SELECT phase, histogram FROM segment_histograms WHERE segment = ? ORDER BY position",
						segment,
					);
		return rows.toArray().map(({ phase, histogram }) => ({
			phase,
			histogram: JSON.parse(histogram) as Histogram,
		}));
	}

	// Synchronous SQL with no await in between, so a run is applied atomically.
	report(phases: PhaseDuration[], segment: string | null = null): void {
		const sql = this.ctx.storage.sql;
		const global = this.merged(null, phases);
		for (const { phase, histogram } of global) {
			sql.exec(
				`INSERT INTO phase_histograms (phase, position, histogram)
				VALUES (?, (SELECT COUNT(*) FROM phase_histograms), ?)
				ON CONFLICT (phase) DO UPDATE SET histogram = excluded.histogram`,
				phase,
				histogram,
			);
		}
		if (segment === null || !this.acceptsSegment(segment)) return;
		for (const { phase, histogram } of this.merged(segment, phases)) {
			sql.exec(
				`INSERT INTO segment_histograms (segment, phase, position, histogram)
				VALUES (?1, ?2, (SELECT COUNT(*) FROM segment_histograms WHERE segment = ?1), ?3)
				ON CONFLICT (segment, phase) DO UPDATE SET histogram = excluded.histogram`,
				segment,
				phase,
				histogram,
			);
		}
	}

	// The stored histograms for these phases with the run's durations added, serialised.
	private merged(segment: string | null, phases: PhaseDuration[]) {
		const stored = new Map(
			this.histograms(segment).map(({ phase, histogram }) => [
				phase,
				histogram,
			]),
		);
		return phases.map(({ phase, ms }) => ({
			phase,
			histogram: JSON.stringify(add(stored.get(phase) ?? empty(), ms)),
		}));
	}

	private acceptsSegment(segment: string) {
		const { known, total } = this.ctx.storage.sql
			.exec<{ known: number; total: number }>(
				"SELECT COUNT(DISTINCT CASE WHEN segment = ? THEN segment END) AS known, COUNT(DISTINCT segment) AS total FROM segment_histograms",
				segment,
			)
			.one();
		return known > 0 || total < MAX_SEGMENTS;
	}

	estimate(segment: string | null = null, minSamples = 1): Estimate {
		if (segment !== null) {
			const own = this.estimateFrom(segment, minSamples);
			if (own.ready) return { ...own, fallback: false };
		}
		return {
			...this.estimateFrom(null, minSamples),
			fallback: segment !== null,
		};
	}

	private estimateFrom(segment: string | null, minSamples: number) {
		const phases = this.histograms(segment).map(({ phase, histogram }) => ({
			phase,
			p50: Math.round(quantile(histogram, 0.5)),
			p90: Math.round(quantile(histogram, 0.9)),
			samples: count(histogram),
		}));
		const ready =
			phases.length > 0 && phases.every((p) => p.samples >= minSamples);
		return { ready, phases: ready ? phases : [] };
	}
}
