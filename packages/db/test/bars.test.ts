import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import {
	addPhase,
	createBar,
	createDb,
	createProject,
	findBar,
	findProjectByKey,
	getBar,
	listBars,
	movePhase,
	renamePhase,
	setMinRuns,
} from "../src";
import { user } from "../src/schema";

const db = createDb(env.DB);
let projectId: string;
let otherProjectId: string;

beforeAll(async () => {
	await db.insert(user).values([
		{ id: "carol", name: "Carol", email: "carol@example.com" },
		{ id: "dave", name: "Dave", email: "dave@example.com" },
	]);
	projectId = (await createProject(db, "carol", "Video app")).id;
	otherProjectId = (await createProject(db, "carol", "Other")).id;
});

describe("bars", () => {
	it("creates a bar with a default minimum of one run", async () => {
		const bar = await createBar(db, "carol", projectId, {
			name: " Video export ",
			slug: "video-export",
		});
		expect(bar).toMatchObject({
			name: "Video export",
			slug: "video-export",
			minRuns: 1,
		});
		expect((await listBars(db, "carol", projectId)).map((b) => b.slug)).toEqual(
			["video-export"],
		);
	});

	it("rejects a duplicate slug in the same project but allows it in another", async () => {
		await createBar(db, "carol", projectId, { name: "A", slug: "dup" });
		await expect(
			createBar(db, "carol", projectId, { name: "B", slug: "dup" }),
		).rejects.toThrow(/already/);
		await expect(
			createBar(db, "carol", otherProjectId, { name: "B", slug: "dup" }),
		).resolves.toMatchObject({ slug: "dup" });
	});

	it.each([
		["an empty slug", ""],
		["uppercase", "Video"],
		["spaces", "video export"],
		["a leading hyphen", "-video"],
		["a too-long slug", "x".repeat(65)],
	])("rejects %s", async (_, slug) => {
		await expect(
			createBar(db, "carol", projectId, { name: "Bar", slug }),
		).rejects.toThrow(RangeError);
	});

	it("refuses to touch another developer's project or bar", async () => {
		await expect(
			createBar(db, "dave", projectId, { name: "X", slug: "x" }),
		).rejects.toThrow();
		const bar = await createBar(db, "carol", projectId, {
			name: "Mine",
			slug: "mine",
		});
		expect(await listBars(db, "dave", projectId)).toEqual([]);
		expect(await getBar(db, "dave", projectId, "mine")).toBeUndefined();
		await expect(setMinRuns(db, "dave", bar.id, 5)).rejects.toThrow();
		await expect(
			addPhase(db, "dave", bar.id, { name: "P", slug: "p" }),
		).rejects.toThrow();
	});

	it("persists the minimum-runs setting and rejects invalid values", async () => {
		const bar = await createBar(db, "carol", projectId, {
			name: "Min",
			slug: "min",
		});
		await setMinRuns(db, "carol", bar.id, 20);
		expect(
			(await getBar(createDb(env.DB), "carol", projectId, "min"))?.minRuns,
		).toBe(20);
		for (const bad of [0, -1, 1.5, Number.NaN])
			await expect(setMinRuns(db, "carol", bar.id, bad)).rejects.toThrow(
				RangeError,
			);
	});
});

describe("phases", () => {
	async function barWithPhases(slug: string, phases: string[]) {
		const bar = await createBar(db, "carol", projectId, { name: slug, slug });
		for (const p of phases)
			await addPhase(db, "carol", bar.id, { name: p, slug: p });
		return bar;
	}
	const slugs = async (bar: string) =>
		(await getBar(createDb(env.DB), "carol", projectId, bar))?.phases.map(
			(p) => p.slug,
		);

	it("keeps phases in the order they were added", async () => {
		await barWithPhases("ordered", ["decode", "encode", "upload"]);
		expect(await slugs("ordered")).toEqual(["decode", "encode", "upload"]);
	});

	it("rejects a duplicate phase slug in the same bar only", async () => {
		const bar = await barWithPhases("dups", ["decode"]);
		await expect(
			addPhase(db, "carol", bar.id, { name: "Again", slug: "decode" }),
		).rejects.toThrow(/already/);
		await barWithPhases("dups-other", ["decode"]);
		expect(await slugs("dups-other")).toEqual(["decode"]);
	});

	it("moves a phase up or down and persists the order", async () => {
		await barWithPhases("moves", ["a", "b", "c"]);
		const [a, , c] =
			(await getBar(db, "carol", projectId, "moves"))?.phases ?? [];
		await movePhase(db, "carol", c.id, "up");
		expect(await slugs("moves")).toEqual(["a", "c", "b"]);
		await movePhase(db, "carol", a.id, "down");
		expect(await slugs("moves")).toEqual(["c", "a", "b"]);
		// Moving past either end changes nothing.
		await movePhase(db, "carol", c.id, "up");
		expect(await slugs("moves")).toEqual(["c", "a", "b"]);
	});

	it("renames a phase without changing its slug", async () => {
		await barWithPhases("renames", ["decode"]);
		const [phase] =
			(await getBar(db, "carol", projectId, "renames"))?.phases ?? [];
		await renamePhase(db, "carol", phase.id, "Decoding video");
		expect(
			(await getBar(db, "carol", projectId, "renames"))?.phases[0],
		).toMatchObject({ name: "Decoding video", slug: "decode" });
		await expect(renamePhase(db, "dave", phase.id, "Hijack")).rejects.toThrow();
		await expect(renamePhase(db, "carol", phase.id, " ")).rejects.toThrow(
			RangeError,
		);
	});
});

describe("API lookups", () => {
	it("finds a project by its public key and a bar with its phases in order", async () => {
		const project = await createProject(db, "carol", "Keyed");
		const bar = await createBar(db, "carol", project.id, {
			name: "Lookup",
			slug: "lookup",
		});
		for (const p of ["b", "a"])
			await addPhase(db, "carol", bar.id, { name: p, slug: p });

		expect((await findProjectByKey(db, project.publicKey))?.id).toBe(
			project.id,
		);
		expect(await findProjectByKey(db, "cb_pub_unknown")).toBeUndefined();

		const found = await findBar(db, project.id, "lookup");
		expect(found?.id).toBe(bar.id);
		expect(found?.phases.map((p) => p.slug)).toEqual(["b", "a"]);
		// A bar is only found inside its own project.
		expect(await findBar(db, projectId, "lookup")).toBeUndefined();
	});
});
