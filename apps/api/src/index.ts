import { Hono } from "hono";
import { cors } from "hono/cors";
import type { PhaseDuration } from "./bar-object";

export { BarObject } from "./bar-object";

const MAX_SEGMENT_LENGTH = 64;

const app = new Hono<{ Bindings: Env }>().basePath("/v1");

// Browser apps on any origin call this API.
app.use(cors());

app.get("/health", (c) => c.json({ ok: true }));

app.post("/runs", async (c) => {
	const body = await c.req.json().catch(() => undefined);
	const error = validateRun(body);
	if (error) return c.json({ error }, 400);
	const { bar, segment, phases } = body as {
		bar: string;
		segment?: string;
		phases: PhaseDuration[];
	};
	await c.env.BAR.getByName(bar).report(
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
	const { ready, fallback, phases } =
		await c.env.BAR.getByName(bar).estimate(segment);
	return c.json({ bar, segment, fallback, ready, phases });
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
		if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0)
			return `Phase "${phase}" needs \`ms\` as a non-negative number`;
	}
}

export default app;
