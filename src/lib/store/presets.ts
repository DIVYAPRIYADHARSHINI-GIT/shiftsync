// One-click presets: Retail, Restaurant and Clinic (with night shifts).
//
// A preset fills in shift templates, coverage needs and rule values only. It never
// touches staff, leave or existing rosters, so a manager can load a preset into a
// business that already has people in it. Everything stays editable afterwards.

import type { CoverageNeed, Rule, ShiftTemplate, Weekday } from '../types';
import { mergeRules } from '../logic/rules';

export interface Preset {
	id: 'retail' | 'restaurant' | 'clinic';
	name: string;
	description: string;
	roles: string[];
	templates: ShiftTemplate[];
	coverage: CoverageNeed[];
	/** Rule overrides applied on top of the defaults. */
	ruleOverrides: Partial<Record<Rule['id'], Partial<Rule>>>;
}

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

function need(
	prefix: string,
	templateId: string,
	role: string,
	min: number,
	ideal: number,
	days: Weekday[]
): CoverageNeed[] {
	return days.map((weekday) => ({
		id: `${prefix}-${templateId}-${role}-${weekday}`.toLowerCase().replace(/\s+/g, ''),
		templateId,
		weekday,
		role,
		min,
		ideal
	}));
}

export const PRESETS: Preset[] = [
	{
		id: 'retail',
		name: 'Retail',
		description:
			'A shop open seven days with an opening and a closing shift, plus heavier weekend cover.',
		roles: ['Sales assistant', 'Cashier', 'Supervisor'],
		templates: [
			{
				id: 'tpl-open',
				name: 'Opening',
				startMin: 9 * 60,
				endMin: 15 * 60,
				unpaidBreakMin: 30,
				colour: '#0B6E4F',
				days: ALL_DAYS
			},
			{
				id: 'tpl-close',
				name: 'Closing',
				startMin: 14 * 60,
				endMin: 21 * 60,
				unpaidBreakMin: 30,
				colour: '#2B6CB0',
				days: ALL_DAYS
			}
		],
		coverage: [
			...need('retail', 'tpl-open', 'Sales assistant', 2, 3, ALL_DAYS),
			...need('retail', 'tpl-open', 'Cashier', 1, 2, ALL_DAYS),
			...need('retail', 'tpl-open', 'Supervisor', 1, 1, ALL_DAYS),
			...need('retail', 'tpl-close', 'Sales assistant', 2, 3, ALL_DAYS),
			...need('retail', 'tpl-close', 'Cashier', 1, 2, ALL_DAYS),
			...need('retail', 'tpl-close', 'Supervisor', 1, 1, ALL_DAYS)
		],
		ruleOverrides: {
			'max-hours-week': { value: 44 },
			'max-consecutive-days': { value: 6 }
		}
	},
	{
		id: 'restaurant',
		name: 'Restaurant',
		description:
			'Kitchen and front of house across lunch and dinner services, with a late close at the weekend.',
		roles: ['Server', 'Chef', 'Kitchen porter', 'Supervisor'],
		templates: [
			{
				id: 'tpl-lunch',
				name: 'Lunch service',
				startMin: 10 * 60 + 30,
				endMin: 16 * 60,
				unpaidBreakMin: 30,
				colour: '#0B6E4F',
				days: ALL_DAYS
			},
			{
				id: 'tpl-dinner',
				name: 'Dinner service',
				startMin: 16 * 60,
				endMin: 23 * 60,
				unpaidBreakMin: 30,
				colour: '#B7791F',
				days: ALL_DAYS
			},
			{
				id: 'tpl-late',
				name: 'Late close',
				startMin: 20 * 60,
				endMin: 1 * 60,
				unpaidBreakMin: 30,
				colour: '#7B3F9D',
				days: [5, 6]
			}
		],
		coverage: [
			...need('rest', 'tpl-lunch', 'Server', 2, 3, ALL_DAYS),
			...need('rest', 'tpl-lunch', 'Chef', 1, 2, ALL_DAYS),
			...need('rest', 'tpl-lunch', 'Kitchen porter', 1, 1, ALL_DAYS),
			...need('rest', 'tpl-dinner', 'Server', 3, 4, ALL_DAYS),
			...need('rest', 'tpl-dinner', 'Chef', 2, 2, ALL_DAYS),
			...need('rest', 'tpl-dinner', 'Supervisor', 1, 1, ALL_DAYS),
			...need('rest', 'tpl-late', 'Server', 1, 2, [5, 6]),
			...need('rest', 'tpl-late', 'Kitchen porter', 1, 1, [5, 6])
		],
		ruleOverrides: {
			'min-rest': { value: 11 },
			'clopening': { value: 13 },
			'max-hours-day': { value: 10 }
		}
	},
	{
		id: 'clinic',
		name: 'Clinic (with night shifts)',
		description:
			'Round-the-clock cover with a day, a late and a full night shift, and a longer rest rule between them.',
		roles: ['Nurse', 'Receptionist', 'Doctor', 'Supervisor'],
		templates: [
			{
				id: 'tpl-day',
				name: 'Day',
				startMin: 7 * 60,
				endMin: 15 * 60,
				unpaidBreakMin: 30,
				colour: '#0B6E4F',
				days: ALL_DAYS
			},
			{
				id: 'tpl-late-clinic',
				name: 'Late',
				startMin: 14 * 60 + 30,
				endMin: 22 * 60 + 30,
				unpaidBreakMin: 30,
				colour: '#2B6CB0',
				days: ALL_DAYS
			},
			{
				id: 'tpl-night-clinic',
				name: 'Night',
				startMin: 22 * 60,
				endMin: 7 * 60 + 30,
				unpaidBreakMin: 60,
				colour: '#7B3F9D',
				days: ALL_DAYS
			}
		],
		coverage: [
			...need('clinic', 'tpl-day', 'Nurse', 2, 3, ALL_DAYS),
			...need('clinic', 'tpl-day', 'Receptionist', 1, 1, WEEKDAYS),
			...need('clinic', 'tpl-day', 'Doctor', 1, 2, ALL_DAYS),
			...need('clinic', 'tpl-late-clinic', 'Nurse', 2, 2, ALL_DAYS),
			...need('clinic', 'tpl-late-clinic', 'Doctor', 1, 1, ALL_DAYS),
			...need('clinic', 'tpl-night-clinic', 'Nurse', 1, 2, ALL_DAYS),
			...need('clinic', 'tpl-night-clinic', 'Doctor', 1, 1, ALL_DAYS)
		],
		ruleOverrides: {
			'min-rest': { value: 12 },
			'max-consecutive-days': { value: 5 },
			'max-hours-week': { value: 48 },
			'rotate-unsocial': { value: 1, weight: 8 }
		}
	}
];

/** Apply a preset's rule overrides on top of the current rules. */
export function applyPresetRules(current: Rule[], preset: Preset): Rule[] {
	const merged = mergeRules(current);
	return merged.map((r) => {
		const override = preset.ruleOverrides[r.id];
		return override ? { ...r, ...override } : r;
	});
}

export function presetById(id: string): Preset | undefined {
	return PRESETS.find((p) => p.id === id);
}
