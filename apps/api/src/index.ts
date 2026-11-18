import {
	createDb,
	findBar,
	findProjectByKey,
	type Project,
} from "@crowdbar/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { PhaseDuration } from "./bar-object";

export { BarObject } from "./bar-object";

const MAX_SEGMENT_LENGTH = 64;
// Longer than any job a progress bar is shown for; anything beyond is a bug or abuse.
const MAX_PHASE_MS = 7 * 24 * 60 * 60 * 1000;

const app = new Hono<{
	Bindings: Env;
	Variables: { db: ReturnType<typeof createDb>; project: Project };
}>().basePath("/v1");

// Browser apps on any origin call this API.
app.use(cors());

app.get("/health", (c) => c.json({ ok: true }));

// Every other route needs a project key.
app.use(async (c, next) => {
	const key = /^Bearer (\S+)$/.exec(c.req.header("Authorization") ?? "")?.[1];
	const db = createDb(c.env.DB);
	const project = key && (await findProjectByKey(db, key));
	if (!project) return c.json({ error: "Missing or unknown project key" }, 401);
	c.set("db", db);
	c.set("project", project);
	await next();
});

app.post("/runs", async (c) => {
	const body = await c.req.json().catch(() => undefined);
	const error = validateRun(body);
	if (error) return c.json({ error }, 400);
	const { bar, segment, phases } = body as {
		bar: string;
		segment?: string;
		phases: PhaseDuration[];
	};
	const found = await findBar(c.var.db, c.var.project.id, bar);
	if (!found) return c.json({ error: `Unknown bar "${bar}"` }, 404);
	const defined = new Set(found.phases.map((p) => p.slug));
	for (const { phase, ms } of phases) {
		// A run may skip phases, but never report one the bar does not define.
		if (!defined.has(phase))
			return c.json({ error: `Bar "${bar}" has no phase "${phase}"` }, 422);
		if (ms < 0 || ms > MAX_PHASE_MS)
			return c.json(
				{ error: `Phase "${phase}" must take 0 to ${MAX_PHASE_MS} ms` },
				422,
			);
	}
	// Addressed by bar id, so two projects with the same slug never share histograms.
	await c.env.BAR.getByName(found.id).report(
		phases.map(({ phase, ms }) => ({ phase, ms })),
		segment ?? null,
	);
	return c.body(null, 202);
});

app.get("/bars/:bar/estimate", async (c) => {
	const bar = c.req.param("bar");
	const segment = c.req.query("segment") ?? null;
	const error = segment === null ? undefined : validateSegment(segment);
	if (error) return c.json({ error }, 400);
	const found = await findBar(c.var.db, c.var.project.id, bar);
	if (!found) return c.json({ error: `Unknown bar "${bar}"` }, 404);
	const estimate = await c.env.BAR.getByName(found.id).estimate(
		segment,
		found.minRuns,
	);
	// Serve phases in the order the developer defined them.
	const phases = found.phases.flatMap(
		(p) => estimate.phases.find((e) => e.phase === p.slug) ?? [],
	);
	return c.json({
		bar,
		segment,
		fallback: estimate.fallback,
		ready: estimate.ready,
		phases,
	});
});

function validateSegment(segment: unknown): string | undefined {
	if (
		typeof segment !== "string" ||
		segment === "" ||
		segment.length > MAX_SEGMENT_LENGTH
	)
		return `\`segment\` must be a string of 1 to ${MAX_SEGMENT_LENGTH} characters`;
}

function validateRun(body: unknown): string | undefined {
	if (typeof body !== "object" || body === null)
		return "Body must be a JSON object";
	const { bar, segment, phases } = body as Record<string, unknown>;
	if (typeof bar !== "string" || bar === "")
		return "`bar` must be a non-empty string";
	if (segment !== undefined) {
		const error = validateSegment(segment);
		if (error) return error;
	}
	if (!Array.isArray(phases) || phases.length === 0)
		return "`phases` must be a non-empty array";
	const seen = new Set<string>();
	for (const p of phases) {
		const { phase, ms } = (p ?? {}) as Record<string, unknown>;
		if (typeof phase !== "string" || phase === "")
			return "Each phase needs a non-empty `phase` string";
		if (seen.has(phase)) return `Phase "${phase}" appears more than once`;
		seen.add(phase);
		if (typeof ms !== "number" || !Number.isFinite(ms))
			return `Phase "${phase}" needs \`ms\` as a number`;
	}
}

export default app;
