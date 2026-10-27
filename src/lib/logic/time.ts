// Time and duration maths for ShiftSync.
//
// Rules this module enforces, from the brief:
//  - A civil date is the string 'YYYY-MM-DD'. Arithmetic happens on UTC midnight of that
//    civil date, so a date can NEVER be shifted by a day by a time-zone conversion.
//  - All times are minutes from midnight (0..1439).
//  - A shift whose end time is at or before its start time crosses midnight. It belongs to
//    the day it STARTS and counts all of its hours on that day.
//  - Real elapsed time is resolved through the business time zone, so a 23-hour or
//    25-hour daylight-saving day produces the correct paid duration.
//
// No UI imports. The clock is injectable everywhere it is needed.

import type { DateStr, Weekday } from '../types';

export interface Clock {
	/** Current instant in epoch milliseconds. */
	now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** A fixed clock for tests. */
export function fixedClock(iso: string): Clock {
	const ms = Date.parse(iso);
	return { now: () => ms };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateStr(value: unknown): value is DateStr {
	if (typeof value !== 'string') return false;
	const m = DATE_RE.exec(value);
	if (!m) return false;
	const y = Number(m[1]);
	const mo = Number(m[2]);
	const d = Number(m[3]);
	if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
	// Round-trip to reject 2026-02-30 and friends.
	return toDateStr(utcMidnight(y, mo, d)) === value;
}

function utcMidnight(year: number, month: number, day: number): number {
	return Date.UTC(year, month - 1, day);
}

/** Civil date string -> UTC midnight epoch ms. Throws on a malformed date. */
export function dateToUtc(date: DateStr): number {
	const m = DATE_RE.exec(date);
	if (!m) throw new Error(`Invalid date: ${date}`);
	return utcMidnight(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** UTC midnight epoch ms -> civil date string. */
export function toDateStr(utcMs: number): DateStr {
	const d = new Date(utcMs);
	const y = String(d.getUTCFullYear()).padStart(4, '0');
	const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${y}-${mo}-${day}`;
}

/** Add whole days to a civil date. Correct across months, years and leap days. */
export function addDays(date: DateStr, days: number): DateStr {
	return toDateStr(dateToUtc(date) + days * 86_400_000);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: DateStr, b: DateStr): number {
	return Math.round((dateToUtc(b) - dateToUtc(a)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date: DateStr): Weekday {
	return new Date(dateToUtc(date)).getUTCDay() as Weekday;
}

/** First day of the week containing `date`, honouring the business week start. */
export function startOfWeek(date: DateStr, weekStartDay: 0 | 1): DateStr {
	const wd = weekdayOf(date);
	const diff = (wd - weekStartDay + 7) % 7;
	return addDays(date, -diff);
}

/** The seven civil dates of the week starting at `weekStart`. */
export function weekDates(weekStart: DateStr): DateStr[] {
	return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** ISO-8601 week number and ISO week-numbering year, for file names like 2026-W44. */
export function isoWeek(date: DateStr): { year: number; week: number } {
	// Shift to the Thursday of the ISO week: that day is always in the ISO year.
	const utc = dateToUtc(date);
	const day = (new Date(utc).getUTCDay() + 6) % 7; // Monday = 0
	const thursday = utc + (3 - day) * 86_400_000;
	const year = new Date(thursday).getUTCFullYear();
	const jan1 = Date.UTC(year, 0, 1);
	const week = Math.floor((thursday - jan1) / 86_400_000 / 7) + 1;
	return { year, week };
}

/** 'YYYY-Www' label used in export file names. */
export function isoWeekLabel(date: DateStr): string {
	const { year, week } = isoWeek(date);
	return `${year}-W${String(week).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Minutes-from-midnight helpers
// ---------------------------------------------------------------------------

/** 'HH:MM' -> minutes from midnight. Accepts '24:00' as 1440 for an end time. */
export function parseTime(value: string): number {
	const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!m) throw new Error(`Invalid time: ${value}`);
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 24 || min > 59 || (h === 24 && min !== 0)) throw new Error(`Invalid time: ${value}`);
	return h * 60 + min;
}

/** Minutes from midnight -> 'HH:MM' with tabular-friendly zero padding. */
export function formatTime(minutes: number): string {
	const m = ((minutes % 1440) + 1440) % 1440;
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Whether a start/end pair crosses midnight (end at or before start). */
export function crossesMidnight(startMin: number, endMin: number): boolean {
	return endMin <= startMin;
}

/**
 * Nominal (civil) length of a shift in minutes, ignoring daylight saving.
 * A midnight-crossing shift wraps into the next civil day.
 */
export function nominalSpanMin(startMin: number, endMin: number): number {
	return crossesMidnight(startMin, endMin) ? 1440 - startMin + endMin : endMin - startMin;
}

// ---------------------------------------------------------------------------
// Time-zone aware instants
// ---------------------------------------------------------------------------

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let f = offsetFormatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		offsetFormatters.set(timeZone, f);
	}
	return f;
}

/** Zone offset in minutes (east of UTC positive) at a given instant. */
export function zoneOffsetMin(utcMs: number, timeZone: string): number {
	let parts: Intl.DateTimeFormatPart[];
	try {
		parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
	} catch {
		return 0; // Unknown zone: behave as UTC rather than crash the roster.
	}
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
	const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
	return Math.round((asUtc - utcMs) / 60_000);
}

/**
 * Resolve a civil date + minutes-from-midnight in `timeZone` to an epoch instant.
 * Handles daylight-saving transitions: a time that does not exist (spring forward)
 * resolves forward past the gap; an ambiguous time (autumn) resolves to the first
 * occurrence, which is the conventional choice for rostering.
 */
export function zonedInstant(date: DateStr, minutes: number, timeZone: string): number {
	const civil = dateToUtc(date) + minutes * 60_000;
	const guess = civil - zoneOffsetMin(civil, timeZone) * 60_000;
	const refined = civil - zoneOffsetMin(guess, timeZone) * 60_000;
	return refined;
}

/**
 * Real elapsed minutes of a shift in the business time zone, including the break.
 * On a 23-hour day this returns 60 minutes less than the nominal span when the shift
 * spans the transition; on a 25-hour day, 60 minutes more.
 */
export function elapsedMin(
	date: DateStr,
	startMin: number,
	endMin: number,
	timeZone: string
): number {
	const start = zonedInstant(date, startMin, timeZone);
	const endDate = crossesMidnight(startMin, endMin) ? addDays(date, 1) : date;
	const endMinutes = crossesMidnight(startMin, endMin) ? endMin : endMin;
	const end = zonedInstant(endDate, endMinutes, timeZone);
	return Math.round((end - start) / 60_000);
}

/** Paid minutes: real elapsed time minus the unpaid break, never negative. */
export function paidMin(
	date: DateStr,
	startMin: number,
	endMin: number,
	unpaidBreakMin: number,
	timeZone: string
): number {
	return Math.max(0, elapsedMin(date, startMin, endMin, timeZone) - unpaidBreakMin);
}

/** Minutes -> decimal hours rounded to two places, for display and totals. */
export function toHours(minutes: number): number {
	return Math.round((minutes / 60) * 100) / 100;
}

/** Minutes -> 'Hh MMm' style duration label, e.g. '7h 30m'. */
export function formatDuration(minutes: number): string {
	const sign = minutes < 0 ? '-' : '';
	const abs = Math.abs(minutes);
	const h = Math.floor(abs / 60);
	const m = abs % 60;
	if (m === 0) return `${sign}${h}h`;
	return `${sign}${h}h ${String(m).padStart(2, '0')}m`;
}

// ---------------------------------------------------------------------------
// Formatting for the interface
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

export function weekdayName(weekday: Weekday, short = false): string {
	const name = WEEKDAY_NAMES[weekday];
	return short ? name.slice(0, 3) : name;
}

export function monthName(date: DateStr, short = false): string {
	const name = MONTH_NAMES[new Date(dateToUtc(date)).getUTCMonth()];
	return short ? name.slice(0, 3) : name;
}

/** '26 Oct 2026' - unambiguous and locale-independent. */
export function formatDate(date: DateStr): string {
	const d = new Date(dateToUtc(date));
	return `${d.getUTCDate()} ${monthName(date, true)} ${d.getUTCFullYear()}`;
}

/** 'Mon 26 Oct' for day headers. */
export function formatDayHeader(date: DateStr): string {
	const d = new Date(dateToUtc(date));
	return `${weekdayName(weekdayOf(date), true)} ${d.getUTCDate()} ${monthName(date, true)}`;
}

/** '26 Oct - 1 Nov 2026' for the week switcher. */
export function formatWeekRange(weekStart: DateStr): string {
	const end = addDays(weekStart, 6);
	const a = new Date(dateToUtc(weekStart));
	const b = new Date(dateToUtc(end));
	const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
	const left = `${a.getUTCDate()} ${monthName(weekStart, true)}${sameYear ? '' : ` ${a.getUTCFullYear()}`}`;
	const right = `${b.getUTCDate()} ${monthName(end, true)} ${b.getUTCFullYear()}`;
	return `${left} - ${right}`;
}

/** Today's civil date in the business time zone, from the injectable clock. */
export function todayIn(timeZone: string, clock: Clock = systemClock): DateStr {
	const now = clock.now();
	const offset = zoneOffsetMin(now, timeZone);
	return toDateStr(Math.floor((now + offset * 60_000) / 86_400_000) * 86_400_000);
}

/** True when `date` is within [start, end] inclusive, as civil dates. */
export function dateInRange(date: DateStr, start: DateStr, end: DateStr): boolean {
	const d = dateToUtc(date);
	return d >= dateToUtc(start) && d <= dateToUtc(end);
}

/** Inclusive list of civil dates from start to end (capped for safety). */
export function dateRange(start: DateStr, end: DateStr, cap = 400): DateStr[] {
	const out: DateStr[] = [];
	let cur = start;
	for (let i = 0; i <= cap; i++) {
		out.push(cur);
		if (cur === end || dateToUtc(cur) > dateToUtc(end)) break;
		cur = addDays(cur, 1);
	}
	return out;
}

/** UTC timestamp for ICS, e.g. '20261026T083000Z'. */
export function icsStamp(utcMs: number): string {
	const d = new Date(utcMs);
	const p = (n: number, w = 2) => String(n).padStart(w, '0');
	return (
		`${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T` +
		`${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
	);
}
