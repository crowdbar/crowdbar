import { env, exports } from "cloudflare:workers";
import {
	addPhase,
	createBar,
	createDb,
	createProject,
	schema,
	setMinRuns,
} from "@crowdbar/db";

export const base = "https://api.crowdbar.dev/v1";
const db = createDb(env.DB);
let owner: Promise<string> | undefined;

// One developer per test file; each call makes a fresh project, so its key and bars are its own.
export async function seedProject(
	bars: Record<string, string[]>,
	options: { minRuns?: number } = {},
) {
	owner ??= db
		.insert(schema.user)
		.values({
			id: crypto.randomUUID(),
			name: "Dev",
			email: `${crypto.randomUUID()}@example.test`,
		})
		.returning()
		.then(([u]) => u.id);
	const ownerId = await owner;
	const project = await createProject(db, ownerId, "Test");
	const ids: Record<string, string> = {};
	for (const [slug, phases] of Object.entries(bars)) {
		const bar = await createBar(db, ownerId, project.id, { name: slug, slug });
		for (const p of phases)
			await addPhase(db, ownerId, bar.id, { name: p, slug: p });
		if (options.minRuns) await setMinRuns(db, ownerId, bar.id, options.minRuns);
		ids[slug] = bar.id;
	}
	const auth = { Authorization: `Bearer ${project.publicKey}` };
	return {
		key: project.publicKey,
		barIds: ids,
		postRun: (body: unknown) =>
			exports.default.fetch(`${base}/runs`, {
				method: "POST",
				headers: { ...auth, "Content-Type": "application/json" },
				body: typeof body === "string" ? body : JSON.stringify(body),
			}),
		getEstimate: (bar: string, segment?: string) =>
			exports.default.fetch(
				`${base}/bars/${bar}/estimate${segment === undefined ? "" : `?segment=${segment}`}`,
				{ headers: auth },
			),
	};
}
