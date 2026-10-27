// Regression tests for bugs found during end-to-end testing.

import { describe, it, expect } from 'vitest';
import { generateRoster, type GenerateOptions } from './generator';
import { validate } from './validate';
import { mergeRules } from './rules';
import { sampleData } from '../store/sample-data';
import { fixedClock, addDays, startOfWeek, todayIn } from './time';
import { makeStaff, makeTemplate, BUSINESS, makeCoverage } from './fixtures';

/**
 * Found by the end-to-end suite: generating the third sample week left a
 * "only 8.5 hours of rest" error. An overnight shift that ENDS on the morning of the
 * next day was not being compared against an evening shift starting later that day.
 */
describe('generator respects minimum rest against overnight shifts', () => {
	const NIGHT = makeTemplate({
		id: 'night',
		name: 'Night',
		startMin: 22 * 60,
		endMin: 6 * 60
	});
	const EVENING = makeTemplate({
		id: 'evening',
		name: 'Evening',
		startMin: 14 * 60 + 30,
		endMin: 22 * 60 + 30
	});

	function options(partial: Partial<GenerateOptions> = {}): GenerateOptions {
		return {
			weekStart: '2026-10-26',
			staff: [makeStaff({ id: 'solo', name: 'Solo Cook', roles: ['Cook'] })],
			templates: [NIGHT, EVENING],
			coverage: [],
			leave: [],
			rules: mergeRules(undefined),
			business: BUSINESS,
			previousWeek: [],
			existing: [],
			seed: 5,
			keepLocked: true,
			onlyEmpty: false,
			maxIterations: 200,
			timeBudgetMs: 1500,
			...partial
		};
	}

	function hardErrors(shifts: GenerateOptions['existing'], opts: GenerateOptions) {
		return validate({
			shifts,
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

	it('will not put a night shift before an evening shift the following day', () => {
		// A night on Monday ends 06:00 Tuesday; a Tuesday evening starts 14:30 - only
		// 8.5 hours of rest, so one of the two slots must be left open.
		const opts = options({
			coverage: [
				...makeCoverage('night', 'Cook', 1, [1]),
				...makeCoverage('evening', 'Cook', 1, [2])
			]
		});
		const result = generateRoster(opts);
		expect(hardErrors(result.shifts, opts)).toEqual([]);
		// Exactly one of the two can be filled by the single eligible cook.
		expect(result.filledSlots).toBe(1);
		expect(result.unfilled).toHaveLength(1);
		expect(result.unfilled[0].reason).toMatch(/rest/);
	});

	it('will not put an evening shift after a night shift started the day before', () => {
		// The mirror case: the evening slot is considered first.
		const opts = options({
			coverage: [
				...makeCoverage('evening', 'Cook', 1, [2]),
				...makeCoverage('night', 'Cook', 1, [1])
			],
			seed: 11
		});
		const result = generateRoster(opts);
		expect(hardErrors(result.shifts, opts)).toEqual([]);
	});

	it('leaves no hard-rule error in any of the three sample weeks', () => {
		const clock = fixedClock('2026-10-26T09:00:00Z');
		const data = sampleData(clock);
		for (const [weekStart, roster] of Object.entries(data.rosters)) {
			const issues = validate({
				shifts: roster.shifts,
				staff: data.staff,
				templates: data.templates,
				coverage: data.coverage,
				leave: data.leave,
				rules: data.rules,
				business: data.business,
				previousWeek: data.rosters[addDays(weekStart, -7)]?.shifts ?? [],
				weekStart
			}).filter((i) => i.severity === 'Error' && i.type !== 'understaffed');
			expect({ weekStart, issues: issues.map((i) => i.message) }).toEqual({
				weekStart,
				issues: []
			});
		}
	});

	/**
	 * Found by the end-to-end suite: with only a few eligible staff the results panel
	 * crashed with `each_key_duplicate`, because several unfilled slots shared the same
	 * date, template and role, and generated shift ids collided for repeated slots.
	 */
	it('gives every generated shift a unique id, including repeated open slots', () => {
		const opts = options({
			staff: [
				makeStaff({ id: 'a', name: 'A', roles: ['Cook'] }),
				makeStaff({ id: 'b', name: 'B', roles: ['Cook'] })
			],
			// Four cooks needed every day, but only two exist: many duplicate open slots.
			coverage: makeCoverage('evening', 'Cook', 4),
			seed: 23
		});
		const result = generateRoster(opts);
		const ids = result.shifts.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(result.unfilled.length).toBeGreaterThan(5);
		// The duplicate-key crash came from these three fields not being unique.
		const composite = result.unfilled.map((u) => `${u.date}|${u.templateId}|${u.role}`);
		expect(new Set(composite).size).toBeLessThan(composite.length);
	});

	it('generated ids stay unique with a mixture of filled and open slots', () => {
		const clock = fixedClock('2026-10-26T09:00:00Z');
		const data = sampleData(clock);
		const first = startOfWeek(todayIn(data.business.timeZone, clock), 1);
		const result = generateRoster({
			weekStart: addDays(first, 21),
			// Only three active people against the full cafe coverage.
			staff: data.staff.map((s, i) => ({ ...s, active: i < 3 })),
			templates: data.templates,
			coverage: data.coverage,
			leave: data.leave,
			rules: data.rules,
			business: data.business,
			previousWeek: [],
			existing: [],
			seed: 31,
			keepLocked: true,
			onlyEmpty: false,
			maxIterations: 150,
			timeBudgetMs: 2000
		});
		const ids = result.shifts.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		// Every unfilled slot still carries a usable plain-language reason.
		for (const slot of result.unfilled) {
			expect(slot.reason).toMatch(/No available/);
		}
	}, 20_000);

	it('the sample draft week carries warnings but no errors', () => {
		const clock = fixedClock('2026-10-26T09:00:00Z');
		const data = sampleData(clock);
		const weeks = Object.keys(data.rosters).sort();
		const draftWeek = weeks[weeks.length - 1];
		const issues = validate({
			shifts: data.rosters[draftWeek].shifts,
			staff: data.staff,
			templates: data.templates,
			coverage: data.coverage,
			leave: data.leave,
			rules: data.rules,
			business: data.business,
			previousWeek: data.rosters[addDays(draftWeek, -7)]?.shifts ?? [],
			weekStart: draftWeek
		});
		const errors = issues.filter((i) => i.severity === 'Error' && i.type !== 'understaffed');
		expect(errors.map((e) => e.message)).toEqual([]);
		// The two deliberate warnings the brief asks for are present.
		const warnings = issues.filter((i) => i.severity === 'Warning');
		expect(warnings.length).toBeGreaterThanOrEqual(2);
		expect(warnings.some((w) => w.type === 'preferred-days-off')).toBe(true);
		expect(warnings.some((w) => w.type === 'contracted-hours')).toBe(true);
	});

	it('no two sample templates overlap on the same day', () => {
		// Guards the staging bug: Evening 14:30-22:30 and Night 22:00-06:00 overlap by
		// 30 minutes, so they can never be given to one person on the same date.
		const data = sampleData(fixedClock('2026-10-26T09:00:00Z'));
		const evening = data.templates.find((t) => t.id === 'tpl-evening');
		const night = data.templates.find((t) => t.id === 'tpl-night');
		expect(evening && night).toBeTruthy();
		if (evening && night) {
			// They do overlap, which is exactly why nothing may schedule both together.
			expect(night.startMin).toBeLessThan(evening.endMin);
			for (const roster of Object.values(data.rosters)) {
				for (const shift of roster.shifts) {
					if (!shift.staffId || shift.templateId !== 'tpl-night') continue;
					const clash = roster.shifts.find(
						(s) =>
							s.staffId === shift.staffId &&
							s.date === shift.date &&
							s.templateId === 'tpl-evening'
					);
					expect(clash).toBeUndefined();
				}
			}
		}
	});

	// Four full generator runs over the 14-staff sample: deliberately slower than the
	// 5 s vitest default, so it gets its own timeout.
	it('leaves no hard-rule error when generating several weeks in a row', () => {
		const clock = fixedClock('2026-10-26T09:00:00Z');
		const data = sampleData(clock);
		const first = startOfWeek(todayIn(data.business.timeZone, clock), 1);
		let previous = data.rosters[first]?.shifts ?? [];

		for (let i = 1; i <= 4; i++) {
			const weekStart = addDays(first, 7 * i);
			const opts: GenerateOptions = {
				weekStart,
				staff: data.staff,
				templates: data.templates,
				coverage: data.coverage,
				leave: data.leave,
				rules: data.rules,
				business: data.business,
				previousWeek: previous,
				existing: [],
				seed: 400 + i,
				keepLocked: true,
				onlyEmpty: false,
				maxIterations: 200,
				timeBudgetMs: 2000
			};
			const result = generateRoster(opts);
			const errors = validate({
				shifts: result.shifts,
				staff: data.staff,
				templates: data.templates,
				coverage: data.coverage,
				leave: data.leave,
				rules: data.rules,
				business: data.business,
				previousWeek: previous,
				weekStart
			}).filter((e) => e.severity === 'Error' && e.type !== 'understaffed');
			expect({ week: i, errors: errors.map((e) => e.message) }).toEqual({ week: i, errors: [] });
			previous = result.shifts;
		}
	}, 30_000);
});
