import { createBar, getProject, listBars } from "@crowdbar/db";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	const ownerId = (locals.user as { id: string }).id;
	const project = await getProject(locals.db, ownerId, params.id);
	// 404 rather than 403, so another developer cannot even confirm the project exists.
	if (!project) error(404, "Project not found");
	return { project, bars: await listBars(locals.db, ownerId, project.id) };
};

export const actions: Actions = {
	createBar: async ({ locals, params, request }) => {
		const form = await request.formData();
		const name = String(form.get("name") ?? "");
		const slug = String(form.get("slug") ?? "");
		const ownerId = (locals.user as { id: string }).id;
		if (!(await getProject(locals.db, ownerId, params.id)))
			error(404, "Project not found");
		try {
			await createBar(locals.db, ownerId, params.id, { name, slug });
		} catch (e) {
			if (e instanceof RangeError)
				return fail(400, { name, slug, error: e.message });
			throw e;
		}
		redirect(303, `/projects/${params.id}/bars/${slug}`);
	},
};
