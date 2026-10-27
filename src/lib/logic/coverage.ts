// Hour-by-hour coverage calculation for the coverage view, plus day status roll-ups
// for the month overview. Pure, no UI imports.

import type {
	BusinessSettings,
	CoverageNeed,
	DateStr,
	Shift,
	ShiftTemplate,
	Weekday
} from '../types';
import { weekdayOf } from './time';
import { closedDayFor } from './validate';

export interface HourBucket {
	/** Hour of the civil day, 0..23. */
	hour: number;
	/** People on duty during this hour (a midnight-crossing shift counts in both days). */
	scheduled: number;
	/** People needed during this hour, from the coverage minimums. */
	needed: number;
}

export type DayStatus = 'closed' | 'empty' | 'understaffed' | 'warnings' | 'staffed';

export interface DayCoverage {
	date: DateStr;
	buckets: HourBucket[];
	status: DayStatus;
	scheduledShifts: number;
	openSlots: number;
	/** Peak shortfall in any hour of the day. */
	worstShortfall: number;
	/** Peak surplus in any hour of the day. */
	worstSurplus: number;
}

/** Does the template cover `hour` of `date`, including a shift started the day before? */
function coversHour(
	template: ShiftTemplate,
	shiftDate: DateStr,
	targetDate: DateStr,
	hour: number
): boolean {
	const overnight = template.endMin <= template.startMin;
	const hourStart = hour * 60;
	const hourEnd = hourStart + 60;
	if (shiftDate === targetDate) {
		const end = overnight ? 1440 : template.endMin;
		return template.startMin < hourEnd && hourStart < end;
	}
	// A shift that started the previous civil day and runs past midnight.
	if (overnight) {
		const prev = new Date(Date.parse(`${targetDate}T00:00:00Z`) - 86_400_000)
			.toISOString()
			.slice(0, 10);
		if (shiftDate === prev) return hourStart < template.endMin;
	}
	return false;
}

export function dayCoverage(
	date: DateStr,
	shifts: Shift[],
	coverage: CoverageNeed[],
	templates: ShiftTemplate[],
	business: BusinessSettings
): DayCoverage {
	const wd = weekdayOf(date);
	const closed = closedDayFor(business, date);
	const relevant = shifts.filter((s) => {
		const t = templates.find((x) => x.id === s.templateId);
		if (!t) return false;
		const overnight = t.endMin <= t.startMin;
		if (s.date === date) return true;
		if (!overnight) return false;
		const prev = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
		return s.date === prev;
	});

	const buckets: HourBucket[] = [];
	for (let hour = 0; hour < 24; hour++) {
		let scheduled = 0;
		for (const s of relevant) {
			const t = templates.find((x) => x.id === s.templateId);
			if (!t || !s.staffId) continue;
			if (coversHour(t, s.date, date, hour)) scheduled++;
		}
		let needed = 0;
		for (const need of coverage) {
			const t = templates.find((x) => x.id === need.templateId);
			if (!t) continue;
			// A need applies on the weekday its template runs.
			const needWeekdayMatches = need.weekday === wd && t.days.includes(wd);
			if (needWeekdayMatches && coversHour(t, date, date, hour)) {
				needed += need.min;
				continue;
			}
			// The tail of the previous day's overnight need.
			const prevWd = ((wd + 6) % 7) as Weekday;
			if (need.weekday === prevWd && t.days.includes(prevWd) && t.endMin <= t.startMin) {
				if (hour * 60 < t.endMin) needed += need.min;
			}
		}
		buckets.push({ hour, scheduled, needed });
	}

	const scheduledShifts = shifts.filter((s) => s.date === date && s.staffId).length;
	const openSlots = shifts.filter((s) => s.date === date && !s.staffId).length;
	const worstShortfall = buckets.reduce((w, b) => Math.max(w, b.needed - b.scheduled), 0);
	const worstSurplus = buckets.reduce((w, b) => Math.max(w, b.scheduled - b.needed), 0);

	let status: DayStatus;
	if (closed) status = 'closed';
	else if (scheduledShifts === 0 && openSlots === 0) status = 'empty';
	else if (worstShortfall > 0 || openSlots > 0) status = 'understaffed';
	else if (worstSurplus > 0) status = 'warnings';
	else status = 'staffed';

	return { date, buckets, status, scheduledShifts, openSlots, worstShortfall, worstSurplus };
}

/** Needed vs scheduled people for one day, for the thin strip under the day header. */
export function dayCoverageSummary(
	date: DateStr,
	shifts: Shift[],
	coverage: CoverageNeed[],
	templates: ShiftTemplate[]
): { needed: number; scheduled: number } {
	const wd = weekdayOf(date);
	let needed = 0;
	for (const need of coverage) {
		const t = templates.find((x) => x.id === need.templateId);
		if (need.weekday === wd && t && t.days.includes(wd)) needed += need.min;
	}
	const scheduled = shifts.filter((s) => s.date === date && s.staffId).length;
	return { needed, scheduled };
}
