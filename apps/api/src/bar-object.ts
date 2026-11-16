import { DurableObject } from "cloudflare:workers";

export type PhaseDuration = { phase: string; ms: number };
export type PhaseEstimate = {
	phase: string;
	p50: number;
	p90: number;
	samples: number;
};

// One instance per bar. Keeps a running aggregate per phase, never raw runs.
export class BarObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS phases (
			phase TEXT PRIMARY KEY,
			position INTEGER NOT NULL,
			samples INTEGER NOT NULL,
			total_ms REAL NOT NULL
		)`);
	}

	report(phases: PhaseDuration[]): void {
		const sql = this.ctx.storage.sql;
		for (const { phase, ms } of phases) {
			sql.exec(
				`INSERT INTO phases (phase, position, samples, total_ms)
				VALUES (?, (SELECT COUNT(*) FROM phases), 1, ?)
				ON CONFLICT (phase) DO UPDATE SET samples = samples + 1, total_ms = total_ms + excluded.total_ms`,
				phase,
				ms,
			);
		}
	}

	// shortcut: mean stands in for p50 and p90; Task 3 replaces it with histogram quantiles.
	estimate(): PhaseEstimate[] {
		return this.ctx.storage.sql
			.exec<{ phase: string; samples: number; total_ms: number }>(
				"SELECT phase, samples, total_ms FROM phases ORDER BY position",
			)
			.toArray()
			.map(({ phase, samples, total_ms }) => {
				const mean = Math.round(total_ms / samples);
				return { phase, p50: mean, p90: mean, samples };
			});
	}
}
