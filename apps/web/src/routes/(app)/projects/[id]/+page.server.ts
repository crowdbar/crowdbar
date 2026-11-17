import { getProject } from "@crowdbar/db";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	const project = await getProject(
		locals.db,
		(locals.user as { id: string }).id,
		params.id,
	);
	// 404 rather than 403, so another developer cannot even confirm the project exists.
	if (!project) error(404, "Project not found");
	return { project };
};
