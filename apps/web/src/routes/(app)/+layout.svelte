<script lang="ts">
import { authClient } from "#lib/auth-client.js";
import { goto } from "$app/navigation";

let { data, children } = $props();

async function signOut() {
	await authClient.signOut();
	await goto("/sign-in");
}
</script>

<div class="mx-auto max-w-2xl p-6">
	<header class="mb-8 flex items-center justify-between border-b pb-4">
		<a href="/projects" class="font-bold">Crowdbar</a>
		<div class="flex items-center gap-4 text-sm">
			<span class="text-gray-700">{data.user.email}</span>
			<button class="rounded border px-3 py-1" onclick={signOut}>Sign out</button>
		</div>
	</header>
	{@render children()}
</div>
