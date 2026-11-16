import {
	computeProgress,
	type EstimatePhase,
	type Progress,
} from "./progress.js";

export type CrowdbarOptions = {
	key?: string;
	baseUrl?: string;
	// How long start() waits for an estimate before giving up.
	timeoutMs?: number;
	fetch?: typeof fetch;
	now?: () => number;
	// Scale the remaining phases by how fast or slow this run has been so far. Off by default.
	paceCorrection?: boolean;
};

export type StartOptions = { segment?: string };

const LISTENER_INTERVAL_MS = 100;

export class Crowdbar {
	private readonly key?: string;
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private readonly fetch: typeof fetch;
	readonly now: () => number;
	readonly paceCorrection: boolean;
	// shortcut: in-memory only, lost on page reload; persist (e.g. localStorage) if cold starts matter.
	private readonly cache = new Map<string, EstimatePhase[]>();

	constructor(options: CrowdbarOptions = {}) {
		this.key = options.key;
		this.baseUrl = (options.baseUrl ?? "https://api.crowdbar.dev/v1").replace(
			/\/$/,
			"",
		);
		this.timeoutMs = options.timeoutMs ?? 3000;
		this.fetch =
			options.fetch ?? ((input, init) => globalThis.fetch(input, init));
		this.now = options.now ?? (() => performance.now());
		this.paceCorrection = options.paceCorrection ?? false;
	}

	// Never rejects: without an estimate the run still works and reports, with ready: false.
	async start(bar: string, options: StartOptions = {}): Promise<Run> {
		const cacheKey = JSON.stringify([bar, options.segment ?? null]);
		let estimate = this.cache.get(cacheKey);
		if (!estimate) {
			estimate = await this.fetchEstimate(bar, options.segment);
			if (estimate) this.cache.set(cacheKey, estimate);
		}
		return new Run(this, bar, options.segment, estimate ?? null);
	}

	private async fetchEstimate(bar: string, segment?: string) {
		try {
			const url = new URL(
				`${this.baseUrl}/bars/${encodeURIComponent(bar)}/estimate`,
			);
			if (segment !== undefined) url.searchParams.set("segment", segment);
			const res = await this.fetch(url.toString(), {
				headers: this.headers(),
				signal: AbortSignal.timeout(this.timeoutMs),
			});
			if (!res.ok) return undefined;
			const body = (await res.json()) as { ready?: unknown; phases?: unknown };
			if (body.ready !== true || !Array.isArray(body.phases)) return undefined;
			const phases = body.phases as EstimatePhase[];
			const valid = phases.every(
				(p) => typeof p.phase === "string" && Number.isFinite(p.p50),
			);
			return valid && phases.length > 0 ? phases : undefined;
		} catch {
			return undefined;
		}
	}

	/** @internal Fire-and-forget; failures are dropped. */
	report(body: unknown): void {
		try {
			this.fetch(`${this.baseUrl}/runs`, {
				method: "POST",
				headers: { ...this.headers(), "Content-Type": "application/json" },
				body: JSON.stringify(body),
				keepalive: true,
			}).catch(() => {});
		} catch {}
	}

	private headers(): Record<string, string> {
		return this.key ? { Authorization: `Bearer ${this.key}` } : {};
	}
}

export class Run {
	private readonly durations = new Map<string, number>();
	private current?: { phase: string; startedAt: number };
	private finished = false;
	private last = 0;
	private readonly listeners = new Set<(p: Progress) => void>();
	private timer?: ReturnType<typeof setInterval>;

	constructor(
		private readonly client: Crowdbar,
		readonly bar: string,
		readonly segment: string | undefined,
		private readonly estimate: EstimatePhase[] | null,
	) {}

	// Ends the current phase (if any) and starts this one.
	phase(name: string): void {
		if (this.finished || this.current?.phase === name) return;
		this.endCurrent();
		this.current = { phase: name, startedAt: this.client.now() };
		this.emit();
	}

	// Ends the current phase and sends the report. Later calls do nothing.
	finish(): void {
		if (this.finished) return;
		this.endCurrent();
		this.finished = true;
		if (this.durations.size > 0) {
			this.client.report({
				bar: this.bar,
				...(this.segment !== undefined && { segment: this.segment }),
				phases: [...this.durations].map(([phase, ms]) => ({
					phase,
					ms: Math.round(ms),
				})),
			});
		}
		this.emit();
		clearInterval(this.timer);
	}

	progress(): Progress {
		if (!this.estimate)
			return {
				ready: false,
				progress: this.finished ? 1 : 0,
				remainingMs: null,
			};
		if (this.finished) return { ready: true, progress: 1, remainingMs: 0 };
		const p = computeProgress(
			this.estimate,
			this.durations,
			this.currentElapsed(),
			this.client.paceCorrection,
		);
		// Progress never goes backwards, even if a later phase runs faster than expected.
		this.last = Math.max(this.last, p.progress);
		return { ...p, progress: this.last };
	}

	// Called on every phase change and every 100 ms until finish(). Returns an unsubscribe function.
	onProgress(listener: (p: Progress) => void): () => void {
		this.listeners.add(listener);
		if (!this.timer && !this.finished)
			this.timer = setInterval(() => this.emit(), LISTENER_INTERVAL_MS);
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) clearInterval(this.timer);
		};
	}

	private currentElapsed() {
		return (
			this.current && {
				phase: this.current.phase,
				ms: this.client.now() - this.current.startedAt,
			}
		);
	}

	private endCurrent() {
		const c = this.currentElapsed();
		if (c)
			this.durations.set(c.phase, (this.durations.get(c.phase) ?? 0) + c.ms);
		this.current = undefined;
	}

	private emit() {
		if (this.listeners.size === 0) return;
		const p = this.progress();
		for (const listener of this.listeners) {
			try {
				listener(p);
			} catch {}
		}
	}
}
