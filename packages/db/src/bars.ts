import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import type { Db } from "./projects";
import { getProject } from "./projects";
import * as schema from "./schema";

export type Bar = typeof schema.bar.$inferSelect;
export type Phase = typeof schema.phase.$inferSelect;

export const MAX_NAME_LENGTH = 100;
export const MAX_MIN_RUNS = 10_000;
// Slugs travel in URLs and SDK calls, so keep them plain.
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function cleanName(name: string) {
	const trimmed = name.trim();
	if (trimmed === "" || trimmed.length > MAX_NAME_LENGTH)
		throw new RangeError(`Name must be 1 to ${MAX_NAME_LENGTH} characters`);
	return trimmed;
}

function checkSlug(slug: string) {
	if (!SLUG_PATTERN.test(slug))
		throw new RangeError(
			"Slug must be 1 to 64 lowercase letters, digits, hyphens or underscores, starting with a letter or digit",
		);
	return slug;
}

// Every function checks ownership through the project, like projects.ts.
async function ownedBar(db: Db, ownerId: string, barId: string) {
	const [found] = await db
		.select({ bar: schema.bar })
		.from(schema.bar)
		.innerJoin(schema.project, eq(schema.bar.projectId, schema.project.id))
		.where(and(eq(schema.bar.id, barId), eq(schema.project.ownerId, ownerId)));
	if (!found) throw new Error("Bar not found");
	return found.bar;
}

async function ownedPhase(db: Db, ownerId: string, phaseId: string) {
	const [found] = await db
		.select({ phase: schema.phase })
		.from(schema.phase)
		.innerJoin(schema.bar, eq(schema.phase.barId, schema.bar.id))
		.innerJoin(schema.project, eq(schema.bar.projectId, schema.project.id))
		.where(
			and(eq(schema.phase.id, phaseId), eq(schema.project.ownerId, ownerId)),
		);
	if (!found) throw new Error("Phase not found");
	return found.phase;
}

export async function createBar(
	db: Db,
	ownerId: string,
	projectId: string,
	input: { name: string; slug: string },
) {
	const name = cleanName(input.name);
	const slug = checkSlug(input.slug);
	if (!(await getProject(db, ownerId, projectId)))
		throw new Error("Project not found");
	const [taken] = await db
		.select({ id: schema.bar.id })
		.from(schema.bar)
		.where(and(eq(schema.bar.projectId, projectId), eq(schema.bar.slug, slug)));
	if (taken)
		throw new RangeError(`A bar with slug "${slug}" already exists here`);
	const [created] = await db
		.insert(schema.bar)
		.values({ id: crypto.randomUUID(), projectId, name, slug })
		.returning();
	return created;
}

export async function listBars(db: Db, ownerId: string, projectId: string) {
	if (!(await getProject(db, ownerId, projectId))) return [];
	return db
		.select()
		.from(schema.bar)
		.where(eq(schema.bar.projectId, projectId))
		.orderBy(desc(schema.bar.createdAt));
}

export async function getBar(
	db: Db,
	ownerId: string,
	projectId: string,
	slug: string,
) {
	if (!(await getProject(db, ownerId, projectId))) return undefined;
	const [found] = await db
		.select()
		.from(schema.bar)
		.where(and(eq(schema.bar.projectId, projectId), eq(schema.bar.slug, slug)));
	if (!found) return undefined;
	const phases = await db
		.select()
		.from(schema.phase)
		.where(eq(schema.phase.barId, found.id))
		.orderBy(asc(schema.phase.position));
	return { ...found, phases };
}

export async function setMinRuns(
	db: Db,
	ownerId: string,
	barId: string,
	minRuns: number,
) {
	if (!Number.isInteger(minRuns) || minRuns < 1 || minRuns > MAX_MIN_RUNS)
		throw new RangeError(
			`Minimum runs must be a whole number from 1 to ${MAX_MIN_RUNS}`,
		);
	await ownedBar(db, ownerId, barId);
	await db.update(schema.bar).set({ minRuns }).where(eq(schema.bar.id, barId));
}

export async function addPhase(
	db: Db,
	ownerId: string,
	barId: string,
	input: { name: string; slug: string },
) {
	const name = cleanName(input.name);
	const slug = checkSlug(input.slug);
	await ownedBar(db, ownerId, barId);
	const existing = await db
		.select({ slug: schema.phase.slug, position: schema.phase.position })
		.from(schema.phase)
		.where(eq(schema.phase.barId, barId));
	if (existing.some((p) => p.slug === slug))
		throw new RangeError(
			`A phase with slug "${slug}" already exists in this bar`,
		);
	const position = Math.max(-1, ...existing.map((p) => p.position)) + 1;
	const [created] = await db
		.insert(schema.phase)
		.values({ id: crypto.randomUUID(), barId, name, slug, position })
		.returning();
	return created;
}

export async function renamePhase(
	db: Db,
	ownerId: string,
	phaseId: string,
	name: string,
) {
	const cleaned = cleanName(name);
	await ownedPhase(db, ownerId, phaseId);
	await db
		.update(schema.phase)
		.set({ name: cleaned })
		.where(eq(schema.phase.id, phaseId));
}

export async function movePhase(
	db: Db,
	ownerId: string,
	phaseId: string,
	direction: "up" | "down",
) {
	const moving = await ownedPhase(db, ownerId, phaseId);
	const up = direction === "up";
	const [neighbour] = await db
		.select()
		.from(schema.phase)
		.where(
			and(
				eq(schema.phase.barId, moving.barId),
				up
					? lt(schema.phase.position, moving.position)
					: gt(schema.phase.position, moving.position),
			),
		)
		.orderBy(up ? desc(schema.phase.position) : asc(schema.phase.position))
		.limit(1);
	if (!neighbour) return;
	await db.batch([
		db
			.update(schema.phase)
			.set({ position: neighbour.position })
			.where(eq(schema.phase.id, moving.id)),
		db
			.update(schema.phase)
			.set({ position: moving.position })
			.where(eq(schema.phase.id, neighbour.id)),
	]);
}
