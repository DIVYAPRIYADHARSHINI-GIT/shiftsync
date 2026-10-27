// Default rule set.
//
// Every rule carries a name, a plain-language explanation (used directly as the tooltip),
// a severity, an on/off switch and - where it has one - an editable numeric value.
// Hard rules are Errors the generator will never break. Soft rules are Warnings that the
// generator scores and tries to minimise.
//
// NOT LEGAL ADVICE: thresholds differ by country and employer. The defaults below are
// common European working-time conventions, shown as a starting point only.

import type { Rule, RuleId } from '../types';

export const DEFAULT_RULES: Rule[] = [
	// ---- Hard rules (Error) -------------------------------------------------
	{
		id: 'no-overlap',
		name: 'No overlapping shifts',
		explanation:
			'One person cannot be on two shifts at the same time. Overnight shifts are compared across the midnight boundary.',
		severity: 'Error',
		enabled: true
	},
	{
		id: 'role-match',
		name: 'Required role',
		explanation: 'The person assigned to a slot must hold the role that slot asks for.',
		severity: 'Error',
		enabled: true
	},
	{
		id: 'not-on-leave',
		name: 'Not on approved leave',
		explanation:
			'Nobody is scheduled on a day covered by approved leave. Pending leave does not block the shift, it raises a warning.',
		severity: 'Error',
		enabled: true
	},
	{
		id: 'availability',
		name: 'Within availability',
		explanation:
			'The shift must fall inside the person\u2019s weekly availability pattern, and the date must not be one of their specific unavailable dates.',
		severity: 'Error',
		enabled: true
	},
	{
		id: 'max-hours-day',
		name: 'Maximum hours per day',
		explanation:
			'The paid hours of all shifts starting on one day stay at or below this limit. An overnight shift counts on the day it starts.',
		severity: 'Error',
		enabled: true,
		value: 10,
		unit: 'hours'
	},
	{
		id: 'max-hours-week',
		name: 'Maximum hours per week',
		explanation: 'Total paid hours in the roster week stay at or below this limit.',
		severity: 'Error',
		enabled: true,
		value: 48,
		unit: 'hours'
	},
	{
		id: 'min-rest',
		name: 'Minimum rest between shifts',
		explanation:
			'There must be at least this many hours between the end of one shift and the start of the next, including across the week boundary.',
		severity: 'Error',
		enabled: true,
		value: 11,
		unit: 'hours'
	},
	{
		id: 'max-consecutive-days',
		name: 'Maximum consecutive working days',
		explanation:
			'A person cannot work more than this many days in a row. The previous week is included in the run.',
		severity: 'Error',
		enabled: true,
		value: 6,
		unit: 'days'
	},
	{
		id: 'closed-day',
		name: 'Closed days and holidays',
		explanation:
			'No shifts on a closed day or public holiday unless you tick the override on that shift.',
		severity: 'Error',
		enabled: true
	},

	// ---- Soft rules (Warning) ----------------------------------------------
	{
		id: 'preferred-days-off',
		name: 'Preferred days off',
		explanation:
			'Avoid scheduling a person on the weekdays they asked to keep free. This is a preference, not a block.',
		severity: 'Warning',
		enabled: true,
		weight: 6
	},
	{
		id: 'contracted-hours',
		name: 'Contracted hours range',
		explanation:
			'Keep each person\u2019s scheduled hours between their contracted minimum and maximum.',
		severity: 'Warning',
		enabled: true,
		weight: 8
	},
	{
		id: 'balance-hours',
		name: 'Balanced hours within a role',
		explanation:
			'Spread hours evenly between people who hold the same role. A gap wider than this many hours is flagged.',
		severity: 'Warning',
		enabled: true,
		value: 8,
		unit: 'hours',
		weight: 5
	},
	{
		id: 'rotate-unsocial',
		name: 'Fair weekend and night shifts',
		explanation:
			'Rotate weekend and night shifts so the same people do not always take them. A gap wider than this many shifts is flagged.',
		severity: 'Warning',
		enabled: true,
		value: 2,
		unit: 'shifts',
		weight: 5
	},
	{
		id: 'clopening',
		name: 'No clopening',
		explanation:
			'Avoid a late finish followed by an early start the next day, even when the minimum rest is technically met.',
		severity: 'Warning',
		enabled: true,
		value: 12,
		unit: 'hours',
		weight: 7
	},
	{
		id: 'split-shift',
		name: 'No split shifts',
		explanation: 'Avoid giving one person two separate shifts on the same day.',
		severity: 'Warning',
		enabled: true,
		weight: 4
	},
	{
		id: 'week-pattern',
		name: 'Similar pattern week to week',
		explanation:
			'Keep each person on a similar set of days and shifts as the previous week, so their routine stays predictable.',
		severity: 'Warning',
		enabled: true,
		weight: 3
	}
];

export const HARD_RULE_IDS: RuleId[] = [
	'no-overlap',
	'role-match',
	'not-on-leave',
	'availability',
	'max-hours-day',
	'max-hours-week',
	'min-rest',
	'max-consecutive-days',
	'closed-day'
];

export function cloneDefaultRules(): Rule[] {
	return DEFAULT_RULES.map((r) => ({ ...r }));
}

export function ruleById(rules: Rule[], id: RuleId): Rule | undefined {
	return rules.find((r) => r.id === id);
}

/** Enabled lookup that treats a missing rule as disabled. */
export function isEnabled(rules: Rule[], id: RuleId): boolean {
	return ruleById(rules, id)?.enabled === true;
}

/** Numeric value with a fallback when the rule is missing or has no value. */
export function ruleValue(rules: Rule[], id: RuleId, fallback: number): number {
	const v = ruleById(rules, id)?.value;
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function ruleWeight(rules: Rule[], id: RuleId, fallback = 1): number {
	const r = ruleById(rules, id);
	if (!r || !r.enabled) return 0;
	return typeof r.weight === 'number' ? r.weight : fallback;
}

/** Merge stored rules with the defaults so a new rule appears after an upgrade. */
export function mergeRules(stored: Rule[] | undefined): Rule[] {
	const byId = new Map((stored ?? []).map((r) => [r.id, r]));
	return DEFAULT_RULES.map((def) => {
		const found = byId.get(def.id);
		if (!found) return { ...def };
		return {
			...def,
			severity: found.severity ?? def.severity,
			enabled: found.enabled ?? def.enabled,
			value: typeof found.value === 'number' ? found.value : def.value,
			weight: typeof found.weight === 'number' ? found.weight : def.weight
		};
	});
}
