<script lang="ts">
import { untrack } from "svelte";
import { sdkSnippet } from "#lib/sdk-snippet.js";
import { slugify } from "#lib/slugify.js";
import { enhance } from "$app/forms";

let { data, form } = $props();

// The new phase's slug follows its name until the developer types in the slug field (or clears it again).
// Seeded once from a failed no-JS submission; afterwards the input owns it.
let phaseSlug = $state(
	untrack(() => (form?.action === "addPhase" ? form.slug : "")),
);
let phaseSlugEdited = untrack(() => phaseSlug !== "");

const snippet = $derived(
	sdkSnippet(
		data.project.publicKey,
		data.bar.slug,
		data.bar.phases.map((p) => p.slug),
	),
);
let copied = $state(false);

async function copy() {
	await navigator.clipboard.writeText(snippet);
	copied = true;
	setTimeout(() => (copied = false), 2000);
}

const errorFor = (action: string) =>
	form?.action === action ? form.error : undefined;
</script>

<svelte:head><title>{data.bar.name} · {data.project.name} · Crowdbar</title></svelte:head>

<p class="mb-2 text-sm"><a href="/projects/{data.project.id}" class="underline">← {data.project.name}</a></p>
<h1 class="text-2xl font-bold">{data.bar.name}</h1>
<p class="mb-6 font-mono text-sm text-gray-700">{data.bar.slug}</p>

<section class="mb-8 space-y-3">
	<h2 class="font-semibold">Phases</h2>
	{#if data.bar.phases.length === 0}
		<p class="text-gray-700">No phases yet. Add them in the order your job runs them.</p>
	{:else}
		<ol class="divide-y rounded border">
			{#each data.bar.phases as phase, i (phase.id)}
				<li class="flex flex-wrap items-center gap-2 p-3">
					<form method="POST" action="?/renamePhase" use:enhance={() => ({ update }) => update({ reset: false })} class="flex flex-1 items-center gap-2">
						<input type="hidden" name="id" value={phase.id} />
						<label class="flex-1">
							<span class="sr-only">Name of phase {phase.slug}</span>
							<input name="name" required maxlength="100" value={phase.name} class="w-full rounded border px-2 py-1" />
						</label>
						<code class="text-sm text-gray-700">{phase.slug}</code>
						<button class="rounded border px-2 py-1 text-sm">Rename</button>
					</form>
					<form method="POST" action="?/movePhase" use:enhance class="flex gap-1">
						<input type="hidden" name="id" value={phase.id} />
						<button name="direction" value="up" disabled={i === 0} class="rounded border px-2 py-1 text-sm disabled:opacity-40" aria-label="Move {phase.name} up">↑</button>
						<button name="direction" value="down" disabled={i === data.bar.phases.length - 1} class="rounded border px-2 py-1 text-sm disabled:opacity-40" aria-label="Move {phase.name} down">↓</button>
					</form>
				</li>
			{/each}
		</ol>
	{/if}
	{#if errorFor("renamePhase")}<p class="text-sm text-red-700">{errorFor("renamePhase")}</p>{/if}

	<form
		method="POST"
		action="?/addPhase"
		use:enhance={() =>
			async ({ result, update }) => {
				if (result.type === "success") {
					phaseSlug = "";
					phaseSlugEdited = false;
				}
				await update();
			}}
		class="flex flex-wrap items-end gap-3">
		<label class="flex-1">
			<span class="block text-sm">Phase name</span>
			<input name="name" required maxlength="100" placeholder="Decode" value={form?.action === "addPhase" ? form.name : ""} oninput={(e) => { if (!phaseSlugEdited) phaseSlug = slugify(e.currentTarget.value); }} class="w-full rounded border px-3 py-2" />
		</label>
		<label class="flex-1">
			<span class="block text-sm">Slug (used in the SDK)</span>
			<input name="slug" required maxlength="64" pattern="[a-z0-9][a-z0-9_\-]*" placeholder="decode" value={phaseSlug} oninput={(e) => { phaseSlug = e.currentTarget.value; phaseSlugEdited = phaseSlug !== ""; }} class="w-full rounded border px-3 py-2 font-mono" aria-invalid={errorFor("addPhase") ? "true" : undefined} aria-describedby={errorFor("addPhase") ? "phase-error" : undefined} />
		</label>
		<button class="rounded bg-black px-4 py-2 text-white">Add phase</button>
	</form>
	{#if errorFor("addPhase")}<p id="phase-error" class="text-sm text-red-700">{errorFor("addPhase")}</p>{/if}
</section>

<section class="mb-8 space-y-2">
	<h2 class="font-semibold">Minimum runs before serving an estimate</h2>
	<form method="POST" action="?/minRuns" use:enhance={() => ({ update }) => update({ reset: false })} class="flex items-end gap-3">
		<label>
			<span class="sr-only">Minimum runs</span>
			<input name="minRuns" type="number" required min="1" max="10000" step="1" value={data.bar.minRuns} class="w-32 rounded border px-3 py-2" aria-invalid={errorFor("minRuns") ? "true" : undefined} />
		</label>
		<button class="rounded border px-4 py-2">Save</button>
	</form>
	{#if errorFor("minRuns")}<p class="text-sm text-red-700">{errorFor("minRuns")}</p>{/if}
</section>

<section class="space-y-2">
	<div class="flex items-center justify-between">
		<h2 class="font-semibold">SDK snippet</h2>
		<button onclick={copy} class="rounded border px-3 py-1 text-sm">{copied ? "Copied" : "Copy"}</button>
	</div>
	<pre class="overflow-x-auto rounded bg-gray-100 p-3 text-sm"><code>{snippet}</code></pre>
	<p class="text-sm text-gray-700">Install with <code>bun add crowdbar</code> (or your package manager).</p>
</section>
