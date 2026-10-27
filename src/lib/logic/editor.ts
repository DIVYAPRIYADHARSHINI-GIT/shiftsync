// Pure roster-editing operations used by the grid, the keyboard menu and the palette.
// Each returns a NEW shift list; the caller commits it through app.setShifts so undo
// and persistence are handled in one place.

import type { CoverageNeed, DateStr, Shift, ShiftTemplate, Weekday } from '../types';
import { addDays, weekDates, weekdayOf } from './time';
import { closedDayFor } from './validate';
import type { BusinessSettings } from '../types';

let counter = 0;
/** Unique id for a manually created shift. Prefixed so generated ids stay recognisable. */
export function newShiftId(): string {
	counter++;
	return `shift-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function addShift(
	shifts: Shift[],
	date: DateStr,
	templateId: string,
	role: string,
	staffId: string | null
): Shift[] {
	return [
		...shifts,
		{ id: newShiftId(), date, templateId, role, staffId, locked: false }
	];
}

export function removeShifts(shifts: Shift[], ids: string[]): Shift[] {
	const set = new Set(ids);
	return shifts.filter((s) => !set.has(s.id));
}

export function assignShift(shifts: Shift[], shiftId: string, staffId: string | null): Shift[] {
	return shifts.map((s) => (s.id === shiftId ? { ...s, staffId } : s));
}

/** Move a shift to a different person and/or a different date. */
export function moveShift(
	shifts: Shift[],
	shiftId: string,
	staffId: string | null,
	date?: DateStr
): Shift[] {
	return shifts.map((s) =>
		s.id === shiftId ? { ...s, staffId, date: date ?? s.date } : s
	);
}

/** Exchange the people on two shifts. */
export function swapShifts(shifts: Shift[], aId: string, bId: string): Shift[] {
	const a = shifts.find((s) => s.id === aId);
	const b = shifts.find((s) => s.id === bId);
	if (!a || !b) return shifts;
	return shifts.map((s) => {
		if (s.id === aId) return { ...s, staffId: b.staffId };
		if (s.id === bId) return { ...s, staffId: a.staffId };
		return s;
	});
}

export function setLocked(shifts: Shift[], ids: string[], locked: boolean): Shift[] {
	const set = new Set(ids);
	return shifts.map((s) => (set.has(s.id) ? { ...s, locked } : s));
}

export function setClosedDayOverride(shifts: Shift[], ids: string[], override: boolean): Shift[] {
	const set = new Set(ids);
	return shifts.map((s) => (set.has(s.id) ? { ...s, closedDayOverride: override } : s));
}

/** Bulk assign: give every selected shift to one person. */
export function bulkAssign(shifts: Shift[], ids: string[], staffId: string | null): Shift[] {
	const set = new Set(ids);
	return shifts.map((s) => (set.has(s.id) ? { ...s, staffId } : s));
}

/**
 * Copy the previous week into this one, shifting every date forward by 7 days.
 * Locked shifts in the target week are preserved; everything else is replaced.
 */
export function copyLastWeek(
	currentShifts: Shift[],
	previousShifts: Shift[],
	business: BusinessSettings
): Shift[] {
	const kept = currentShifts.filter((s) => s.locked);
	const copied = previousShifts
		.map((s) => ({
			...s,
			id: newShiftId(),
			date: addDays(s.date, 7),
			locked: false
		}))
		// Do not copy a shift onto a closed day in the new week.
		.filter((s) => !closedDayFor(business, s.date) || s.closedDayOverride);
	return [...kept, ...copied];
}

/** Clear the week, keeping locked shifts. */
export function clearWeek(shifts: Shift[]): Shift[] {
	return shifts.filter((s) => s.locked);
}

/** Paste copied shifts onto a target date (and optionally a target person). */
export function pasteShifts(
	shifts: Shift[],
	clipboard: Shift[],
	targetDate: DateStr,
	targetStaffId?: string | null
): Shift[] {
	if (clipboard.length === 0) return shifts;
	// Preserve the relative day offsets of a multi-day copy.
	const earliest = clipboard.reduce((min, s) => (s.date < min ? s.date : min), clipboard[0].date);
	const offsetOf = (date: DateStr) =>
		Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${earliest}T00:00:00Z`)) / 86_400_000);
	const pasted = clipboard.map((s) => ({
		...s,
		id: newShiftId(),
		date: addDays(targetDate, offsetOf(s.date)),
		staffId: targetStaffId === undefined ? s.staffId : targetStaffId,
		locked: false
	}));
	return [...shifts, ...pasted];
}

/**
 * Create the open slots required by the coverage needs that are not already present.
 * Used by "Fill open slots" and when a week has never been generated, so the grid
 * shows dashed cards for what is still missing.
 */
export function materialiseOpenSlots(
	shifts: Shift[],
	coverage: CoverageNeed[],
	templates: ShiftTemplate[],
	weekStart: DateStr,
	business: BusinessSettings
): Shift[] {
	const out = [...shifts];
	for (const date of weekDates(weekStart)) {
		if (closedDayFor(business, date)) continue;
		const wd = weekdayOf(date);
		for (const need of coverage) {
			if (need.weekday !== wd) continue;
			const template = templates.find((t) => t.id === need.templateId);
			if (!template || !template.days.includes(wd)) continue;
			const existing = out.filter(
				(s) => s.date === date && s.templateId === need.templateId && s.role === need.role
			).length;
			for (let i = existing; i < need.min; i++) {
				out.push({
					id: newShiftId(),
					date,
					templateId: need.templateId,
					role: need.role,
					staffId: null,
					locked: false
				});
			}
		}
	}
	return out;
}

/** Remove open slots that no coverage need asks for any more. */
export function pruneOrphanOpenSlots(
	shifts: Shift[],
	coverage: CoverageNeed[],
	templates: ShiftTemplate[]
): Shift[] {
	return shifts.filter((s) => {
		if (s.staffId) return true;
		const wd = weekdayOf(s.date);
		const template = templates.find((t) => t.id === s.templateId);
		if (!template) return false;
		return coverage.some(
			(c) => c.templateId === s.templateId && c.role === s.role && c.weekday === wd
		);
	});
}

/** Shifts for one person on one date, used by the staff-view cells. */
export function shiftsFor(shifts: Shift[], staffId: string, date: DateStr): Shift[] {
	return shifts.filter((s) => s.staffId === staffId && s.date === date);
}

/** Shifts for one template and role on one date, used by the shift-view cells. */
export function slotsFor(
	shifts: Shift[],
	templateId: string,
	role: string,
	date: DateStr
): Shift[] {
	return shifts.filter((s) => s.templateId === templateId && s.role === role && s.date === date);
}

/** Distinct template+role pairs required anywhere in the week, for the shift view rows. */
export function shiftViewRows(
	coverage: CoverageNeed[],
	shifts: Shift[],
	templates: ShiftTemplate[]
): { templateId: string; role: string }[] {
	const keys = new Map<string, { templateId: string; role: string }>();
	for (const c of coverage) keys.set(`${c.templateId}|${c.role}`, { templateId: c.templateId, role: c.role });
	for (const s of shifts) keys.set(`${s.templateId}|${s.role}`, { templateId: s.templateId, role: s.role });
	return [...keys.values()].sort((a, b) => {
		const ta = templates.find((t) => t.id === a.templateId);
		const tb = templates.find((t) => t.id === b.templateId);
		const sa = ta?.startMin ?? 0;
		const sb = tb?.startMin ?? 0;
		if (sa !== sb) return sa - sb;
		return a.role.localeCompare(b.role);
	});
}

/** How many people a need asks for on a weekday. */
export function requiredFor(
	coverage: CoverageNeed[],
	templateId: string,
	role: string,
	weekday: Weekday
): { min: number; ideal?: number } {
	const need = coverage.find(
		(c) => c.templateId === templateId && c.role === role && c.weekday === weekday
	);
	return { min: need?.min ?? 0, ideal: need?.ideal };
}
