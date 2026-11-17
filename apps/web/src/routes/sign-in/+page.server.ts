import { env } from "cloudflare:workers";
import { redirect } from "@sveltejs/kit";
import { configuredProviders, safeRedirect } from "#lib/server/auth-rules.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, url }) => {
	const redirectTo = safeRedirect(url.searchParams.get("redirectTo"));
	if (locals.user) redirect(303, redirectTo);
	const providers = Object.keys(configuredProviders(env)) as (
		| "github"
		| "google"
	)[];
	return { providers, redirectTo };
};
