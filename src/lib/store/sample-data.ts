// Sample data: the fictional "Greenleaf Cafe".
//
// Everything here is invented. No real person, business or employee data is used.
// Names deliberately include Tamil and Devanagari script so the grid, the PDF route and
// the CSV/ICS exports are exercised with complex scripts from first open.
//
// The sample is built relative to an injected "today" so the current week is always
// populated: a PUBLISHED roster for the current week and a GENERATED DRAFT for next week
// with two deliberate warnings, so the issues panel, coverage view and hours summary all
// show realistic content immediately.

import type {
	AppData,
	CoverageNeed,
	DayAvailability,
	Leave,
	Shift,
	ShiftTemplate,
	Staff,
	SwapRequest,
	Weekday,
	WeeklyAvailability
} from '../types';
import { addDays, startOfWeek, todayIn, type Clock, systemClock } from '../logic/time';
import { mergeRules } from '../logic/rules';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS } from './schema';
import { generateRoster } from '../logic/generator';

const ALL: DayAvailability = { kind: 'all-day' };
const OFF: DayAvailability = { kind: 'unavailable' };
const morningsOnly: DayAvailability = { kind: 'between', fromMin: 6 * 60, toMin: 15 * 60 };
const eveningsOnly: DayAvailability = { kind: 'between', fromMin: 14 * 60, toMin: 24 * 60 };
const fromNoon: DayAvailability = { kind: 'between', fromMin: 12 * 60, toMin: 24 * 60 };

function week(...days: DayAvailability[]): WeeklyAvailability {
	return days as unknown as WeeklyAvailability;
}

const ROLES = ['Barista', 'Cashier', 'Cook', 'Supervisor'] as const;

/** Staff colours drawn from the desaturated token palette. */
const COLOURS = [
	'#0B6E4F',
	'#2B6CB0',
	'#B7791F',
	'#7B3F9D',
	'#2F855A',
	'#C0392B',
	'#1F6F78',
	'#8A5A2B',
	'#44608A',
	'#6B5B95',
	'#3E7C59',
	'#9A6A3A',
	'#30657F',
	'#8C4F6D'
];

interface SeedStaff {
	name: string;
	roles: string[];
	min: number;
	max: number;
	rate: number;
	availability: WeeklyAvailability;
	preferredDaysOff: Weekday[];
	notes: string;
	active?: boolean;
}

// 14 fictional staff across four roles, with varied availability and contracts.
const SEED_STAFF: SeedStaff[] = [
	{
		name: 'Meena Raghavan',
		roles: ['Supervisor', 'Barista'],
		min: 32,
		max: 40,
		rate: 310,
		availability: week(OFF, ALL, ALL, ALL, ALL, ALL, ALL),
		preferredDaysOff: [0],
		notes: 'Keyholder. Prefers to open rather than close.'
	},
	{
		name: 'Arun Selvaraj',
		roles: ['Supervisor', 'Cook'],
		min: 32,
		max: 40,
		rate: 300,
		availability: week(ALL, ALL, ALL, ALL, OFF, ALL, ALL),
		preferredDaysOff: [4],
		notes: 'Second keyholder. Trained on the espresso machine.'
	},
	{
		name: 'பிரியா சுந்தர்',
		roles: ['Barista', 'Cashier'],
		min: 24,
		max: 32,
		rate: 240,
		availability: week(ALL, morningsOnly, morningsOnly, morningsOnly, morningsOnly, ALL, ALL),
		preferredDaysOff: [3],
		notes: 'College classes on weekday afternoons.'
	},
	{
		name: 'कार्तिक शर्मा',
		roles: ['Barista', 'Cook'],
		min: 30,
		max: 40,
		rate: 250,
		availability: week(ALL, ALL, ALL, ALL, ALL, ALL, OFF),
		preferredDaysOff: [6],
		notes: 'Happy to take night shifts.'
	},
	{
		name: 'Divya Nair',
		roles: ['Cashier'],
		min: 16,
		max: 24,
		rate: 220,
		availability: week(eveningsOnly, eveningsOnly, eveningsOnly, OFF, eveningsOnly, ALL, ALL),
		preferredDaysOff: [3],
		notes: 'Part time, evenings.'
	},
	{
		name: 'Faisal Rahman',
		roles: ['Cook'],
		min: 32,
		max: 44,
		rate: 280,
		availability: week(ALL, ALL, ALL, ALL, ALL, ALL, ALL),
		preferredDaysOff: [1],
		notes: 'Lead cook. Does the weekly stock order on Monday.'
	},
	{
		name: 'அன்பு வேலன்',
		roles: ['Cook', 'Cashier'],
		min: 24,
		max: 36,
		rate: 235,
		availability: week(ALL, ALL, OFF, ALL, ALL, ALL, ALL),
		preferredDaysOff: [2],
		notes: 'Comfortable on the grill and the till.'
	},
	{
		name: 'Nisha Pillai',
		roles: ['Barista', 'Supervisor'],
		min: 28,
		max: 38,
		rate: 290,
		availability: week(ALL, ALL, ALL, ALL, ALL, OFF, ALL),
		preferredDaysOff: [5],
		notes: 'Supervisor in training.'
	},
	{
		name: 'रोहित देशपांडे',
		roles: ['Cashier', 'Barista'],
		min: 20,
		max: 30,
		rate: 225,
		availability: week(ALL, fromNoon, fromNoon, fromNoon, fromNoon, ALL, ALL),
		preferredDaysOff: [0],
		notes: 'Available from midday on weekdays.'
	},
	{
		name: 'Sameera Khan',
		roles: ['Barista'],
		min: 16,
		max: 28,
		rate: 230,
		availability: week(ALL, ALL, ALL, ALL, ALL, ALL, ALL),
		preferredDaysOff: [2],
		notes: 'Flexible. Covers at short notice.'
	},
	{
		name: 'Tomas Lindqvist',
		roles: ['Cook', 'Supervisor'],
		min: 30,
		max: 40,
		rate: 295,
		availability: week(OFF, ALL, ALL, ALL, ALL, ALL, OFF),
		preferredDaysOff: [0, 6],
		notes: 'Weekday cook. Handles the night bake.'
	},
	{
		name: 'வசந்தி குமார்',
		roles: ['Cashier', 'Cook'],
		min: 24,
		max: 34,
		rate: 240,
		availability: week(ALL, ALL, ALL, ALL, ALL, ALL, ALL),
		preferredDaysOff: [4],
		notes: 'Prefers back-to-back days over scattered shifts.'
	},
	{
		name: 'Joseph Fernandes',
		roles: ['Barista', 'Cashier'],
		min: 20,
		max: 32,
		rate: 235,
		availability: week(ALL, ALL, ALL, OFF, ALL, ALL, ALL),
		preferredDaysOff: [3],
		notes: 'Studies on Wednesday.'
	},
	{
		name: 'Leela Krishnan',
		roles: ['Supervisor', 'Cashier'],
		min: 12,
		max: 20,
		rate: 300,
		availability: week(ALL, OFF, OFF, ALL, ALL, ALL, ALL),
		preferredDaysOff: [1, 2],
		notes: 'Relief supervisor for weekends and holiday cover.'
	}
];

export function sampleData(clock: Clock = systemClock): AppData {
	const timeZone = 'Asia/Kolkata';
	const today = todayIn(timeZone, clock);
	const thisWeek = startOfWeek(today, 1);
	const nextWeek = addDays(thisWeek, 7);
	const lastWeek = addDays(thisWeek, -7);

	const staff: Staff[] = SEED_STAFF.map((s, i) => ({
		id: `staff-${i + 1}`,
		name: s.name,
		roles: s.roles,
		colour: COLOURS[i % COLOURS.length],
		minWeeklyHours: s.min,
		maxWeeklyHours: s.max,
		hourlyRate: s.rate,
		availability: s.availability,
		unavailableDates: [],
		preferredDaysOff: s.preferredDaysOff,
		notes: s.notes,
		active: s.active !== false
	}));

	// Three templates: Morning, Evening and a Night bake that crosses midnight.
	const templates: ShiftTemplate[] = [
		{
			id: 'tpl-morning',
			name: 'Morning',
			startMin: 7 * 60,
			endMin: 15 * 60,
			unpaidBreakMin: 30,
			colour: '#0B6E4F',
			days: [0, 1, 2, 3, 4, 5, 6]
		},
		{
			id: 'tpl-evening',
			name: 'Evening',
			startMin: 14 * 60 + 30,
			endMin: 22 * 60 + 30,
			unpaidBreakMin: 30,
			colour: '#2B6CB0',
			days: [0, 1, 2, 3, 4, 5, 6]
		},
		{
			id: 'tpl-night',
			name: 'Night bake',
			startMin: 22 * 60,
			endMin: 6 * 60,
			unpaidBreakMin: 45,
			colour: '#7B3F9D',
			days: [1, 2, 3, 4, 5]
		}
	];

	// Coverage: 2 baristas + 1 cashier + 1 supervisor mornings, similar evenings,
	// 1 cook overnight on weekdays. Weekends need an extra barista.
	const coverage: CoverageNeed[] = [];
	let cid = 0;
	const addNeed = (templateId: string, weekday: Weekday, role: string, min: number, ideal?: number) => {
		coverage.push({ id: `cov-${++cid}`, templateId, weekday, role, min, ideal });
	};
	for (let d = 0 as Weekday; d <= 6; d = (d + 1) as Weekday) {
		const weekend = d === 0 || d === 6;
		addNeed('tpl-morning', d, 'Barista', weekend ? 2 : 1, weekend ? 3 : 2);
		addNeed('tpl-morning', d, 'Cashier', 1, 1);
		addNeed('tpl-morning', d, 'Supervisor', 1, 1);
		addNeed('tpl-evening', d, 'Barista', weekend ? 2 : 1, 2);
		addNeed('tpl-evening', d, 'Cashier', 1, 1);
		addNeed('tpl-evening', d, 'Cook', 1, 1);
		if (d >= 1 && d <= 5) addNeed('tpl-night', d, 'Cook', 1, 1);
	}

	// Leave: two approved, two pending, spread across both weeks.
	const leave: Leave[] = [
		{
			id: 'leave-1',
			staffId: 'staff-5',
			startDate: addDays(nextWeek, 1),
			endDate: addDays(nextWeek, 3),
			type: 'Paid',
			status: 'Approved',
			note: 'Family wedding.'
		},
		{
			id: 'leave-2',
			staffId: 'staff-7',
			startDate: addDays(thisWeek, 4),
			endDate: addDays(thisWeek, 5),
			type: 'Sick',
			status: 'Approved',
			note: 'Doctor\u2019s note received.'
		},
		{
			id: 'leave-3',
			staffId: 'staff-10',
			startDate: addDays(nextWeek, 5),
			endDate: addDays(nextWeek, 6),
			type: 'Unpaid',
			status: 'Pending',
			note: 'Requested on short notice.'
		},
		{
			id: 'leave-4',
			staffId: 'staff-13',
			startDate: addDays(nextWeek, 2),
			endDate: addDays(nextWeek, 2),
			type: 'Paid',
			status: 'Pending'
		}
	];

	const rules = mergeRules(undefined);
	const business = {
		name: 'Greenleaf Cafe',
		timeZone,
		weekStartDay: 1 as const,
		currency: 'INR',
		closedDays: [
			{ id: 'closed-1', recurringMonthDay: '01-01', name: 'New Year\u2019s Day' },
			{ id: 'closed-2', recurringMonthDay: '12-25', name: 'Christmas Day' }
		]
	};

	const genBase = {
		staff,
		templates,
		coverage,
		leave,
		rules,
		business,
		// A fixed iteration budget keeps "Load sample data" fast AND deterministic:
		// the same sample roster appears on every machine, generated in well under a second.
		maxIterations: 160,
		timeBudgetMs: 1500,
		keepLocked: true,
		onlyEmpty: false
	};

	// Previous week, so rest gaps and runs have history to look back into.
	const prevResult = generateRoster({
		...genBase,
		weekStart: lastWeek,
		previousWeek: [],
		existing: [],
		seed: 101
	});

	const publishedResult = generateRoster({
		...genBase,
		weekStart: thisWeek,
		previousWeek: prevResult.shifts,
		existing: [],
		seed: 202
	});

	const draftResult = generateRoster({
		...genBase,
		weekStart: nextWeek,
		previousWeek: publishedResult.shifts,
		existing: [],
		seed: 303
	});

	// Two deliberate WARNINGS in the draft so the issues panel has real content on first
	// open. Both must be genuine soft-rule warnings, never hard errors - the generator is
	// not allowed to produce an error, so the sample must not fake one either.
	//
	//   1. Preferred day off: someone is placed on a weekday they asked to keep free.
	//   2. Contracted hours: someone is scheduled above their contracted maximum.
	//
	// An earlier version tried to stage a "split shift" by giving one cook both the
	// Evening (14:30-22:30) and the Night bake (22:00-06:00) on the same day. Those two
	// templates OVERLAP by 30 minutes, so it produced overlap, daily-hours and rest
	// ERRORS instead. Any staged warning has to use non-overlapping shifts.
	const draftShifts = [...draftResult.shifts];

	const sameera = staff.find((s) => s.name === 'Sameera Khan');
	if (sameera) {
		// Sameera prefers Tuesday (weekday 2) off: give her the Tuesday morning barista slot.
		const tuesday = addDays(nextWeek, 1); // Monday-start week: index 1 is Tuesday
		const target = draftShifts.find(
			(s) => s.date === tuesday && s.templateId === 'tpl-morning' && s.role === 'Barista'
		);
		if (target) target.staffId = sameera.id;
		const prefIdx = staff.findIndex((s) => s.id === sameera.id);
		if (prefIdx >= 0) staff[prefIdx] = { ...staff[prefIdx], preferredDaysOff: [2] };
	}

	// Lower one person's contracted maximum below what they are actually scheduled, so the
	// "above their contracted maximum" warning appears without touching any shift.
	const busiest = staff
		.map((person) => ({
			person,
			hours: draftShifts.filter((s) => s.staffId === person.id).length * 7.5
		}))
		.filter((row) => row.hours > 0)
		.sort((a, b) => b.hours - a.hours)[0];
	if (busiest) {
		const idx = staff.findIndex((s) => s.id === busiest.person.id);
		if (idx >= 0) {
			const cap = Math.max(8, Math.floor(busiest.hours) - 4);
			staff[idx] = {
				...staff[idx],
				maxWeeklyHours: cap,
				minWeeklyHours: Math.min(staff[idx].minWeeklyHours, cap)
			};
		}
	}

	const swaps: SwapRequest[] = [
		{
			id: 'swap-1',
			createdAt: new Date(clock.now() - 2 * 86_400_000).toISOString(),
			shiftId: publishedResult.shifts.find((s) => s.staffId)?.id ?? '',
			fromStaffId: publishedResult.shifts.find((s) => s.staffId)?.staffId ?? null,
			toStaffId: 'staff-10',
			reason: 'Asked to attend a family function.',
			status: 'Pending'
		}
	];

	const rosters: AppData['rosters'] = {
		[lastWeek]: {
			weekStart: lastWeek,
			status: 'Published',
			shifts: prevResult.shifts,
			snapshots: [],
			publishedAt: new Date(clock.now() - 9 * 86_400_000).toISOString(),
			lastSeed: 101
		},
		[thisWeek]: {
			weekStart: thisWeek,
			status: 'Published',
			shifts: publishedResult.shifts,
			snapshots: [
				{
					id: 'snap-1',
					createdAt: new Date(clock.now() - 3 * 86_400_000).toISOString(),
					label: 'Before publishing',
					shifts: publishedResult.shifts.map((s) => ({ ...s }))
				}
			],
			publishedAt: new Date(clock.now() - 2 * 86_400_000).toISOString(),
			lastSeed: 202
		},
		[nextWeek]: {
			weekStart: nextWeek,
			status: 'Draft',
			shifts: draftShifts,
			snapshots: [],
			lastSeed: 303
		}
	};

	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		business,
		staff,
		templates,
		coverage,
		leave,
		rosters,
		rules,
		swaps,
		settings: { ...DEFAULT_SETTINGS, sampleDataLoaded: true }
	};
}

export const SAMPLE_ROLES = ROLES;
