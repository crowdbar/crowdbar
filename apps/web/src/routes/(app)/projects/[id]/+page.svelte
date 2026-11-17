<script lang="ts">
let { data } = $props();
</script>

<svelte:head><title>{data.project.name} · Crowdbar</title></svelte:head>

<p class="mb-2 text-sm"><a href="/projects" class="underline">← Projects</a></p>
<h1 class="mb-6 text-2xl font-bold">{data.project.name}</h1>
<section class="space-y-2">
	<h2 class="font-semibold">Public key</h2>
	<p class="text-sm text-gray-700">Use it in the SDK. It ships inside your app, so it is not a secret.</p>
	<code class="block rounded bg-gray-100 p-3">{data.project.publicKey}</code>
</section>
