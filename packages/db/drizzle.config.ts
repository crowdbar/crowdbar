import { defineConfig } from "drizzle-kit";

// Flat NNNN_name.sql files in ./migrations, which `wrangler d1 migrations apply` reads directly.
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/schema.ts",
	out: "./migrations",
});
