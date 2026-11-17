// Pure auth rules, kept apart from Better Auth and SvelteKit so they are unit-testable.

const DEFAULT_AFTER_SIGN_IN = "/projects";

// Every route in the (app) group is the dashboard and needs a signed-in developer.
export function signInRedirect(
	routeId: string | null,
	user: unknown,
	url: URL,
): string | null {
	if (user || !routeId?.startsWith("/(app)")) return null;
	return `/sign-in?redirectTo=${encodeURIComponent(url.pathname + url.search)}`;
}

// Only same-site paths, so the sign-in page cannot be used as an open redirect.
export function safeRedirect(target: string | null): string {
	return target?.startsWith("/") && !/^\/[/\\]/.test(target)
		? target
		: DEFAULT_AFTER_SIGN_IN;
}

type ProviderEnv = {
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
};

export function configuredProviders(env: ProviderEnv) {
	const providers: Partial<
		Record<"github" | "google", { clientId: string; clientSecret: string }>
	> = {};
	if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
		providers.github = {
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
		};
	if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
		providers.google = {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		};
	return providers;
}

// We never store IP addresses; the user agent goes too, as it adds nothing we use.
export function withoutTracking<T extends object>(session: T) {
	return { ...session, ipAddress: null, userAgent: null };
}
