// CSV output in long format, plus the hours summary export.
// RFC 4180 quoting, CRLF line endings and a UTF-8 BOM so Excel opens Tamil and
// Devanagari names correctly.

import type { DateStr, Shift, ShiftTemplate, Staff } from '../types';
import { formatTime, toHours } from './time';
import { resolveAll } from './validate';
import type { HoursRow } from './hours';

export function csvCell(value: string | number | undefined | null): string {
	if (value === undefined || value === null) return '';
	const s = String(value);
	if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

export function csvRows(rows: (string | number | undefined | null)[][]): string {
	return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Prefix a UTF-8 BOM so spreadsheet apps detect the encoding. */
export function withBom(csv: string): string {
	return `\uFEFF${csv}`;
}

/** Long-format roster CSV: date, shift, role, person, start, end, paid hours. */
export function rosterCsv(
	shifts: Shift[],
	staff: Staff[],
	templates: ShiftTemplate[],
	timeZone: string
): string {
	const resolved = resolveAll(shifts, templates, timeZone).sort((a, b) => {
		if (a.shift.date !== b.shift.date) return a.shift.date < b.shift.date ? -1 : 1;
		return a.template.startMin - b.template.startMin;
	});
	const header = [
		'Date',
		'Shift',
		'Role',
		'Person',
		'Start',
		'End',
		'Paid hours',
		'Overnight',
		'Status'
	];
	const body = resolved.map((r) => {
		const person = staff.find((s) => s.id === r.shift.staffId);
		return [
			r.shift.date,
			r.template.name,
			r.shift.role,
			person?.name ?? '',
			formatTime(r.template.startMin),
			formatTime(r.template.endMin),
			toHours(r.paidMinutes).toFixed(2),
			r.overnight ? 'Yes' : 'No',
			r.shift.staffId ? 'Assigned' : 'Open'
		];
	});
	return withBom(csvRows([header, ...body]));
}

/** Hours summary CSV for a period. */
export function hoursCsv(rows: HoursRow[], currency: string): string {
	const header = [
		'Person',
		'Roles',
		'Scheduled hours',
		'Contracted min',
		'Contracted max',
		'Overtime hours',
		'Shifts',
		'Weekend shifts',
		'Night shifts',
		'Days off',
		'Longest run',
		`Estimated cost (${currency})`
	];
	const body = rows.map((r) => [
		r.name,
		r.roles.join(' / '),
		r.hours.toFixed(2),
		r.minHours,
		r.maxHours,
		r.overtimeHours.toFixed(2),
		r.shifts,
		r.weekendShifts,
		r.nightShifts,
		r.daysOff,
		r.longestRun,
		typeof r.estimatedCost === 'number' ? r.estimatedCost.toFixed(2) : ''
	]);
	return withBom(csvRows([header, ...body]));
}

/** A safe file-name fragment from a business name. */
export function safeFileStem(value: string): string {
	return (
		value
			.normalize('NFKD')
			.replace(/[^\p{Letter}\p{Number}]+/gu, '')
			.slice(0, 40) || 'Roster'
	);
}

export function rosterFileName(
	business: string,
	weekLabel: string,
	extension: string
): string {
	return `Roster_${safeFileStem(business)}_${weekLabel}.${extension}`;
}

/** Minimal CSV parser used when importing - handles quotes and embedded newlines. */
export function parseCsv(text: string): string[][] {
	const clean = text.replace(/^\uFEFF/, '');
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < clean.length; i++) {
		const ch = clean[i];
		if (quoted) {
			if (ch === '"') {
				if (clean[i + 1] === '"') {
					cell += '"';
					i++;
				} else quoted = false;
			} else cell += ch;
			continue;
		}
		if (ch === '"') quoted = true;
		else if (ch === ',') {
			row.push(cell);
			cell = '';
		} else if (ch === '\n') {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else if (ch !== '\r') cell += ch;
	}
	if (cell !== '' || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows;
}

export type { DateStr };
