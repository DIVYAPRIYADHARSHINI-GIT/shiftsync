// Property-based tests: generate random staff, rules and coverage, then assert the
// invariant that matters most - the generator NEVER breaks a hard rule.
//
// A small hand-rolled generator keeps the dependency list short and the runs fast.
// Each case is seeded, so a failure is reproducible from the printed seed.

import { describe, it, expect } from 'vitest';
import { generateRoster, mulberry32, type GenerateOptions } from './generator';
import { validate } from './validate';
import { mergeRules } from './rules';
import type { CoverageNeed, Rule, ShiftTemplate, Staff, Weekday } from '../types';
import { BUSINESS } from './fixtures';
import { availability, ALL_DAY, NOT_AVAILABLE, between } from './fixtures';
import { addDays } from './time';

const ROLES = ['Barista', 'Cashier', 'Cook', 'Supervisor'];
const WEEK_STARTS = ['2026-10-26', '2026-12-28', '2026-03-23', '2027-02-22', '2024-02-26'];
const ZONES = ['Asia/Kolkata', 'Europe/London', 'UTC', 'America/New_York'];

function randomStaff(rand: () => number, count: number): Staff[] {
	return Array.from({ length: count }, (_, i) => {
		const roleCount = 1 + Math.floor(rand() * 2);
		const roles = Array.from(
			new Set(Array.from({ length: roleCount }, () => ROLES[Math.floor(rand() * ROLES.length)]))
		);
		const days = Array.from({ length: 7 }, () => {
			const roll = rand();
			if (roll < 0.15) return NOT_AVAILABLE;
			if (roll < 0.4) {
				const from = Math.floor(rand() * 10) * 60;
				return between(from, Math.min(1440, from + (6 + Math.floor(rand() * 10)) * 60));
			}
			return ALL_DAY;
		});
		const min = Math.floor(rand() * 20);
		return {
			id: `p${i + 1}`,
			name: `Person ${i + 1}`,
			roles,
			colour: '#0B6E4F',
			minWeeklyHours: min,
			maxWeeklyHours: min + 10 + Math.floor(rand() * 25),
			hourlyRate: 200 + Math.floor(rand() * 150),
			availability: availability(...days),
			unavailableDates: [],
			preferredDaysOff: rand() < 0.5 ? [Math.floor(rand() * 7) as Weekday] : [],
			notes: '',
			active: rand() < 0.92
		};
	});
}

function randomTemplates(rand: () => number): ShiftTemplate[] {
	const count = 1 + Math.floor(rand() * 3);
	return Array.from({ length: count }, (_, i) => {
		const overnight = rand() < 0.25;
		const startMin = overnight ? (20 + Math.floor(rand() * 4)) * 60 : Math.floor(rand() * 14) * 60;
		const lengthMin = (4 + Math.floor(rand() * 6)) * 60;
		const endMin = overnight ? (startMin + lengthMin) % 1440 : Math.min(1439, startMin + lengthMin);
		const days: Weekday[] = [];
		for (let d = 0; d < 7; d++) if (rand() < 0.8) days.push(d as Weekday);
		return {
			id: `t${i + 1}`,
			name: `Shift ${i + 1}`,
			startMin,
			endMin: overnight ? endMin : Math.max(startMin + 60, endMin),
			unpaidBreakMin: rand() < 0.5 ? 30 : 0,
			colour: '#0B6E4F',
			days: days.length ? days : [1, 2, 3, 4, 5]
		};
	});
}

function randomCoverage(
	rand: () => number,
	templates: ShiftTemplate[]
): CoverageNeed[] {
	const out: CoverageNeed[] = [];
	let id = 0;
	for (const t of templates) {
		for (const weekday of t.days) {
			for (const role of ROLES) {
				if (rand() < 0.35) {
					out.push({
						id: `c${++id}`,
						templateId: t.id,
						weekday,
						role,
						min: 1 + Math.floor(rand() * 2)
					});
				}
			}
		}
	}
	return out;
}

function randomRules(rand: () => number): Rule[] {
	return mergeRules(undefined).map((r) => {
		const next = { ...r };
		if (rand() < 0.2) next.enabled = false;
		if (typeof next.value === 'number') {
			if (next.id === 'max-hours-week') next.value = 30 + Math.floor(rand() * 25);
			else if (next.id === 'max-hours-day') next.value = 6 + Math.floor(rand() * 7);
			else if (next.id === 'min-rest') next.value = 8 + Math.floor(rand() * 6);
			else if (next.id === 'max-consecutive-days') next.value = 3 + Math.floor(rand() * 4);
		}
		return next;
	});
}

function hardErrorsOf(shifts: GenerateOptions['existing'], opts: GenerateOptions) {
	return validate({
		shifts,
		staff: opts.staff,
		templates: opts.templates,
		coverage: opts.coverage,
		leave: opts.leave,
		rules: opts.rules,
		business: opts.business,
		previousWeek: opts.previousWeek,
		weekStart: opts.weekStart
	}).filter((i) => i.severity === 'Error' && i.type !== 'understaffed');
}

function randomCase(seed: number): GenerateOptions {
	const rand = mulberry32(seed);
	const staff = randomStaff(rand, 2 + Math.floor(rand() * 14));
	const templates = randomTemplates(rand);
	const coverage = randomCoverage(rand, templates);
	const weekStart = WEEK_STARTS[Math.floor(rand() * WEEK_STARTS.length)];
	const timeZone = ZONES[Math.floor(rand() * ZONES.length)];

	// Random approved and pending leave.
	const leave = staff
		.filter(() => rand() < 0.2)
		.map((p, i) => {
			const offset = Math.floor(rand() * 7);
			return {
				id: `l${i}`,
				staffId: p.id,
				startDate: addDays(weekStart, offset),
				endDate: addDays(weekStart, Math.min(6, offset + Math.floor(rand() * 3))),
				type: (rand() < 0.5 ? 'Paid' : 'Sick') as 'Paid' | 'Sick',
				status: (rand() < 0.7 ? 'Approved' : 'Pending') as 'Approved' | 'Pending'
			};
		});

	return {
		weekStart,
		staff,
		templates,
		coverage,
		leave,
		rules: randomRules(rand),
		business: {
			...BUSINESS,
			timeZone,
			closedDays: rand() < 0.2 ? [{ id: 'c', date: addDays(weekStart, 3), name: 'Closed' }] : []
		},
		previousWeek: [],
		existing: [],
		seed,
		keepLocked: true,
		onlyEmpty: false,
		timeBudgetMs: 25
	};
}

describe('property: the generator never breaks a hard rule', () => {
	it('holds across 60 random businesses', () => {
		const failures: { seed: number; messages: string[] }[] = [];
		for (let seed = 1; seed <= 60; seed++) {
			const opts = randomCase(seed);
			const result = generateRoster(opts);
			const errors = hardErrorsOf(result.shifts, opts);
			if (errors.length > 0) {
				failures.push({ seed, messages: errors.slice(0, 3).map((e) => e.message) });
			}
		}
		expect(failures).toEqual([]);
	});

	it('holds when a previous week is present', () => {
		const failures: { seed: number; messages: string[] }[] = [];
		for (let seed = 200; seed <= 230; seed++) {
			const base = randomCase(seed);
			const prior = generateRoster({ ...base, weekStart: addDays(base.weekStart, -7) });
			const opts: GenerateOptions = {
				...base,
				previousWeek: prior.shifts,
				seed: seed + 1
			};
			const result = generateRoster(opts);
			const errors = hardErrorsOf(result.shifts, opts);
			if (errors.length > 0) {
				failures.push({ seed, messages: errors.slice(0, 3).map((e) => e.message) });
			}
		}
		expect(failures).toEqual([]);
	});

	it('holds when locked shifts are present', () => {
		const failures: number[] = [];
		for (let seed = 300; seed <= 325; seed++) {
			const base = randomCase(seed);
			const first = generateRoster(base);
			// Lock a third of the generated shifts, then regenerate.
			const existing = first.shifts
				.filter((_, i) => i % 3 === 0)
				.map((s) => ({ ...s, locked: true }));
			const opts: GenerateOptions = { ...base, existing, seed: seed + 7 };
			const result = generateRoster(opts);
			// Every locked shift must survive untouched.
			for (const locked of existing) {
				const found = result.shifts.find((s) => s.id === locked.id);
				if (!found || found.staffId !== locked.staffId) failures.push(seed);
			}
			if (hardErrorsOf(result.shifts, opts).length > 0) failures.push(seed);
		}
		expect(failures).toEqual([]);
	});

	it('is always deterministic for a given seed', () => {
		for (let seed = 400; seed <= 412; seed++) {
			const a = generateRoster(randomCase(seed));
			const b = generateRoster(randomCase(seed));
			expect(a.shifts.map((s) => `${s.id}:${s.staffId}`)).toEqual(
				b.shifts.map((s) => `${s.id}:${s.staffId}`)
			);
		}
	});

	it('never reports more filled slots than required', () => {
		for (let seed = 500; seed <= 520; seed++) {
			const result = generateRoster(randomCase(seed));
			expect(result.filledSlots).toBeLessThanOrEqual(result.requiredSlots);
			expect(result.fillRate).toBeGreaterThanOrEqual(0);
			expect(result.fillRate).toBeLessThanOrEqual(1);
		}
	});

	it('every unfilled slot carries a reason', () => {
		for (let seed = 600; seed <= 620; seed++) {
			const result = generateRoster(randomCase(seed));
			for (const slot of result.unfilled) {
				expect(slot.reason.length).toBeGreaterThan(10);
				expect(slot.reason).toMatch(/No available/);
			}
		}
	});
});
