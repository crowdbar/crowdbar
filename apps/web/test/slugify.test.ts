import { SLUG_PATTERN } from "@crowdbar/db";
import { describe, expect, it } from "vitest";
import { slugify } from "../src/lib/slugify";

describe("slugify", () => {
	it.each([
		["Video export", "video-export"],
		["  Decode   Video ", "decode-video"],
		["Upload (S3)!", "upload-s3"],
		["--Résumé_v2", "rsum_v2"],
		["", ""],
	])("turns %j into %j", (name, slug) => {
		expect(slugify(name)).toBe(slug);
	});

	it("always produces a slug the dashboard accepts, or an empty one", () => {
		for (const name of [
			"Video export",
			"Ünïcode only ü",
			"x".repeat(80),
			"!!",
		]) {
			const slug = slugify(name);
			if (slug !== "") expect(slug).toMatch(SLUG_PATTERN);
		}
	});
});
