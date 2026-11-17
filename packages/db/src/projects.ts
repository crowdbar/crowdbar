import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;
export type Project = typeof schema.project.$inferSelect;

export const MAX_PROJECT_NAME_LENGTH = 100;

export function createDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

function newPublicKey() {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	const base64url = btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_");
	return `cb_pub_${base64url}`;
}

// Every read is scoped to the owner, so a developer can never reach another developer's project.
export async function createProject(db: Db, ownerId: string, name: string) {
	const trimmed = name.trim();
	if (trimmed === "" || trimmed.length > MAX_PROJECT_NAME_LENGTH)
		throw new RangeError(
			`Project name must be 1 to ${MAX_PROJECT_NAME_LENGTH} characters`,
		);
	const [created] = await db
		.insert(schema.project)
		.values({
			id: crypto.randomUUID(),
			ownerId,
			name: trimmed,
			publicKey: newPublicKey(),
		})
		.returning();
	return created;
}

export function listProjects(db: Db, ownerId: string) {
	return db
		.select()
		.from(schema.project)
		.where(eq(schema.project.ownerId, ownerId))
		.orderBy(desc(schema.project.createdAt));
}

export async function getProject(db: Db, ownerId: string, id: string) {
	const [found] = await db
		.select()
		.from(schema.project)
		.where(and(eq(schema.project.id, id), eq(schema.project.ownerId, ownerId)));
	return found;
}
