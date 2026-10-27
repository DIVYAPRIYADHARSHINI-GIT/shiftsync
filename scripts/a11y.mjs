// Automated accessibility check: runs axe-core over every main page in both themes and
// reports serious and critical violations. Part of the required Design QA.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const BASE = process.env.SS_BASE ?? 'http://localhost:4199';
const WIDTHS = (process.env.SS_WIDTHS ?? '1440,390').split(',').map(Number);
const THEMES = (process.env.SS_THEMES ?? 'light,dark').split(',');
const PAGES = [
	{ path: '/', name: 'Roster (staff view)' },
	{ path: '/?view=shift', name: 'Roster (shift view)' },
	{ path: '/?view=coverage', name: 'Coverage' },
	{ path: '/staff', name: 'Staff' },
	{ path: '/shifts', name: 'Shifts and coverage' },
	{ path: '/leave', name: 'Leave' },
	{ path: '/swaps', name: 'Swaps' },
	{ path: '/hours', name: 'Hours summary' },
	{ path: '/reports', name: 'Reports' },
	{ path: '/settings', name: 'Settings' },
	{ path: '/about', name: 'About' },
	{ path: '/privacy', name: 'Privacy and backup' }
];

const browser = await chromium.launch();
const findings = [];
let checks = 0;

for (const theme of THEMES) {
	for (const width of WIDTHS) {
		const context = await browser.newContext({
			viewport: { width, height: width < 500 ? 844 : 900 },
			colorScheme: theme === 'dark' ? 'dark' : 'light'
		});
		const page = await context.newPage();
		for (const target of PAGES) {
			await page.goto(BASE + target.path, { waitUntil: 'networkidle' });
			await page.waitForTimeout(400);
			await page.addScriptTag({ path: axePath });
			const result = await page.evaluate(async () =>
				// @ts-ignore - axe is injected above
				await window.axe.run(document, {
					runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
				})
			);
			checks++;
			for (const violation of result.violations) {
				if (violation.impact !== 'serious' && violation.impact !== 'critical') continue;
				findings.push({
					page: target.name,
					theme,
					width,
					id: violation.id,
					impact: violation.impact,
					help: violation.help,
					nodes: violation.nodes.slice(0, 3).map((n) => n.target.join(' ')),
					summary: violation.nodes[0]?.failureSummary?.split('\n')[1]?.trim() ?? ''
				});
			}
		}
		await context.close();
	}
}

await browser.close();

console.log(`axe-core ran ${checks} page checks (${PAGES.length} pages x ${WIDTHS.length} widths x ${THEMES.length} themes).`);
if (findings.length === 0) {
	console.log('No serious or critical accessibility violations found.');
} else {
	console.log(`\n${findings.length} serious or critical findings:\n`);
	for (const f of findings) {
		console.log(`- [${f.impact}] ${f.id} on ${f.page} (${f.theme}, ${f.width}px)`);
		console.log(`    ${f.help}`);
		if (f.summary) console.log(`    ${f.summary}`);
		console.log(`    nodes: ${f.nodes.join(' | ')}`);
	}
	process.exitCode = 1;
}
