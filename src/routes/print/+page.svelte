<script lang="ts">
	// Print view. This is the fallback route for rosters containing Tamil or Devanagari
	// names: the browser's own text shaper lays those scripts out correctly, which
	// pdf-lib cannot do. "Save as PDF" in the print dialog produces the same landscape
	// grid as the generated PDF.
	import { onMount } from 'svelte';
	import { app } from '#lib/state.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import {
		formatDayHeader,
		formatTime,
		formatWeekRange,
		isoWeekLabel,
		toHours,
		weekDates
	} from '#lib/logic/time';
	import { resolveAll } from '#lib/logic/validate';
	import type { Shift } from '#lib/types';

	const dates = $derived(weekDates(app.currentWeek));
	const resolved = $derived(
		resolveAll(
			$state.snapshot(app.roster.shifts) as Shift[],
			$state.snapshot(app.data.templates),
			app.data.business.timeZone
		)
	);

	function cellShifts(staffId: string, date: string) {
		return resolved
			.filter((r) => r.shift.staffId === staffId && r.shift.date === date)
			.sort((a, b) => a.template.startMin - b.template.startMin);
	}

	function personHours(staffId: string): number {
		return toHours(
			resolved
				.filter((r) => r.shift.staffId === staffId)
				.reduce((sum, r) => sum + r.paidMinutes, 0)
		);
	}

	const openSlots = $derived(resolved.filter((r) => !r.shift.staffId));

	onMount(() => {
		// Give fonts and layout a moment, then open the dialog so "Save as PDF" is one step.
		const timer = setTimeout(() => window.print(), 700);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head>
	<title>Roster {app.data.business.name} {isoWeekLabel(app.currentWeek)}</title>
</svelte:head>

<div class="print-page">
	<div class="no-print bar">
		<p>
			This is the print view. Choose &ldquo;Save as PDF&rdquo; in the print dialog. It renders
			Tamil and Hindi names correctly because the browser shapes the text.
		</p>
		<button type="button" class="btn btn-primary btn-sm" onclick={() => window.print()}>
			<Icon name="print" size={16} /> Print
		</button>
		<a class="btn btn-sm" href="/reports">Back to reports</a>
	</div>

	<header class="sheet-head">
		<div>
			<h1>{app.data.business.name}</h1>
			<p class="tnum">Roster for {formatWeekRange(app.currentWeek)}</p>
		</div>
		<div class="head-right">
			<p class="status">{app.roster.status}</p>
			<p class="tnum">{isoWeekLabel(app.currentWeek)}</p>
		</div>
	</header>

	<table class="sheet">
		<thead>
			<tr>
				<th scope="col">Staff</th>
				{#each dates as date (date)}
					<th scope="col">{formatDayHeader(date)}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each app.activeStaff as person (person.id)}
				<tr>
					<th scope="row">
						<span class="p-name">{person.name}</span>
						<span class="p-hours tnum">{personHours(person.id)}h</span>
					</th>
					{#each dates as date (date)}
						<td>
							{#each cellShifts(person.id, date) as r (r.shift.id)}
								<span class="chip">
									<span class="chip-bar" style="background: {r.template.colour}"></span>
									<span class="chip-text">
										<span class="tnum">
											{formatTime(r.template.startMin)}&ndash;{formatTime(r.template.endMin)}{#if r.overnight}<span class="plus">+1</span>{/if}
										</span>
										<span class="chip-role">{r.shift.role}</span>
									</span>
								</span>
							{/each}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>

	{#if openSlots.length > 0}
		<section class="open-list">
			<h2>Open slots</h2>
			<ul>
				{#each openSlots as r (r.shift.id)}
					<li class="tnum">
						{formatDayHeader(r.shift.date)}: {r.template.name}
						{formatTime(r.template.startMin)}&ndash;{formatTime(r.template.endMin)} &middot;
						{r.shift.role}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<footer class="sheet-foot">
		<div class="legend">
			{#each app.data.templates as template (template.id)}
				<span>
					<span class="swatch" style="background: {template.colour}"></span>
					{template.name}
					<span class="tnum">
						{formatTime(template.startMin)}&ndash;{formatTime(template.endMin)}
					</span>
				</span>
			{/each}
		</div>
		<p class="legal">
			ShiftSync &middot; Rules differ by country and employer; this is not legal advice.
		</p>
	</footer>
</div>

<style>
	.print-page {
		padding: var(--space-6);
		background: var(--surface);
		min-height: 100%;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		margin-bottom: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		background: var(--info-tint);
		flex-wrap: wrap;
	}
	.bar p {
		flex: 1;
		font-size: var(--text-13);
		line-height: var(--lh-normal);
		min-width: 240px;
	}

	.sheet-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding-bottom: var(--space-2);
		margin-bottom: var(--space-3);
		border-bottom: 1px solid var(--border-strong);
	}
	.sheet-head h1 {
		font-size: 18px;
	}
	.sheet-head p {
		font-size: var(--text-12);
		color: var(--text-secondary);
	}
	.head-right {
		text-align: right;
	}
	.status {
		font-weight: 600;
		color: var(--brand);
	}

	.sheet {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}
	.sheet th,
	.sheet td {
		border: 1px solid var(--border);
		padding: 3px 4px;
		vertical-align: top;
		text-align: left;
		font-size: 9px;
	}
	.sheet thead th {
		background: var(--surface-subtle);
		font-size: 9px;
		font-weight: 600;
		white-space: nowrap;
	}
	.sheet tbody th {
		width: 110px;
		font-weight: 400;
	}
	.p-name {
		display: block;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.p-hours {
		display: block;
		font-size: 8px;
		color: var(--text-tertiary);
	}
	.chip {
		display: flex;
		align-items: stretch;
		gap: 3px;
		margin-bottom: 2px;
	}
	.chip-bar {
		width: 2.5px;
		flex-shrink: 0;
		border-radius: 1px;
	}
	.chip-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.3;
	}
	.plus {
		font-size: 7px;
		color: var(--text-tertiary);
		margin-left: 2px;
	}
	.chip-role {
		font-size: 8px;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.open-list {
		margin-top: var(--space-3);
	}
	.open-list h2 {
		font-size: 11px;
		margin-bottom: var(--space-1);
	}
	.open-list ul {
		list-style: none;
		margin: 0;
		padding: 0;
		columns: 3;
		font-size: 9px;
		color: var(--saffron);
	}

	.sheet-foot {
		margin-top: var(--space-3);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		font-size: 9px;
		color: var(--text-secondary);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.swatch {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
	.legal {
		margin-top: var(--space-1);
		font-size: 8px;
		color: var(--text-tertiary);
	}

	@media print {
		.print-page {
			padding: 0;
		}
		.sheet th,
		.sheet td {
			border-color: #c9ced6;
		}
		.sheet thead th {
			background: #f1f3f6;
		}
	}
</style>
