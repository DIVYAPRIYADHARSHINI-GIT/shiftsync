// Quick smoke check used during development: does the app boot with sample data,
// render the grid, and stay free of console errors? Short timeouts, fail fast.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const BASE = process.env.SS_BASE ?? 'http://localhost:4199';
const TIMEOUT = 10_000;

let browser: Browser;
const consoleErrors: string[] = [];

async function newPage(width = 1440, height = 900): Promise<Page> {
	const context = await browser.newContext({ viewport: { width, height } });
	const page = await context.newPage();
	page.setDefaultTimeout(TIMEOUT);
	page.on('console', (m) => {
		if (m.type() === 'error') consoleErrors.push(`${page.url()} :: ${m.text()}`);
	});
	page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: ${e.message}`));
	return page;
}

beforeAll(async () => {
	browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
	await browser?.close();
	if (consoleErrors.length) {
		console.log('--- console errors ---');
		for (const e of [...new Set(consoleErrors)]) console.log(e);
	}
});

describe('smoke', () => {
	it('boots with the sample business and renders the roster grid', async () => {
		const page = await newPage();
		await page.goto(BASE, { waitUntil: 'networkidle' });
		await expect.poll(() => page.locator('text=Greenleaf Cafe').count()).toBeGreaterThan(0);
		await expect.poll(() => page.locator('table[aria-label^="Roster"]').count()).toBe(1);
		// Sample staff should be rendered as rows.
		const rows = await page.locator('table[aria-label^="Roster"] tbody tr').count();
		expect(rows).toBeGreaterThan(5);
		// Shift chips should exist for the published current week.
		const chips = await page.locator('.chip').count();
		expect(chips).toBeGreaterThan(5);
		await page.close();
	});

	it('has no console errors on the roster page', async () => {
		expect(consoleErrors).toEqual([]);
	});
});
