import { describe, it, expect } from 'vitest';
import {
	buildSlots,
	fairnessRows,
	fairnessScore,
	generateRoster,
	mulberry32,
	rankReplacements,
	type GenerateOptions
} from './generator';
import { validate } from './validate';
import {
	ALL_DAY,
	BUSINESS,
	EVENING,
	MORNING,
	NIGHT,
	NOT_AVAILABLE,
	availability,
	makeCoverage,
	makeLeave,
	makeShift,
	makeStaff
} from './fixtures';
import { mergeRules } from './rules';

const MON = '2026-10-26';
const TEMPLATES = [MORNING, EVENING, NIGHT];

function baseOptions(partial: Partial<GenerateOptions> = {}): GenerateOptions {
	return {
		weekStart: MON,
		staff: [],
		templates: TEMPLATES,
		coverage: [],
		leave: [],
		rules: mergeRules(undefined),
		business: BUSINESS,
		previousWeek: [],
		existing: [],
		seed: 1,
		keepLocked: true,
		onlyEmpty: false,
		timeBudgetMs: 150,
		...partial
	};
}

/** A roster of N interchangeable baristas, enough to cover one morning slot a day. */
function cafeOptions(staffCount: number, partial: Partial<GenerateOptions> = {}) {
	const staff = Array.from({ length: staffCount }, (_, i) =>
		makeStaff({ id: `s${i + 1}`, name: `Person ${i + 1}`, roles: ['Barista'], maxWeeklyHours: 40 })
	);
	return baseOptions({
		staff,
		coverage: makeCoverage('morning', 'Barista', 1),
		...partial
	});
}

function hardErrors(result: ReturnType<typeof generateRoster>, opts: GenerateOptions) {
	return validate({
		shifts: result.shifts,
		staff: opts.staff,
		templates: opts.templates,
		coverage: opts.coverage,
		leave: opts.leave,
		rules: opts.rules,
		business: opts.business,
		previousWeek: opts.previousWeek,
		weekStart: opts.weekStart
	}).filter((i) => i.severity === 'Error' && i.type !== 'understaffed');
}

describe('seeded random', () => {
	it('is deterministic for a seed', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		expect([a(), a(), a()]).toEqual([b(), b(), b()]);
	});

	it('differs between seeds', () => {
		expect(mulberry32(1)()).not.toBe(mulberry32(2)());
	});
});

describe('slot building', () => {
	it('builds one slot per required person per day', () => {
		const slots = buildSlots(MON, makeCoverage('morning', 'Barista', 2), TEMPLATES, BUSINESS);
		expect(slots).toHaveLength(14); // 7 days x 2
	});

	it('skips closed days', () => {
		const slots = buildSlots(MON, makeCoverage('morning', 'Barista', 1), TEMPLATES, {
			...BUSINESS,
			closedDays: [{ id: 'c1', date: MON, name: 'Holiday' }]
		});
		expect(slots).toHaveLength(6);
		expect(slots.find((s) => s.date === MON)).toBeUndefined();
	});

	it('skips weekdays the template does not run', () => {
		const weekdayOnly = { ...MORNING, id: 'wd', days: [1, 2, 3, 4, 5] as const };
		const slots = buildSlots(
			MON,
			makeCoverage('wd', 'Barista', 1),
			[{ ...weekdayOnly, days: [1, 2, 3, 4, 5] }],
			BUSINESS
		);
		expect(slots).toHaveLength(5);
	});
});

describe('generator correctness', () => {
	it('fills every slot when there are plenty of people', () => {
		const opts = cafeOptions(8);
		const result = generateRoster(opts);
		expect(result.requiredSlots).toBe(7);
		expect(result.filledSlots).toBe(7);
		expect(result.fillRate).toBe(1);
		expect(result.unfilled).toHaveLength(0);
	});

	it('never creates a hard-rule violation', () => {
		const opts = cafeOptions(6);
		const result = generateRoster(opts);
		expect(hardErrors(result, opts)).toHaveLength(0);
	});

	it('is deterministic: the same seed gives the same roster', () => {
		const opts = cafeOptions(5, { seed: 777 });
		const a = generateRoster(opts);
		const b = generateRoster(cafeOptions(5, { seed: 777 }));
		expect(a.shifts.map((s) => `${s.date}:${s.staffId}`)).toEqual(
			b.shifts.map((s) => `${s.date}:${s.staffId}`)
		);
	});

	it('a different seed can give a different roster', () => {
		const a = generateRoster(cafeOptions(6, { seed: 1 }));
		const b = generateRoster(cafeOptions(6, { seed: 99 }));
		// With six interchangeable people the assignment should not be identical.
		const same =
			a.shifts.map((s) => s.staffId).join(',') === b.shifts.map((s) => s.staffId).join(',');
		expect(same).toBe(false);
	});

	it('respects approved leave', () => {
		const opts = cafeOptions(2, {
			leave: [makeLeave({ id: 'l1', staffId: 's1', startDate: MON, endDate: MON })]
		});
		const result = generateRoster(opts);
		const monday = result.shifts.find((s) => s.date === MON);
		expect(monday?.staffId).not.toBe('s1');
		expect(hardErrors(result, opts)).toHaveLength(0);
	});

	it('respects availability', () => {
		const staff = [
			makeStaff({
				id: 's1',
				name: 'Alice',
				availability: availability(
					ALL_DAY,
					NOT_AVAILABLE,
					ALL_DAY,
					ALL_DAY,
					ALL_DAY,
					ALL_DAY,
					ALL_DAY
				)
			}),
			makeStaff({ id: 's2', name: 'Bala' })
		];
		const opts = baseOptions({ staff, coverage: makeCoverage('morning', 'Barista', 1) });
		const result = generateRoster(opts);
		expect(result.shifts.find((s) => s.date === MON)?.staffId).toBe('s2');
	});

	it('respects roles', () => {
		const staff = [
			makeStaff({ id: 's1', name: 'Alice', roles: ['Cashier'] }),
			makeStaff({ id: 's2', name: 'Bala', roles: ['Cook'] })
		];
		const opts = baseOptions({ staff, coverage: makeCoverage('morning', 'Cook', 1) });
		const result = generateRoster(opts);
		expect(result.shifts.every((s) => s.staffId === null || s.staffId === 's2')).toBe(true);
	});

	it('explains unfilled slots in plain language', () => {
		const opts = baseOptions({
			staff: [makeStaff({ id: 's1', name: 'Meena', roles: ['Cashier'] })],
			coverage: makeCoverage('evening', 'Cashier', 2, [2])
		});
		const result = generateRoster(opts);
		expect(result.unfilled.length).toBeGreaterThan(0);
		expect(result.unfilled[0].reason).toContain('No available Cashier');
	});

	it('names the blocking reason when someone is on leave', () => {
		const opts = baseOptions({
			staff: [makeStaff({ id: 's1', name: 'Meena', roles: ['Cashier'] })],
			leave: [makeLeave({ id: 'l1', staffId: 's1', startDate: MON, endDate: MON })],
			coverage: makeCoverage('morning', 'Cashier', 1, [1])
		});
		const result = generateRoster(opts);
		expect(result.unfilled[0].reason).toContain('Meena is on paid leave');
	});

	it('reports an impossible problem clearly instead of a bad roster', () => {
		const opts = baseOptions({
			staff: [],
			coverage: makeCoverage('morning', 'Barista', 1)
		});
		const result = generateRoster(opts);
		expect(result.impossible).toBe(true);
		expect(result.impossibleReason).toContain('no active staff');
	});

	it('keeps locked shifts exactly where they are', () => {
		const existing = [
			makeShift({
				id: 'locked-1',
				date: MON,
				templateId: 'morning',
				role: 'Barista',
				staffId: 's3',
				locked: true
			})
		];
		const opts = cafeOptions(5, { existing, keepLocked: true });
		const result = generateRoster(opts);
		const kept = result.shifts.find((s) => s.id === 'locked-1');
		expect(kept).toBeDefined();
		expect(kept?.staffId).toBe('s3');
	});

	it('only fills empty slots when asked', () => {
		const existing = [
			makeShift({
				id: 'keep-1',
				date: MON,
				templateId: 'morning',
				role: 'Barista',
				staffId: 's4'
			})
		];
		const opts = cafeOptions(5, { existing, onlyEmpty: true });
		const result = generateRoster(opts);
		expect(result.shifts.find((s) => s.id === 'keep-1')?.staffId).toBe('s4');
	});

	it('does not schedule on a closed day', () => {
		const opts = cafeOptions(5, {
			business: { ...BUSINESS, closedDays: [{ id: 'c1', date: MON, name: 'Holiday' }] }
		});
		const result = generateRoster(opts);
		expect(result.shifts.some((s) => s.date === MON)).toBe(false);
	});

	it('honours the minimum rest rule across the week boundary', () => {
		const opts = baseOptions({
			staff: [makeStaff({ id: 's1', name: 'Alice' })],
			previousWeek: [
				makeShift({ id: 'p1', date: '2026-10-25', templateId: 'evening', staffId: 's1' })
			],
			coverage: makeCoverage('morning', 'Barista', 1, [1])
		});
		const result = generateRoster(opts);
		// Alice finished at 23:00 on Sunday, so a 07:00 Monday start is blocked.
		expect(result.shifts.find((s) => s.date === MON)?.staffId).toBeNull();
		expect(result.unfilled[0].reason).toContain('rest');
	});

	it('can be cancelled', () => {
		const opts = cafeOptions(5, { shouldCancel: () => true });
		const result = generateRoster(opts);
		expect(result.cancelled).toBe(true);
	});

	it('reports progress from 0 to 1', () => {
		const seen: number[] = [];
		generateRoster(cafeOptions(4, { onProgress: (f) => seen.push(f) }));
		expect(seen.length).toBeGreaterThan(0);
		expect(seen[seen.length - 1]).toBe(1);
	});

	it('stays within its time budget', () => {
		let fake = 0;
		const opts = cafeOptions(10, { timeBudgetMs: 100, nowMs: () => (fake += 5) });
		const result = generateRoster(opts);
		expect(result.elapsedMs).toBeLessThanOrEqual(400);
	});

	it('handles a week crossing a month boundary', () => {
		const opts = cafeOptions(6, { weekStart: '2026-10-26' });
		const result = generateRoster(opts);
		expect(result.shifts.some((s) => s.date === '2026-11-01')).toBe(true);
		expect(hardErrors(result, opts)).toHaveLength(0);
	});

	it('handles a week crossing a year boundary', () => {
		const opts = cafeOptions(6, { weekStart: '2026-12-28' });
		const result = generateRoster(opts);
		expect(result.shifts.some((s) => s.date === '2027-01-03')).toBe(true);
		expect(hardErrors(result, opts)).toHaveLength(0);
	});

	it('handles a daylight saving week without breaking rules', () => {
		const opts = cafeOptions(6, {
			weekStart: '2026-03-23',
			business: { ...BUSINESS, timeZone: 'Europe/London' }
		});
		const result = generateRoster(opts);
		expect(hardErrors(result, opts)).toHaveLength(0);
	});

	it('handles overnight shift coverage', () => {
		const staff = Array.from({ length: 5 }, (_, i) =>
			makeStaff({ id: `s${i + 1}`, name: `Cook ${i + 1}`, roles: ['Cook'] })
		);
		const opts = baseOptions({ staff, coverage: makeCoverage('night', 'Cook', 1) });
		const result = generateRoster(opts);
		expect(result.filledSlots).toBe(7);
		expect(hardErrors(result, opts)).toHaveLength(0);
	});

	it('does not freeze with 50 staff over a full week of coverage', () => {
		const staff = Array.from({ length: 50 }, (_, i) =>
			makeStaff({
				id: `s${i + 1}`,
				name: `Person ${i + 1}`,
				roles: ['Barista', 'Cashier', 'Cook'],
				maxWeeklyHours: 40
			})
		);
		const coverage = [
			...makeCoverage('morning', 'Barista', 3),
			...makeCoverage('morning', 'Cashier', 2),
			...makeCoverage('evening', 'Barista', 3),
			...makeCoverage('evening', 'Cook', 2),
			...makeCoverage('night', 'Cook', 1)
		];
		const started = Date.now();
		const opts = baseOptions({ staff, coverage, timeBudgetMs: 1000 });
		const result = generateRoster(opts);
		const elapsed = Date.now() - started;
		expect(elapsed).toBeLessThan(8000);
		expect(result.requiredSlots).toBe(7 * 3 + 7 * 2 + 7 * 3 + 7 * 2 + 7);
		expect(hardErrors(result, opts)).toHaveLength(0);
	});
});

describe('fairness', () => {
	it('summarises hours, weekends, nights and days off', () => {
		const rows = fairnessRows(
			[
				makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's2', date: '2026-10-31', templateId: 'night', staffId: 'a' })
			],
			[makeStaff({ id: 'a', name: 'Alice' })],
			TEMPLATES,
			MON,
			'Asia/Kolkata'
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].hours).toBe(16);
		expect(rows[0].weekendShifts).toBe(1);
		expect(rows[0].nightShifts).toBe(1);
		expect(rows[0].daysOff).toBe(5);
	});

	it('scores an even roster higher than a lopsided one', () => {
		const even = [
			{ staffId: 'a', name: 'A', hours: 30, minHours: 20, maxHours: 40, weekendShifts: 1, nightShifts: 1, daysOff: 3, longestRun: 3 },
			{ staffId: 'b', name: 'B', hours: 30, minHours: 20, maxHours: 40, weekendShifts: 1, nightShifts: 1, daysOff: 3, longestRun: 3 }
		];
		const lopsided = [
			{ staffId: 'a', name: 'A', hours: 48, minHours: 20, maxHours: 40, weekendShifts: 4, nightShifts: 4, daysOff: 0, longestRun: 7 },
			{ staffId: 'b', name: 'B', hours: 6, minHours: 20, maxHours: 40, weekendShifts: 0, nightShifts: 0, daysOff: 6, longestRun: 1 }
		];
		expect(fairnessScore(even)).toBeGreaterThan(fairnessScore(lopsided));
		expect(fairnessScore(even)).toBe(100);
	});

	it('the generator spreads hours between interchangeable people', () => {
		const opts = cafeOptions(4, {
			coverage: makeCoverage('morning', 'Barista', 1),
			timeBudgetMs: 400
		});
		const result = generateRoster(opts);
		const counts = new Map<string, number>();
		for (const s of result.shifts) {
			if (s.staffId) counts.set(s.staffId, (counts.get(s.staffId) ?? 0) + 1);
		}
		const values = [...counts.values()];
		// 7 shifts across 4 people: nobody should hold more than 3.
		expect(Math.max(...values)).toBeLessThanOrEqual(3);
	});
});

describe('replacement ranking for sick cover', () => {
	it('ranks eligible people before blocked ones', () => {
		const shift = makeShift({
			id: 'x1',
			date: MON,
			templateId: 'morning',
			role: 'Barista',
			staffId: 's1'
		});
		const staff = [
			makeStaff({ id: 's1', name: 'Sick person' }),
			makeStaff({ id: 's2', name: 'Free person' }),
			makeStaff({ id: 's3', name: 'Wrong role', roles: ['Cook'] })
		];
		const ranked = rankReplacements(shift, {
			...baseOptions({ staff, existing: [shift] }),
			staff,
			existing: [shift]
		});
		expect(ranked[0].staffId).toBe('s2');
		expect(ranked[0].blocked).toBeNull();
		const wrongRole = ranked.find((r) => r.staffId === 's3');
		expect(wrongRole?.blocked).toContain('not a Barista');
	});

	it('prefers a person with fewer warnings', () => {
		const shift = makeShift({
			id: 'x1',
			date: MON,
			templateId: 'morning',
			role: 'Barista',
			staffId: 's1'
		});
		const staff = [
			makeStaff({ id: 's1', name: 'Sick person' }),
			makeStaff({ id: 's2', name: 'Prefers Monday off', preferredDaysOff: [1] }),
			makeStaff({ id: 's3', name: 'Happy to work' })
		];
		const ranked = rankReplacements(shift, {
			...baseOptions({ staff, existing: [shift] }),
			staff,
			existing: [shift]
		});
		expect(ranked[0].staffId).toBe('s3');
	});
});
