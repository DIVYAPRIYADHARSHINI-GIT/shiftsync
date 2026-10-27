// ShiftSync data model.
//
// Design intent captured from the brief:
//  - Dates are ALWAYS civil date strings 'YYYY-MM-DD'. Never a Date object, so a date can
//    never be shifted by a day through a time-zone conversion.
//  - Times are ALWAYS minutes from midnight (0..1439). A shift that crosses midnight has
//    endMin <= startMin and belongs to the day it STARTS.
//  - All data lives in the browser's localStorage behind the RosterStore interface.

/** Civil date, 'YYYY-MM-DD'. Never a Date. */
export type DateStr = string;

/** 0 = Sunday ... 6 = Saturday (matches Date.getUTCDay for easy civil maths). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Theme = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

export interface ClosedDay {
	id: string;
	/** Civil date for a one-off closure. Empty for a recurring rule. */
	date?: DateStr;
	/** Recurring annual closure as 'MM-DD' (e.g. '01-01' for New Year's Day). */
	recurringMonthDay?: string;
	name: string;
}

export interface BusinessSettings {
	name: string;
	timeZone: string;
	/** Only Monday (1) or Sunday (0) per the brief. */
	weekStartDay: 0 | 1;
	currency: string;
	closedDays: ClosedDay[];
}

export type AvailabilityKind = 'all-day' | 'between' | 'unavailable';

export interface DayAvailability {
	kind: AvailabilityKind;
	/** Minutes from midnight; only meaningful when kind === 'between'. */
	fromMin?: number;
	toMin?: number;
}

/** Index 0..6 keyed by Weekday. */
export type WeeklyAvailability = [
	DayAvailability,
	DayAvailability,
	DayAvailability,
	DayAvailability,
	DayAvailability,
	DayAvailability,
	DayAvailability
];

export interface Staff {
	id: string;
	name: string;
	roles: string[];
	colour: string;
	minWeeklyHours: number;
	maxWeeklyHours: number;
	hourlyRate?: number;
	availability: WeeklyAvailability;
	/** Specific civil dates the person cannot work. */
	unavailableDates: DateStr[];
	/** Soft preference only. */
	preferredDaysOff: Weekday[];
	notes: string;
	active: boolean;
}

export interface ShiftTemplate {
	id: string;
	name: string;
	/** Minutes from midnight. */
	startMin: number;
	/** Minutes from midnight. endMin <= startMin means the shift crosses midnight. */
	endMin: number;
	unpaidBreakMin: number;
	colour: string;
	/** Which weekdays this template runs. */
	days: Weekday[];
}

export interface CoverageNeed {
	id: string;
	templateId: string;
	weekday: Weekday;
	role: string;
	/** Hard requirement used by the generator and the understaffed check. */
	min: number;
	/** Optional nicer-to-have number. */
	ideal?: number;
}

export type LeaveType = 'Paid' | 'Unpaid' | 'Sick';
export type LeaveStatus = 'Pending' | 'Approved' | 'Declined';

export interface Leave {
	id: string;
	staffId: string;
	startDate: DateStr;
	endDate: DateStr;
	type: LeaveType;
	status: LeaveStatus;
	note?: string;
}

/** One assigned (or open) shift instance. */
export interface Shift {
	id: string;
	date: DateStr;
	templateId: string;
	role: string;
	/** null = an open, unfilled slot. */
	staffId: string | null;
	locked: boolean;
	/** Manager override to allow a closed-day assignment. */
	closedDayOverride?: boolean;
	note?: string;
}

export type RosterStatus = 'Draft' | 'Published';

export interface RosterSnapshot {
	id: string;
	createdAt: string;
	label: string;
	shifts: Shift[];
}

export interface Roster {
	/** Week key: the civil date of the week's first day, e.g. '2026-10-26'. */
	weekStart: DateStr;
	status: RosterStatus;
	shifts: Shift[];
	snapshots: RosterSnapshot[];
	publishedAt?: string;
	/** Seed of the last generator run, for reproducibility. */
	lastSeed?: number;
}

export type RuleId =
	// Hard rules
	| 'no-overlap'
	| 'role-match'
	| 'not-on-leave'
	| 'availability'
	| 'max-hours-day'
	| 'max-hours-week'
	| 'min-rest'
	| 'max-consecutive-days'
	| 'closed-day'
	// Soft rules
	| 'preferred-days-off'
	| 'contracted-hours'
	| 'balance-hours'
	| 'rotate-unsocial'
	| 'clopening'
	| 'split-shift'
	| 'week-pattern';

export type Severity = 'Error' | 'Warning';

export interface Rule {
	id: RuleId;
	name: string;
	explanation: string;
	severity: Severity;
	enabled: boolean;
	/** Numeric threshold where the rule has one (hours, days, count). */
	value?: number;
	unit?: string;
	/** Soft-rule weight used by the generator's score. */
	weight?: number;
}

export type SwapStatus = 'Pending' | 'Approved' | 'Declined';

export interface SwapRequest {
	id: string;
	createdAt: string;
	shiftId: string;
	fromStaffId: string | null;
	/** null = move the shift to an open slot. */
	toStaffId: string | null;
	/** Optional second shift for a true two-way swap. */
	withShiftId?: string;
	reason: string;
	status: SwapStatus;
	decidedAt?: string;
}

export interface AppSettings {
	theme: Theme;
	density: Density;
	lastBackupAt?: string;
	showCost: boolean;
	overtimeMultiplier: number;
	sampleDataLoaded: boolean;
}

export interface AppData {
	schemaVersion: number;
	business: BusinessSettings;
	staff: Staff[];
	templates: ShiftTemplate[];
	coverage: CoverageNeed[];
	leave: Leave[];
	rosters: Record<DateStr, Roster>;
	rules: Rule[];
	swaps: SwapRequest[];
	settings: AppSettings;
}

// ---------------------------------------------------------------------------
// Validation output
// ---------------------------------------------------------------------------

export interface Issue {
	/** Rule that produced the issue, or a structural code. */
	type: RuleId | 'understaffed' | 'open-slot' | 'pending-leave';
	severity: Severity;
	staffId?: string | null;
	shiftId?: string;
	date?: DateStr;
	message: string;
	suggestedFix: string;
}

export interface ValidationInput {
	shifts: Shift[];
	staff: Staff[];
	templates: ShiftTemplate[];
	coverage: CoverageNeed[];
	leave: Leave[];
	rules: Rule[];
	business: BusinessSettings;
	/** Previous week's shifts so rest gaps and runs are correct across the boundary. */
	previousWeek: Shift[];
	weekStart: DateStr;
}
