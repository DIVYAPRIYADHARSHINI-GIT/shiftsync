// Clean-state check: a brand-new visitor must see ONLY the fictional sample business.
//
// This runs against a fresh browser profile with empty storage, exactly like a first-time
// visitor to the deployed site, and asserts that none of the data created during testing
// (extra staff, extra shifts, extra leave, extra swaps, test business names) is present.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const BASE = process.env.SS_BASE ?? 'http://localhost:4199';
const TIMEOUT = 20_000;

let browser: Browser;

/** Names the sample business is allowed to contain, and nothing else. */
const EXPECTED_STAFF = [
	'Meena Raghavan',
	'Arun Selvaraj',
	'\u0BAA\u0BBF\u0BB0\u0BBF\u0BAF\u0BBE \u0B9A\u0BC1\u0BA8\u0BCD\u0BA4\u0BB0\u0BCD',
	'\u0915\u093E\u0930\u094D\u0924\u093F\u0915 \u0936\u0930\u094D\u092E\u093E',
	'Divya Nair',
	'Faisal Rahman',
	'\u0B85\u0BA9\u0BCD\u0BAA\u0BC1 \u0BB5\u0BC7\u0BB2\u0BA9\u0BCD',
	'Nisha Pillai',
	'\u0930\u094B\u0939\u093F\u0924 \u0926\u0947\u0936\u092A\u093E\u0902\u0921\u0947',
	'Sameera Khan',
	'Tomas Lindqvist',
	'\u0BB5\u0B9A\u0BA8\u0BCD\u0BA4\u0BBF \u0B95\u0BC1\u0BAE\u0BBE\u0BB0\u0BCD',
	'Joseph Fernandes',
	'Leela Krishnan'
];

async function freshPage(): Promise<Page> {
	// A brand-new context has no localStorage, which is the first-visitor condition.
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	page.setDefaultTimeout(TIMEOUT);
	return page;
}

beforeAll(async () => {
	browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
	await browser?.close();
});

describe('a first-time visitor sees only the sample data', () => {
	it('loads exactly the 14 fictional staff, with no test entries', async () => {
		const page = await freshPage();
		await page.goto(BASE, { waitUntil: 'networkidle' });
		await expect
			.poll(() => page.locator('table[aria-label^="Roster"] tbody tr').count(), {
				timeout: TIMEOUT
			})
			.toBeGreaterThan(5);

		const store = await page.evaluate(() =>
			JSON.parse(localStorage.getItem('shiftsync:data:v1') ?? '{}')
		);

		expect(store.business.name).toBe('Greenleaf Cafe');
		expect(store.staff).toHaveLength(14);
		expect(store.staff.map((s: { name: string }) => s.name).sort()).toEqual(
			[...EXPECTED_STAFF].sort()
		);
		// Every sample person is active; nothing was left deactivated by a test.
		expect(store.staff.every((s: { active: boolean }) => s.active)).toBe(true);

		await page.close();
	});

	it('has only the three sample shift templates', async () => {
		const page = await freshPage();
		await page.goto(BASE, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);
		const store = await page.evaluate(() =>
			JSON.parse(localStorage.getItem('shiftsync:data:v1') ?? '{}')
		);
		expect(store.templates.map((t: { name: string }) => t.name).sort()).toEqual([
			'Evening',
			'Morning',
			'Night bake'
		]);
		// No preset templates leaked in from the preset test.
		const names = store.templates.map((t: { name: string }) => t.name);
		for (const leaked of ['Day', 'Late', 'Opening', 'Closing', 'Lunch service', 'Dinner service']) {
			expect(names).not.toContain(leaked);
		}
		await page.close();
	});

	it('has exactly the sample leave, swaps and roster weeks', async () => {
		const page = await freshPage();
		await page.goto(BASE, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);
		const store = await page.evaluate(() =>
			JSON.parse(localStorage.getItem('shiftsync:data:v1') ?? '{}')
		);
		expect(store.leave).toHaveLength(4);
		expect(store.swaps).toHaveLength(1);
		expect(Object.keys(store.rosters)).toHaveLength(3);
		// No snapshots beyond the single staged one, so no test snapshot survived.
		const snapshots = Object.values(
			store.rosters as Record<string, { snapshots: unknown[] }>
		).flatMap((r) => r.snapshots);
		expect(snapshots.length).toBeLessThanOrEqual(1);
		await page.close();
	});

	it('has the default rule values and the business time zone', async () => {
		const page = await freshPage();
		await page.goto(BASE, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);
		const store = await page.evaluate(() =>
			JSON.parse(localStorage.getItem('shiftsync:data:v1') ?? '{}')
		);
		// The DST test switched the zone to Europe/London; a fresh visitor must not see that.
		expect(store.business.timeZone).toBe('Asia/Kolkata');
		const rest = store.rules.find((r: { id: string }) => r.id === 'min-rest');
		expect(rest.value).toBe(11);
		expect(rest.enabled).toBe(true);
		const week = store.rules.find((r: { id: string }) => r.id === 'max-hours-week');
		expect(week.value).toBe(48);
		// Every rule is switched on by default.
		expect(store.rules.every((r: { enabled: boolean }) => r.enabled)).toBe(true);
		await page.close();
	});

	it('shows no errors and the expected deliberate warnings', async () => {
		const page = await freshPage();
		await page.goto(BASE, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);
		// The published current week must be clean.
		expect(await page.locator('.pill-danger:has-text("error")').count()).toBe(0);
		// Next week's draft carries the two deliberate warnings.
		await page.locator('button[aria-label="Next week"]').click();
		await page.waitForTimeout(600);
		expect(await page.locator('.pill-warn:has-text("warning")').count()).toBe(1);
		expect(await page.locator('.pill-danger:has-text("error")').count()).toBe(0);
		await page.close();
	});

	it('reports no backup yet, so the reminder is visible', async () => {
		const page = await freshPage();
		await page.goto(BASE, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);
		const store = await page.evaluate(() =>
			JSON.parse(localStorage.getItem('shiftsync:data:v1') ?? '{}')
		);
		// No lastBackupAt from a test export leaked into the shipped sample.
		expect(store.settings.lastBackupAt).toBeFalsy();
		expect(await page.locator('text=You have not exported a backup yet').count()).toBe(1);
		await page.close();
	});
});
