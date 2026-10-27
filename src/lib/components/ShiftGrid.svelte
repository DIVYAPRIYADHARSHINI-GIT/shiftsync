<script lang="ts">
	// Roster grid, shift view: rows are shift + role, columns are days.
	// Open (unfilled) slots show as dashed saffron cards listing eligible people.
	import Icon from './Icon.svelte';
	import ShiftChip from './ShiftChip.svelte';
	import { app } from '../state.svelte';
	import type { DateStr } from '../types';
	import { formatDate, formatTime, weekDates, weekdayName, weekdayOf } from '../logic/time';
	import { checkAssignment, closedDayFor } from '../logic/validate';
	import { requiredFor, shiftViewRows, slotsFor } from '../logic/editor';
	import { rankReplacements } from '../logic/generator';

	interface Props {
		selectedShiftId: string | null;
		onselectShift: (id: string | null) => void;
		onaddSlot: (date: DateStr, templateId: string, role: string) => void;
		onmoveShift: (shiftId: string, staffId: string | null, date: DateStr) => void;
		onannounce: (message: string) => void;
	}

	let { selectedShiftId, onselectShift, onaddSlot, onmoveShift, onannounce }: Props = $props();

	const dates = $derived(weekDates(app.currentWeek));
	const rows = $derived(
		shiftViewRows(app.data.coverage, app.roster.shifts, app.data.templates)
	);
	const dark = $derived(
		typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
	);

	let draggingId = $state<string | null>(null);
	let hoverKey = $state<string | null>(null);
	let dropChecks = $state<Record<string, { ok: boolean; reason: string }>>({});

	function key(templateId: string, role: string, date: DateStr) {
		return `${templateId}|${role}|${date}`;
	}

	/** Up to three eligible people for an open slot, shown on the dashed card. */
	function eligibleFor(shiftId: string): string[] {
		const shift = app.roster.shifts.find((s) => s.id === shiftId);
		if (!shift) return [];
		return rankReplacements($state.snapshot(shift), {
			weekStart: app.currentWeek,
			staff: $state.snapshot(app.data.staff),
			templates: $state.snapshot(app.data.templates),
			coverage: $state.snapshot(app.data.coverage),
			leave: $state.snapshot(app.data.leave),
			rules: $state.snapshot(app.data.rules),
			business: $state.snapshot(app.data.business),
			previousWeek: $state.snapshot(app.previousWeekShifts),
			existing: $state.snapshot(app.roster.shifts)
		})
			.filter((c) => !c.blocked)
			.slice(0, 3)
			.map((c) => c.name);
	}

	function checkDrop(templateId: string, role: string, date: DateStr) {
		if (!draggingId) return { ok: true, reason: '' };
		const k = key(templateId, role, date);
		const cached = dropChecks[k];
		if (cached) return cached;
		const moved = app.roster.shifts.map((s) =>
			s.id === draggingId ? { ...s, date, templateId, role } : s
		);
		const shift = app.roster.shifts.find((s) => s.id === draggingId);
		const result = checkAssignment(
			{ ...app.validationInput, shifts: moved },
			draggingId,
			shift?.staffId ?? null
		);
		const value = { ok: result.ok, reason: result.reason };
		dropChecks = { ...dropChecks, [k]: value };
		return value;
	}
</script>

<div class="grid-wrap">
	<table class="shift-grid" aria-label="Shifts and roles for the week beginning {formatDate(app.currentWeek)}">
		<thead>
			<tr>
				<th scope="col" class="corner"><span class="corner-label">Shift and role</span></th>
				{#each dates as date (date)}
					{@const wd = weekdayOf(date)}
					{@const closed = closedDayFor(app.data.business, date)}
					<th
						scope="col"
						class="day-head"
						class:today={date === app.today}
						class:weekend={wd === 0 || wd === 6}
						class:closed={!!closed}
					>
						<span class="day-name">{weekdayName(wd, true)}</span>
						<span class="day-date tnum">{Number(date.slice(8))}</span>
						{#if closed}<span class="closed-tag">Closed</span>{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.templateId + row.role)}
				{@const template = app.templateById(row.templateId)}
				{#if template}
					<tr>
						<th scope="row" class="row-head">
							<span class="bar" style="background: {template.colour}" aria-hidden="true"></span>
							<span class="row-text">
								<span class="row-title">{template.name}</span>
								<span class="row-sub tnum">
									{formatTime(template.startMin)}&ndash;{formatTime(template.endMin)}
									{#if template.endMin <= template.startMin}<span class="next">+1</span>{/if}
								</span>
								<span class="row-role">{row.role}</span>
							</span>
						</th>
						{#each dates as date (date)}
							{@const wd = weekdayOf(date)}
							{@const need = requiredFor(app.data.coverage, row.templateId, row.role, wd)}
							{@const slots = slotsFor(app.roster.shifts, row.templateId, row.role, date)}
							{@const filled = slots.filter((s) => s.staffId).length}
							{@const closed = closedDayFor(app.data.business, date)}
							{@const k = key(row.templateId, row.role, date)}
							{@const check = draggingId && hoverKey === k ? checkDrop(row.templateId, row.role, date) : null}
							<td
								class="cell"
								class:today={date === app.today}
								class:weekend={wd === 0 || wd === 6}
								class:closed={!!closed}
								class:short={need.min > 0 && filled < need.min && !closed}
								class:drop-ok={check?.ok === true}
								class:drop-bad={check?.ok === false}
								title={check && !check.ok ? check.reason : undefined}
								ondragover={(e) => {
									if (!draggingId) return;
									e.preventDefault();
									hoverKey = k;
									const r = checkDrop(row.templateId, row.role, date);
									if (e.dataTransfer) e.dataTransfer.dropEffect = r.ok ? 'move' : 'none';
								}}
								ondragleave={() => {
									if (hoverKey === k) hoverKey = null;
								}}
								ondrop={(e) => {
									e.preventDefault();
									const id = e.dataTransfer?.getData('text/plain') || draggingId;
									draggingId = null;
									hoverKey = null;
									dropChecks = {};
									if (!id) return;
									const moving = app.roster.shifts.find((s) => s.id === id);
									onmoveShift(id, moving?.staffId ?? null, date);
									onannounce(`Moved shift to ${formatDate(date)}.`);
								}}
							>
								<div class="cell-inner">
									{#if need.min > 0 && !closed}
										<span class="need tnum" title="{filled} assigned of {need.min} needed{need.ideal ? `, ideal ${need.ideal}` : ''}">
											{filled}/{need.min}{#if need.ideal && need.ideal !== need.min}<span class="ideal"> (ideal {need.ideal})</span>{/if}
										</span>
									{/if}

									{#each slots as slot (slot.id)}
										{#if slot.staffId}
											<ShiftChip
												shift={slot}
												{template}
												{dark}
												showRole
												personName={app.staffById(slot.staffId)?.name}
												issues={app.issuesForShift(slot.id)}
												selected={selectedShiftId === slot.id}
												onselect={() => onselectShift(slot.id)}
												ondragstart={() => {
													draggingId = slot.id;
													dropChecks = {};
													onselectShift(slot.id);
												}}
												ondragend={() => {
													draggingId = null;
													hoverKey = null;
													dropChecks = {};
												}}
											/>
										{:else}
											{@const eligible = eligibleFor(slot.id)}
											<button
												type="button"
												class="open-slot"
												class:selected={selectedShiftId === slot.id}
												aria-label="Open {slot.role} slot on {template.name}, {formatDate(date)}. {eligible.length
													? `Eligible: ${eligible.join(', ')}`
													: 'No eligible people'}"
												onclick={() => onselectShift(slot.id)}
											>
												<span class="open-head">
													<Icon name="warning" size={13} />
													<span class="open-role">{slot.role}</span>
												</span>
												<span class="open-time tnum">
													{formatTime(template.startMin)}&ndash;{formatTime(template.endMin)}
												</span>
												{#if eligible.length > 0}
													<span class="open-eligible">{eligible.join(', ')}</span>
												{:else}
													<span class="open-eligible none">Nobody is eligible</span>
												{/if}
											</button>
										{/if}
									{/each}

									{#if !closed}
										<button
											type="button"
											class="add"
											aria-label="Add a {row.role} slot on {template.name}, {formatDate(date)}"
											onclick={() => onaddSlot(date, row.templateId, row.role)}
										>
											<Icon name="plus" size={12} />
										</button>
									{/if}
								</div>
							</td>
						{/each}
					</tr>
				{/if}
			{:else}
				<tr>
					<td colspan={dates.length + 1}>
						<div class="empty-state">
							<Icon name="shifts" size={24} />
							<p>No shift templates or coverage needs yet.</p>
							<a class="btn btn-primary" href="/shifts">Set up shifts and coverage</a>
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
	.shift-grid {
		border-collapse: separate;
		border-spacing: 0;
		width: max-content;
		min-width: 100%;
	}
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
	.row-head {
		position: sticky;
		left: 0;
		z-index: 2;
		background: var(--surface);
		box-shadow: var(--shadow-sticky);
	}
	.corner,
	.row-head {
		width: 200px;
		min-width: 200px;
		max-width: 200px;
	}
	.corner {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		border-right: 1px solid var(--border);
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
		min-width: 150px;
		padding: var(--space-2);
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
	.day-name {
		display: block;
		font-size: var(--text-12);
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
	}
	.day-date {
		font-size: var(--text-16);
		font-weight: 600;
	}
	.closed-tag {
		display: block;
		font-size: 11px;
		color: var(--text-tertiary);
	}

	.row-head {
		display: flex;
		align-items: stretch;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3) var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		border-right: 1px solid var(--border);
		text-align: left;
		font-weight: 400;
	}
	.bar {
		width: 3px;
		flex-shrink: 0;
		border-radius: 0 2px 2px 0;
	}
	.row-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.row-title {
		font-size: var(--text-13);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-sub {
		font-size: var(--text-12);
		color: var(--text-secondary);
	}
	.next {
		color: var(--text-tertiary);
	}
	.row-role {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}

	.cell {
		min-width: 150px;
		padding: var(--space-1);
		border-bottom: 1px solid var(--border);
		border-right: 1px solid var(--border);
		vertical-align: top;
		background: var(--surface);
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
	.cell.drop-ok {
		box-shadow: inset 0 0 0 2px var(--success);
		background: var(--success-tint);
	}
	.cell.drop-bad {
		box-shadow: inset 0 0 0 2px var(--danger);
		background: var(--danger-tint);
	}
	.cell-inner {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-height: 44px;
	}
	.need {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-tertiary);
	}
	.cell.short .need {
		color: var(--saffron-ink);
	}
	.ideal {
		font-weight: 400;
	}

	.open-slot {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--space-1) var(--space-2);
		border: 1px dashed color-mix(in srgb, var(--saffron) 60%, transparent);
		border-radius: var(--radius-control);
		background: var(--saffron-tint);
		color: var(--text-primary);
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--ease-out);
	}
	.open-slot:hover {
		border-color: var(--saffron);
	}
	.open-slot.selected {
		outline: 2px solid var(--brand);
		outline-offset: -1px;
	}
	.open-head {
		display: flex;
		align-items: center;
		gap: 3px;
		color: var(--saffron-ink);
	}
	.open-role {
		font-size: var(--text-12);
		font-weight: 600;
	}
	.open-time {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.open-eligible {
		font-size: 11px;
		color: var(--text-tertiary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.open-eligible.none {
		color: var(--danger-ink);
	}

	.add {
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
	.cell:hover .add,
	.add:focus-visible {
		opacity: 1;
	}
	.add:hover {
		border-color: var(--brand);
		color: var(--brand);
	}
</style>
