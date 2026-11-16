import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

// The SDK is MIT; importing an AGPL workspace package would void that.
it("does not import AGPL workspace packages", () => {
	const dir = new URL("../src/", import.meta.url);
	for (const file of readdirSync(dir)) {
		expect(readFileSync(new URL(file, dir), "utf8"), file).not.toMatch(
			/@crowdbar\//,
		);
	}
	const pkg = readFileSync(new URL("../package.json", import.meta.url), "utf8");
	expect(pkg).not.toMatch(/@crowdbar\//);
});
