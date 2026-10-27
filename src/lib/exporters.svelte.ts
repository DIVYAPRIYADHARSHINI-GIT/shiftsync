// Browser-side export helpers shared by Reports and the Hours summary.
// Every export is built in the browser from localStorage data. The only network call
// anywhere in the app is the POST to /api/pdf, which stores nothing.

import { app } from './state.svelte';
import type { PdfRequest } from './server/pdf';
import { rosterCsv, rosterFileName, safeFileStem } from './logic/csv';
import { buildIcs, icsFileName } from './logic/ics';
import { resolveAll } from './logic/validate';
import {
	formatDate,
	formatDayHeader,
	formatTime,
	formatWeekRange,
	isoWeekLabel,
	toHours,
	weekDates
} from './logic/time';
import type { Shift } from './types';

export function downloadBlob(name: string, data: BlobPart, type: string) {
	const blob = new Blob([data], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

/** Long-format roster CSV for the open week. */
export function exportRosterCsv() {
	const csv = rosterCsv(
		$state.snapshot(app.roster.shifts) as Shift[],
		$state.snapshot(app.data.staff),
		$state.snapshot(app.data.templates),
		app.data.business.timeZone
	);
	downloadBlob(
		rosterFileName(app.data.business.name, isoWeekLabel(app.currentWeek), 'csv'),
		csv,
		'text/csv;charset=utf-8'
	);
	app.toast('Roster exported as CSV.', 'success');
}

/** Per-person ICS calendar file. */
export function exportPersonIcs(staffId: string) {
	const person = app.staffById(staffId);
	if (!person) return;
	const ics = buildIcs({
		staff: $state.snapshot(person),
		shifts: $state.snapshot(app.roster.shifts) as Shift[],
		templates: $state.snapshot(app.data.templates),
		businessName: app.data.business.name,
		timeZone: app.data.business.timeZone,
		nowMs: Date.now()
	});
	downloadBlob(
		icsFileName(person.name, isoWeekLabel(app.currentWeek)),
		ics,
		'text/calendar;charset=utf-8'
	);
	app.toast(`Calendar file exported for ${person.name}.`, 'success');
}

/** Build the payload the PDF route renders. */
export function buildPdfRequest(includePersonPages: boolean): PdfRequest {
	const dates = weekDates(app.currentWeek);
	const resolved = resolveAll(
		$state.snapshot(app.roster.shifts) as Shift[],
		$state.snapshot(app.data.templates),
		app.data.business.timeZone
	);
	return {
		businessName: app.data.business.name,
		weekLabel: isoWeekLabel(app.currentWeek),
		weekRange: formatWeekRange(app.currentWeek),
		status: app.roster.status,
		days: dates.map((date) => ({ date, label: formatDayHeader(date) })),
		staffOrder: app.activeStaff.map((s) => s.name),
		shifts: resolved.map((r) => ({
			date: r.shift.date,
			start: formatTime(r.template.startMin),
			end: formatTime(r.template.endMin),
			overnight: r.overnight,
			templateName: r.template.name,
			templateColour: r.template.colour,
			role: r.shift.role,
			person: app.staffById(r.shift.staffId)?.name ?? '',
			paidHours: toHours(r.paidMinutes)
		})),
		templates: app.data.templates.map((t) => ({
			name: t.name,
			colour: t.colour,
			times: `${formatTime(t.startMin)}-${formatTime(t.endMin)}`
		})),
		summary: app.activeStaff.map((person) => {
			const mine = resolved.filter((r) => r.shift.staffId === person.id);
			return {
				name: person.name,
				roles: person.roles.join(', '),
				hours: toHours(mine.reduce((sum, r) => sum + r.paidMinutes, 0)),
				shifts: mine.length
			};
		}),
		includePersonPages,
		timeZone: app.data.business.timeZone,
		generatedAt: new Date().toISOString()
	};
}

export interface PdfOutcome {
	ok: boolean;
	/** Set when the server asked the client to use the print route instead. */
	fallbackToPrint?: boolean;
	message?: string;
}

/**
 * Ask the PDF route to render the open week. On HTTP 422 the roster contains Tamil or
 * Devanagari text that pdf-lib cannot shape, and the caller falls back to /print.
 */
export async function exportRosterPdf(includePersonPages: boolean): Promise<PdfOutcome> {
	const payload = buildPdfRequest(includePersonPages);
	try {
		const response = await fetch('/api/pdf', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (response.status === 422) {
			const body = (await response.json()) as { error?: string; detail?: string };
			return {
				ok: false,
				fallbackToPrint: true,
				message: `${body.error ?? 'This roster uses a script the PDF cannot shape.'} ${body.detail ?? ''}`.trim()
			};
		}

		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { error?: string };
			return { ok: false, message: body.error ?? 'The PDF could not be generated.' };
		}

		const bytes = await response.arrayBuffer();
		downloadBlob(
			rosterFileName(app.data.business.name, payload.weekLabel, 'pdf'),
			bytes,
			'application/pdf'
		);
		return { ok: true };
	} catch {
		return {
			ok: false,
			message: 'The PDF route could not be reached. Check your connection and try again.'
		};
	}
}

/** Short plain text week for the whole team, for pasting into a message. */
export function wholeWeekText(): string {
	const dates = weekDates(app.currentWeek);
	const lines = [
		`${app.data.business.name} roster`,
		`${formatWeekRange(app.currentWeek)} (${app.roster.status})`,
		''
	];
	for (const date of dates) {
		const dayShifts = resolveAll(
			$state.snapshot(app.roster.shifts.filter((s) => s.date === date)) as Shift[],
			$state.snapshot(app.data.templates),
			app.data.business.timeZone
		).sort((a, b) => a.template.startMin - b.template.startMin);
		lines.push(formatDayHeader(date));
		if (dayShifts.length === 0) lines.push('  No shifts');
		for (const r of dayShifts) {
			const who = app.staffById(r.shift.staffId)?.name ?? 'OPEN';
			lines.push(
				`  ${formatTime(r.template.startMin)}-${formatTime(r.template.endMin)}` +
					`${r.overnight ? '+1' : ''} ${r.template.name} (${r.shift.role}): ${who}`
			);
		}
		lines.push('');
	}
	return lines.join('\n').trimEnd();
}

/** One person's week as short plain text. */
export function personWeekText(staffId: string): string {
	const person = app.staffById(staffId);
	if (!person) return '';
	const mine = resolveAll(
		$state.snapshot(app.roster.shifts.filter((s) => s.staffId === staffId)) as Shift[],
		$state.snapshot(app.data.templates),
		app.data.business.timeZone
	).sort((a, b) => a.startMs - b.startMs);
	const lines = [
		`${person.name} - ${app.data.business.name}`,
		formatWeekRange(app.currentWeek),
		''
	];
	if (mine.length === 0) lines.push('No shifts this week.');
	for (const r of mine) {
		lines.push(
			`${formatDayHeader(r.shift.date)}: ${formatTime(r.template.startMin)}-${formatTime(r.template.endMin)}` +
				`${r.overnight ? '+1' : ''} ${r.template.name} (${r.shift.role})`
		);
	}
	const hours = toHours(mine.reduce((sum, r) => sum + r.paidMinutes, 0));
	lines.push('', `Total ${hours} hours over ${mine.length} shifts.`);
	return lines.join('\n');
}

export async function copyText(text: string, what: string) {
	try {
		await navigator.clipboard.writeText(text);
		app.toast(`${what} copied. Paste it into WhatsApp or any message.`, 'success');
	} catch {
		app.toast(
			'The browser blocked clipboard access. Select the text in the preview and copy it manually.',
			'warning'
		);
	}
}
