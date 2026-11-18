// Suggests a slug from a display name: lowercase, spaces to hyphens, anything else invalid dropped.
export function slugify(name: string) {
	return name
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9_-]/g, "")
		.replace(/^[-_]+/, "")
		.slice(0, 64);
}
