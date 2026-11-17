<script lang="ts">
import { enhance } from "$app/forms";

let { data, form } = $props();
</script>

<svelte:head><title>Projects · Crowdbar</title></svelte:head>

<h1 class="mb-6 text-2xl font-bold">Projects</h1>

<form method="POST" action="?/create" use:enhance class="mb-8 flex gap-3">
	<label class="flex-1">
		<span class="sr-only">Project name</span>
		<input name="name" required maxlength="100" placeholder="New project name" value={form?.name ?? ""} class="w-full rounded border px-3 py-2" aria-invalid={form?.error ? "true" : undefined} aria-describedby={form?.error ? "name-error" : undefined} />
	</label>
	<button class="rounded bg-black px-4 py-2 text-white">Create project</button>
</form>
{#if form?.error}<p id="name-error" class="-mt-6 mb-6 text-sm text-red-700">{form.error}</p>{/if}

{#if data.projects.length === 0}
	<p class="text-gray-700">No projects yet. Create one to get a key for the SDK.</p>
{:else}
	<ul class="divide-y rounded border">
		{#each data.projects as project (project.id)}
			<li class="flex items-center justify-between gap-4 p-4">
				<a href="/projects/{project.id}" class="font-medium underline">{project.name}</a>
				<code class="text-sm text-gray-700">{project.publicKey}</code>
			</li>
		{/each}
	</ul>
{/if}
