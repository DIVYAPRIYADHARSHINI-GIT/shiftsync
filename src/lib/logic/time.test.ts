import { describe, it, expect } from 'vitest';
import {
	addDays,
	daysBetween,
	dateRange,
	elapsedMin,
	formatDuration,
	formatTime,
	formatWeekRange,
	isDateStr,
	isoWeekLabel,
	nominalSpanMin,
	paidMin,
	parseTime,
	startOfWeek,
	toDateStr,
	todayIn,
	weekDates,
	weekdayOf,
	zoneOffsetMin,
	zonedInstant,
	fixedClock,
	crossesMidnight,
	icsStamp,
	dateInRange
} from './time';

describe('civil date arithmetic', () => {
	it('never shifts a date by a day across a month boundary', () => {
		expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('handles a leap day', () => {
		expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
		expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
		expect(daysBetween('2024-02-01', '2024-03-01')).toBe(29);
	});

	it('crosses a year boundary', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
		expect(daysBetween('2026-12-28', '2027-01-04')).toBe(7);
	});

	it('validates date strings', () => {
		expect(isDateStr('2026-10-26')).toBe(true);
		expect(isDateStr('2026-02-30')).toBe(false);
		expect(isDateStr('2026-13-01')).toBe(false);
		expect(isDateStr('26-10-2026')).toBe(false);
		expect(isDateStr(20261026)).toBe(false);
	});

	it('computes the weekday', () => {
		expect(weekdayOf('2026-10-26')).toBe(1); // Monday
		expect(weekdayOf('2026-10-25')).toBe(0); // Sunday
	});

	it('finds the start of the week for both week-start settings', () => {
		expect(startOfWeek('2026-10-28', 1)).toBe('2026-10-26');
		expect(startOfWeek('2026-10-28', 0)).toBe('2026-10-25');
		expect(startOfWeek('2026-10-26', 1)).toBe('2026-10-26');
	});

	it('lists the seven dates of a week that crosses a month', () => {
		expect(weekDates('2026-10-26')).toEqual([
			'2026-10-26',
			'2026-10-27',
			'2026-10-28',
			'2026-10-29',
			'2026-10-30',
			'2026-10-31',
			'2026-11-01'
		]);
	});

	it('builds an inclusive date range', () => {
		expect(dateRange('2026-12-30', '2027-01-02')).toEqual([
			'2026-12-30',
			'2026-12-31',
			'2027-01-01',
			'2027-01-02'
		]);
	});

	it('checks inclusive range membership', () => {
		expect(dateInRange('2026-10-27', '2026-10-26', '2026-10-28')).toBe(true);
		expect(dateInRange('2026-10-26', '2026-10-26', '2026-10-26')).toBe(true);
		expect(dateInRange('2026-10-29', '2026-10-26', '2026-10-28')).toBe(false);
	});

	it('produces ISO week labels used in file names', () => {
		expect(isoWeekLabel('2026-10-26')).toBe('2026-W44');
		// 1 Jan 2027 is a Friday and belongs to ISO week 53 of 2026.
		expect(isoWeekLabel('2027-01-01')).toBe('2026-W53');
	});

	it('formats a week range across a month and a year', () => {
		expect(formatWeekRange('2026-10-26')).toBe('26 Oct - 1 Nov 2026');
		expect(formatWeekRange('2026-12-28')).toBe('28 Dec 2026 - 3 Jan 2027');
	});
});

describe('time of day', () => {
	it('parses and formats times', () => {
		expect(parseTime('09:00')).toBe(540);
		expect(parseTime('22:30')).toBe(1350);
		expect(parseTime('24:00')).toBe(1440);
		expect(formatTime(540)).toBe('09:00');
		expect(formatTime(1350)).toBe('22:30');
	});

	it('rejects malformed times', () => {
		expect(() => parseTime('9am')).toThrow();
		expect(() => parseTime('25:00')).toThrow();
		expect(() => parseTime('12:70')).toThrow();
	});

	it('detects midnight crossing', () => {
		expect(crossesMidnight(22 * 60, 6 * 60)).toBe(true);
		expect(crossesMidnight(9 * 60, 17 * 60)).toBe(false);
		// An exactly 24-hour shift counts as crossing.
		expect(crossesMidnight(600, 600)).toBe(true);
	});

	it('computes the nominal span of an overnight shift', () => {
		expect(nominalSpanMin(22 * 60, 6 * 60)).toBe(8 * 60);
		expect(nominalSpanMin(9 * 60, 17 * 60)).toBe(8 * 60);
	});

	it('formats durations', () => {
		expect(formatDuration(450)).toBe('7h 30m');
		expect(formatDuration(480)).toBe('8h');
		expect(formatDuration(-60)).toBe('-1h');
	});
});

describe('time zones and daylight saving', () => {
	it('reports zone offsets', () => {
		expect(zoneOffsetMin(Date.UTC(2026, 0, 15), 'Asia/Kolkata')).toBe(330);
		expect(zoneOffsetMin(Date.UTC(2026, 0, 15), 'Europe/London')).toBe(0);
		expect(zoneOffsetMin(Date.UTC(2026, 6, 15), 'Europe/London')).toBe(60);
	});

	it('unknown zones fall back to UTC rather than throwing', () => {
		expect(zoneOffsetMin(Date.UTC(2026, 0, 1), 'Not/AZone')).toBe(0);
	});

	it('resolves a civil time to the right instant', () => {
		const ms = zonedInstant('2026-10-26', 9 * 60, 'Asia/Kolkata');
		expect(new Date(ms).toISOString()).toBe('2026-10-26T03:30:00.000Z');
	});

	it('a 23-hour spring-forward day shortens a shift that spans the change', () => {
		// Europe/London springs forward at 01:00 on 29 March 2026.
		const minutes = elapsedMin('2026-03-28', 22 * 60, 6 * 60, 'Europe/London');
		expect(minutes).toBe(7 * 60);
	});

	it('a 25-hour autumn day lengthens a shift that spans the change', () => {
		// Europe/London falls back at 02:00 on 25 October 2026.
		const minutes = elapsedMin('2026-10-24', 22 * 60, 6 * 60, 'Europe/London');
		expect(minutes).toBe(9 * 60);
	});

	it('a normal overnight shift is exactly its nominal span', () => {
		expect(elapsedMin('2026-10-26', 22 * 60, 6 * 60, 'Asia/Kolkata')).toBe(8 * 60);
	});

	it('paid minutes subtract the unpaid break and never go negative', () => {
		expect(paidMin('2026-10-26', 7 * 60, 15 * 60, 30, 'Asia/Kolkata')).toBe(7 * 60 + 30);
		expect(paidMin('2026-10-26', 9 * 60, 10 * 60, 90, 'Asia/Kolkata')).toBe(0);
	});

	it('resolves today in the business zone from an injected clock', () => {
		// 22:00 UTC on 26 Oct is already 27 Oct in Kolkata (+05:30).
		const clock = fixedClock('2026-10-26T22:00:00Z');
		expect(todayIn('Asia/Kolkata', clock)).toBe('2026-10-27');
		expect(todayIn('UTC', clock)).toBe('2026-10-26');
	});

	it('formats ICS stamps in UTC', () => {
		expect(icsStamp(Date.UTC(2026, 9, 26, 8, 30, 0))).toBe('20261026T083000Z');
	});

	it('round-trips a UTC midnight through toDateStr', () => {
		expect(toDateStr(Date.UTC(2027, 0, 1))).toBe('2027-01-01');
	});
});
