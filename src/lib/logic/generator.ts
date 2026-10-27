// Seeded, deterministic roster generator.
//
// Approach (stated plainly on the About page too):
//   1. Build the full slot list from the coverage needs for the chosen week.
//   2. Order slots hardest-first: fewest eligible people, then night/weekend, then time.
//   3. Fill each slot with the eligible person who scores best on fairness, never
//      creating a hard-rule violation (the check is the same `validate` the editor uses).
//   4. Improve the result with a short local search that moves and swaps shifts to
//      reduce soft-rule penalties, again rejecting anything that breaks a hard rule.
//
// It is a HEURISTIC. It produces a good roster that follows the rules; it does not
// guarantee the best possible one. When a slot cannot be filled, the reason for every
// candidate is recorded so the results panel can explain it in plain language.
//
// Deterministic: the same seed and the same input always produce the same roster.
// Pure: no clock, no storage, no UI. Runs inside a Web Worker with a time budget.

import type {
	CoverageNeed,
	DateStr,
	Issue,
	Leave,
	Rule,
	Shift,
	ShiftTemplate,
	Staff,
	BusinessSettings
} from '../types';
import {
	addDays,
	toHours,
	weekDates,
	weekdayOf,
	formatDate,
	zonedInstant,
	paidMin
} from './time';
import { isEnabled, ruleValue, ruleWeight } from './rules';
import {
	approvedLeaveOn,
	availabilityFits,
	closedDayFor,
	consecutiveRunEndingOn,
	isNightShift,
	isWeekend,
	resolveAll,
	shiftLabel,
	validate,
	type ResolvedShift
} from './validate';

// ---------------------------------------------------------------------------
// Seeded random (mulberry32) - small, fast and reproducible.
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface GenerateOptions {
	weekStart: DateStr;
	staff: Staff[];
	templates: ShiftTemplate[];
	coverage: CoverageNeed[];
	leave: Leave[];
	rules: Rule[];
	business: BusinessSettings;
	previousWeek: Shift[];
	/** Existing shifts in the week. Locked ones are always kept. */
	existing: Shift[];
	seed: number;
	/** Keep locked shifts, people and days. */
	keepLocked: boolean;
	/** Only fill slots that are currently empty; never move an existing assignment. */
	onlyEmpty: boolean;
	/** Staff ids whose assignments must not change. */
	lockedStaffIds?: string[];
	/** Dates whose assignments must not change. */
	lockedDates?: DateStr[];
	/**
	 * Wall-clock SAFETY stop in ms. Determinism comes from `maxIterations`, not from the
	 * clock, so a slow machine produces the same roster as a fast one. This budget only
	 * guards against a pathological input and is reported as `hitTimeLimit` when it fires.
	 */
	timeBudgetMs?: number;
	/**
	 * Deterministic local-search budget. Defaults to a value scaled from the problem size.
	 * Two runs with the same seed and the same iteration budget always agree.
	 */
	maxIterations?: number;
	/** Injected so the worker can report progress and honour Cancel. */
	onProgress?: (fraction: number) => void;
	shouldCancel?: () => boolean;
	/** Injected time source so tests are deterministic. */
	nowMs?: () => number;
}

export interface UnfilledSlot {
	date: DateStr;
	templateId: string;
	role: string;
	/** Plain-language explanation naming the blocked candidates. */
	reason: string;
}

export interface FairnessRow {
	staffId: string;
	name: string;
	hours: number;
	minHours: number;
	maxHours: number;
	weekendShifts: number;
	nightShifts: number;
	daysOff: number;
	longestRun: number;
}

export interface GenerateResult {
	shifts: Shift[];
	seed: number;
	requiredSlots: number;
	filledSlots: number;
	fillRate: number;
	unfilled: UnfilledSlot[];
	issues: Issue[];
	fairness: FairnessRow[];
	softScore: number;
	/** True when coverage simply cannot be met with the available people. */
	impossible: boolean;
	impossibleReason?: string;
	cancelled: boolean;
	elapsedMs: number;
	iterations: number;
	/** True when the wall-clock safety stop fired before the iteration budget was spent. */
	hitTimeLimit: boolean;
}

interface Slot {
	date: DateStr;
	template: ShiftTemplate;
	role: string;
	/** Index within the role requirement, used for a stable slot id. */
	index: number;
}

/**
 * Deterministic shift ids so two runs with the same seed compare cleanly.
 *
 * `slot.index` alone is NOT unique: the remaining-slot list is rebuilt after preserved
 * shifts are matched off, so two different requirements can both arrive carrying index 0.
 * A per-run counter is appended to guarantee uniqueness while staying deterministic,
 * because the slot order itself is deterministic for a given seed.
 */
function slotId(slot: Slot, seed: number, ordinal: number): string {
	return `gen-${seed}-${slot.date}-${slot.template.id}-${slot.role}-${slot.index}-${ordinal}`.replace(
		/\s+/g,
		''
	);
}

/** Build the required slot list from the coverage needs. */
export function buildSlots(
	weekStart: DateStr,
	coverage: CoverageNeed[],
	templates: ShiftTemplate[],
	business: BusinessSettings
): Slot[] {
	const slots: Slot[] = [];
	for (const date of weekDates(weekStart)) {
		if (closedDayFor(business, date)) continue;
		const wd = weekdayOf(date);
		for (const need of coverage) {
			if (need.weekday !== wd) continue;
			const template = templates.find((t) => t.id === need.templateId);
			if (!template || !template.days.includes(wd)) continue;
			for (let i = 0; i < need.min; i++) {
				slots.push({ date, template, role: need.role, index: i });
			}
		}
	}
	return slots;
}

/** Why a candidate cannot take a slot, or null when they can. */
function blockReason(
	person: Staff,
	slot: Slot,
	state: Shift[],
	opts: GenerateOptions
): string | null {
	const tz = opts.business.timeZone;
	if (!person.active) return `${person.name} is deactivated`;
	if (!person.roles.includes(slot.role)) return `${person.name} is not a ${slot.role}`;

	const leave = approvedLeaveOn(opts.leave, person.id, slot.date);
	if (leave) return `${person.name} is on ${leave.type.toLowerCase()} leave`;

	const fit = availabilityFits(person, slot.template, slot.date);
	if (!fit.ok) return fit.reason;

	// Hour, rest and run limits are checked against the state built so far.
	const mine = state.filter((s) => s.staffId === person.id);
	const resolvedMine = resolveAll([...mine, ...opts.previousWeek.filter((s) => s.staffId === person.id)], opts.templates, tz);
	const slotStart = zonedInstant(slot.date, slot.template.startMin, tz);
	const overnight = slot.template.endMin <= slot.template.startMin;
	const slotEnd = zonedInstant(
		overnight ? addDays(slot.date, 1) : slot.date,
		slot.template.endMin,
		tz
	);
	const slotPaid = paidMin(
		slot.date,
		slot.template.startMin,
		slot.template.endMin,
		slot.template.unpaidBreakMin,
		tz
	);

	// Overlap
	for (const r of resolvedMine) {
		if (slotStart < r.endMs && r.startMs < slotEnd) {
			return `${person.name} already works ${shiftLabel(r.template)} then`;
		}
	}

	// Daily hours
	if (isEnabled(opts.rules, 'max-hours-day')) {
		const limit = ruleValue(opts.rules, 'max-hours-day', 10) * 60;
		const sameDay = resolvedMine
			.filter((r) => r.shift.date === slot.date)
			.reduce((sum, r) => sum + r.paidMinutes, 0);
		if (sameDay + slotPaid > limit) {
			return `${person.name} would pass the ${toHours(limit)} hour daily limit`;
		}
	}

	// Weekly hours (this roster week only)
	if (isEnabled(opts.rules, 'max-hours-week')) {
		const limit = ruleValue(opts.rules, 'max-hours-week', 48) * 60;
		const weekMinutes = resolveAll(mine, opts.templates, tz).reduce(
			(sum, r) => sum + r.paidMinutes,
			0
		);
		if (weekMinutes + slotPaid > limit) {
			return `${person.name} is already at ${toHours(weekMinutes)} hours`;
		}
	}

	// Minimum rest
	if (isEnabled(opts.rules, 'min-rest')) {
		const minRestMs = ruleValue(opts.rules, 'min-rest', 11) * 3_600_000;
		for (const r of resolvedMine) {
			const gapAfter = slotStart - r.endMs;
			const gapBefore = r.startMs - slotEnd;
			if (gapAfter >= 0 && gapAfter < minRestMs) {
				return `${person.name} needs ${toHours(minRestMs / 60000)} hours rest after their previous shift`;
			}
			if (gapBefore >= 0 && gapBefore < minRestMs) {
				return `${person.name} needs ${toHours(minRestMs / 60000)} hours rest before their next shift`;
			}
		}
	}

	// Consecutive days
	if (isEnabled(opts.rules, 'max-consecutive-days')) {
		const maxRun = ruleValue(opts.rules, 'max-consecutive-days', 6);
		const worked = new Set<DateStr>(resolvedMine.map((r) => r.shift.date));
		worked.add(slot.date);
		// Check the run through the new date and a few days forward.
		for (let i = 0; i <= 7; i++) {
			const probe = addDays(slot.date, i);
			if (!worked.has(probe)) break;
			if (consecutiveRunEndingOn(worked, probe) > maxRun) {
				return `${person.name} would work more than ${maxRun} days in a row`;
			}
		}
	}

	return null;
}

/** Lower is better. Fairness-driven preference among eligible people. */
function candidateScore(
	person: Staff,
	slot: Slot,
	state: Shift[],
	opts: GenerateOptions,
	rand: () => number
): number {
	const tz = opts.business.timeZone;
	const mine = state.filter((s) => s.staffId === person.id);
	const resolvedMine = resolveAll(mine, opts.templates, tz);
	const minutes = resolvedMine.reduce((sum, r) => sum + r.paidMinutes, 0);
	const hours = toHours(minutes);

	let score = 0;

	// Keep hours inside the contracted range: strongly prefer people below their minimum.
	const contractWeight = ruleWeight(opts.rules, 'contracted-hours', 8);
	if (hours < person.minWeeklyHours) score -= contractWeight * (person.minWeeklyHours - hours);
	else if (hours > person.maxWeeklyHours) score += contractWeight * (hours - person.maxWeeklyHours);

	// Balance hours: fewer hours so far is better.
	score += ruleWeight(opts.rules, 'balance-hours', 5) * (hours / 10);

	// Preferred days off.
	if (person.preferredDaysOff.includes(weekdayOf(slot.date))) {
		score += ruleWeight(opts.rules, 'preferred-days-off', 6) * 2;
	}

	// Rotate unsocial shifts: prefer whoever has had fewer so far.
	const rotateWeight = ruleWeight(opts.rules, 'rotate-unsocial', 5);
	if (isWeekend(slot.date)) {
		const count = resolvedMine.filter((r) => isWeekend(r.shift.date)).length;
		score += rotateWeight * count;
	}
	if (isNightShift(slot.template)) {
		const count = resolvedMine.filter((r) => isNightShift(r.template)).length;
		score += rotateWeight * count;
	}

	// Avoid split shifts.
	if (mine.some((s) => s.date === slot.date)) {
		score += ruleWeight(opts.rules, 'split-shift', 4) * 3;
	}

	// Clopening: a short-but-legal gap is worse than a long one.
	const clopeningWeight = ruleWeight(opts.rules, 'clopening', 7);
	if (clopeningWeight > 0) {
		const limitMs = ruleValue(opts.rules, 'clopening', 12) * 3_600_000;
		const slotStart = zonedInstant(slot.date, slot.template.startMin, tz);
		for (const r of resolveAll(
			[...mine, ...opts.previousWeek.filter((s) => s.staffId === person.id)],
			opts.templates,
			tz
		)) {
			const gap = slotStart - r.endMs;
			if (gap >= 0 && gap < limitMs) score += clopeningWeight * 2;
		}
	}

	// Keep last week's pattern: a small bonus for working the same weekday as last week.
	const patternWeight = ruleWeight(opts.rules, 'week-pattern', 3);
	if (patternWeight > 0) {
		const lastWeekDays = new Set(
			opts.previousWeek.filter((s) => s.staffId === person.id).map((s) => weekdayOf(s.date))
		);
		if (lastWeekDays.has(weekdayOf(slot.date))) score -= patternWeight;
	}

	// Tiny deterministic jitter breaks ties differently per seed.
	score += rand() * 0.5;
	return score;
}

/** Total soft-rule penalty of a roster, used by the local search. */
export function softPenalty(shifts: Shift[], opts: GenerateOptions): number {
	const issues = validate({
		shifts,
		staff: opts.staff,
		templates: opts.templates,
		coverage: opts.coverage,
		leave: opts.leave,
		rules: opts.rules,
		business: opts.business,
		previousWeek: opts.previousWeek,
		weekStart: opts.weekStart
	});
	let penalty = 0;
	for (const i of issues) {
		if (i.severity === 'Error') penalty += 1000;
		else if (i.type === 'open-slot') penalty += 200;
		else penalty += ruleWeight(opts.rules, i.type as Rule['id'], 3) || 3;
	}
	return penalty;
}

function hasHardViolation(shifts: Shift[], opts: GenerateOptions): boolean {
	const issues = validate({
		shifts,
		staff: opts.staff,
		templates: opts.templates,
		coverage: opts.coverage,
		leave: opts.leave,
		rules: opts.rules,
		business: opts.business,
		previousWeek: opts.previousWeek,
		weekStart: opts.weekStart
	});
	// `understaffed` is an Error but is not a hard rule the generator can avoid by
	// construction - it simply means there were not enough people.
	return issues.some((i) => i.severity === 'Error' && i.type !== 'understaffed');
}

export function generateRoster(opts: GenerateOptions): GenerateResult {
	const now = opts.nowMs ?? (() => Date.now());
	const started = now();
	const budget = opts.timeBudgetMs ?? 3000;
	const rand = mulberry32(opts.seed);
	const tz = opts.business.timeZone;
	const lockedStaff = new Set(opts.lockedStaffIds ?? []);
	const lockedDates = new Set(opts.lockedDates ?? []);

	// Which existing shifts stay untouched?
	const isPinned = (s: Shift) =>
		(opts.keepLocked && s.locked) ||
		(s.staffId !== null && lockedStaff.has(s.staffId)) ||
		lockedDates.has(s.date);

	const pinned = opts.existing.filter(isPinned);
	const keptAssignments = opts.onlyEmpty
		? opts.existing.filter((s) => s.staffId !== null && !isPinned(s))
		: [];
	const preserved = [...pinned, ...keptAssignments];

	const slots = buildSlots(opts.weekStart, opts.coverage, opts.templates, opts.business);
	const requiredSlots = slots.length;

	// Match preserved shifts to slots so we do not double-fill a requirement.
	const remaining: Slot[] = [];
	const used = [...preserved];
	const preservedPool = [...preserved];
	for (const slot of slots) {
		const matchIdx = preservedPool.findIndex(
			(s) => s.date === slot.date && s.templateId === slot.template.id && s.role === slot.role
		);
		if (matchIdx >= 0) preservedPool.splice(matchIdx, 1);
		else remaining.push(slot);
	}

	// Eligible-count per remaining slot, for hardest-first ordering.
	const eligibleCount = new Map<Slot, number>();
	for (const slot of remaining) {
		const count = opts.staff.filter((p) => blockReason(p, slot, [], opts) === null).length;
		eligibleCount.set(slot, count);
	}
	remaining.sort((a, b) => {
		const ca = eligibleCount.get(a) ?? 0;
		const cb = eligibleCount.get(b) ?? 0;
		if (ca !== cb) return ca - cb;
		const ua = (isNightShift(a.template) ? 1 : 0) + (isWeekend(a.date) ? 1 : 0);
		const ub = (isNightShift(b.template) ? 1 : 0) + (isWeekend(b.date) ? 1 : 0);
		if (ua !== ub) return ub - ua;
		if (a.date !== b.date) return a.date < b.date ? -1 : 1;
		return a.template.startMin - b.template.startMin;
	});

	// --- Greedy fill --------------------------------------------------------
	const state: Shift[] = [...used];
	const unfilled: UnfilledSlot[] = [];
	let cancelled = false;

	for (let i = 0; i < remaining.length; i++) {
		if (opts.shouldCancel?.()) {
			cancelled = true;
			break;
		}
		opts.onProgress?.((i / Math.max(1, remaining.length)) * 0.7);
		const slot = remaining[i];
		const reasons: string[] = [];
		const candidates: { person: Staff; score: number }[] = [];
		for (const person of opts.staff) {
			const blocked = blockReason(person, slot, state, opts);
			if (blocked) {
				reasons.push(blocked);
				continue;
			}
			candidates.push({ person, score: candidateScore(person, slot, state, opts, rand) });
		}
		if (candidates.length === 0) {
			unfilled.push({
				date: slot.date,
				templateId: slot.template.id,
				role: slot.role,
				reason: summariseReasons(slot, reasons)
			});
			// Still record the open slot so the editor shows a dashed card.
			state.push({
				id: slotId(slot, opts.seed, i),
				date: slot.date,
				templateId: slot.template.id,
				role: slot.role,
				staffId: null,
				locked: false
			});
			continue;
		}
		candidates.sort((a, b) => a.score - b.score);
		state.push({
			id: slotId(slot, opts.seed, i),
			date: slot.date,
			templateId: slot.template.id,
			role: slot.role,
			staffId: candidates[0].person.id,
			locked: false
		});
	}

	// --- Local search: move and swap to reduce soft penalties ---------------
	let iterations = 0;
	let best = [...state];
	let bestPenalty = softPenalty(best, opts);

	const movable = () =>
		best
			.map((s, idx) => ({ s, idx }))
			.filter(({ s }) => !isPinned(s) && !(opts.onlyEmpty && s.staffId !== null));

	// Determinism: the loop is bounded by a FIXED iteration count derived from the problem
	// size, never by elapsed time. The wall clock is only a safety stop for a pathological
	// input, so the same seed yields the same roster on a fast and a slow machine alike.
	const maxIterations = opts.maxIterations ?? Math.min(1200, 40 + state.length * 12);
	let hitTimeLimit = false;

	while (!cancelled && iterations < maxIterations) {
		if (now() - started >= budget) {
			hitTimeLimit = true;
			break;
		}
		iterations++;
		if (opts.shouldCancel?.()) {
			cancelled = true;
			break;
		}
		if (iterations % 20 === 0) {
			opts.onProgress?.(0.7 + Math.min(0.29, (iterations / maxIterations) * 0.29));
		}
		const pool = movable();
		if (pool.length < 1) break;

		const pick = pool[Math.floor(rand() * pool.length)];
		let candidate: Shift[] | null = null;

		if (rand() < 0.5) {
			// Move: give this shift to a different person.
			const others = opts.staff.filter((p) => p.id !== pick.s.staffId && p.active);
			if (others.length === 0) continue;
			const target = others[Math.floor(rand() * others.length)];
			candidate = best.map((s, idx) => (idx === pick.idx ? { ...s, staffId: target.id } : s));
		} else {
			// Swap: exchange the people on two shifts.
			const partner = pool[Math.floor(rand() * pool.length)];
			if (partner.idx === pick.idx) continue;
			candidate = best.map((s, idx) => {
				if (idx === pick.idx) return { ...s, staffId: best[partner.idx].staffId };
				if (idx === partner.idx) return { ...s, staffId: best[pick.idx].staffId };
				return s;
			});
		}

		if (!candidate) continue;
		if (hasHardViolation(candidate, opts)) continue;
		const penalty = softPenalty(candidate, opts);
		if (penalty < bestPenalty) {
			best = candidate;
			bestPenalty = penalty;
		}
	}

	opts.onProgress?.(1);

	const finalShifts = best;
	const filledSlots = finalShifts.filter((s) => s.staffId !== null).length;
	const issues = validate({
		shifts: finalShifts,
		staff: opts.staff,
		templates: opts.templates,
		coverage: opts.coverage,
		leave: opts.leave,
		rules: opts.rules,
		business: opts.business,
		previousWeek: opts.previousWeek,
		weekStart: opts.weekStart
	});

	const impossible = requiredSlots > 0 && filledSlots === 0;
	const activeStaff = opts.staff.filter((s) => s.active).length;

	return {
		shifts: finalShifts,
		seed: opts.seed,
		requiredSlots,
		filledSlots,
		fillRate: requiredSlots === 0 ? 1 : filledSlots / requiredSlots,
		unfilled,
		issues,
		fairness: fairnessRows(finalShifts, opts.staff, opts.templates, opts.weekStart, tz),
		softScore: bestPenalty,
		impossible,
		impossibleReason: impossible
			? activeStaff === 0
				? 'There are no active staff to roster. Add staff, or activate the people you have.'
				: 'No person meets the hard rules for any required slot. Review roles, availability and leave for this week.'
			: undefined,
		cancelled,
		elapsedMs: now() - started,
		iterations,
		hitTimeLimit
	};
}

function summariseReasons(slot: Slot, reasons: string[]): string {
	const unique = Array.from(new Set(reasons)).slice(0, 3);
	const head = `No available ${slot.role} for ${slot.template.name} on ${formatDate(slot.date)}`;
	if (unique.length === 0) return `${head}: there is nobody with the ${slot.role} role.`;
	return `${head}: ${unique.join(', ')}.`;
}

/** Per-person fairness and hours figures for a set of shifts. */
export function fairnessRows(
	shifts: Shift[],
	staff: Staff[],
	templates: ShiftTemplate[],
	weekStart: DateStr,
	timeZone: string
): FairnessRow[] {
	const resolved = resolveAll(
		shifts.filter((s) => s.staffId),
		templates,
		timeZone
	);
	const dates = weekDates(weekStart);
	return staff
		.filter((s) => s.active)
		.map((person) => {
			const mine = resolved.filter((r) => r.shift.staffId === person.id);
			const worked = new Set(mine.map((r) => r.shift.date));
			let longestRun = 0;
			for (const d of dates) {
				if (worked.has(d)) longestRun = Math.max(longestRun, consecutiveRunEndingOn(worked, d));
			}
			return {
				staffId: person.id,
				name: person.name,
				hours: toHours(mine.reduce((sum, r) => sum + r.paidMinutes, 0)),
				minHours: person.minWeeklyHours,
				maxHours: person.maxWeeklyHours,
				weekendShifts: mine.filter((r) => isWeekend(r.shift.date)).length,
				nightShifts: mine.filter((r) => isNightShift(r.template)).length,
				daysOff: dates.filter((d) => !worked.has(d)).length,
				longestRun
			};
		});
}

/**
 * Fairness indicator 0-100. 100 means hours, weekend and night shifts are spread evenly
 * and everyone sits inside their contracted range.
 */
export function fairnessScore(rows: FairnessRow[]): number {
	if (rows.length === 0) return 100;
	const spread = (values: number[]) => {
		if (values.length < 2) return 0;
		const max = Math.max(...values);
		const min = Math.min(...values);
		return max - min;
	};
	const hourSpread = spread(rows.map((r) => r.hours));
	const weekendSpread = spread(rows.map((r) => r.weekendShifts));
	const nightSpread = spread(rows.map((r) => r.nightShifts));
	const outOfRange = rows.filter((r) => r.hours < r.minHours || r.hours > r.maxHours).length;
	let score = 100;
	score -= Math.min(40, hourSpread * 2);
	score -= Math.min(15, weekendSpread * 5);
	score -= Math.min(15, nightSpread * 5);
	score -= Math.min(30, (outOfRange / rows.length) * 60);
	return Math.max(0, Math.round(score));
}

/**
 * Rank eligible replacements for a shift (used by sick-leave cover and the inspector).
 * Safe candidates come first, then candidates with warnings only.
 */
export function rankReplacements(
	shift: Shift,
	opts: Omit<GenerateOptions, 'seed' | 'keepLocked' | 'onlyEmpty'> & { seed?: number }
): { staffId: string; name: string; score: number; blocked: string | null; warnings: number }[] {
	const template = opts.templates.find((t) => t.id === shift.templateId);
	if (!template) return [];
	const slot: Slot = { date: shift.date, template, role: shift.role, index: 0 };
	const others = opts.existing.filter((s) => s.id !== shift.id);
	const rand = mulberry32(opts.seed ?? 1);
	const full = { ...opts, seed: opts.seed ?? 1, keepLocked: true, onlyEmpty: false } as GenerateOptions;
	return opts.staff
		.filter((p) => p.id !== shift.staffId)
		.map((person) => {
			const blocked = blockReason(person, slot, others, full);
			const candidateShifts = others.concat([{ ...shift, staffId: person.id }]);
			const warnings = blocked
				? 0
				: validate({
						shifts: candidateShifts,
						staff: opts.staff,
						templates: opts.templates,
						coverage: opts.coverage,
						leave: opts.leave,
						rules: opts.rules,
						business: opts.business,
						previousWeek: opts.previousWeek,
						weekStart: opts.weekStart
					}).filter((i) => i.severity === 'Warning' && i.staffId === person.id).length;
			return {
				staffId: person.id,
				name: person.name,
				score: blocked ? Number.POSITIVE_INFINITY : candidateScore(person, slot, others, full, rand) + warnings * 5,
				blocked,
				warnings
			};
		})
		.sort((a, b) => a.score - b.score);
}
