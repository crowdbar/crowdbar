import { DurableObject } from "cloudflare:workers";
import { add, count, empty, type Histogram, quantile } from "@crowdbar/core";

export type PhaseDuration = { phase: string; ms: number };
export type PhaseEstimate = {
	phase: string;
	p50: number;
	p90: number;
	samples: number;
};
export type Estimate = { ready: boolean; phases: PhaseEstimate[] };

// One instance per bar. Keeps a histogram per phase, never raw runs.
export class BarObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS phase_histograms (
			phase TEXT PRIMARY KEY,
			position INTEGER NOT NULL,
			histogram TEXT NOT NULL
		)`);
	}

	private histograms() {
		return this.ctx.storage.sql
			.exec<{ phase: string; histogram: string }>(
				"SELECT phase, histogram FROM phase_histograms ORDER BY position",
			)
			.toArray()
			.map(({ phase, histogram }) => ({
				phase,
				histogram: JSON.parse(histogram) as Histogram,
			}));
	}

	// Synchronous SQL with no await in between, so a run is applied atomically.
	report(phases: PhaseDuration[]): void {
		const sql = this.ctx.storage.sql;
		const stored = new Map(
			this.histograms().map(({ phase, histogram }) => [phase, histogram]),
		);
		for (const { phase, ms } of phases) {
			sql.exec(
				`INSERT INTO phase_histograms (phase, position, histogram)
				VALUES (?, (SELECT COUNT(*) FROM phase_histograms), ?)
				ON CONFLICT (phase) DO UPDATE SET histogram = excluded.histogram`,
				phase,
				JSON.stringify(add(stored.get(phase) ?? empty(), ms)),
			);
		}
	}

	estimate(minSamples = 1): Estimate {
		const phases = this.histograms().map(({ phase, histogram }) => ({
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
