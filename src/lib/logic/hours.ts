// Hours, overtime and estimated labour cost for any period.
//
// "Estimate, not payroll" - the cost figures here use the hourly rate on the staff record
// and a single overtime multiplier. They ignore tax, allowances and local overtime law.

import type { DateStr, Rule, Shift, ShiftTemplate, Staff } from '../types';
import { dateInRange, toHours } from './time';
import { ruleValue } from './rules';
import { consecutiveRunEndingOn, isNightShift, isWeekend, resolveAll } from './validate';
import { dateRange } from './time';

export interface HoursRow {
	staffId: string;
	name: string;
	roles: string[];
	colour: string;
	/** Total paid hours in the period. */
	hours: number;
	minHours: number;
	maxHours: number;
	/** Hours above the weekly maximum rule, summed per week in the period. */
	overtimeHours: number;
	shifts: number;
	weekendShifts: number;
	nightShifts: number;
	daysOff: number;
	longestRun: number;
	/** Estimated cost including the overtime multiplier. Undefined with no rate. */
	estimatedCost?: number;
}

export interface HoursSummary {
	rows: HoursRow[];
	totalHours: number;
	totalOvertimeHours: number;
	totalEstimatedCost?: number;
	/** 0-100 fairness indicator across the rows. */
	fairness: number;
}

export function hoursSummary(
	shifts: Shift[],
	staff: Staff[],
	templates: ShiftTemplate[],
	rules: Rule[],
	timeZone: string,
	startDate: DateStr,
	endDate: DateStr,
	overtimeMultiplier = 1.5
): HoursSummary {
	const inPeriod = shifts.filter((s) => s.staffId && dateInRange(s.date, startDate, endDate));
	const resolved = resolveAll(inPeriod, templates, timeZone);
	const dates = dateRange(startDate, endDate);
	const weeklyMax = ruleValue(rules, 'max-hours-week', 48);

	const rows: HoursRow[] = staff.map((person) => {
		const mine = resolved.filter((r) => r.shift.staffId === person.id);
		const minutes = mine.reduce((sum, r) => sum + r.paidMinutes, 0);
		const worked = new Set(mine.map((r) => r.shift.date));
		let longestRun = 0;
		for (const d of dates) {
			if (worked.has(d)) longestRun = Math.max(longestRun, consecutiveRunEndingOn(worked, d));
		}

		// Overtime is measured per rolling 7-day block from the period start.
		let overtimeMinutes = 0;
		for (let i = 0; i < dates.length; i += 7) {
			const block = new Set(dates.slice(i, i + 7));
			const blockMinutes = mine
				.filter((r) => block.has(r.shift.date))
				.reduce((sum, r) => sum + r.paidMinutes, 0);
			overtimeMinutes += Math.max(0, blockMinutes - weeklyMax * 60);
		}

		const hours = toHours(minutes);
		const overtimeHours = toHours(overtimeMinutes);
		const baseHours = Math.max(0, hours - overtimeHours);
		const estimatedCost =
			typeof person.hourlyRate === 'number'
				? Math.round(
						(baseHours * person.hourlyRate + overtimeHours * person.hourlyRate * overtimeMultiplier) *
							100
					) / 100
				: undefined;

		return {
			staffId: person.id,
			name: person.name,
			roles: person.roles,
			colour: person.colour,
			hours,
			minHours: person.minWeeklyHours,
			maxHours: person.maxWeeklyHours,
			overtimeHours,
			shifts: mine.length,
			weekendShifts: mine.filter((r) => isWeekend(r.shift.date)).length,
			nightShifts: mine.filter((r) => isNightShift(r.template)).length,
			daysOff: dates.filter((d) => !worked.has(d)).length,
			longestRun,
			estimatedCost
		};
	});

	const active = rows.filter((r) => r.shifts > 0);
	const totalHours = toHours(rows.reduce((s, r) => s + r.hours, 0) * 60);
	const costRows = rows.filter((r) => typeof r.estimatedCost === 'number');

	return {
		rows,
		totalHours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
		totalOvertimeHours: Math.round(rows.reduce((s, r) => s + r.overtimeHours, 0) * 100) / 100,
		totalEstimatedCost: costRows.length
			? Math.round(costRows.reduce((s, r) => s + (r.estimatedCost ?? 0), 0) * 100) / 100
			: undefined,
		fairness: fairnessIndicator(active.length ? active : rows)
	};
}

/** 0-100: 100 means hours and unsocial shifts are spread evenly. */
export function fairnessIndicator(rows: HoursRow[]): number {
	if (rows.length < 2) return 100;
	const span = (values: number[]) => Math.max(...values) - Math.min(...values);
	const hourSpan = span(rows.map((r) => r.hours));
	const weekendSpan = span(rows.map((r) => r.weekendShifts));
	const nightSpan = span(rows.map((r) => r.nightShifts));
	const outOfRange = rows.filter((r) => r.hours < r.minHours || r.hours > r.maxHours).length;
	let score = 100;
	score -= Math.min(40, hourSpan * 2);
	score -= Math.min(15, weekendSpan * 5);
	score -= Math.min(15, nightSpan * 5);
	score -= Math.min(30, (outOfRange / rows.length) * 60);
	return Math.max(0, Math.round(score));
}

/** Where a person sits against their contracted range, for the slim progress bar. */
export function contractState(
	hours: number,
	minHours: number,
	maxHours: number
): 'under' | 'in-range' | 'near-limit' | 'over' {
	if (hours > maxHours) return 'over';
	if (maxHours > 0 && hours >= maxHours - 2) return 'near-limit';
	if (hours < minHours) return 'under';
	return 'in-range';
}
