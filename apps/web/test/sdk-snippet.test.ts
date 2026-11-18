import { describe, expect, it } from "vitest";
import { sdkSnippet } from "../src/lib/sdk-snippet";

describe("sdkSnippet", () => {
	it("fills in the key, bar slug and phases in order", () => {
		expect(
			sdkSnippet("cb_pub_abc", "video-export", ["decode", "encode", "upload"]),
		).toBe(`import { Crowdbar } from "crowdbar";

const crowdbar = new Crowdbar({ key: "cb_pub_abc" });
const run = await crowdbar.start("video-export");

run.onProgress(({ progress, remainingMs }) => {
	// draw your bar
});

run.phase("decode");
// ...work...
run.phase("encode");
// ...work...
run.phase("upload");
// ...work...
run.finish();
`);
	});

	it("still produces runnable code for a bar with no phases yet", () => {
		expect(sdkSnippet("k", "b", [])).toContain(
			'const run = await crowdbar.start("b");',
		);
	});
});
