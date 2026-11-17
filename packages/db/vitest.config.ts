import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
	plugins: [
		cloudflareTest({
			miniflare: {
				compatibilityDate: "2026-11-16",
				d1Databases: ["DB"],
				bindings: { MIGRATIONS: await readD1Migrations("./migrations") },
			},
		}),
	],
	test: { setupFiles: ["./test/apply-migrations.ts"] },
}));
