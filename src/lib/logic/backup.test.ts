import { describe, it, expect } from 'vitest';
import {
	backupFileName,
	backupReminderDue,
	buildBackup,
	daysSinceBackup,
	validateBackup
} from './backup';
import { emptyData } from '../store/schema';
import { MemoryRosterStore, formatBytes } from '../store/roster-store';
import { sampleData } from '../store/sample-data';
import { fixedClock } from './time';

const NOW = '2026-10-26T09:00:00Z';

function goodBackupText(): string {
	return JSON.stringify(buildBackup(sampleData(fixedClock(NOW)), NOW));
}

describe('backup validation', () => {
	it('accepts a backup this app wrote', () => {
		const result = validateBackup(goodBackupText());
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.summary.staff).toBe(14);
			expect(result.summary.rosters).toBe(3);
			expect(result.summary.leave).toBe(4);
		}
	});

	it('rejects text that is not JSON', () => {
		const result = validateBackup('this is not json');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('not valid JSON');
			expect(result.detail).toBeTruthy();
		}
	});

	it('rejects truncated JSON', () => {
		const result = validateBackup('{"app":"shiftsync","data":{');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('not valid JSON');
	});

	it('rejects a JSON array', () => {
		const result = validateBackup('[1,2,3]');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('does not contain a ShiftSync backup');
	});

	it('rejects a backup from another app', () => {
		const result = validateBackup(JSON.stringify({ app: 'someotherapp', schemaVersion: 1, data: {} }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('not created by ShiftSync');
	});

	it('rejects a backup from a newer schema', () => {
		const result = validateBackup(
			JSON.stringify({ app: 'shiftsync', schemaVersion: 99, data: emptyData() })
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('newer version');
	});

	it('rejects a missing data section', () => {
		const result = validateBackup(JSON.stringify({ app: 'shiftsync', schemaVersion: 1 }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('missing its data section');
	});

	it('rejects a missing staff list', () => {
		const data = { ...emptyData() } as Record<string, unknown>;
		delete data.staff;
		const result = validateBackup(JSON.stringify({ app: 'shiftsync', schemaVersion: 1, data }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('"staff" is missing');
	});

	it('rejects a staff entry without a name', () => {
		const data = emptyData();
		// @ts-expect-error deliberately malformed
		data.staff.push({ id: 'x', roles: [] });
		const result = validateBackup(JSON.stringify({ app: 'shiftsync', schemaVersion: 1, data }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('missing an id or a name');
	});

	it('rejects a roster keyed by something that is not a date', () => {
		const data = emptyData();
		data.rosters['week-one'] = { weekStart: 'week-one', status: 'Draft', shifts: [], snapshots: [] };
		const result = validateBackup(JSON.stringify({ app: 'shiftsync', schemaVersion: 1, data }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('is not a date');
	});

	it('rejects a shift with a malformed date', () => {
		const data = emptyData();
		data.rosters['2026-10-26'] = {
			weekStart: '2026-10-26',
			status: 'Draft',
			shifts: [
				{ id: 's1', date: '26/10/2026', templateId: 't', role: 'Barista', staffId: null, locked: false }
			],
			snapshots: []
		};
		const result = validateBackup(JSON.stringify({ app: 'shiftsync', schemaVersion: 1, data }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('malformed date');
	});

	it('rejects an impossible calendar date', () => {
		const data = emptyData();
		data.rosters['2026-02-30'] = {
			weekStart: '2026-02-30',
			status: 'Draft',
			shifts: [],
			snapshots: []
		};
		const result = validateBackup(JSON.stringify({ app: 'shiftsync', schemaVersion: 1, data }));
		expect(result.ok).toBe(false);
	});

	it('rejects an invalid person reference on a shift', () => {
		const data = emptyData();
		data.rosters['2026-10-26'] = {
			weekStart: '2026-10-26',
			status: 'Draft',
			shifts: [
				// @ts-expect-error deliberately malformed
				{ id: 's1', date: '2026-10-26', templateId: 't', role: 'Barista', staffId: 42, locked: false }
			],
			snapshots: []
		};
		const result = validateBackup(JSON.stringify({ app: 'shiftsync', schemaVersion: 1, data }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('invalid person reference');
	});

	it('names the backup file by business and date', () => {
		expect(backupFileName('Greenleaf Cafe', NOW)).toBe(
			'ShiftSync_Backup_GreenleafCafe_2026-10-26.json'
		);
	});
});

describe('backup reminder', () => {
	const now = Date.parse(NOW);

	it('is due when there has never been a backup', () => {
		expect(daysSinceBackup(undefined, now)).toBeNull();
		expect(backupReminderDue(undefined, now)).toBe(true);
	});

	it('is not due within 7 days', () => {
		const threeDaysAgo = new Date(now - 3 * 86_400_000).toISOString();
		expect(daysSinceBackup(threeDaysAgo, now)).toBe(3);
		expect(backupReminderDue(threeDaysAgo, now)).toBe(false);
	});

	it('is due at exactly 7 days', () => {
		const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
		expect(backupReminderDue(sevenDaysAgo, now)).toBe(true);
	});

	it('ignores an unparseable date', () => {
		expect(daysSinceBackup('not-a-date', now)).toBeNull();
	});
});

describe('store behaviour', () => {
	it('round-trips data through the memory store', () => {
		const store = new MemoryRosterStore();
		const data = sampleData(fixedClock(NOW));
		store.replaceAll(data);
		expect(store.load().staff).toHaveLength(14);
		expect(store.info().health).toBe('ok');
	});

	it('start fresh clears everything', () => {
		const store = new MemoryRosterStore();
		store.replaceAll(sampleData(fixedClock(NOW)));
		store.clear();
		const data = store.load();
		expect(data.staff).toHaveLength(0);
		expect(Object.keys(data.rosters)).toHaveLength(0);
		expect(data.rules.length).toBeGreaterThan(0); // defaults are restored
	});

	it('reports a storage size', () => {
		const store = new MemoryRosterStore();
		store.replaceAll(sampleData(fixedClock(NOW)));
		expect(store.info().usedBytes).toBeGreaterThan(1000);
		expect(store.info().fraction).toBeLessThan(1);
	});

	it('formats byte counts', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
	});
});

describe('sample data', () => {
	const data = sampleData(fixedClock(NOW));

	it('loads a fictional business with 14 staff in four roles', () => {
		expect(data.business.name).toBe('Greenleaf Cafe');
		expect(data.staff).toHaveLength(14);
		const roles = new Set(data.staff.flatMap((s) => s.roles));
		expect([...roles].sort()).toEqual(['Barista', 'Cashier', 'Cook', 'Supervisor']);
	});

	it('includes Tamil and Devanagari names', () => {
		const names = data.staff.map((s) => s.name).join(' ');
		expect(/[\u0B80-\u0BFF]/.test(names)).toBe(true); // Tamil
		expect(/[\u0900-\u097F]/.test(names)).toBe(true); // Devanagari
	});

	it('has three templates including one that crosses midnight', () => {
		expect(data.templates).toHaveLength(3);
		const overnight = data.templates.filter((t) => t.endMin <= t.startMin);
		expect(overnight).toHaveLength(1);
		expect(overnight[0].name).toBe('Night bake');
	});

	it('has a published current week and a draft next week', () => {
		const statuses = Object.values(data.rosters).map((r) => r.status);
		expect(statuses).toContain('Published');
		expect(statuses).toContain('Draft');
	});

	it('has approved and pending leave', () => {
		expect(data.leave.some((l) => l.status === 'Approved')).toBe(true);
		expect(data.leave.some((l) => l.status === 'Pending')).toBe(true);
	});

	it('has a pending swap request', () => {
		expect(data.swaps.some((s) => s.status === 'Pending')).toBe(true);
	});

	it('marks itself as loaded', () => {
		expect(data.settings.sampleDataLoaded).toBe(true);
	});

	it('is deterministic for a fixed clock', () => {
		const again = sampleData(fixedClock(NOW));
		expect(Object.keys(again.rosters)).toEqual(Object.keys(data.rosters));
		expect(JSON.stringify(again.staff)).toBe(JSON.stringify(data.staff));
	});
});
