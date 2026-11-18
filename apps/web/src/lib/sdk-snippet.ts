// The copyable quickstart on a bar's page, matching the TypeScript SDK's API.
export function sdkSnippet(key: string, bar: string, phases: string[]) {
	const q = JSON.stringify;
	const steps = phases
		.map((p) => `run.phase(${q(p)});\n// ...work...\n`)
		.join("");
	return `import { Crowdbar } from "crowdbar";

const crowdbar = new Crowdbar({ key: ${q(key)} });
const run = await crowdbar.start(${q(bar)});

run.onProgress(({ progress, remainingMs }) => {
	// draw your bar
});

${steps}run.finish();
`;
}
