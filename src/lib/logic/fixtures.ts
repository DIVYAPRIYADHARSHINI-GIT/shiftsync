// Shared test fixtures. Small, explicit and fictional, so each rule test reads clearly.

import type {
	BusinessSettings,
	CoverageNeed,
	DayAvailability,
	Leave,
	Shift,
	ShiftTemplate,
	Staff,
	ValidationInput,
	Weekday,
	WeeklyAvailability
} from '../types';
import { mergeRules } from './rules';

export const ALL_DAY: DayAvailability = { kind: 'all-day' };
export const NOT_AVAILABLE: DayAvailability = { kind: 'unavailable' };
export function between(fromMin: number, toMin: number): DayAvailability {
	return { kind: 'between', fromMin, toMin };
}

export function availability(...days: DayAvailability[]): WeeklyAvailability {
	const filled = days.length === 7 ? days : Array.from({ length: 7 }, () => days[0] ?? ALL_DAY);
	return filled as unknown as WeeklyAvailability;
}

export function makeStaff(partial: Partial<Staff> & { id: string; name: string }): Staff {
	return {
		roles: ['Barista'],
		colour: '#0B6E4F',
		minWeeklyHours: 0,
		maxWeeklyHours: 40,
		availability: availability(ALL_DAY),
		unavailableDates: [],
		preferredDaysOff: [],
		notes: '',
		active: true,
		...partial
	};
}

export function makeTemplate(
	partial: Partial<ShiftTemplate> & { id: string; name: string }
): ShiftTemplate {
	return {
		startMin: 9 * 60,
		endMin: 17 * 60,
		unpaidBreakMin: 0,
		colour: '#0B6E4F',
		days: [0, 1, 2, 3, 4, 5, 6],
		...partial
	};
}

export const MORNING = makeTemplate({
	id: 'morning',
	name: 'Morning',
	startMin: 7 * 60,
	endMin: 15 * 60
});
export const EVENING = makeTemplate({
	id: 'evening',
	name: 'Evening',
	startMin: 15 * 60,
	endMin: 23 * 60
});
export const NIGHT = makeTemplate({
	id: 'night',
	name: 'Night',
	startMin: 22 * 60,
	endMin: 6 * 60,
	days: [0, 1, 2, 3, 4, 5, 6]
});

export const BUSINESS: BusinessSettings = {
	name: 'Test Cafe',
	timeZone: 'Asia/Kolkata',
	weekStartDay: 1,
	currency: 'INR',
	closedDays: []
};

export function makeShift(partial: Partial<Shift> & { id: string; date: string }): Shift {
	return {
		templateId: 'morning',
		role: 'Barista',
		staffId: null,
		locked: false,
		...partial
	};
}

export function makeCoverage(
	templateId: string,
	role: string,
	min: number,
	days: Weekday[] = [0, 1, 2, 3, 4, 5, 6]
): CoverageNeed[] {
	return days.map((weekday) => ({
		id: `${templateId}-${role}-${weekday}`,
		templateId,
		weekday,
		role,
		min
	}));
}

/** A validation input with sensible defaults; override only what the test cares about. */
export function makeInput(partial: Partial<ValidationInput> = {}): ValidationInput {
	return {
		shifts: [],
		staff: [],
		templates: [MORNING, EVENING, NIGHT],
		coverage: [],
		leave: [],
		rules: mergeRules(undefined),
		business: BUSINESS,
		previousWeek: [],
		weekStart: '2026-10-26',
		...partial
	};
}

export function makeLeave(partial: Partial<Leave> & { id: string; staffId: string }): Leave {
	return {
		startDate: '2026-10-26',
		endDate: '2026-10-26',
		type: 'Paid',
		status: 'Approved',
		...partial
	};
}
