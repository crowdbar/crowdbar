import { env } from "cloudflare:workers";
import { createDb } from "@crowdbar/db";
import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { createAuth } from "#lib/server/auth.js";
import { signInRedirect } from "#lib/server/auth-rules.js";
import { building } from "$app/env";

export const handle: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);
	const auth = createAuth(env);
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.db = createDb(env.DB);
	// Checked here rather than in a layout load, so form actions are protected too.
	const to = signInRedirect(event.route.id, event.locals.user, event.url);
	if (to) redirect(303, to);
	return svelteKitHandler({ event, resolve, auth, building });
};
