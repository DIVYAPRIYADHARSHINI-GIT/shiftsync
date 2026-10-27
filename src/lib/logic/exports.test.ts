import { describe, it, expect } from 'vitest';
import { csvCell, hoursCsv, parseCsv, rosterCsv, rosterFileName, safeFileStem } from './csv';
import { buildIcs, escapeIcsText, foldLine, icsFileName } from './ics';
import { hoursSummary, contractState, fairnessIndicator } from './hours';
import { dayCoverage, dayCoverageSummary } from './coverage';
import { evaluateSwap, applySwap } from './swaps';
import { BUSINESS, EVENING, MORNING, NIGHT, makeCoverage, makeInput, makeShift, makeStaff } from './fixtures';
import { mergeRules } from './rules';
import type { SwapRequest } from '../types';

const MON = '2026-10-26';
const TUE = '2026-10-27';
const TEMPLATES = [MORNING, EVENING, NIGHT];
const TZ = 'Asia/Kolkata';

describe('CSV output', () => {
	it('quotes cells containing commas, quotes and newlines', () => {
		expect(csvCell('plain')).toBe('plain');
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
		expect(csvCell(undefined)).toBe('');
	});

	it('writes the long format with a BOM and CRLF', () => {
		const csv = rosterCsv(
			[makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' })],
			[makeStaff({ id: 'a', name: 'Alice' })],
			TEMPLATES,
			TZ
		);
		expect(csv.startsWith('\uFEFF')).toBe(true);
		expect(csv).toContain('\r\n');
		const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
		expect(lines[0]).toBe('Date,Shift,Role,Person,Start,End,Paid hours,Overnight,Status');
		expect(lines[1]).toBe('2026-10-26,Morning,Barista,Alice,07:00,15:00,8.00,No,Assigned');
	});

	it('marks overnight shifts and open slots', () => {
		const csv = rosterCsv(
			[
				makeShift({ id: 's1', date: MON, templateId: 'night', staffId: 'a' }),
				makeShift({ id: 's2', date: MON, templateId: 'morning', staffId: null })
			],
			[makeStaff({ id: 'a', name: 'Alice' })],
			TEMPLATES,
			TZ
		);
		expect(csv).toContain(',Yes,Assigned');
		expect(csv).toContain(',No,Open');
	});

	it('keeps Tamil and Devanagari names intact', () => {
		const csv = rosterCsv(
			[makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' })],
			[makeStaff({ id: 'a', name: 'பிரியா சுந்தர்' })],
			TEMPLATES,
			TZ
		);
		expect(csv).toContain('பிரியா சுந்தர்');
	});

	it('writes the hours summary', () => {
		const csv = hoursCsv(
			[
				{
					staffId: 'a',
					name: 'Alice',
					roles: ['Barista', 'Cashier'],
					colour: '#000',
					hours: 38.5,
					minHours: 32,
					maxHours: 40,
					overtimeHours: 0,
					shifts: 5,
					weekendShifts: 1,
					nightShifts: 0,
					daysOff: 2,
					longestRun: 5,
					estimatedCost: 11935
				}
			],
			'INR'
		);
		expect(csv).toContain('Estimated cost (INR)');
		expect(csv).toContain('Barista / Cashier');
		expect(csv).toContain('38.50');
	});

	it('round-trips through the parser', () => {
		const rows = parseCsv('a,b\r\n"x,1","say ""hi"""\r\n');
		expect(rows[0]).toEqual(['a', 'b']);
		expect(rows[1]).toEqual(['x,1', 'say "hi"']);
	});

	it('builds safe file names', () => {
		expect(safeFileStem('Greenleaf Cafe')).toBe('GreenleafCafe');
		expect(safeFileStem('!!!')).toBe('Roster');
		expect(rosterFileName('Greenleaf Cafe', '2026-W44', 'pdf')).toBe(
			'Roster_GreenleafCafe_2026-W44.pdf'
		);
	});
});

describe('ICS output', () => {
	const staff = makeStaff({ id: 'a', name: 'Alice' });

	it('produces a valid calendar envelope', () => {
		const ics = buildIcs({
			staff,
			shifts: [makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' })],
			templates: TEMPLATES,
			businessName: 'Greenleaf Cafe',
			timeZone: TZ,
			nowMs: Date.UTC(2026, 9, 20, 12, 0, 0)
		});
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
		expect(ics).toContain('VERSION:2.0');
		expect(ics).toContain('X-WR-TIMEZONE:Asia/Kolkata');
		expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
		expect((ics.match(/END:VEVENT/g) ?? []).length).toBe(1);
	});

	it('writes UTC instants that match the business time zone', () => {
		const ics = buildIcs({
			staff,
			shifts: [makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' })],
			templates: TEMPLATES,
			businessName: 'Cafe',
			timeZone: TZ,
			nowMs: 0
		});
		// 07:00 IST = 01:30 UTC; 15:00 IST = 09:30 UTC.
		expect(ics).toContain('DTSTART:20261026T013000Z');
		expect(ics).toContain('DTEND:20261026T093000Z');
	});

	it('carries an overnight shift into the next day', () => {
		const ics = buildIcs({
			staff,
			shifts: [makeShift({ id: 's1', date: MON, templateId: 'night', staffId: 'a' })],
			templates: TEMPLATES,
			businessName: 'Cafe',
			timeZone: TZ,
			nowMs: 0
		});
		// 22:00 IST Mon = 16:30Z Mon, 06:00 IST Tue = 00:30Z Tue.
		expect(ics).toContain('DTSTART:20261026T163000Z');
		expect(ics).toContain('DTEND:20261027T003000Z');
	});

	it('handles a daylight saving week in a DST zone', () => {
		const ics = buildIcs({
			staff,
			shifts: [makeShift({ id: 's1', date: '2026-03-28', templateId: 'night', staffId: 'a' })],
			templates: TEMPLATES,
			businessName: 'Cafe',
			timeZone: 'Europe/London',
			nowMs: 0
		});
		// 22:00 GMT = 22:00Z, 06:00 BST next day = 05:00Z.
		expect(ics).toContain('DTSTART:20260328T220000Z');
		expect(ics).toContain('DTEND:20260329T050000Z');
	});

	it('only includes the chosen person', () => {
		const ics = buildIcs({
			staff,
			shifts: [
				makeShift({ id: 's1', date: MON, staffId: 'a' }),
				makeShift({ id: 's2', date: TUE, staffId: 'b' })
			],
			templates: TEMPLATES,
			businessName: 'Cafe',
			timeZone: TZ,
			nowMs: 0
		});
		expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
	});

	it('escapes special characters', () => {
		expect(escapeIcsText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
		expect(escapeIcsText('line1\nline2')).toBe('line1\\nline2');
	});

	it('folds long lines at 75 octets', () => {
		const folded = foldLine(`SUMMARY:${'x'.repeat(200)}`);
		for (const line of folded.split('\r\n')) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}
		expect(folded.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true);
	});

	it('names the file per person and week', () => {
		expect(icsFileName('பிரியா சுந்தர்', '2026-W44')).toMatch(/^Shifts_.*_2026-W44\.ics$/);
		expect(icsFileName('Alice Brown', '2026-W44')).toBe('Shifts_AliceBrown_2026-W44.ics');
	});
});

describe('hours and cost', () => {
	const staff = [
		makeStaff({ id: 'a', name: 'Alice', minWeeklyHours: 32, maxWeeklyHours: 40, hourlyRate: 300 }),
		makeStaff({ id: 'b', name: 'Bala', minWeeklyHours: 16, maxWeeklyHours: 24, hourlyRate: 200 })
	];
	const rules = mergeRules(undefined);

	it('totals paid hours for a period', () => {
		const summary = hoursSummary(
			[
				makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's2', date: TUE, templateId: 'morning', staffId: 'a' })
			],
			staff,
			TEMPLATES,
			rules,
			TZ,
			MON,
			'2026-11-01'
		);
		const alice = summary.rows.find((r) => r.staffId === 'a');
		expect(alice?.hours).toBe(16);
		expect(alice?.shifts).toBe(2);
		expect(alice?.daysOff).toBe(5);
		expect(summary.totalHours).toBe(16);
	});

	it('ignores shifts outside the period', () => {
		const summary = hoursSummary(
			[makeShift({ id: 's1', date: '2026-11-05', templateId: 'morning', staffId: 'a' })],
			staff,
			TEMPLATES,
			rules,
			TZ,
			MON,
			'2026-11-01'
		);
		expect(summary.totalHours).toBe(0);
	});

	it('computes overtime above the weekly rule', () => {
		const shifts = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map(
			(date, i) => makeShift({ id: `s${i}`, date, templateId: 'morning', staffId: 'a' })
		);
		const summary = hoursSummary(shifts, staff, TEMPLATES, rules, TZ, MON, '2026-11-01');
		const alice = summary.rows.find((r) => r.staffId === 'a');
		// 56 scheduled hours against a 48 hour weekly rule = 8 hours overtime.
		expect(alice?.hours).toBe(56);
		expect(alice?.overtimeHours).toBe(8);
	});

	it('estimates cost with the overtime multiplier', () => {
		const shifts = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map(
			(date, i) => makeShift({ id: `s${i}`, date, templateId: 'morning', staffId: 'a' })
		);
		const summary = hoursSummary(shifts, staff, TEMPLATES, rules, TZ, MON, '2026-11-01', 1.5);
		const alice = summary.rows.find((r) => r.staffId === 'a');
		// 48 base hours x 300 + 8 overtime hours x 300 x 1.5 = 14400 + 3600 = 18000.
		expect(alice?.estimatedCost).toBe(18000);
	});

	it('leaves cost undefined without an hourly rate', () => {
		const noRate = [makeStaff({ id: 'c', name: 'Chandra' })];
		const summary = hoursSummary(
			[makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'c' })],
			noRate,
			TEMPLATES,
			rules,
			TZ,
			MON,
			'2026-11-01'
		);
		expect(summary.rows[0].estimatedCost).toBeUndefined();
		expect(summary.totalEstimatedCost).toBeUndefined();
	});

	it('counts night and weekend shifts', () => {
		const summary = hoursSummary(
			[
				makeShift({ id: 's1', date: '2026-10-31', templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's2', date: '2026-10-28', templateId: 'night', staffId: 'a' })
			],
			staff,
			TEMPLATES,
			rules,
			TZ,
			MON,
			'2026-11-01'
		);
		const alice = summary.rows.find((r) => r.staffId === 'a');
		expect(alice?.weekendShifts).toBe(1);
		expect(alice?.nightShifts).toBe(1);
	});

	it('describes where hours sit against the contracted range', () => {
		expect(contractState(10, 20, 40)).toBe('under');
		expect(contractState(30, 20, 40)).toBe('in-range');
		expect(contractState(39, 20, 40)).toBe('near-limit');
		expect(contractState(44, 20, 40)).toBe('over');
	});

	it('scores fairness', () => {
		expect(fairnessIndicator([])).toBe(100);
		const uneven = [
			{ staffId: 'a', name: 'A', roles: [], colour: '', hours: 48, minHours: 10, maxHours: 20, overtimeHours: 0, shifts: 6, weekendShifts: 3, nightShifts: 3, daysOff: 1, longestRun: 6 },
			{ staffId: 'b', name: 'B', roles: [], colour: '', hours: 4, minHours: 10, maxHours: 20, overtimeHours: 0, shifts: 1, weekendShifts: 0, nightShifts: 0, daysOff: 6, longestRun: 1 }
		];
		expect(fairnessIndicator(uneven)).toBeLessThan(40);
	});
});

describe('coverage view', () => {
	it('counts people on duty hour by hour', () => {
		const day = dayCoverage(
			MON,
			[
				makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's2', date: MON, templateId: 'morning', staffId: 'b' })
			],
			makeCoverage('morning', 'Barista', 2, [1]),
			TEMPLATES,
			BUSINESS
		);
		expect(day.buckets).toHaveLength(24);
		expect(day.buckets[8].scheduled).toBe(2); // 08:00 is inside 07:00-15:00
		expect(day.buckets[8].needed).toBe(2);
		expect(day.buckets[3].scheduled).toBe(0);
		expect(day.status).toBe('staffed');
	});

	it('an overnight shift counts in both civil days', () => {
		const monday = dayCoverage(
			MON,
			[makeShift({ id: 's1', date: MON, templateId: 'night', staffId: 'a' })],
			[],
			TEMPLATES,
			BUSINESS
		);
		const tuesday = dayCoverage(
			TUE,
			[makeShift({ id: 's1', date: MON, templateId: 'night', staffId: 'a' })],
			[],
			TEMPLATES,
			BUSINESS
		);
		expect(monday.buckets[23].scheduled).toBe(1);
		expect(tuesday.buckets[2].scheduled).toBe(1);
		expect(tuesday.buckets[8].scheduled).toBe(0);
	});

	it('reports understaffing and surplus', () => {
		const short = dayCoverage(
			MON,
			[makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' })],
			makeCoverage('morning', 'Barista', 3, [1]),
			TEMPLATES,
			BUSINESS
		);
		expect(short.worstShortfall).toBe(2);
		expect(short.status).toBe('understaffed');

		const over = dayCoverage(
			MON,
			[
				makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's2', date: MON, templateId: 'morning', staffId: 'b' })
			],
			makeCoverage('morning', 'Barista', 1, [1]),
			TEMPLATES,
			BUSINESS
		);
		expect(over.worstSurplus).toBe(1);
		expect(over.status).toBe('warnings');
	});

	it('marks a closed day and an empty day', () => {
		const closed = dayCoverage(MON, [], [], TEMPLATES, {
			...BUSINESS,
			closedDays: [{ id: 'c', date: MON, name: 'Holiday' }]
		});
		expect(closed.status).toBe('closed');
		expect(dayCoverage(MON, [], [], TEMPLATES, BUSINESS).status).toBe('empty');
	});

	it('an open slot makes a day understaffed', () => {
		const day = dayCoverage(
			MON,
			[makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: null })],
			[],
			TEMPLATES,
			BUSINESS
		);
		expect(day.openSlots).toBe(1);
		expect(day.status).toBe('understaffed');
	});

	it('summarises needed against scheduled for the day header strip', () => {
		const summary = dayCoverageSummary(
			MON,
			[makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' })],
			makeCoverage('morning', 'Barista', 2, [1]),
			TEMPLATES
		);
		expect(summary).toEqual({ needed: 2, scheduled: 1 });
	});
});

describe('swap validation', () => {
	const staff = [
		makeStaff({ id: 'a', name: 'Alice', roles: ['Barista'] }),
		makeStaff({ id: 'b', name: 'Bala', roles: ['Cashier'] }),
		makeStaff({ id: 'c', name: 'Chandra', roles: ['Barista'] })
	];

	function swap(partial: Partial<SwapRequest>): SwapRequest {
		return {
			id: 'sw1',
			createdAt: '2026-10-20T00:00:00Z',
			shiftId: 's1',
			fromStaffId: 'a',
			toStaffId: 'c',
			reason: 'Family function',
			status: 'Pending',
			...partial
		};
	}

	it('approves a clean swap', () => {
		const input = makeInput({
			staff,
			shifts: [makeShift({ id: 's1', date: MON, role: 'Barista', staffId: 'a' })]
		});
		const result = evaluateSwap(input, swap({}));
		expect(result.ok).toBe(true);
		expect(result.addedErrors).toHaveLength(0);
		expect(result.summary).toContain('clean');
	});

	it('rejects a swap that breaks the role rule', () => {
		const input = makeInput({
			staff,
			shifts: [makeShift({ id: 's1', date: MON, role: 'Barista', staffId: 'a' })]
		});
		const result = evaluateSwap(input, swap({ toStaffId: 'b' }));
		expect(result.ok).toBe(false);
		expect(result.addedErrors[0].message).toContain('Bala');
		expect(result.summary).toContain('would break');
	});

	it('applies a one-way move', () => {
		const shifts = [makeShift({ id: 's1', date: MON, staffId: 'a' })];
		expect(applySwap(shifts, swap({}))[0].staffId).toBe('c');
	});

	it('opens a slot when the target is null', () => {
		const shifts = [makeShift({ id: 's1', date: MON, staffId: 'a' })];
		expect(applySwap(shifts, swap({ toStaffId: null }))[0].staffId).toBeNull();
	});

	it('exchanges people in a two-way swap', () => {
		const shifts = [
			makeShift({ id: 's1', date: MON, staffId: 'a' }),
			makeShift({ id: 's2', date: TUE, staffId: 'c' })
		];
		const result = applySwap(shifts, swap({ withShiftId: 's2' }));
		expect(result[0].staffId).toBe('c');
		expect(result[1].staffId).toBe('a');
	});

	it('reports warnings without blocking', () => {
		const withPreference = [
			...staff.slice(0, 2),
			makeStaff({ id: 'c', name: 'Chandra', roles: ['Barista'], preferredDaysOff: [1] })
		];
		const input = makeInput({
			staff: withPreference,
			shifts: [makeShift({ id: 's1', date: MON, role: 'Barista', staffId: 'a' })]
		});
		const result = evaluateSwap(input, swap({}));
		expect(result.ok).toBe(true);
		expect(result.addedWarnings.length).toBeGreaterThan(0);
		expect(result.summary).toContain('warning');
	});

	it('notices when a swap resolves an existing issue', () => {
		const input = makeInput({
			staff,
			// Bala is on a Barista slot: an existing role error that the swap fixes.
			shifts: [makeShift({ id: 's1', date: MON, role: 'Barista', staffId: 'b' })]
		});
		const result = evaluateSwap(input, swap({ fromStaffId: 'b', toStaffId: 'c' }));
		expect(result.ok).toBe(true);
		expect(result.resolvedIssues.length).toBeGreaterThan(0);
		expect(result.summary).toContain('resolves');
	});
});
