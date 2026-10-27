// ICS (RFC 5545) calendar export for one person's shifts.
//
// Time-zone approach: each shift's start and end are resolved to a real instant through
// the business time zone (including daylight-saving transitions) and written as UTC
// stamps with a trailing 'Z'. UTC stamps are unambiguous in every calendar client and
// need no VTIMEZONE block, so an overnight shift lands on the correct clock time on a
// phone in any zone. The business zone is also recorded in X-WR-TIMEZONE and the
// description for reference.

import type { Shift, ShiftTemplate, Staff } from '../types';
import { addDays, formatTime, icsStamp, toHours, zonedInstant } from './time';
import { resolveAll } from './validate';

/** Fold a content line to 75 octets as RFC 5545 requires. */
export function foldLine(line: string): string {
	const bytes = new TextEncoder().encode(line);
	if (bytes.length <= 75) return line;
	const out: string[] = [];
	let current = '';
	let currentBytes = 0;
	for (const ch of line) {
		const size = new TextEncoder().encode(ch).length;
		const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
		if (currentBytes + size > limit) {
			out.push(current);
			current = ch;
			currentBytes = size;
		} else {
			current += ch;
			currentBytes += size;
		}
	}
	if (current) out.push(current);
	return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join('\r\n');
}

export function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

export interface IcsOptions {
	staff: Staff;
	shifts: Shift[];
	templates: ShiftTemplate[];
	businessName: string;
	timeZone: string;
	/** Injected so the DTSTAMP is deterministic in tests. */
	nowMs: number;
}

export function buildIcs(opts: IcsOptions): string {
	const { staff, shifts, templates, businessName, timeZone, nowMs } = opts;
	const mine = shifts.filter((s) => s.staffId === staff.id);
	const resolved = resolveAll(mine, templates, timeZone).sort((a, b) => a.startMs - b.startMs);
	const stamp = icsStamp(nowMs);

	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//ShiftSync//Staff roster planner//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escapeIcsText(`${staff.name} - ${businessName} shifts`)}`,
		`X-WR-TIMEZONE:${escapeIcsText(timeZone)}`
	];

	for (const r of resolved) {
		const start = zonedInstant(r.shift.date, r.template.startMin, timeZone);
		const endDate = r.overnight ? addDays(r.shift.date, 1) : r.shift.date;
		const end = zonedInstant(endDate, r.template.endMin, timeZone);
		const summary = `${r.template.name} (${r.shift.role})`;
		const description =
			`${businessName}\\n` +
			`${formatTime(r.template.startMin)}-${formatTime(r.template.endMin)}` +
			`${r.overnight ? ' (next day)' : ''}\\n` +
			`Paid hours: ${toHours(r.paidMinutes).toFixed(2)}\\n` +
			`Unpaid break: ${r.template.unpaidBreakMin} minutes\\n` +
			`Time zone: ${timeZone}`;
		lines.push(
			'BEGIN:VEVENT',
			`UID:${r.shift.id}@shiftsync`,
			`DTSTAMP:${stamp}`,
			`DTSTART:${icsStamp(start)}`,
			`DTEND:${icsStamp(end)}`,
			`SUMMARY:${escapeIcsText(summary)}`,
			`DESCRIPTION:${description}`,
			`LOCATION:${escapeIcsText(businessName)}`,
			'END:VEVENT'
		);
	}

	lines.push('END:VCALENDAR');
	return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function icsFileName(staffName: string, weekLabel: string): string {
	const stem = staffName.normalize('NFKD').replace(/[^\p{Letter}\p{Number}]+/gu, '') || 'Staff';
	return `Shifts_${stem}_${weekLabel}.ics`;
}
