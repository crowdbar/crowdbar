import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("GET /v1/health returns ok", async () => {
	const res = await exports.default.fetch("https://api.crowdbar.dev/v1/health");
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ ok: true });
});
