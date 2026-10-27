// Swap validation and application.
//
// A swap is validated by building the roster that WOULD result and running the same
// `validate` function the editor uses, then reporting only the issues the swap adds.
// Nothing is applied until the manager approves.

import type { Issue, Shift, SwapRequest, ValidationInput } from '../types';
import { issueKey, validate } from './validate';

export interface SwapEvaluation {
	/** The roster that would result if the swap were approved. */
	resultingShifts: Shift[];
	/** Issues the swap introduces (not pre-existing ones). */
	addedIssues: Issue[];
	addedErrors: Issue[];
	addedWarnings: Issue[];
	/** Issues the swap resolves. */
	resolvedIssues: Issue[];
	ok: boolean;
	summary: string;
}

/** Apply a swap to a shift list without validating. */
export function applySwap(shifts: Shift[], swap: SwapRequest): Shift[] {
	if (swap.withShiftId) {
		// Two-way swap: exchange the people on the two shifts.
		const a = shifts.find((s) => s.id === swap.shiftId);
		const b = shifts.find((s) => s.id === swap.withShiftId);
		if (!a || !b) return shifts;
		return shifts.map((s) => {
			if (s.id === a.id) return { ...s, staffId: b.staffId };
			if (s.id === b.id) return { ...s, staffId: a.staffId };
			return s;
		});
	}
	// One-way move: hand the shift to the target person, or open it up.
	return shifts.map((s) => (s.id === swap.shiftId ? { ...s, staffId: swap.toStaffId } : s));
}

export function evaluateSwap(input: ValidationInput, swap: SwapRequest): SwapEvaluation {
	const before = validate(input);
	const beforeKeys = new Set(before.map(issueKey));
	const resultingShifts = applySwap(input.shifts, swap);
	const after = validate({ ...input, shifts: resultingShifts });
	const afterKeys = new Set(after.map(issueKey));

	const addedIssues = after.filter((i) => !beforeKeys.has(issueKey(i)));
	const resolvedIssues = before.filter((i) => !afterKeys.has(issueKey(i)));
	const addedErrors = addedIssues.filter((i) => i.severity === 'Error');
	const addedWarnings = addedIssues.filter((i) => i.severity === 'Warning');

	let summary: string;
	if (addedErrors.length > 0) {
		summary = `This swap would break ${addedErrors.length} rule${addedErrors.length === 1 ? '' : 's'}.`;
	} else if (addedWarnings.length > 0) {
		summary = `This swap is allowed and adds ${addedWarnings.length} warning${addedWarnings.length === 1 ? '' : 's'}.`;
	} else if (resolvedIssues.length > 0) {
		summary = `This swap is clean and resolves ${resolvedIssues.length} existing issue${resolvedIssues.length === 1 ? '' : 's'}.`;
	} else {
		summary = 'This swap is clean. No new rule issues.';
	}

	return {
		resultingShifts,
		addedIssues,
		addedErrors,
		addedWarnings,
		resolvedIssues,
		ok: addedErrors.length === 0,
		summary
	};
}
