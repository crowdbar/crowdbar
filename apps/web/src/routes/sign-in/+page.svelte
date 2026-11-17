<script lang="ts">
import { authClient } from "#lib/auth-client.js";

let { data } = $props();
let pending = $state(false);
const labels = { github: "GitHub", google: "Google" };

async function signIn(provider: "github" | "google") {
	pending = true;
	await authClient.signIn.social({ provider, callbackURL: data.redirectTo });
	pending = false;
}
</script>

<svelte:head><title>Sign in · Crowdbar</title></svelte:head>

<main class="mx-auto max-w-sm space-y-6 p-6">
	<h1 class="text-3xl font-bold">Sign in</h1>
	{#if data.providers.length === 0}
		<p class="text-gray-700">No sign-in provider is configured.</p>
	{/if}
	<div class="flex flex-col gap-3">
		{#each data.providers as provider (provider)}
			<button class="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={pending} onclick={() => signIn(provider)}>
				Continue with {labels[provider]}
			</button>
		{/each}
	</div>
</main>
