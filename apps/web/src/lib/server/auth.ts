import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createDb, schema } from "@crowdbar/db";
import { betterAuth } from "better-auth";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { configuredProviders, withoutTracking } from "./auth-rules.js";

// Built per request, so each request gets a fresh D1 connection and its own cookie context.
export function createAuth(env: Env) {
	return betterAuth({
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(createDb(env.DB), { provider: "sqlite", schema }),
		socialProviders: configuredProviders(env),
		databaseHooks: {
			session: {
				create: {
					before: async (session) => ({ data: withoutTracking(session) }),
				},
				update: {
					before: async (session) => ({ data: withoutTracking(session) }),
				},
			},
		},
		plugins: [sveltekitCookies(getRequestEvent)], // must stay last
	});
}
