import {
	addPhase,
	getBar,
	getProject,
	movePhase,
	renamePhase,
	setMinRuns,
} from "@crowdbar/db";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

async function loadBar({
	locals,
	params,
}: RequestEvent | Parameters<PageServerLoad>[0]) {
	const ownerId = (locals.user as { id: string }).id;
	const project = await getProject(locals.db, ownerId, params.id);
	const bar =
		project && (await getBar(locals.db, ownerId, project.id, params.bar));
	if (!project || !bar) error(404, "Bar not found");
	return { ownerId, project, bar };
}

// Runs a mutation, turning validation errors into a form error tagged with the action.
async function attempt<V extends Record<string, string>>(
	action: string,
	values: V,
	run: () => Promise<unknown>,
) {
	try {
		await run();
	} catch (e) {
		if (e instanceof RangeError)
			return fail(400, { action, ...values, error: e.message });
		throw e;
	}
}

function phaseIn(bar: { phases: { id: string }[] }, id: string) {
	// The db layer checks ownership too; this keeps a forged id to a clean 404.
	if (!bar.phases.some((p) => p.id === id)) error(404, "Phase not found");
	return id;
}

export const load: PageServerLoad = async (event) => {
	const { project, bar } = await loadBar(event);
	return { project, bar };
};

export const actions: Actions = {
	minRuns: async (event) => {
		const { ownerId, bar } = await loadBar(event);
		const minRuns = String(
			(await event.request.formData()).get("minRuns") ?? "",
		);
		return attempt("minRuns", { minRuns }, () =>
			setMinRuns(event.locals.db, ownerId, bar.id, Number(minRuns)),
		);
	},
	addPhase: async (event) => {
		const { ownerId, bar } = await loadBar(event);
		const form = await event.request.formData();
		const name = String(form.get("name") ?? "");
		const slug = String(form.get("slug") ?? "");
		return attempt("addPhase", { name, slug }, () =>
			addPhase(event.locals.db, ownerId, bar.id, { name, slug }),
		);
	},
	renamePhase: async (event) => {
		const { ownerId, bar } = await loadBar(event);
		const form = await event.request.formData();
		const id = phaseIn(bar, String(form.get("id") ?? ""));
		const name = String(form.get("name") ?? "");
		return attempt("renamePhase", { id, name }, () =>
			renamePhase(event.locals.db, ownerId, id, name),
		);
	},
	movePhase: async (event) => {
		const { ownerId, bar } = await loadBar(event);
		const form = await event.request.formData();
		const id = phaseIn(bar, String(form.get("id") ?? ""));
		const direction = form.get("direction") === "up" ? "up" : "down";
		await movePhase(event.locals.db, ownerId, id, direction);
	},
};
