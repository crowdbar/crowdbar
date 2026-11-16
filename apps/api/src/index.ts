import { Hono } from "hono";
import { cors } from "hono/cors";
import type { PhaseDuration } from "./bar-object";

export { BarObject } from "./bar-object";

const app = new Hono<{ Bindings: Env }>().basePath("/v1");

// Browser apps on any origin call this API.
app.use(cors());

app.get("/health", (c) => c.json({ ok: true }));

app.post("/runs", async (c) => {
	const body = await c.req.json().catch(() => undefined);
	const error = validateRun(body);
	if (error) return c.json({ error }, 400);
	const { bar, phases } = body as { bar: string; phases: PhaseDuration[] };
	await c.env.BAR.getByName(bar).report(
		phases.map(({ phase, ms }) => ({ phase, ms })),
	);
	return c.body(null, 202);
});

app.get("/bars/:bar/estimate", async (c) => {
	const bar = c.req.param("bar");
	const { ready, phases } = await c.env.BAR.getByName(bar).estimate();
	return c.json({ bar, segment: null, fallback: false, ready, phases });
});

function validateRun(body: unknown): string | undefined {
	if (typeof body !== "object" || body === null)
		return "Body must be a JSON object";
	const { bar, phases } = body as Record<string, unknown>;
	if (typeof bar !== "string" || bar === "")
		return "`bar` must be a non-empty string";
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
