import { describe, expect, it } from "vitest";
import {
	configuredProviders,
	safeRedirect,
	signInRedirect,
	withoutTracking,
} from "../src/lib/server/auth-rules";

const url = (path: string) => new URL(`https://crowdbar.test${path}`);
const user = { id: "u1" };

describe("signInRedirect", () => {
	it.each([
		["/(app)/projects", "/projects"],
		["/(app)/projects/[id]", "/projects/abc?tab=keys"],
	])(
		"sends a signed-out visitor on %s to sign-in, then back",
		(routeId, path) => {
			expect(signInRedirect(routeId, null, url(path))).toBe(
				`/sign-in?redirectTo=${encodeURIComponent(path)}`,
			);
		},
	);

	it("lets signed-in developers and public routes through", () => {
		expect(
			signInRedirect("/(app)/projects", user, url("/projects")),
		).toBeNull();
		for (const routeId of ["/", "/demo", "/sign-in", null])
			expect(signInRedirect(routeId, null, url("/x"))).toBeNull();
	});
});

describe("safeRedirect", () => {
	it("keeps same-site paths and rejects everything else", () => {
		expect(safeRedirect("/projects/abc?x=1")).toBe("/projects/abc?x=1");
		for (const bad of [
			null,
			"",
			"https://evil.test",
			"//evil.test",
			"/\\evil.test",
			"projects",
		])
			expect(safeRedirect(bad)).toBe("/projects");
	});
});

describe("configuredProviders", () => {
	it("enables only the providers whose credentials are set", () => {
		const providers = configuredProviders({
			GITHUB_CLIENT_ID: "id",
			GITHUB_CLIENT_SECRET: "secret",
			GOOGLE_CLIENT_ID: "id",
			GOOGLE_CLIENT_SECRET: "",
		});
		expect(Object.keys(providers)).toEqual(["github"]);
		expect(providers.github).toEqual({
			clientId: "id",
			clientSecret: "secret",
		});
	});
});

describe("withoutTracking", () => {
	it("drops the IP address and user agent before a session is stored", () => {
		const session = {
			token: "t",
			ipAddress: "203.0.113.9",
			userAgent: "Firefox",
		};
		expect(withoutTracking(session)).toEqual({
			token: "t",
			ipAddress: null,
			userAgent: null,
		});
	});
});
