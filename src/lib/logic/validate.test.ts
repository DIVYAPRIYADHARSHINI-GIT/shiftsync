import { describe, it, expect } from 'vitest';
import { checkAssignment, coverageIssues, sortIssues, validate } from './validate';
import {
	ALL_DAY,
	BUSINESS,
	EVENING,
	MORNING,
	NIGHT,
	NOT_AVAILABLE,
	availability,
	between,
	makeCoverage,
	makeInput,
	makeLeave,
	makeShift,
	makeStaff
} from './fixtures';
import { mergeRules } from './rules';
import { weekDates } from './time';

const MON = '2026-10-26';
const TUE = '2026-10-27';
const SAT = '2026-10-31';
const SUN = '2026-11-01';

function issueTypes(input: Parameters<typeof validate>[0]) {
	return validate(input).map((i) => i.type);
}

describe('hard rule: no overlapping shifts', () => {
	it('flags two shifts at the same time for one person', () => {
		const alice = makeStaff({ id: 'a', name: 'Alice' });
		const input = makeInput({
			staff: [alice],
			shifts: [
				makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's2', date: MON, templateId: 'morning', staffId: 'a' })
			]
		});
		const issues = validate(input).filter((i) => i.type === 'no-overlap');
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe('Error');
		expect(issues[0].message).toContain('Alice');
	});

	it('does not flag back-to-back shifts that only touch', () => {
		const alice = makeStaff({ id: 'a', name: 'Alice' });
		const input = makeInput({
			staff: [alice],
			rules: mergeRules(undefined).map((r) =>
				r.id === 'min-rest' || r.id === 'clopening' || r.id === 'split-shift'
					? { ...r, enabled: false }
					: r
			),
			shifts: [
				makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's2', date: MON, templateId: 'evening', staffId: 'a' })
			]
		});
		expect(issueTypes(input)).not.toContain('no-overlap');
	});

	it('detects an overnight shift overlapping the next morning', () => {
		const alice = makeStaff({ id: 'a', name: 'Alice' });
		const earlyStart = { ...MORNING, id: 'early', startMin: 5 * 60, endMin: 13 * 60 };
		const input = makeInput({
			templates: [MORNING, EVENING, NIGHT, earlyStart],
			staff: [alice],
			shifts: [
				makeShift({ id: 's1', date: MON, templateId: 'night', staffId: 'a' }),
				makeShift({ id: 's2', date: TUE, templateId: 'early', staffId: 'a' })
			]
		});
		const issues = validate(input).filter((i) => i.type === 'no-overlap');
		expect(issues).toHaveLength(1);
	});
});

describe('hard rule: required role', () => {
	it('flags a person who does not hold the role', () => {
		const alice = makeStaff({ id: 'a', name: 'Alice', roles: ['Cashier'] });
		const input = makeInput({
			staff: [alice],
			shifts: [makeShift({ id: 's1', date: MON, role: 'Cook', staffId: 'a' })]
		});
		const issues = validate(input).filter((i) => i.type === 'role-match');
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('Cook');
		expect(issues[0].suggestedFix).toContain('Cook');
	});

	it('accepts a person holding one of several roles', () => {
		const alice = makeStaff({ id: 'a', name: 'Alice', roles: ['Cashier', 'Cook'] });
		const input = makeInput({
			staff: [alice],
			shifts: [makeShift({ id: 's1', date: MON, role: 'Cook', staffId: 'a' })]
		});
		expect(issueTypes(input)).not.toContain('role-match');
	});
});

describe('hard rule: approved leave', () => {
	it('blocks a shift on approved leave', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			leave: [makeLeave({ id: 'l1', staffId: 'a', startDate: MON, endDate: TUE })],
			shifts: [makeShift({ id: 's1', date: TUE, staffId: 'a' })]
		});
		const issues = validate(input).filter((i) => i.type === 'not-on-leave');
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe('Error');
	});

	it('pending leave is a warning, not an error', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			leave: [makeLeave({ id: 'l1', staffId: 'a', status: 'Pending', startDate: MON, endDate: MON })],
			shifts: [makeShift({ id: 's1', date: MON, staffId: 'a' })]
		});
		const issues = validate(input);
		expect(issues.filter((i) => i.type === 'not-on-leave')).toHaveLength(0);
		const pending = issues.filter((i) => i.type === 'pending-leave');
		expect(pending).toHaveLength(1);
		expect(pending[0].severity).toBe('Warning');
	});

	it('declined leave does not block anything', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			leave: [makeLeave({ id: 'l1', staffId: 'a', status: 'Declined' })],
			shifts: [makeShift({ id: 's1', date: MON, staffId: 'a' })]
		});
		const types = issueTypes(input);
		expect(types).not.toContain('not-on-leave');
		expect(types).not.toContain('pending-leave');
	});
});

describe('hard rule: availability', () => {
	it('blocks a day marked not available', () => {
		const alice = makeStaff({
			id: 'a',
			name: 'Alice',
			// Monday (index 1) unavailable
			availability: availability(ALL_DAY, NOT_AVAILABLE, ALL_DAY, ALL_DAY, ALL_DAY, ALL_DAY, ALL_DAY)
		});
		const input = makeInput({
			staff: [alice],
			shifts: [makeShift({ id: 's1', date: MON, staffId: 'a' })]
		});
		expect(validate(input).filter((i) => i.type === 'availability')).toHaveLength(1);
	});

	it('blocks a shift outside an availability window', () => {
		const alice = makeStaff({
			id: 'a',
			name: 'Alice',
			availability: availability(between(6 * 60, 12 * 60))
		});
		const input = makeInput({
			staff: [alice],
			shifts: [makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' })]
		});
		const issues = validate(input).filter((i) => i.type === 'availability');
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('06:00-12:00');
	});

	it('accepts a shift inside the window', () => {
		const alice = makeStaff({
			id: 'a',
			name: 'Alice',
			availability: availability(between(6 * 60, 16 * 60))
		});
		const input = makeInput({
			staff: [alice],
			shifts: [makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' })]
		});
		expect(issueTypes(input)).not.toContain('availability');
	});

	it('an overnight shift must fit both the start day and the next day window', () => {
		const alice = makeStaff({
			id: 'a',
			name: 'Alice',
			// Monday open all day, Tuesday closes at 03:00 so a 06:00 finish does not fit.
			availability: availability(
				ALL_DAY,
				ALL_DAY,
				between(0, 3 * 60),
				ALL_DAY,
				ALL_DAY,
				ALL_DAY,
				ALL_DAY
			)
		});
		const input = makeInput({
			staff: [alice],
			shifts: [makeShift({ id: 's1', date: MON, templateId: 'night', staffId: 'a' })]
		});
		expect(validate(input).filter((i) => i.type === 'availability')).toHaveLength(1);
	});

	it('blocks a specific unavailable date', () => {
		const alice = makeStaff({ id: 'a', name: 'Alice', unavailableDates: [TUE] });
		const input = makeInput({
			staff: [alice],
			shifts: [makeShift({ id: 's1', date: TUE, staffId: 'a' })]
		});
		expect(validate(input).filter((i) => i.type === 'availability')).toHaveLength(1);
	});

	it('flags a deactivated person who still has a shift', () => {
		const alice = makeStaff({ id: 'a', name: 'Alice', active: false });
		const input = makeInput({
			staff: [alice],
			shifts: [makeShift({ id: 's1', date: MON, staffId: 'a' })]
		});
		const issues = validate(input).filter((i) => i.message.includes('deactivated'));
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe('Error');
	});
});

describe('hard rule: hour limits', () => {
	it('flags more than the daily maximum', () => {
		const long = { ...MORNING, id: 'long', startMin: 6 * 60, endMin: 20 * 60 };
		const input = makeInput({
			templates: [long],
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			shifts: [makeShift({ id: 's1', date: MON, templateId: 'long', staffId: 'a' })]
		});
		const issues = validate(input).filter((i) => i.type === 'max-hours-day');
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('14');
	});

	it('an overnight shift counts its hours on the day it starts', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			rules: mergeRules(undefined).map((r) =>
				r.id === 'max-hours-day' ? { ...r, value: 7 } : r
			),
			shifts: [makeShift({ id: 's1', date: MON, templateId: 'night', staffId: 'a' })]
		});
		const issues = validate(input).filter((i) => i.type === 'max-hours-day');
		expect(issues).toHaveLength(1);
		// The 8 hour night shift is attributed to Monday, the day it starts.
		expect(issues[0].date).toBe(MON);
	});

	it('flags more than the weekly maximum', () => {
		const dates = weekDates(MON);
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice', maxWeeklyHours: 60 })],
			rules: mergeRules(undefined).map((r) =>
				r.id === 'min-rest' || r.id === 'max-consecutive-days' || r.id === 'clopening'
					? { ...r, enabled: false }
					: r
			),
			shifts: dates.map((date, i) =>
				makeShift({ id: `s${i}`, date, templateId: 'morning', staffId: 'a' })
			)
		});
		// 7 days x 8 hours = 56 hours, above the 48 hour default.
		const issues = validate(input).filter((i) => i.type === 'max-hours-week');
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('56');
	});

	it('stays silent exactly at the weekly limit', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			rules: mergeRules(undefined).map((r) =>
				r.id === 'max-hours-week' ? { ...r, value: 8 } : r
			),
			shifts: [makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' })]
		});
		expect(issueTypes(input)).not.toContain('max-hours-week');
	});
});

describe('hard rule: minimum rest', () => {
	it('flags less than 11 hours between shifts', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			shifts: [
				makeShift({ id: 's1', date: MON, templateId: 'evening', staffId: 'a' }), // ends 23:00
				makeShift({ id: 's2', date: TUE, templateId: 'morning', staffId: 'a' }) // starts 07:00
			]
		});
		const issues = validate(input).filter((i) => i.type === 'min-rest');
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('8 hours of rest');
	});

	it('looks back into the previous week across the boundary', () => {
		const prevSunday = '2026-10-25';
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			previousWeek: [
				makeShift({ id: 'p1', date: prevSunday, templateId: 'evening', staffId: 'a' })
			],
			shifts: [makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' })]
		});
		const issues = validate(input).filter((i) => i.type === 'min-rest');
		expect(issues).toHaveLength(1);
		expect(issues[0].date).toBe(MON);
	});

	it('accepts a long enough gap', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			shifts: [
				makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' }), // ends 15:00
				makeShift({ id: 's2', date: TUE, templateId: 'morning', staffId: 'a' }) // starts 07:00, 16h gap
			]
		});
		expect(issueTypes(input)).not.toContain('min-rest');
	});
});

describe('hard rule: consecutive working days', () => {
	it('flags a run longer than the limit, counting the previous week', () => {
		const prev = ['2026-10-23', '2026-10-24', '2026-10-25'];
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			previousWeek: prev.map((date, i) =>
				makeShift({ id: `p${i}`, date, templateId: 'morning', staffId: 'a' })
			),
			shifts: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map((date, i) =>
				makeShift({ id: `s${i}`, date, templateId: 'morning', staffId: 'a' })
			)
		});
		const issues = validate(input).filter((i) => i.type === 'max-consecutive-days');
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('7 days in a row');
	});

	it('a day off resets the run', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			rules: mergeRules(undefined).map((r) =>
				r.id === 'max-hours-week' ? { ...r, enabled: false } : r
			),
			shifts: ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30'].map((date, i) =>
				makeShift({ id: `s${i}`, date, templateId: 'morning', staffId: 'a' })
			)
		});
		expect(issueTypes(input)).not.toContain('max-consecutive-days');
	});
});

describe('hard rule: closed days', () => {
	it('flags a shift on a one-off closed day', () => {
		const input = makeInput({
			business: {
				...BUSINESS,
				closedDays: [{ id: 'c1', date: TUE, name: 'Stocktake' }]
			},
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			shifts: [makeShift({ id: 's1', date: TUE, staffId: 'a' })]
		});
		const issues = validate(input).filter((i) => i.type === 'closed-day');
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('Stocktake');
	});

	it('flags a recurring annual holiday', () => {
		const input = makeInput({
			weekStart: '2026-12-21',
			business: {
				...BUSINESS,
				closedDays: [{ id: 'c1', recurringMonthDay: '12-25', name: 'Christmas Day' }]
			},
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			shifts: [makeShift({ id: 's1', date: '2026-12-25', staffId: 'a' })]
		});
		expect(validate(input).filter((i) => i.type === 'closed-day')).toHaveLength(1);
	});

	it('the manager override clears the closed-day error', () => {
		const input = makeInput({
			business: { ...BUSINESS, closedDays: [{ id: 'c1', date: TUE, name: 'Stocktake' }] },
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			shifts: [makeShift({ id: 's1', date: TUE, staffId: 'a', closedDayOverride: true })]
		});
		expect(issueTypes(input)).not.toContain('closed-day');
	});
});

describe('soft rules', () => {
	it('warns about a preferred day off', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice', preferredDaysOff: [1] })],
			shifts: [makeShift({ id: 's1', date: MON, staffId: 'a' })]
		});
		const issues = validate(input).filter((i) => i.type === 'preferred-days-off');
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe('Warning');
		expect(issues[0].message).toContain('Monday');
	});

	it('warns when hours fall below the contracted minimum', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice', minWeeklyHours: 20 })],
			shifts: [makeShift({ id: 's1', date: MON, staffId: 'a' })]
		});
		const issues = validate(input).filter((i) => i.type === 'contracted-hours');
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('below their contracted minimum');
	});

	it('warns when hours exceed the contracted maximum', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice', maxWeeklyHours: 10 })],
			rules: mergeRules(undefined).map((r) =>
				r.id === 'min-rest' || r.id === 'clopening' ? { ...r, enabled: false } : r
			),
			shifts: [
				makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's2', date: TUE, templateId: 'morning', staffId: 'a' })
			]
		});
		const issues = validate(input).filter((i) => i.type === 'contracted-hours');
		expect(issues[0].message).toContain('above their contracted maximum');
	});

	it('warns about a split shift', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			rules: mergeRules(undefined).map((r) =>
				r.id === 'min-rest' ? { ...r, enabled: false } : r
			),
			shifts: [
				makeShift({ id: 's1', date: MON, templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's2', date: MON, templateId: 'evening', staffId: 'a' })
			]
		});
		const issues = validate(input).filter((i) => i.type === 'split-shift');
		expect(issues).toHaveLength(1);
	});

	it('warns about clopening when rest is legal but short', () => {
		const lateClose = { ...EVENING, id: 'late', startMin: 14 * 60, endMin: 20 * 60 };
		const earlyOpen = { ...MORNING, id: 'early', startMin: 7 * 60, endMin: 13 * 60 };
		const input = makeInput({
			templates: [lateClose, earlyOpen],
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			shifts: [
				makeShift({ id: 's1', date: MON, templateId: 'late', staffId: 'a' }), // ends 20:00
				makeShift({ id: 's2', date: TUE, templateId: 'early', staffId: 'a' }) // starts 07:00 = 11h gap
			]
		});
		const issues = validate(input);
		expect(issues.filter((i) => i.type === 'min-rest')).toHaveLength(0);
		expect(issues.filter((i) => i.type === 'clopening')).toHaveLength(1);
	});

	it('warns when hours are uneven within a role', () => {
		const dates = weekDates(MON);
		const input = makeInput({
			staff: [
				makeStaff({ id: 'a', name: 'Alice', maxWeeklyHours: 60 }),
				makeStaff({ id: 'b', name: 'Bala', maxWeeklyHours: 60 })
			],
			rules: mergeRules(undefined).map((r) =>
				['min-rest', 'max-consecutive-days', 'max-hours-week', 'clopening'].includes(r.id)
					? { ...r, enabled: false }
					: r
			),
			shifts: dates
				.slice(0, 5)
				.map((date, i) => makeShift({ id: `s${i}`, date, templateId: 'morning', staffId: 'a' }))
		});
		const issues = validate(input).filter((i) => i.type === 'balance-hours');
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('Alice');
		expect(issues[0].suggestedFix).toContain('Bala');
	});

	it('warns when weekend shifts are not rotated', () => {
		const input = makeInput({
			staff: [
				makeStaff({ id: 'a', name: 'Alice' }),
				makeStaff({ id: 'b', name: 'Bala' })
			],
			rules: mergeRules(undefined).map((r) =>
				['balance-hours', 'min-rest', 'clopening'].includes(r.id) ? { ...r, enabled: false } : r
			),
			shifts: [
				makeShift({ id: 's1', date: SAT, templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's2', date: SUN, templateId: 'morning', staffId: 'a' }),
				makeShift({ id: 's3', date: SAT, templateId: 'evening', staffId: 'a' })
			]
		});
		const issues = validate(input).filter((i) => i.type === 'rotate-unsocial');
		expect(issues.some((i) => i.message.includes('Weekend'))).toBe(true);
	});
});

describe('rule switches', () => {
	it('a disabled rule produces no issues', () => {
		const rules = mergeRules(undefined).map((r) =>
			r.id === 'role-match' ? { ...r, enabled: false } : r
		);
		const input = makeInput({
			rules,
			staff: [makeStaff({ id: 'a', name: 'Alice', roles: ['Cashier'] })],
			shifts: [makeShift({ id: 's1', date: MON, role: 'Cook', staffId: 'a' })]
		});
		expect(issueTypes(input)).not.toContain('role-match');
	});

	it('an edited rule value changes the threshold', () => {
		const rules = mergeRules(undefined).map((r) => (r.id === 'min-rest' ? { ...r, value: 6 } : r));
		const input = makeInput({
			rules,
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			shifts: [
				makeShift({ id: 's1', date: MON, templateId: 'evening', staffId: 'a' }),
				makeShift({ id: 's2', date: TUE, templateId: 'morning', staffId: 'a' })
			]
		});
		// 8 hours of rest now passes a 6 hour rule.
		expect(issueTypes(input)).not.toContain('min-rest');
	});
});

describe('coverage and open slots', () => {
	it('reports an unfilled slot as a warning', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			shifts: [makeShift({ id: 's1', date: MON, staffId: null })]
		});
		const issues = validate(input).filter((i) => i.type === 'open-slot');
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe('Warning');
	});

	it('reports understaffing against the coverage minimum', () => {
		const issues = coverageIssues(
			[],
			makeCoverage('morning', 'Barista', 2, [1]),
			[MORNING],
			[MON],
			BUSINESS
		);
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('0 of 2 Barista');
		expect(issues[0].severity).toBe('Error');
	});

	it('does not require coverage on a closed day', () => {
		const issues = coverageIssues(
			[],
			makeCoverage('morning', 'Barista', 2, [1]),
			[MORNING],
			[MON],
			{ ...BUSINESS, closedDays: [{ id: 'c1', date: MON, name: 'Holiday' }] }
		);
		expect(issues).toHaveLength(0);
	});

	it('is satisfied when the minimum is met', () => {
		const issues = coverageIssues(
			[
				makeShift({ id: 's1', date: MON, staffId: 'a' }),
				makeShift({ id: 's2', date: MON, staffId: 'b' })
			],
			makeCoverage('morning', 'Barista', 2, [1]),
			[MORNING],
			[MON],
			BUSINESS
		);
		expect(issues).toHaveLength(0);
	});
});

describe('checkAssignment for drag and drop', () => {
	it('rejects a drop that breaks a hard rule and gives the reason', () => {
		const input = makeInput({
			staff: [
				makeStaff({ id: 'a', name: 'Alice', roles: ['Barista'] }),
				makeStaff({ id: 'b', name: 'Bala', roles: ['Cashier'] })
			],
			shifts: [makeShift({ id: 's1', date: MON, role: 'Barista', staffId: null })]
		});
		const result = checkAssignment(input, 's1', 'b');
		expect(result.ok).toBe(false);
		expect(result.reason).toContain('Bala');
		expect(result.reason).toContain('Barista');
	});

	it('accepts a clean drop', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice' })],
			shifts: [makeShift({ id: 's1', date: MON, role: 'Barista', staffId: null })]
		});
		const result = checkAssignment(input, 's1', 'a');
		expect(result.ok).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it('allows a drop with warnings and reports them', () => {
		const input = makeInput({
			staff: [makeStaff({ id: 'a', name: 'Alice', preferredDaysOff: [1] })],
			shifts: [makeShift({ id: 's1', date: MON, role: 'Barista', staffId: null })]
		});
		const result = checkAssignment(input, 's1', 'a');
		expect(result.ok).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});
});

describe('issue sorting', () => {
	it('puts errors before warnings, then orders by date', () => {
		const sorted = sortIssues([
			{ type: 'open-slot', severity: 'Warning', message: 'b', suggestedFix: '', date: TUE },
			{ type: 'role-match', severity: 'Error', message: 'a', suggestedFix: '', date: SAT },
			{ type: 'min-rest', severity: 'Error', message: 'c', suggestedFix: '', date: MON }
		]);
		expect(sorted.map((i) => i.message)).toEqual(['c', 'a', 'b']);
	});
});
