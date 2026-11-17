import { createProject, listProjects } from "@crowdbar/db";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => ({
	projects: await listProjects(locals.db, (locals.user as { id: string }).id),
});

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const name = String((await request.formData()).get("name") ?? "");
		let id: string;
		try {
			({ id } = await createProject(
				locals.db,
				(locals.user as { id: string }).id,
				name,
			));
		} catch (e) {
			if (e instanceof RangeError) return fail(400, { name, error: e.message });
			throw e;
		}
		redirect(303, `/projects/${id}`);
	},
};
