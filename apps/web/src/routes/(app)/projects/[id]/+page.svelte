<script lang="ts">
import { enhance } from "$app/forms";

let { data, form } = $props();
</script>

<svelte:head><title>{data.project.name} · Crowdbar</title></svelte:head>

<p class="mb-2 text-sm"><a href="/projects" class="underline">← Projects</a></p>
<h1 class="mb-6 text-2xl font-bold">{data.project.name}</h1>
<section class="mb-8 space-y-2">
	<h2 class="font-semibold">Public key</h2>
	<p class="text-sm text-gray-700">Use it in the SDK. It ships inside your app, so it is not a secret.</p>
	<code class="block rounded bg-gray-100 p-3">{data.project.publicKey}</code>
</section>

<section class="space-y-4">
	<h2 class="font-semibold">Bars</h2>
	<form method="POST" action="?/createBar" use:enhance class="flex flex-wrap items-end gap-3">
		<label class="flex-1">
			<span class="block text-sm">Name</span>
			<input name="name" required maxlength="100" placeholder="Video export" value={form?.name ?? ""} class="w-full rounded border px-3 py-2" />
		</label>
		<label class="flex-1">
			<span class="block text-sm">Slug (used in the SDK)</span>
			<input name="slug" required maxlength="64" pattern="[a-z0-9][a-z0-9_\-]*" placeholder="video-export" value={form?.slug ?? ""} class="w-full rounded border px-3 py-2 font-mono" aria-invalid={form?.error ? "true" : undefined} aria-describedby={form?.error ? "bar-error" : undefined} />
		</label>
		<button class="rounded bg-black px-4 py-2 text-white">Add bar</button>
	</form>
	{#if form?.error}<p id="bar-error" class="text-sm text-red-700">{form.error}</p>{/if}

	{#if data.bars.length === 0}
		<p class="text-gray-700">No bars yet. A bar is one progress bar in your app, made of ordered phases.</p>
	{:else}
		<ul class="divide-y rounded border">
			{#each data.bars as bar (bar.id)}
				<li class="flex items-center justify-between gap-4 p-4">
					<a href="/projects/{data.project.id}/bars/{bar.slug}" class="font-medium underline">{bar.name}</a>
					<code class="text-sm text-gray-700">{bar.slug}</code>
				</li>
			{/each}
		</ul>
	{/if}
</section>
