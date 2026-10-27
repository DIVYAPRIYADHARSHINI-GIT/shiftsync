// The single pure validation function used by the editor, the generator, swap approval
// and every report. No UI imports, no clock, no storage - same input, same output.
//
//   validate({ shifts, staff, templates, coverage, leave, rules, business,
//              previousWeek, weekStart }) -> Issue[]
//
// Every issue carries a type, severity, person, shift, date, a clear message and a
// suggested fix, so the issues panel and the generator can both use it directly.

import type {
	CoverageNeed,
	DateStr,
	Issue,
	Leave,
	Rule,
	Shift,
	ShiftTemplate,
	Staff,
	ValidationInput,
	Weekday
} from '../types';
import {
	addDays,
	dateInRange,
	dateToUtc,
	formatDate,
	formatTime,
	paidMin,
	toHours,
	weekDates,
	weekdayName,
	weekdayOf,
	zonedInstant
} from './time';
import { isEnabled, ruleValue } from './rules';

/** A shift with its template and resolved instants, used throughout the checks. */
export interface ResolvedShift {
	shift: Shift;
	template: ShiftTemplate;
	/** Epoch ms of the shift start in the business time zone. */
	startMs: number;
	endMs: number;
	paidMinutes: number;
	/** True when the shift ends on the civil day after it starts. */
	overnight: boolean;
}

export function resolveShift(
	shift: Shift,
	templates: ShiftTemplate[],
	timeZone: string
): ResolvedShift | null {
	const template = templates.find((t) => t.id === shift.templateId);
	if (!template) return null;
	const overnight = template.endMin <= template.startMin;
	const startMs = zonedInstant(shift.date, template.startMin, timeZone);
	const endMs = zonedInstant(
		overnight ? addDays(shift.date, 1) : shift.date,
		template.endMin,
		timeZone
	);
	return {
		shift,
		template,
		startMs,
		endMs,
		overnight,
		paidMinutes: paidMin(
			shift.date,
			template.startMin,
			template.endMin,
			template.unpaidBreakMin,
			timeZone
		)
	};
}

export function resolveAll(
	shifts: Shift[],
	templates: ShiftTemplate[],
	timeZone: string
): ResolvedShift[] {
	const out: ResolvedShift[] = [];
	for (const s of shifts) {
		const r = resolveShift(s, templates, timeZone);
		if (r) out.push(r);
	}
	return out;
}

/** Shift label used in messages, e.g. 'Morning 09:00-17:00'. */
export function shiftLabel(template: ShiftTemplate): string {
	return `${template.name} ${formatTime(template.startMin)}-${formatTime(template.endMin)}`;
}

function staffName(staff: Staff[], id: string | null | undefined): string {
	if (!id) return 'Open slot';
	return staff.find((s) => s.id === id)?.name ?? 'Unknown person';
}

// ---------------------------------------------------------------------------
// Shared predicates - also used by the generator for eligibility
// ---------------------------------------------------------------------------

/** Approved leave covering a date. */
export function approvedLeaveOn(leave: Leave[], staffId: string, date: DateStr): Leave | undefined {
	return leave.find(
		(l) =>
			l.staffId === staffId &&
			l.status === 'Approved' &&
			dateInRange(date, l.startDate, l.endDate)
	);
}

export function pendingLeaveOn(leave: Leave[], staffId: string, date: DateStr): Leave | undefined {
	return leave.find(
		(l) =>
			l.staffId === staffId && l.status === 'Pending' && dateInRange(date, l.startDate, l.endDate)
	);
}

/** Closed-day rule (one-off dates and recurring MM-DD rules). */
export function closedDayFor(
	business: ValidationInput['business'],
	date: DateStr
): { name: string } | undefined {
	const monthDay = date.slice(5);
	return business.closedDays.find((c) => c.date === date || c.recurringMonthDay === monthDay);
}

/**
 * Does the template fit inside the person's weekly availability for this date?
 * A midnight-crossing shift must fit the start day's window up to midnight and the next
 * day's window from midnight, which is the behaviour a manager expects for a night shift.
 */
export function availabilityFits(
	person: Staff,
	template: ShiftTemplate,
	date: DateStr
): { ok: true } | { ok: false; reason: string } {
	if (person.unavailableDates.includes(date)) {
		return { ok: false, reason: `${person.name} marked ${formatDate(date)} as unavailable` };
	}
	const overnight = template.endMin <= template.startMin;
	const wd = weekdayOf(date);
	const day = person.availability[wd];
	const dayName = weekdayName(wd);

	const fitsWindow = (
		avail: (typeof person.availability)[number],
		from: number,
		to: number,
		label: string
	): { ok: true } | { ok: false; reason: string } => {
		if (avail.kind === 'all-day') return { ok: true };
		if (avail.kind === 'unavailable') {
			return { ok: false, reason: `${person.name} is not available on ${label}` };
		}
		const f = avail.fromMin ?? 0;
		const t = avail.toMin ?? 1440;
		if (from >= f && to <= t) return { ok: true };
		return {
			ok: false,
			reason: `${person.name} is only available ${formatTime(f)}-${formatTime(t)} on ${label}`
		};
	};

	const first = fitsWindow(day, template.startMin, overnight ? 1440 : template.endMin, dayName);
	if (!first.ok) return first;
	if (overnight && template.endMin > 0) {
		const nextWd = ((wd + 1) % 7) as Weekday;
		const next = fitsWindow(person.availability[nextWd], 0, template.endMin, weekdayName(nextWd));
		if (!next.ok) return next;
	}
	return { ok: true };
}

/** Two resolved shifts overlap in real time. */
export function overlaps(a: ResolvedShift, b: ResolvedShift): boolean {
	return a.startMs < b.endMs && b.startMs < a.endMs;
}

/** A shift counts as a night shift when it crosses midnight or starts at/after 22:00. */
export function isNightShift(template: ShiftTemplate): boolean {
	return template.endMin <= template.startMin || template.startMin >= 22 * 60;
}

export function isWeekend(date: DateStr): boolean {
	const wd = weekdayOf(date);
	return wd === 0 || wd === 6;
}

/** Longest run of consecutive worked days ending at or before `date`, inclusive. */
export function consecutiveRunEndingOn(workedDates: Set<DateStr>, date: DateStr): number {
	let run = 0;
	let cursor = date;
	while (workedDates.has(cursor) && run < 400) {
		run++;
		cursor = addDays(cursor, -1);
	}
	return run;
}

// ---------------------------------------------------------------------------
// The validator
// ---------------------------------------------------------------------------

export function validate(input: ValidationInput): Issue[] {
	const { shifts, staff, templates, coverage, leave, rules, business, previousWeek, weekStart } =
		input;
	const tz = business.timeZone;
	const issues: Issue[] = [];
	const resolved = resolveAll(shifts, templates, tz);
	const prevResolved = resolveAll(previousWeek, templates, tz);
	const dates = weekDates(weekStart);
	const staffById = new Map(staff.map((s) => [s.id, s]));

	const assigned = resolved.filter((r) => r.shift.staffId);
	const byStaff = new Map<string, ResolvedShift[]>();
	for (const r of assigned) {
		const key = r.shift.staffId as string;
		const list = byStaff.get(key);
		if (list) list.push(r);
		else byStaff.set(key, [r]);
	}
	for (const list of byStaff.values()) list.sort((a, b) => a.startMs - b.startMs);

	const prevByStaff = new Map<string, ResolvedShift[]>();
	for (const r of prevResolved.filter((x) => x.shift.staffId)) {
		const key = r.shift.staffId as string;
		const list = prevByStaff.get(key);
		if (list) list.push(r);
		else prevByStaff.set(key, [r]);
	}
	for (const list of prevByStaff.values()) list.sort((a, b) => a.startMs - b.startMs);

	// --- Structural: open slots -------------------------------------------
	for (const r of resolved) {
		if (!r.shift.staffId) {
			issues.push({
				type: 'open-slot',
				severity: 'Warning',
				staffId: null,
				shiftId: r.shift.id,
				date: r.shift.date,
				message: `${r.shift.role} slot on ${shiftLabel(r.template)} is unfilled on ${formatDate(r.shift.date)}.`,
				suggestedFix: 'Assign an eligible person, or remove the slot if it is not needed.'
			});
		}
	}

	// --- Per-shift hard rules ----------------------------------------------
	for (const r of assigned) {
		const person = staffById.get(r.shift.staffId as string);
		if (!person) {
			issues.push({
				type: 'role-match',
				severity: 'Error',
				staffId: r.shift.staffId,
				shiftId: r.shift.id,
				date: r.shift.date,
				message: `This shift is assigned to a person who no longer exists.`,
				suggestedFix: 'Reassign the shift or delete it.'
			});
			continue;
		}

		// Role
		if (isEnabled(rules, 'role-match') && !person.roles.includes(r.shift.role)) {
			issues.push({
				type: 'role-match',
				severity: 'Error',
				staffId: person.id,
				shiftId: r.shift.id,
				date: r.shift.date,
				message: `${person.name} does not hold the ${r.shift.role} role needed for ${shiftLabel(r.template)}.`,
				suggestedFix: `Assign someone with the ${r.shift.role} role, or add ${r.shift.role} to ${person.name}\u2019s roles.`
			});
		}

		// Approved leave
		if (isEnabled(rules, 'not-on-leave')) {
			const l = approvedLeaveOn(leave, person.id, r.shift.date);
			if (l) {
				issues.push({
					type: 'not-on-leave',
					severity: 'Error',
					staffId: person.id,
					shiftId: r.shift.id,
					date: r.shift.date,
					message: `${person.name} is on approved ${l.type.toLowerCase()} leave on ${formatDate(r.shift.date)}.`,
					suggestedFix: 'Assign a different person, or change the leave status.'
				});
			}
		}
		// Pending leave is a warning only.
		const pending = pendingLeaveOn(leave, person.id, r.shift.date);
		if (pending) {
			issues.push({
				type: 'pending-leave',
				severity: 'Warning',
				staffId: person.id,
				shiftId: r.shift.id,
				date: r.shift.date,
				message: `${person.name} has pending ${pending.type.toLowerCase()} leave on ${formatDate(r.shift.date)}.`,
				suggestedFix: 'Decide the leave request before you publish the roster.'
			});
		}

		// Availability
		if (isEnabled(rules, 'availability')) {
			const fit = availabilityFits(person, r.template, r.shift.date);
			if (!fit.ok) {
				issues.push({
					type: 'availability',
					severity: 'Error',
					staffId: person.id,
					shiftId: r.shift.id,
					date: r.shift.date,
					message: `${fit.reason}, but ${shiftLabel(r.template)} is scheduled then.`,
					suggestedFix: `Assign someone available, or update ${person.name}\u2019s availability.`
				});
			}
		}

		// Inactive staff
		if (!person.active) {
			issues.push({
				type: 'availability',
				severity: 'Error',
				staffId: person.id,
				shiftId: r.shift.id,
				date: r.shift.date,
				message: `${person.name} is deactivated but is scheduled on ${formatDate(r.shift.date)}.`,
				suggestedFix: `Reassign the shift, or reactivate ${person.name} in Staff.`
			});
		}

		// Closed day
		if (isEnabled(rules, 'closed-day') && !r.shift.closedDayOverride) {
			const closed = closedDayFor(business, r.shift.date);
			if (closed) {
				issues.push({
					type: 'closed-day',
					severity: 'Error',
					staffId: person.id,
					shiftId: r.shift.id,
					date: r.shift.date,
					message: `${formatDate(r.shift.date)} is closed for ${closed.name}, but ${person.name} is scheduled.`,
					suggestedFix: 'Remove the shift, or tick the closed-day override on it.'
				});
			}
		}
	}

	// --- Per-person rules ---------------------------------------------------
	const maxDay = ruleValue(rules, 'max-hours-day', 10) * 60;
	const maxWeek = ruleValue(rules, 'max-hours-week', 48) * 60;
	const minRestMs = ruleValue(rules, 'min-rest', 11) * 3_600_000;
	const maxRun = ruleValue(rules, 'max-consecutive-days', 6);
	const clopeningMs = ruleValue(rules, 'clopening', 12) * 3_600_000;

	for (const [staffId, list] of byStaff) {
		const person = staffById.get(staffId);
		if (!person) continue;
		const prev = prevByStaff.get(staffId) ?? [];

		// Overlaps
		if (isEnabled(rules, 'no-overlap')) {
			for (let i = 0; i < list.length; i++) {
				for (let j = i + 1; j < list.length; j++) {
					if (overlaps(list[i], list[j])) {
						issues.push({
							type: 'no-overlap',
							severity: 'Error',
							staffId,
							shiftId: list[j].shift.id,
							date: list[j].shift.date,
							message: `${person.name} is on two shifts at the same time on ${formatDate(list[j].shift.date)}: ${shiftLabel(list[i].template)} and ${shiftLabel(list[j].template)}.`,
							suggestedFix: 'Move one of the two shifts to another person or another day.'
						});
					}
				}
			}
		}

		// Hours per day (a shift counts on the day it starts)
		if (isEnabled(rules, 'max-hours-day')) {
			const perDay = new Map<DateStr, number>();
			for (const r of list) {
				perDay.set(r.shift.date, (perDay.get(r.shift.date) ?? 0) + r.paidMinutes);
			}
			for (const [date, minutes] of perDay) {
				if (minutes > maxDay) {
					issues.push({
						type: 'max-hours-day',
						severity: 'Error',
						staffId,
						date,
						message: `${person.name} is scheduled ${toHours(minutes)} hours on ${formatDate(date)}, above the ${toHours(maxDay)} hour daily limit.`,
						suggestedFix: 'Shorten or reassign one of that day\u2019s shifts.'
					});
				}
			}
		}

		// Hours per week
		const weekMinutes = list.reduce((sum, r) => sum + r.paidMinutes, 0);
		if (isEnabled(rules, 'max-hours-week') && weekMinutes > maxWeek) {
			issues.push({
				type: 'max-hours-week',
				severity: 'Error',
				staffId,
				message: `${person.name} is scheduled ${toHours(weekMinutes)} hours this week, above the ${toHours(maxWeek)} hour weekly limit.`,
				suggestedFix: 'Reassign one shift to a person with spare hours.'
			});
		}

		// Minimum rest, including across the week boundary
		const chain = [...prev, ...list].sort((a, b) => a.startMs - b.startMs);
		if (isEnabled(rules, 'min-rest')) {
			for (let i = 1; i < chain.length; i++) {
				const gap = chain[i].startMs - chain[i - 1].endMs;
				if (gap >= 0 && gap < minRestMs) {
					issues.push({
						type: 'min-rest',
						severity: 'Error',
						staffId,
						shiftId: chain[i].shift.id,
						date: chain[i].shift.date,
						message: `${person.name} has only ${toHours(gap / 60000)} hours of rest before ${shiftLabel(chain[i].template)} on ${formatDate(chain[i].shift.date)}, below the ${toHours(minRestMs / 60000)} hour minimum.`,
						suggestedFix: 'Give the later shift to someone else, or move it to a later start.'
					});
				}
			}
		}

		// Consecutive working days, counting back into the previous week
		if (isEnabled(rules, 'max-consecutive-days')) {
			const worked = new Set<DateStr>([
				...prev.map((r) => r.shift.date),
				...list.map((r) => r.shift.date)
			]);
			let reported = false;
			for (const date of dates) {
				if (!worked.has(date)) continue;
				const run = consecutiveRunEndingOn(worked, date);
				if (run > maxRun && !reported) {
					issues.push({
						type: 'max-consecutive-days',
						severity: 'Error',
						staffId,
						date,
						message: `${person.name} works ${run} days in a row up to ${formatDate(date)}, above the ${maxRun} day limit.`,
						suggestedFix: 'Remove one shift in that run to create a day off.'
					});
					reported = true;
				}
			}
		}

		// --- Soft rules ------------------------------------------------------
		if (isEnabled(rules, 'preferred-days-off')) {
			for (const r of list) {
				if (person.preferredDaysOff.includes(weekdayOf(r.shift.date))) {
					issues.push({
						type: 'preferred-days-off',
						severity: 'Warning',
						staffId,
						shiftId: r.shift.id,
						date: r.shift.date,
						message: `${person.name} prefers ${weekdayName(weekdayOf(r.shift.date))} off but is scheduled on ${formatDate(r.shift.date)}.`,
						suggestedFix: 'Swap this shift with a colleague who is free that day.'
					});
				}
			}
		}

		if (isEnabled(rules, 'contracted-hours')) {
			const hours = toHours(weekMinutes);
			if (hours < person.minWeeklyHours) {
				issues.push({
					type: 'contracted-hours',
					severity: 'Warning',
					staffId,
					message: `${person.name} has ${hours} hours, below their contracted minimum of ${person.minWeeklyHours}.`,
					suggestedFix: 'Give them an unfilled slot that matches their role and availability.'
				});
			} else if (hours > person.maxWeeklyHours) {
				issues.push({
					type: 'contracted-hours',
					severity: 'Warning',
					staffId,
					message: `${person.name} has ${hours} hours, above their contracted maximum of ${person.maxWeeklyHours}.`,
					suggestedFix: 'Move a shift to a colleague who is below their contracted minimum.'
				});
			}
		}

		if (isEnabled(rules, 'split-shift')) {
			const perDay = new Map<DateStr, number>();
			for (const r of list) perDay.set(r.shift.date, (perDay.get(r.shift.date) ?? 0) + 1);
			for (const [date, count] of perDay) {
				if (count > 1) {
					issues.push({
						type: 'split-shift',
						severity: 'Warning',
						staffId,
						date,
						message: `${person.name} has ${count} separate shifts on ${formatDate(date)}.`,
						suggestedFix: 'Combine them into one shift, or move one to another person.'
					});
				}
			}
		}

		if (isEnabled(rules, 'clopening')) {
			for (let i = 1; i < chain.length; i++) {
				const gap = chain[i].startMs - chain[i - 1].endMs;
				if (gap >= minRestMs && gap < clopeningMs) {
					issues.push({
						type: 'clopening',
						severity: 'Warning',
						staffId,
						shiftId: chain[i].shift.id,
						date: chain[i].shift.date,
						message: `${person.name} closes then opens again after ${toHours(gap / 60000)} hours before ${formatDate(chain[i].shift.date)}.`,
						suggestedFix: 'Give the early shift to someone who finished earlier.'
					});
				}
			}
		}

		if (isEnabled(rules, 'week-pattern') && prev.length > 0) {
			const prevDays = new Set(prev.map((r) => weekdayOf(r.shift.date)));
			const nowDays = new Set(list.map((r) => weekdayOf(r.shift.date)));
			let changed = 0;
			for (const d of nowDays) if (!prevDays.has(d)) changed++;
			for (const d of prevDays) if (!nowDays.has(d)) changed++;
			if (changed >= 4) {
				issues.push({
					type: 'week-pattern',
					severity: 'Warning',
					staffId,
					message: `${person.name}\u2019s working days differ from last week on ${changed} days.`,
					suggestedFix: 'Use Copy last week as a starting point, then adjust only what changed.'
				});
			}
		}
	}

	// --- Fairness across a role --------------------------------------------
	if (isEnabled(rules, 'balance-hours')) {
		const gapLimit = ruleValue(rules, 'balance-hours', 8);
		const roles = new Set<string>();
		for (const s of staff) for (const r of s.roles) roles.add(r);
		for (const role of roles) {
			const members = staff.filter((s) => s.active && s.roles.includes(role));
			if (members.length < 2) continue;
			const hours = members.map((m) => ({
				person: m,
				hours: toHours((byStaff.get(m.id) ?? []).reduce((sum, r) => sum + r.paidMinutes, 0))
			}));
			const max = hours.reduce((a, b) => (b.hours > a.hours ? b : a));
			const min = hours.reduce((a, b) => (b.hours < a.hours ? b : a));
			if (max.hours - min.hours > gapLimit) {
				issues.push({
					type: 'balance-hours',
					severity: 'Warning',
					staffId: max.person.id,
					message: `${role} hours are uneven: ${max.person.name} has ${max.hours} and ${min.person.name} has ${min.hours}.`,
					suggestedFix: `Move a ${role} shift from ${max.person.name} to ${min.person.name}.`
				});
			}
		}
	}

	// --- Weekend and night rotation ----------------------------------------
	if (isEnabled(rules, 'rotate-unsocial')) {
		const gapLimit = ruleValue(rules, 'rotate-unsocial', 2);
		for (const kind of ['weekend', 'night'] as const) {
			const counts = staff
				.filter((s) => s.active)
				.map((s) => ({
					person: s,
					count: (byStaff.get(s.id) ?? []).filter((r) =>
						kind === 'weekend' ? isWeekend(r.shift.date) : isNightShift(r.template)
					).length
				}));
			// Compare the busiest person against the quietest across ALL active staff, so a
			// single person carrying every weekend is flagged even when nobody else has one.
			if (counts.length < 2) continue;
			const relevant = counts.filter((c) => c.count > 0);
			if (relevant.length === 0) continue;
			const max = relevant.reduce((a, b) => (b.count > a.count ? b : a));
			const min = counts.reduce((a, b) => (b.count < a.count ? b : a));
			if (max.count - min.count > gapLimit) {
				issues.push({
					type: 'rotate-unsocial',
					severity: 'Warning',
					staffId: max.person.id,
					message: `${kind === 'weekend' ? 'Weekend' : 'Night'} shifts are uneven: ${max.person.name} has ${max.count} and ${min.person.name} has ${min.count}.`,
					suggestedFix: `Rotate one ${kind} shift to ${min.person.name}.`
				});
			}
		}
	}

	// --- Coverage ------------------------------------------------------------
	for (const issue of coverageIssues(shifts, coverage, templates, dates, business)) {
		issues.push(issue);
	}

	return issues;
}

/** Understaffed checks, split out so the coverage view can reuse them. */
export function coverageIssues(
	shifts: Shift[],
	coverage: CoverageNeed[],
	templates: ShiftTemplate[],
	dates: DateStr[],
	business: ValidationInput['business']
): Issue[] {
	const issues: Issue[] = [];
	for (const date of dates) {
		if (closedDayFor(business, date)) continue;
		const wd = weekdayOf(date);
		for (const need of coverage) {
			if (need.weekday !== wd) continue;
			const template = templates.find((t) => t.id === need.templateId);
			if (!template || !template.days.includes(wd)) continue;
			const filled = shifts.filter(
				(s) => s.date === date && s.templateId === need.templateId && s.role === need.role && s.staffId
			).length;
			if (filled < need.min) {
				issues.push({
					type: 'understaffed',
					severity: 'Error',
					date,
					message: `${shiftLabel(template)} on ${formatDate(date)} has ${filled} of ${need.min} ${need.role} needed.`,
					suggestedFix: `Assign ${need.min - filled} more ${need.role}, or lower the coverage need for this shift.`
				});
			}
		}
	}
	return issues;
}

// ---------------------------------------------------------------------------
// Single-assignment check, used for drag-and-drop live validation
// ---------------------------------------------------------------------------

export interface AssignmentCheck {
	ok: boolean;
	/** Hard-rule errors that make the drop invalid. */
	errors: Issue[];
	/** Soft-rule warnings; the drop is still allowed. */
	warnings: Issue[];
	/** One short sentence for the hover tooltip. */
	reason: string;
}

/**
 * Would assigning `shiftId` to `staffId` break a rule? Runs the full validator on a
 * copy of the roster and returns only the issues that involve that person, so the
 * editor shows a precise reason on a red drop target.
 */
export function checkAssignment(
	input: ValidationInput,
	shiftId: string,
	staffId: string | null
): AssignmentCheck {
	const before = validate(input);
	const beforeKeys = new Set(before.map(issueKey));
	const nextShifts = input.shifts.map((s) => (s.id === shiftId ? { ...s, staffId } : s));
	const after = validate({ ...input, shifts: nextShifts });
	const added = after.filter((i) => !beforeKeys.has(issueKey(i)));
	const relevant = added.filter((i) => !staffId || i.staffId === staffId || i.shiftId === shiftId);
	const errors = relevant.filter((i) => i.severity === 'Error');
	const warnings = relevant.filter((i) => i.severity === 'Warning');
	const reason = errors.length
		? errors[0].message
		: warnings.length
			? warnings[0].message
			: 'No rule issues.';
	return { ok: errors.length === 0, errors, warnings, reason };
}

export function issueKey(i: Issue): string {
	return [i.type, i.severity, i.staffId ?? '', i.shiftId ?? '', i.date ?? '', i.message].join('|');
}

/** Sort issues so Errors come first, then by date. */
export function sortIssues(issues: Issue[]): Issue[] {
	return [...issues].sort((a, b) => {
		if (a.severity !== b.severity) return a.severity === 'Error' ? -1 : 1;
		const da = a.date ? dateToUtc(a.date) : 0;
		const db = b.date ? dateToUtc(b.date) : 0;
		if (da !== db) return da - db;
		return a.message.localeCompare(b.message);
	});
}
