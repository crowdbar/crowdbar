// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Db } from "@crowdbar/db";
import type { User } from "better-auth";

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			db: Db;
		}
	}
}
