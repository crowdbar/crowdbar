import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, createProject, getProject, listProjects } from "../src";
import { user } from "../src/schema";

const db = createDb(env.DB);

beforeAll(async () => {
	await db.insert(user).values([
		{ id: "alice", name: "Alice", email: "alice@example.com" },
		{ id: "bob", name: "Bob", email: "bob@example.com" },
	]);
});

describe("projects", () => {
	it("persists a created project with its public key", async () => {
		const created = await createProject(db, "alice", "  Video app  ");
		expect(created.name).toBe("Video app");
		expect(created.publicKey).toMatch(/^cb_pub_[A-Za-z0-9_-]{24}$/);
		// A fresh connection stands in for a page reload.
		const listed = await listProjects(createDb(env.DB), "alice");
		expect(listed.map((p) => [p.id, p.publicKey])).toContainEqual([
			created.id,
			created.publicKey,
		]);
	});

	it("never shows or opens another developer's project", async () => {
		const secret = await createProject(db, "alice", "Private");
		expect(await listProjects(db, "bob")).toEqual([]);
		expect(await getProject(db, "bob", secret.id)).toBeUndefined();
		expect((await getProject(db, "alice", secret.id))?.name).toBe("Private");
	});

	it("gives every project its own key", async () => {
		const a = await createProject(db, "bob", "One");
		const b = await createProject(db, "bob", "Two");
		expect(a.publicKey).not.toBe(b.publicKey);
	});

	it.each([
		["blank", "   "],
		["too long", "x".repeat(101)],
	])("rejects a %s name", async (_, name) => {
		await expect(createProject(db, "bob", name)).rejects.toThrow(RangeError);
	});
});
