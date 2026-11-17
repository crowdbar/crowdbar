import type { LayoutServerLoad } from "./$types";

// The hook has already redirected signed-out visitors, so user is set here.
export const load: LayoutServerLoad = ({ locals }) => ({
	user: { name: locals.user?.name ?? "", email: locals.user?.email ?? "" },
});
