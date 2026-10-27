// JSON backup validation.
//
// Import NEVER silently overwrites existing data: the UI requires an explicit choice
// (replace or cancel) and shows exactly what the file contains first. This module only
// decides whether a file is a valid ShiftSync backup and explains clearly when it is not.

import type { AppData, Shift } from '../types';
import { isDateStr } from './time';
import { CURRENT_SCHEMA_VERSION, migrate } from '../store/schema';

export interface BackupEnvelope {
	app: 'shiftsync';
	schemaVersion: number;
	exportedAt: string;
	data: AppData;
}

export type BackupCheck =
	| {
			ok: true;
			data: AppData;
			/** Human summary shown before the manager confirms the import. */
			summary: { staff: number; templates: number; rosters: number; leave: number; swaps: number };
			/** Set when the file came from an older schema and was migrated on read. */
			migratedFrom?: number;
	  }
	| { ok: false; error: string; detail?: string };

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate a backup file's text. Returns a clear, actionable error for every failure
 * mode: not JSON, not an object, wrong app, missing sections, wrong field types, a
 * schema from the future, or shifts with malformed dates.
 */
export function validateBackup(text: string): BackupCheck {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (e) {
		return {
			ok: false,
			error: 'This file is not valid JSON.',
			detail:
				'Choose the .json file that ShiftSync exported. A renamed spreadsheet or a partly downloaded file will fail here.'
		};
	}

	if (!isObject(parsed)) {
		return {
			ok: false,
			error: 'This file does not contain a ShiftSync backup.',
			detail: 'The top level of the file should be an object with an "app" field.'
		};
	}

	if (parsed.app !== 'shiftsync') {
		return {
			ok: false,
			error: 'This backup was not created by ShiftSync.',
			detail: `The file reports app "${String(parsed.app ?? 'unknown')}". Export a fresh backup from Privacy and backup.`
		};
	}

	const version = Number(parsed.schemaVersion);
	if (!Number.isInteger(version) || version < 1) {
		return {
			ok: false,
			error: 'The backup has no usable schema version.',
			detail: 'Export a fresh backup from this version of ShiftSync.'
		};
	}
	if (version > CURRENT_SCHEMA_VERSION) {
		return {
			ok: false,
			error: 'This backup was made by a newer version of ShiftSync.',
			detail: `The file uses schema ${version}; this app reads up to ${CURRENT_SCHEMA_VERSION}. Update the app, then import again.`
		};
	}

	if (!isObject(parsed.data)) {
		return {
			ok: false,
			error: 'The backup is missing its data section.',
			detail: 'Expected a "data" object holding staff, templates, rosters and settings.'
		};
	}

	const data = parsed.data as Record<string, unknown>;
	for (const key of ['staff', 'templates', 'coverage', 'leave', 'swaps'] as const) {
		if (!Array.isArray(data[key])) {
			return {
				ok: false,
				error: `The backup section "${key}" is missing or is not a list.`,
				detail: 'The file looks edited or truncated. Import a backup exported by ShiftSync.'
			};
		}
	}
	if (!isObject(data.business)) {
		return { ok: false, error: 'The backup has no business settings section.' };
	}
	if (!isObject(data.rosters)) {
		return {
			ok: false,
			error: 'The backup section "rosters" is missing or is not an object.',
			detail: 'Rosters are stored keyed by the first date of each week.'
		};
	}

	// Staff shape
	for (const [i, person] of (data.staff as unknown[]).entries()) {
		if (!isObject(person) || typeof person.id !== 'string' || typeof person.name !== 'string') {
			return {
				ok: false,
				error: `Staff entry ${i + 1} is missing an id or a name.`,
				detail: 'Every person needs a text id and a name.'
			};
		}
		if (!Array.isArray(person.roles)) {
			return { ok: false, error: `Staff entry "${person.name}" has no roles list.` };
		}
	}

	// Roster keys and shift dates
	for (const [weekKey, roster] of Object.entries(data.rosters as Record<string, unknown>)) {
		if (!isDateStr(weekKey)) {
			return {
				ok: false,
				error: `Roster key "${weekKey}" is not a date.`,
				detail: 'Roster weeks are keyed by the first day of the week as YYYY-MM-DD.'
			};
		}
		if (!isObject(roster) || !Array.isArray(roster.shifts)) {
			return { ok: false, error: `The roster for week ${weekKey} has no shifts list.` };
		}
		for (const shift of roster.shifts as unknown[]) {
			if (!isObject(shift) || !isDateStr(shift.date)) {
				return {
					ok: false,
					error: `A shift in week ${weekKey} has a malformed date.`,
					detail: 'Shift dates must be written as YYYY-MM-DD.'
				};
			}
			if (typeof shift.templateId !== 'string' || typeof shift.role !== 'string') {
				return {
					ok: false,
					error: `A shift on ${String(shift.date)} is missing its template or role.`
				};
			}
			const staffId = (shift as Partial<Shift>).staffId;
			if (staffId !== null && typeof staffId !== 'string') {
				return {
					ok: false,
					error: `A shift on ${String(shift.date)} has an invalid person reference.`,
					detail: 'Use null for an open slot or a staff id for an assigned shift.'
				};
			}
		}
	}

	const migrated = migrate(data as unknown as AppData, version);
	const rosterCount = Object.keys(migrated.rosters).length;

	return {
		ok: true,
		data: migrated,
		migratedFrom: version < CURRENT_SCHEMA_VERSION ? version : undefined,
		summary: {
			staff: migrated.staff.length,
			templates: migrated.templates.length,
			rosters: rosterCount,
			leave: migrated.leave.length,
			swaps: migrated.swaps.length
		}
	};
}

export function buildBackup(data: AppData, nowIso: string): BackupEnvelope {
	return {
		app: 'shiftsync',
		schemaVersion: CURRENT_SCHEMA_VERSION,
		exportedAt: nowIso,
		data
	};
}

export function backupFileName(businessName: string, nowIso: string): string {
	const stem =
		businessName.normalize('NFKD').replace(/[^\p{Letter}\p{Number}]+/gu, '').slice(0, 40) ||
		'ShiftSync';
	return `ShiftSync_Backup_${stem}_${nowIso.slice(0, 10)}.json`;
}

/** Days since the last backup, or null when there has never been one. */
export function daysSinceBackup(lastBackupAt: string | undefined, nowMs: number): number | null {
	if (!lastBackupAt) return null;
	const then = Date.parse(lastBackupAt);
	if (Number.isNaN(then)) return null;
	return Math.floor((nowMs - then) / 86_400_000);
}

/** The reminder fires after 7 days without a backup, or when there has never been one. */
export function backupReminderDue(lastBackupAt: string | undefined, nowMs: number): boolean {
	const days = daysSinceBackup(lastBackupAt, nowMs);
	return days === null || days >= 7;
}
