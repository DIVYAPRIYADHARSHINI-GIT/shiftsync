<script lang="ts">
	// On small screens the grid becomes a clean day-by-day list with the same actions.
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';
	import { app } from '../state.svelte';
	import type { DateStr } from '../types';
	import { formatDate, formatTime, weekDates, weekdayName, weekdayOf } from '../logic/time';
	import { closedDayFor } from '../logic/validate';
	import { contrastOn, initials } from './controls.svelte';

	interface Props {
		selectedShiftId: string | null;
		onselectShift: (id: string | null) => void;
		onassign: (shiftId: string, staffId: string | null) => void;
		onremove: (shiftId: string) => void;
		onaddShift: (date: DateStr, staffId: string) => void;
	}

	let { selectedShiftId, onselectShift, onassign, onremove, onaddShift }: Props = $props();

	const dates = $derived(weekDates(app.currentWeek));

	function dayShifts(date: DateStr) {
		return app.roster.shifts
			.filter((s) => s.date === date)
			.sort((a, b) => {
				const ta = app.templateById(a.templateId)?.startMin ?? 0;
				const tb = app.templateById(b.templateId)?.startMin ?? 0;
				if (ta !== tb) return ta - tb;
				return a.role.localeCompare(b.role);
			});
	}
</script>

<div class="day-list">
	{#each dates as date (date)}
		{@const shifts = dayShifts(date)}
		{@const closed = closedDayFor(app.data.business, date)}
		<section class="day" class:today={date === app.today}>
			<header>
				<div class="day-head">
					<span class="dow">{weekdayName(weekdayOf(date))}</span>
					<span class="dom tnum">{formatDate(date)}</span>
				</div>
				{#if closed}
					<span class="pill">Closed: {closed.name}</span>
				{:else}
					<span class="pill tnum">{shifts.filter((s) => s.staffId).length} on duty</span>
				{/if}
			</header>

			{#if shifts.length === 0}
				<p class="none">No shifts on this day.</p>
			{:else}
				<ul>
					{#each shifts as shift (shift.id)}
						{@const template = app.templateById(shift.templateId)}
						{@const person = app.staffById(shift.staffId)}
						{@const issues = app.issuesForShift(shift.id)}
						{#if template}
							<li class:selected={selectedShiftId === shift.id}>
								<button
									type="button"
									class="row"
									aria-expanded={selectedShiftId === shift.id}
									onclick={() => onselectShift(selectedShiftId === shift.id ? null : shift.id)}
								>
									<span class="bar" style="background: {template.colour}" aria-hidden="true"></span>
									<span class="row-main">
										<span class="row-top">
											<span class="time tnum">
												{formatTime(template.startMin)}&ndash;{formatTime(template.endMin)}
											</span>
											{#if template.endMin <= template.startMin}
												<span class="next">+1</span>
											{/if}
											<span class="tpl">{template.name}</span>
										</span>
										<span class="row-bottom">
											{#if person}
												<span class="avatar" style="background: {person.colour}; color: {contrastOn(person.colour)}" aria-hidden="true">
													{initials(person.name)}
												</span>
												<span class="who">{person.name}</span>
											{:else}
												<span class="open">
													<Icon name="warning" size={13} /> Open {shift.role} slot
												</span>
											{/if}
											<span class="role">{shift.role}</span>
											{#if shift.locked}<Icon name="lock" size={13} label="Locked" />{/if}
										</span>
									</span>
									{#if issues.length > 0}
										<span
											class="issue"
											class:error={issues.some((i) => i.severity === 'Error')}
										>
											<Icon
												name={issues.some((i) => i.severity === 'Error') ? 'error' : 'warning'}
												size={14}
											/>
											<span class="tnum">{issues.length}</span>
										</span>
									{/if}
								</button>

								{#if selectedShiftId === shift.id}
									<div class="expand">
										{#each issues as issue (issue.message)}
											<p class="issue-line" class:error={issue.severity === 'Error'}>
												{issue.message}
											</p>
										{/each}
										<div class="field">
											<span class="label" id="dl-label-{shift.id}">Assign to</span>
											<Select
												value={shift.staffId ?? ''}
												ariaLabel="Assign this shift"
												options={[
													{ value: '', label: 'Open slot' },
													...app.activeStaff.map((s) => ({ value: s.id, label: s.name }))
												]}
												onchange={(v) => onassign(shift.id, v || null)}
											/>
										</div>
										<button type="button" class="btn btn-sm btn-danger" onclick={() => onremove(shift.id)}>
											<Icon name="trash" size={14} /> Remove shift
										</button>
									</div>
								{/if}
							</li>
						{/if}
					{/each}
				</ul>
			{/if}

			{#if !closed && app.activeStaff.length > 0 && app.data.templates.length > 0}
				<button
					type="button"
					class="add-day"
					onclick={() => onaddShift(date, app.activeStaff[0].id)}
				>
					<Icon name="plus" size={14} /> Add a shift
				</button>
			{/if}
		</section>
	{/each}
</div>

<style>
	.day-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.day {
		/* flex-shrink: 0 is required: .day-list is a scrolling flex column, and without it
		   these cards shrink to the header height and `overflow: hidden` clips the shifts. */
		flex-shrink: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		background: var(--surface);
		overflow: hidden;
	}
	.day.today {
		border-color: color-mix(in srgb, var(--brand) 45%, var(--border));
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--surface-subtle);
	}
	.day-head {
		display: flex;
		flex-direction: column;
	}
	.dow {
		font-size: var(--text-12);
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: uppercase;
	}
	.dom {
		font-size: var(--text-14);
		font-weight: 600;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		border-bottom: 1px solid var(--border);
	}
	li:last-child {
		border-bottom: none;
	}
	li.selected {
		background: var(--brand-tint);
	}
	.row {
		display: flex;
		align-items: stretch;
		gap: var(--space-2);
		width: 100%;
		min-height: 52px;
		padding: var(--space-2) var(--space-3) var(--space-2) 0;
		border: none;
		background: none;
		color: var(--text-primary);
		font-family: inherit;
		text-align: left;
		cursor: pointer;
	}
	.bar {
		width: 3px;
		flex-shrink: 0;
	}
	.row-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
	}
	.row-top {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.time {
		font-size: var(--text-13);
		font-weight: 600;
	}
	.next {
		font-size: 10px;
		color: var(--text-tertiary);
	}
	.tpl {
		font-size: var(--text-12);
		color: var(--text-secondary);
	}
	.row-bottom {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		color: #fff;
		font-size: 9px;
		font-weight: 600;
		flex-shrink: 0;
	}
	.who {
		font-size: var(--text-13);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.open {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: var(--text-12);
		color: var(--saffron-ink);
		font-weight: 500;
	}
	.role {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		margin-left: auto;
		flex-shrink: 0;
	}
	.issue {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		align-self: center;
		padding: 2px 5px;
		border-radius: var(--radius-pill);
		background: var(--saffron-tint);
		color: var(--saffron-ink);
		font-size: 11px;
		font-weight: 600;
		flex-shrink: 0;
	}
	.issue.error {
		background: var(--danger-tint);
		color: var(--danger-ink);
	}
	.expand {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		border-top: 1px solid var(--border);
		background: var(--surface);
	}
	.issue-line {
		font-size: var(--text-12);
		color: var(--saffron);
		line-height: var(--lh-normal);
	}
	.issue-line.error {
		color: var(--danger);
	}
	.none {
		padding: var(--space-4) var(--space-3);
		font-size: var(--text-13);
		color: var(--text-tertiary);
	}
	.add-day {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		width: 100%;
		min-height: 44px;
		border: none;
		border-top: 1px solid var(--border);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		font-family: inherit;
		font-size: var(--text-13);
		font-weight: 500;
		cursor: pointer;
	}
	.add-day:hover {
		color: var(--brand);
	}
</style>
