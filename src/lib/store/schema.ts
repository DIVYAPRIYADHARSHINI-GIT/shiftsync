// Versioned schema and migrations.
//
// A migration list, not a single "upgrade" function, so a database could be added later
// behind the same RosterStore interface without touching the rest of the app.
// Bump CURRENT_SCHEMA_VERSION and append one entry to MIGRATIONS for every change.

import type { AppData, BusinessSettings, AppSettings } from '../types';
import { mergeRules } from '../logic/rules';

export const CURRENT_SCHEMA_VERSION = 1;

export const STORAGE_KEY = 'shiftsync:data:v1';

export const DEFAULT_BUSINESS: BusinessSettings = {
	name: 'My business',
	timeZone: 'Asia/Kolkata',
	weekStartDay: 1,
	currency: 'INR',
	closedDays: []
};

export const DEFAULT_SETTINGS: AppSettings = {
	theme: 'system',
	density: 'comfortable',
	showCost: true,
	overtimeMultiplier: 1.5,
	sampleDataLoaded: false
};

export function emptyData(): AppData {
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		business: { ...DEFAULT_BUSINESS, closedDays: [] },
		staff: [],
		templates: [],
		coverage: [],
		leave: [],
		rosters: {},
		rules: mergeRules(undefined),
		swaps: [],
		settings: { ...DEFAULT_SETTINGS }
	};
}

type Migration = { to: number; up: (data: AppData) => AppData };

/**
 * Migrations run in order for any stored version below CURRENT_SCHEMA_VERSION.
 * Version 1 is the first released schema, so the list is empty today. Example of the
 * shape a future change takes:
 *   { to: 2, up: (d) => ({ ...d, business: { ...d.business, country: 'IN' } }) }
 */
export const MIGRATIONS: Migration[] = [];

/** Bring stored data up to the current schema and fill in anything missing. */
export function migrate(data: AppData, fromVersion: number): AppData {
	let out = data;
	for (const m of MIGRATIONS) {
		if (fromVersion < m.to) out = m.up(out);
	}
	return normalise(out);
}

/** Defensive normalisation so a hand-edited or partial file still opens. */
export function normalise(data: Partial<AppData>): AppData {
	const base = emptyData();
	const rosters = data.rosters ?? {};
	for (const roster of Object.values(rosters)) {
		roster.shifts ??= [];
		roster.snapshots ??= [];
		roster.status ??= 'Draft';
		for (const shift of roster.shifts) {
			shift.locked ??= false;
			if (shift.staffId === undefined) shift.staffId = null;
		}
	}
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		business: { ...base.business, ...(data.business ?? {}), closedDays: data.business?.closedDays ?? [] },
		staff: (data.staff ?? []).map((s) => ({
			...s,
			roles: s.roles ?? [],
			unavailableDates: s.unavailableDates ?? [],
			preferredDaysOff: s.preferredDaysOff ?? [],
			notes: s.notes ?? '',
			active: s.active !== false
		})),
		templates: data.templates ?? [],
		coverage: data.coverage ?? [],
		leave: data.leave ?? [],
		rosters,
		rules: mergeRules(data.rules),
		swaps: data.swaps ?? [],
		settings: { ...base.settings, ...(data.settings ?? {}) }
	};
}
