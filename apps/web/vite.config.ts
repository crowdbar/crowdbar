import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import {
	defaultClientConditions,
	defaultServerConditions,
	defineConfig,
} from "vite";

// "source" resolves workspace packages (the SDK) to their TypeScript, so no prior build is needed.
const conditions = ["source"];

export default defineConfig({
	resolve: { conditions: [...conditions, ...defaultClientConditions] },
	ssr: { resolve: { conditions: [...conditions, ...defaultServerConditions] } },
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
			},
			adapter: adapter(),
		}),
	],
});
