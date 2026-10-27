<script lang="ts">
	// The roster grid, staff view: rows are staff, columns are days.
	//
	// Interaction model:
	//  - Drag and drop with live validation. A valid drop cell gets a green outline, an
	//    invalid one a red outline and a reason on hover.
	//  - A full keyboard and touch alternative: select a chip, then use the actions menu
	//    (Move to, Swap with, Remove), with screen reader announcements.
	//  - Click an empty cell to add a shift; shift-click cells to multi-select.
	import Icon from './Icon.svelte';
	import ShiftChip from './ShiftChip.svelte';
	import { app } from '../state.svelte';
	import type { DateStr, Shift } from '../types';
	import {
		formatDate,
		formatDuration,
		toHours,
		weekDates,
		weekdayName,
		weekdayOf
	} from '../logic/time';
	import { checkAssignment, closedDayFor, resolveAll } from '../logic/validate';
	import { dayCoverageSummary } from '../logic/coverage';
	import { contractState } from '../logic/hours';
	import { contrastOn, initials } from './controls.svelte';

	interface Props {
		selectedShiftId: string | null;
		selectedCells: string[];
		onselectShift: (id: string | null) => void;
		onselectCells: (keys: string[]) => void;
		onaddShift: (date: DateStr, staffId: string) => void;
		onmoveShift: (shiftId: string, staffId: string | null, date: DateStr) => void;
		onswapShifts: (aId: string, bId: string) => void;
		/** Announce an action for screen readers. */
		onannounce: (message: string) => void;
	}

	let {
		selectedShiftId,
		selectedCells,
		onselectShift,
		onselectCells,
		onaddShift,
		onmoveShift,
		onswapShifts,
		onannounce
	}: Props = $props();

	const dates = $derived(weekDates(app.currentWeek));
	const staff = $derived(app.data.staff.filter((s) => s.active));
	const dark = $derived(
		typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
	);

	// --- Drag state ---------------------------------------------------------
	let draggingId = $state<string | null>(null);
	/** Cell key -> check result, computed lazily while dragging. */
	let dropChecks = $state<Record<string, { ok: boolean; reason: string }>>({});
	let hoverCell = $state<string | null>(null);

	function cellKey(staffId: string, date: DateStr): string {
		return `${staffId}|${date}`;
	}

	/** Paid hours scheduled for one person this week. */
	function weekHours(staffId: string): number {
		const mine = app.roster.shifts.filter((s) => s.staffId === staffId);
		return toHours(
			resolveAll(mine, app.data.templates, app.data.business.timeZone).reduce(
				(sum, r) => sum + r.paidMinutes,
				0
			)
		);
	}

	function cellShifts(staffId: string, date: DateStr): Shift[] {
		return app.roster.shifts
			.filter((s) => s.staffId === staffId && s.date === date)
			.sort((a, b) => {
				const ta = app.templateById(a.templateId)?.startMin ?? 0;
				const tb = app.templateById(b.templateId)?.startMin ?? 0;
				return ta - tb;
			});
	}

	// --- Drag handlers --------------------------------------------------------

	function onDragStart(shiftId: string) {
		draggingId = shiftId;
		dropChecks = {};
		onselectShift(shiftId);
	}

	function onDragEnd() {
		draggingId = null;
		dropChecks = {};
		hoverCell = null;
	}

	/**
	 * Check a drop target on demand and memoise it for the duration of the drag, so a
	 * 14 x 7 grid does not run 98 full validations at drag start.
	 */
	function checkCell(staffId: string, date: DateStr): { ok: boolean; reason: string } {
		if (!draggingId) return { ok: true, reason: '' };
		const key = cellKey(staffId, date);
		const cached = dropChecks[key];
		if (cached) return cached;
		const shift = app.roster.shifts.find((s) => s.id === draggingId);
		if (!shift) return { ok: true, reason: '' };
		// Validate the move to this person AND this date.
		const moved = app.roster.shifts.map((s) =>
			s.id === draggingId ? { ...s, date, staffId } : s
		);
		const result = checkAssignment(
			{ ...app.validationInput, shifts: moved },
			draggingId,
			staffId
		);
		const value = { ok: result.ok, reason: result.reason };
		dropChecks = { ...dropChecks, [key]: value };
		return value;
	}

	function onDrop(event: DragEvent, staffId: string, date: DateStr) {
		event.preventDefault();
		const shiftId = event.dataTransfer?.getData('text/plain') || draggingId;
		if (!shiftId) return;
		const target = cellShifts(staffId, date);
		const source = app.roster.shifts.find((s) => s.id === shiftId);
		onDragEnd();
		if (!source) return;
		// Dropping onto a cell that already holds exactly one shift swaps the two people.
		if (target.length === 1 && source.staffId !== staffId && source.staffId !== null) {
			onswapShifts(shiftId, target[0].id);
			onannounce(
				`Swapped ${app.staffById(source.staffId)?.name ?? 'person'} and ${app.staffById(staffId)?.name ?? 'person'}.`
			);
			return;
		}
		onmoveShift(shiftId, staffId, date);
		onannounce(
			`Moved shift to ${app.staffById(staffId)?.name ?? 'person'} on ${formatDate(date)}.`
		);
	}

	function toggleCellSelection(staffId: string, date: DateStr, additive: boolean) {
		const key = cellKey(staffId, date);
		if (!additive) {
			onselectCells(selectedCells.includes(key) && selectedCells.length === 1 ? [] : [key]);
			return;
		}
		onselectCells(
			selectedCells.includes(key)
				? selectedCells.filter((k) => k !== key)
				: [...selectedCells, key]
		);
	}
</script>

<div class="grid-wrap">
	<table class="roster-grid" aria-label="Roster for the week beginning {formatDate(app.currentWeek)}">
		<thead>
			<tr>
				<th scope="col" class="corner">
					<span class="corner-label">Staff</span>
				</th>
				{#each dates as date (date)}
					{@const wd = weekdayOf(date)}
					{@const isToday = date === app.today}
					{@const weekend = wd === 0 || wd === 6}
					{@const closed = closedDayFor(app.data.business, date)}
					{@const cover = dayCoverageSummary(date, app.roster.shifts, app.data.coverage, app.data.templates)}
					<th
						scope="col"
						class="day-head"
						class:today={isToday}
						class:weekend
						class:closed={!!closed}
						aria-current={isToday ? 'date' : undefined}
					>
						<span class="day-name">
							{weekdayName(wd, true)}
							{#if isToday}<span class="today-dot" role="img" aria-label="Today"></span>{/if}
						</span>
						<span class="day-date tnum">{Number(date.slice(8))} {date.slice(5, 7) === app.currentWeek.slice(5, 7) ? '' : new Date(Date.parse(date + 'T00:00:00Z')).toLocaleString('en', { month: 'short', timeZone: 'UTC' })}</span>
						{#if closed}
							<span class="cover-strip closed-strip" title="Closed: {closed.name}">
								<Icon name="info" size={12} />
								<span>Closed</span>
							</span>
						{:else}
							<span
								class="cover-strip"
								class:short={cover.scheduled < cover.needed}
								class:over={cover.scheduled > cover.needed}
								title="{cover.scheduled} scheduled of {cover.needed} needed"
							>
								<Icon
									name={cover.scheduled < cover.needed ? 'warning' : cover.scheduled > cover.needed ? 'info' : 'success'}
									size={12}
								/>
								<span class="tnum">{cover.scheduled}/{cover.needed}</span>
							</span>
						{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each staff as person (person.id)}
				{@const hours = weekHours(person.id)}
				{@const state = contractState(hours, person.minWeeklyHours, person.maxWeeklyHours)}
				{@const pct = person.maxWeeklyHours > 0 ? Math.min(100, (hours / person.maxWeeklyHours) * 100) : 0}
				<tr>
					<th scope="row" class="staff-cell">
						<span class="avatar" style="background: {person.colour}; color: {contrastOn(person.colour)}" aria-hidden="true">
							{initials(person.name)}
						</span>
						<span class="who">
							<span class="name" title={person.name}>{person.name}</span>
							<span class="roles" title={person.roles.join(', ')}>{person.roles.join(', ')}</span>
							<span class="hours-bar" title="{hours} hours scheduled, contracted {person.minWeeklyHours} to {person.maxWeeklyHours}">
								<span class="hours-track">
									<span class="hours-fill {state}" style="width: {pct}%"></span>
									{#if person.minWeeklyHours > 0 && person.maxWeeklyHours > 0}
										<span
											class="hours-min"
											style="left: {Math.min(100, (person.minWeeklyHours / person.maxWeeklyHours) * 100)}%"
											aria-hidden="true"
										></span>
									{/if}
								</span>
								<span class="hours-text tnum">
									{formatDuration(Math.round(hours * 60))}
									<span class="contracted">/ {person.maxWeeklyHours}h</span>
								</span>
							</span>
						</span>
					</th>

					{#each dates as date (date)}
						{@const key = cellKey(person.id, date)}
						{@const shifts = cellShifts(person.id, date)}
						{@const wd = weekdayOf(date)}
						{@const weekend = wd === 0 || wd === 6}
						{@const closed = closedDayFor(app.data.business, date)}
						{@const check = draggingId && hoverCell === key ? checkCell(person.id, date) : null}
						<td
							class="cell"
							class:today={date === app.today}
							class:weekend
							class:closed={!!closed}
							class:selected={selectedCells.includes(key)}
							class:drop-ok={check?.ok === true}
							class:drop-bad={check?.ok === false}
							title={check && !check.ok ? check.reason : undefined}
							ondragover={(e) => {
								if (!draggingId) return;
								e.preventDefault();
								hoverCell = key;
								const result = checkCell(person.id, date);
								if (e.dataTransfer) e.dataTransfer.dropEffect = result.ok ? 'move' : 'none';
							}}
							ondragleave={() => {
								if (hoverCell === key) hoverCell = null;
							}}
							ondrop={(e) => onDrop(e, person.id, date)}
						>
							<div class="cell-inner">
								{#each shifts as shift (shift.id)}
									{@const template = app.templateById(shift.templateId)}
									{#if template}
										<ShiftChip
											{shift}
											{template}
											{dark}
											issues={app.issuesForShift(shift.id)}
											selected={selectedShiftId === shift.id}
											onselect={() => onselectShift(shift.id)}
											ondragstart={() => onDragStart(shift.id)}
											ondragend={onDragEnd}
										/>
									{/if}
								{/each}

								{#if shifts.length === 0}
									<button
										type="button"
										class="add-cell"
										aria-label="Add a shift for {person.name} on {formatDate(date)}"
										onclick={(e) => {
											if (e.shiftKey || e.metaKey || e.ctrlKey) {
												toggleCellSelection(person.id, date, true);
											} else {
												onaddShift(date, person.id);
											}
										}}
									>
										<Icon name="plus" size={14} />
									</button>
								{:else}
									<button
										type="button"
										class="add-more"
										aria-label="Add another shift for {person.name} on {formatDate(date)}"
										onclick={() => onaddShift(date, person.id)}
									>
										<Icon name="plus" size={12} />
									</button>
								{/if}
							</div>
						</td>
					{/each}
				</tr>
			{:else}
				<tr>
					<td colspan={dates.length + 1} class="empty-row">
						<div class="empty-state">
							<Icon name="staff" size={24} />
							<p>No active staff yet.</p>
							<a class="btn btn-primary" href="/staff">Add your first staff member</a>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.grid-wrap {
		flex: 1;
		min-height: 0;
		overflow: auto;
		background: var(--surface);
	}
	.roster-grid {
		border-collapse: separate;
		border-spacing: 0;
		width: max-content;
		min-width: 100%;
	}

	/* --- Sticky header row and first column --- */
	thead th {
		position: sticky;
		top: 0;
		z-index: 3;
		background: var(--surface);
		box-shadow: var(--shadow-sticky-y);
	}
	.corner {
		left: 0;
		z-index: 5 !important;
		box-shadow: var(--shadow-sticky), var(--shadow-sticky-y);
	}
	.staff-cell {
		position: sticky;
		left: 0;
		z-index: 2;
		background: var(--surface);
		box-shadow: var(--shadow-sticky);
	}
	.corner,
	.staff-cell {
		width: 228px;
		min-width: 228px;
		max-width: 228px;
	}

	.corner {
		border-bottom: 1px solid var(--border);
		border-right: 1px solid var(--border);
		padding: var(--space-2) var(--space-3);
		text-align: left;
		vertical-align: bottom;
	}
	.corner-label {
		font-size: var(--text-12);
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.day-head {
		min-width: 136px;
		padding: var(--space-2) var(--space-2) var(--space-1);
		border-bottom: 1px solid var(--border);
		border-right: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
		font-weight: 500;
	}
	.day-head.weekend {
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface));
	}
	.day-head.today {
		background: var(--brand-tint);
	}
	.day-head.closed {
		background: var(--surface-subtle);
	}
	.day-name {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-12);
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.today-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--brand);
	}
	.day-date {
		display: block;
		font-size: var(--text-16);
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.3;
	}
	.cover-strip {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		margin-top: 2px;
		padding: 1px 5px;
		border-radius: var(--radius-pill);
		background: var(--success-tint);
		color: var(--success-ink);
		font-size: 11px;
		font-weight: 600;
	}
	.cover-strip.short {
		background: var(--saffron-tint);
		color: var(--saffron-ink);
	}
	.cover-strip.over {
		background: var(--info-tint);
		color: var(--info-ink);
	}
	.cover-strip.closed-strip {
		background: var(--surface-subtle);
		color: var(--text-tertiary);
	}

	/* --- Staff cell --- */
	.staff-cell {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		border-right: 1px solid var(--border);
		text-align: left;
		font-weight: 400;
	}
	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border-radius: 50%;
		color: #fff;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		flex: 1;
	}
	.name {
		font-size: var(--text-13);
		font-weight: 500;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.roles {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hours-bar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: 3px;
	}
	.hours-track {
		position: relative;
		flex: 1;
		height: 4px;
		min-width: 40px;
		border-radius: 2px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		overflow: hidden;
	}
	.hours-fill {
		display: block;
		height: 100%;
		background: var(--success);
		transition: width var(--motion-slow) var(--ease-out);
	}
	.hours-fill.under {
		background: var(--info);
	}
	.hours-fill.near-limit {
		background: var(--saffron);
	}
	.hours-fill.over {
		background: var(--danger);
	}
	.hours-min {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--text-tertiary);
		opacity: 0.55;
	}
	.hours-text {
		font-size: 11px;
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.contracted {
		color: var(--text-tertiary);
	}

	/* --- Day cells --- */
	.cell {
		min-width: 136px;
		padding: var(--space-1);
		border-bottom: 1px solid var(--border);
		border-right: 1px solid var(--border);
		vertical-align: top;
		background: var(--surface);
		transition:
			background var(--motion-fast) var(--ease-out),
			box-shadow var(--motion-fast) var(--ease-out);
	}
	.cell.weekend {
		background: color-mix(in srgb, var(--surface-subtle) 45%, var(--surface));
	}
	.cell.today {
		background: color-mix(in srgb, var(--brand-tint) 35%, var(--surface));
	}
	.cell.closed {
		background: repeating-linear-gradient(
			45deg,
			var(--surface-subtle),
			var(--surface-subtle) 6px,
			var(--surface) 6px,
			var(--surface) 12px
		);
	}
	.cell.selected {
		box-shadow: inset 0 0 0 2px var(--brand);
	}
	.cell.drop-ok {
		box-shadow: inset 0 0 0 2px var(--success);
		background: var(--success-tint);
	}
	.cell.drop-bad {
		box-shadow: inset 0 0 0 2px var(--danger);
		background: var(--danger-tint);
		cursor: not-allowed;
	}
	.cell-inner {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-height: 48px;
	}
	:global(.compact) .cell-inner {
		min-height: 38px;
	}

	.add-cell {
		flex: 1;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity var(--motion-fast) var(--ease-out),
			border-color var(--motion-fast) var(--ease-out);
	}
	.cell:hover .add-cell,
	.add-cell:focus-visible {
		opacity: 1;
	}
	.add-cell:hover {
		border-color: var(--brand);
		color: var(--brand);
	}
	.add-more {
		align-self: flex-start;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 18px;
		border: 1px dashed var(--border-strong);
		border-radius: 4px;
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
		opacity: 0;
		transition: opacity var(--motion-fast) var(--ease-out);
	}
	.cell:hover .add-more,
	.add-more:focus-visible {
		opacity: 1;
	}
	.add-more:hover {
		border-color: var(--brand);
		color: var(--brand);
	}

	.empty-row {
		padding: 0;
	}
</style>
