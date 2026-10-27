<script lang="ts">
	// Hours and fairness summary for any period, a sortable table, SVG bar charts, the
	// "My shifts" per-person view, and the optional labour cost estimate.
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Select from '#lib/components/Select.svelte';
	import DateField from '#lib/components/DateField.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import { app } from '#lib/state.svelte';
	import { hoursSummary, contractState, type HoursRow } from '#lib/logic/hours';
	import {
		addDays,
		dateInRange,
		dateToUtc,
		formatDate,
		formatDayHeader,
		formatDuration,
		formatTime,
		isoWeekLabel,
		weekdayName,
		weekdayOf
	} from '#lib/logic/time';
	import { resolveAll } from '#lib/logic/validate';
	import { hoursCsv, rosterFileName, safeFileStem } from '#lib/logic/csv';
	import { buildIcs, icsFileName } from '#lib/logic/ics';
	import { contrastOn, initials } from '#lib/components/controls.svelte';

	type SortKey = 'name' | 'hours' | 'overtime' | 'weekend' | 'night' | 'daysOff' | 'cost';

	let periodMode = $state<'week' | 'month' | 'custom'>('week');
	let customStart = $state(app.currentWeek);
	let customEnd = $state(addDays(app.currentWeek, 27));
	let sortKey = $state<SortKey>('hours');
	let sortDesc = $state(true);
	let personId = $state(page.url.searchParams.get('person') ?? '');

	const period = $derived.by(() => {
		if (periodMode === 'week') {
			return { start: app.currentWeek, end: addDays(app.currentWeek, 6), label: 'This week' };
		}
		if (periodMode === 'month') {
			return { start: app.currentWeek, end: addDays(app.currentWeek, 27), label: 'Four weeks' };
		}
		return { start: customStart, end: customEnd, label: 'Custom period' };
	});

	/** All shifts across every stored week, so a period can span roster weeks. */
	const allShifts = $derived(Object.values(app.data.rosters).flatMap((r) => r.shifts));

	const summary = $derived(
		hoursSummary(
			$state.snapshot(allShifts),
			$state.snapshot(app.data.staff.filter((s) => s.active)),
			$state.snapshot(app.data.templates),
			$state.snapshot(app.data.rules),
			app.data.business.timeZone,
			period.start,
			period.end,
			app.data.settings.overtimeMultiplier
		)
	);

	const sorted = $derived.by(() => {
		const rows = [...summary.rows];
		const get = (r: HoursRow): number | string => {
			switch (sortKey) {
				case 'hours':
					return r.hours;
				case 'overtime':
					return r.overtimeHours;
				case 'weekend':
					return r.weekendShifts;
				case 'night':
					return r.nightShifts;
				case 'daysOff':
					return r.daysOff;
				case 'cost':
					return r.estimatedCost ?? -1;
				default:
					return r.name;
			}
		};
		rows.sort((a, b) => {
			const va = get(a);
			const vb = get(b);
			const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
			return sortDesc ? -cmp : cmp;
		});
		return rows;
	});

	function toggleSort(key: SortKey) {
		if (sortKey === key) sortDesc = !sortDesc;
		else {
			sortKey = key;
			sortDesc = key !== 'name';
		}
	}

	const maxHours = $derived(Math.max(1, ...summary.rows.map((r) => Math.max(r.hours, r.maxHours))));

	// --- My shifts -----------------------------------------------------------
	const selectedPerson = $derived(app.staffById(personId));
	const personShifts = $derived.by(() => {
		if (!personId) return [];
		const mine = allShifts.filter(
			(s) => s.staffId === personId && dateInRange(s.date, period.start, period.end)
		);
		return resolveAll(
			$state.snapshot(mine),
			$state.snapshot(app.data.templates),
			app.data.business.timeZone
		).sort((a, b) => a.startMs - b.startMs);
	});

	const personRow = $derived(summary.rows.find((r) => r.staffId === personId));

	function download(name: string, text: string, type: string) {
		const blob = new Blob([text], { type });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportHoursCsv() {
		download(
			`Hours_${safeFileStem(app.data.business.name)}_${period.start}_to_${period.end}.csv`,
			hoursCsv($state.snapshot(sorted), app.data.business.currency),
			'text/csv;charset=utf-8'
		);
		app.toast('Hours summary exported as CSV.', 'success');
	}

	function exportPersonIcs() {
		if (!selectedPerson) return;
		const ics = buildIcs({
			staff: $state.snapshot(selectedPerson),
			shifts: $state.snapshot(allShifts.filter((s) => dateInRange(s.date, period.start, period.end))),
			templates: $state.snapshot(app.data.templates),
			businessName: app.data.business.name,
			timeZone: app.data.business.timeZone,
			nowMs: Date.now()
		});
		download(
			icsFileName(selectedPerson.name, isoWeekLabel(period.start)),
			ics,
			'text/calendar;charset=utf-8'
		);
		app.toast(`Calendar file exported for ${selectedPerson.name}.`, 'success');
	}

	/** Short plain text version of a person's week, for pasting into WhatsApp. */
	function copyPersonWeek() {
		if (!selectedPerson) return;
		const lines = [
			`${selectedPerson.name} - ${app.data.business.name}`,
			`${formatDate(period.start)} to ${formatDate(period.end)}`,
			''
		];
		if (personShifts.length === 0) lines.push('No shifts in this period.');
		for (const r of personShifts) {
			lines.push(
				`${weekdayName(weekdayOf(r.shift.date), true)} ${formatDate(r.shift.date)}: ` +
					`${formatTime(r.template.startMin)}-${formatTime(r.template.endMin)}` +
					`${r.overnight ? ' (+1)' : ''} ${r.template.name} (${r.shift.role})`
			);
		}
		if (personRow) {
			lines.push('', `Total ${personRow.hours} hours over ${personRow.shifts} shifts.`);
		}
		navigator.clipboard
			.writeText(lines.join('\n'))
			.then(() => app.toast('Copied. Paste it into WhatsApp or any message.', 'success'))
			.catch(() =>
				app.toast('The browser blocked clipboard access. Select the text and copy it manually.', 'warning')
			);
	}
</script>

<PageHeader
	title="Hours summary"
	description="Scheduled hours against contracted ranges, overtime, unsocial shifts and a fairness indicator for any period."
>
	{#snippet actions()}
		<button type="button" class="btn" onclick={exportHoursCsv}>
			<Icon name="download" size={16} /> Export CSV
		</button>
	{/snippet}
</PageHeader>

<div class="controls card card-pad">
	<div class="field">
		<span class="label">Period</span>
		<Segmented
			value={periodMode}
			small
			ariaLabel="Period"
			segments={[
				{ value: 'week', label: 'This week' },
				{ value: 'month', label: 'Four weeks' },
				{ value: 'custom', label: 'Custom' }
			]}
			onchange={(v) => (periodMode = v as typeof periodMode)}
		/>
	</div>
	{#if periodMode === 'custom'}
		<div class="field">
			<span class="label">From</span>
			<DateField
				value={customStart}
				small
				ariaLabel="Period start"
				weekStartDay={app.data.business.weekStartDay}
				onchange={(d) => (customStart = d)}
			/>
		</div>
		<div class="field">
			<span class="label">To</span>
			<DateField
				value={customEnd}
				small
				ariaLabel="Period end"
				weekStartDay={app.data.business.weekStartDay}
				onchange={(d) => (customEnd = d)}
			/>
		</div>
	{:else}
		<p class="period-label tnum">
			{formatDate(period.start)} &ndash; {formatDate(period.end)}
		</p>
	{/if}
	<div class="spacer"></div>
	<Toggle
		checked={app.data.settings.showCost}
		label="Show cost estimate"
		onchange={(v) =>
			app.commit('Toggle cost estimate', (d) => {
				d.settings.showCost = v;
			}, false)}
	/>
</div>

{#if summary.rows.length === 0}
	<div class="card">
		<div class="empty-state">
			<Icon name="hours" size={28} />
			<div>
				<p class="empty-title">No active staff to summarise</p>
				<p>Add staff, then generate or build a roster to see hours and fairness here.</p>
			</div>
			<a class="btn btn-primary" href="/staff">Go to Staff</a>
		</div>
	</div>
{:else}
	<div class="stat-row">
		<div class="stat card card-pad">
			<span class="stat-value tnum">{summary.totalHours}</span>
			<span class="stat-label">Total scheduled hours</span>
		</div>
		<div class="stat card card-pad">
			<span class="stat-value tnum" class:bad={summary.totalOvertimeHours > 0}>
				{summary.totalOvertimeHours}
			</span>
			<span class="stat-label">Overtime hours above the weekly rule</span>
		</div>
		<div class="stat card card-pad">
			<span class="stat-value tnum">{summary.fairness}</span>
			<span class="stat-label">Fairness indicator out of 100</span>
		</div>
		{#if app.data.settings.showCost && summary.totalEstimatedCost !== undefined}
			<div class="stat card card-pad">
				<span class="stat-value tnum">
					{summary.totalEstimatedCost.toLocaleString('en-IN')}
				</span>
				<span class="stat-label">
					Estimated labour cost in {app.data.business.currency}
				</span>
			</div>
		{/if}
	</div>

	<section class="chart-section card card-pad">
		<header>
			<h2>Hours against the contracted range</h2>
			<p>
				The grey band is each person&rsquo;s contracted minimum to maximum. The bar is what they are
				scheduled.
			</p>
		</header>

		<!--
			Labels and numbers are real HTML so they stay exactly on the 12/13 px type scale at
			every width; only the bars themselves are SVG. A scaled viewBox would enlarge SVG
			text and break the scale.
		-->
		<div
			class="bar-chart"
			role="img"
			aria-label="Scheduled hours per person: {summary.rows
				.map((r) => `${r.name} ${r.hours} hours, contracted ${r.minHours} to ${r.maxHours}`)
				.join('; ')}"
		>
			{#each sorted as row (row.staffId)}
				{@const state = contractState(row.hours, row.minHours, row.maxHours)}
				<div class="bar-row">
					<span class="bar-name" title={row.name}>{row.name}</span>
					<span class="bar-track">
						<span
							class="bar-band"
							style="left: {(row.minHours / maxHours) * 100}%; width: {Math.max(0.5, ((row.maxHours - row.minHours) / maxHours) * 100)}%"
						></span>
						<span class="bar-fill {state}" style="width: {Math.max(0.5, (row.hours / maxHours) * 100)}%"></span>
					</span>
					<span class="bar-value tnum">{row.hours}</span>
				</div>
			{/each}
			<div class="bar-axis" aria-hidden="true">
				<span class="bar-name"></span>
				<span class="axis-track">
					{#each [0, 0.25, 0.5, 0.75, 1] as fraction}
						<span class="axis-tick tnum" style="left: {fraction * 100}%">
							{Math.round(fraction * maxHours)}
						</span>
					{/each}
				</span>
				<span class="bar-value"></span>
			</div>
		</div>

		<div class="legend">
			<span><span class="swatch" style="background: var(--brand)"></span> Within range</span>
			<span><span class="swatch" style="background: var(--info)"></span> Below minimum</span>
			<span><span class="swatch" style="background: var(--saffron)"></span> Near the maximum</span>
			<span><span class="swatch" style="background: var(--danger)"></span> Over the maximum</span>
		</div>
	</section>

	<div class="table-wrap">
		<table class="data">
			<thead>
				<tr>
					<th scope="col">
						<button type="button" class="sort" onclick={() => toggleSort('name')}>
							Person
							{#if sortKey === 'name'}<Icon name={sortDesc ? 'chevron-down' : 'chevron-up'} size={14} />{/if}
						</button>
					</th>
					<th scope="col">Roles</th>
					<th scope="col" class="num">
						<button type="button" class="sort" onclick={() => toggleSort('hours')}>
							Hours
							{#if sortKey === 'hours'}<Icon name={sortDesc ? 'chevron-down' : 'chevron-up'} size={14} />{/if}
						</button>
					</th>
					<th scope="col" class="num">Contracted</th>
					<th scope="col" class="num">
						<button type="button" class="sort" onclick={() => toggleSort('overtime')}>
							Overtime
							{#if sortKey === 'overtime'}<Icon name={sortDesc ? 'chevron-down' : 'chevron-up'} size={14} />{/if}
						</button>
					</th>
					<th scope="col" class="num">
						<button type="button" class="sort" onclick={() => toggleSort('weekend')}>
							Weekend
							{#if sortKey === 'weekend'}<Icon name={sortDesc ? 'chevron-down' : 'chevron-up'} size={14} />{/if}
						</button>
					</th>
					<th scope="col" class="num">
						<button type="button" class="sort" onclick={() => toggleSort('night')}>
							Night
							{#if sortKey === 'night'}<Icon name={sortDesc ? 'chevron-down' : 'chevron-up'} size={14} />{/if}
						</button>
					</th>
					<th scope="col" class="num">
						<button type="button" class="sort" onclick={() => toggleSort('daysOff')}>
							Days off
							{#if sortKey === 'daysOff'}<Icon name={sortDesc ? 'chevron-down' : 'chevron-up'} size={14} />{/if}
						</button>
					</th>
					<th scope="col" class="num">Longest run</th>
					{#if app.data.settings.showCost}
						<th scope="col" class="num">
							<button type="button" class="sort" onclick={() => toggleSort('cost')}>
								Cost estimate
								{#if sortKey === 'cost'}<Icon name={sortDesc ? 'chevron-down' : 'chevron-up'} size={14} />{/if}
							</button>
						</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each sorted as row (row.staffId)}
					{@const state = contractState(row.hours, row.minHours, row.maxHours)}
					<tr>
						<th scope="row" class="person">
							<span class="avatar" style="background: {row.colour}; color: {contrastOn(row.colour)}" aria-hidden="true">
								{initials(row.name)}
							</span>
							<button type="button" class="link-btn" onclick={() => (personId = row.staffId)}>
								{row.name}
							</button>
						</th>
						<td class="roles-cell">{row.roles.join(', ')}</td>
						<td class="num tnum">
							<span
								class="hours-chip"
								class:over={state === 'over'}
								class:near={state === 'near-limit'}
								class:under={state === 'under'}
							>
								{row.hours}
							</span>
						</td>
						<td class="num tnum muted">{row.minHours}&ndash;{row.maxHours}</td>
						<td class="num tnum" class:bad={row.overtimeHours > 0}>{row.overtimeHours}</td>
						<td class="num tnum">{row.weekendShifts}</td>
						<td class="num tnum">{row.nightShifts}</td>
						<td class="num tnum">{row.daysOff}</td>
						<td class="num tnum">{row.longestRun}</td>
						{#if app.data.settings.showCost}
							<td class="num tnum">
								{row.estimatedCost !== undefined ? row.estimatedCost.toLocaleString('en-IN') : '-'}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if app.data.settings.showCost}
		<p class="cost-note">
			<Icon name="info" size={14} />
			Cost is an estimate from the hourly rates you entered and a
			{app.data.settings.overtimeMultiplier}x overtime multiplier. It ignores tax, allowances and
			local overtime law, and it is not payroll.
		</p>
	{/if}

	<section class="my-shifts card card-pad">
		<header>
			<h2>My shifts</h2>
			<p>Choose a person to see their upcoming shifts, hours and days off.</p>
		</header>

		<div class="controls-inline">
			<div class="person-select">
				<Select
					value={personId}
					placeholder="Choose a person"
					ariaLabel="Person to show shifts for"
					options={app.activeStaff.map((s) => ({ value: s.id, label: s.name, description: s.roles.join(', ') }))}
					onchange={(v) => (personId = v)}
				/>
			</div>
			{#if selectedPerson}
				<button type="button" class="btn" onclick={copyPersonWeek}>
					<Icon name="copy" size={16} /> Copy for WhatsApp
				</button>
				<button type="button" class="btn" onclick={exportPersonIcs}>
					<Icon name="calendar" size={16} /> Calendar file
				</button>
			{/if}
		</div>

		{#if !selectedPerson}
			<p class="muted pad">No person chosen yet.</p>
		{:else if personShifts.length === 0}
			<p class="muted pad">
				{selectedPerson.name} has no shifts between {formatDate(period.start)} and
				{formatDate(period.end)}.
			</p>
		{:else}
			{#if personRow}
				<dl class="person-facts">
					<div>
						<dt>Scheduled</dt>
						<dd class="tnum">{personRow.hours} hours</dd>
					</div>
					<div>
						<dt>Contracted</dt>
						<dd class="tnum">{personRow.minHours}&ndash;{personRow.maxHours} hours</dd>
					</div>
					<div>
						<dt>Shifts</dt>
						<dd class="tnum">{personRow.shifts}</dd>
					</div>
					<div>
						<dt>Days off</dt>
						<dd class="tnum">{personRow.daysOff}</dd>
					</div>
					<div>
						<dt>Longest run</dt>
						<dd class="tnum">{personRow.longestRun} days</dd>
					</div>
				</dl>
			{/if}
			<ul class="shift-list">
				{#each personShifts as r (r.shift.id)}
					<li>
						<span class="bar" style="background: {r.template.colour}" aria-hidden="true"></span>
						<span class="sl-date tnum">{formatDayHeader(r.shift.date)}</span>
						<span class="sl-time tnum">
							{formatTime(r.template.startMin)}&ndash;{formatTime(r.template.endMin)}
							{#if r.overnight}<span class="next">+1</span>{/if}
						</span>
						<span class="sl-name">{r.template.name}</span>
						<span class="sl-role">{r.shift.role}</span>
						<span class="sl-hours tnum">{formatDuration(r.paidMinutes)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.controls {
		display: flex;
		align-items: flex-end;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
	.period-label {
		font-size: var(--text-13);
		color: var(--text-secondary);
		padding-bottom: var(--space-1);
	}

	.stat-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.stat-value {
		font-size: var(--text-24);
		font-weight: 600;
		line-height: 1.1;
	}
	.stat-value.bad {
		color: var(--danger);
	}
	.stat-label {
		font-size: var(--text-12);
		color: var(--text-secondary);
	}

	.chart-section,
	.my-shifts {
		margin-bottom: var(--space-4);
	}
	.chart-section header,
	.my-shifts header {
		margin-bottom: var(--space-3);
	}
	.chart-section header p,
	.my-shifts header p {
		font-size: var(--text-13);
		color: var(--text-secondary);
		margin-top: var(--space-1);
	}
	.bar-chart {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.bar-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 22px;
	}
	.bar-name {
		width: 160px;
		flex-shrink: 0;
		font-size: var(--text-13);
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bar-track {
		position: relative;
		flex: 1;
		min-width: 80px;
		height: 14px;
		border-radius: 2px;
		background: linear-gradient(
			to right,
			var(--border) 1px,
			transparent 1px 25%,
			var(--border) 25% calc(25% + 1px),
			transparent calc(25% + 1px) 50%,
			var(--border) 50% calc(50% + 1px),
			transparent calc(50% + 1px) 75%,
			var(--border) 75% calc(75% + 1px),
			transparent calc(75% + 1px)
		);
	}
	.bar-band {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 2px;
	}
	.bar-fill {
		position: absolute;
		top: 2px;
		bottom: 2px;
		left: 0;
		border-radius: 2px;
		background: var(--brand);
		transition: width var(--motion-slow) var(--ease-out);
	}
	.bar-fill.under {
		background: var(--info);
	}
	.bar-fill.near-limit {
		background: var(--saffron);
	}
	.bar-fill.over {
		background: var(--danger);
	}
	.bar-value {
		width: 44px;
		flex-shrink: 0;
		font-size: var(--text-12);
		color: var(--text-tertiary);
		text-align: right;
	}
	.bar-axis {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-1);
	}
	.axis-track {
		position: relative;
		flex: 1;
		min-width: 80px;
		height: 14px;
	}
	.axis-tick {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		margin-top: var(--space-3);
		font-size: var(--text-12);
		color: var(--text-secondary);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}

	.sort {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		padding: 0;
	}
	.sort:hover {
		color: var(--brand);
	}
	.person {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 400;
		text-align: left;
	}
	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		flex-shrink: 0;
		border-radius: 50%;
		color: #fff;
		font-size: 10px;
		font-weight: 600;
	}
	.link-btn {
		border: none;
		background: none;
		color: var(--brand);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
		padding: 0;
		text-align: left;
	}
	.link-btn:hover {
		text-decoration: underline;
	}
	.roles-cell {
		font-size: var(--text-12);
		color: var(--text-secondary);
	}
	.hours-chip {
		display: inline-block;
		padding: 1px 6px;
		border-radius: var(--radius-pill);
		background: var(--success-tint);
		color: var(--success);
		font-weight: 600;
	}
	.hours-chip.under {
		background: var(--info-tint);
		color: var(--info);
	}
	.hours-chip.near {
		background: var(--saffron-tint);
		color: var(--saffron);
	}
	.hours-chip.over {
		background: var(--danger-tint);
		color: var(--danger);
	}
	.muted {
		color: var(--text-tertiary);
	}
	.bad {
		color: var(--danger);
		font-weight: 600;
	}

	.cost-note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		margin: var(--space-2) 0 var(--space-4);
		font-size: var(--text-12);
		color: var(--text-tertiary);
		line-height: var(--lh-normal);
		max-width: 80ch;
	}
	.cost-note :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.controls-inline {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
		flex-wrap: wrap;
	}
	.person-select {
		width: 240px;
	}
	.pad {
		padding: var(--space-4) 0;
		font-size: var(--text-13);
	}
	.person-facts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-6);
		margin: 0 0 var(--space-3);
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--border);
	}
	.person-facts > div {
		display: flex;
		flex-direction: column;
	}
	.person-facts dt {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}
	.person-facts dd {
		margin: 0;
		font-size: var(--text-16);
		font-weight: 600;
	}
	.shift-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.shift-list li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0 var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-13);
	}
	.shift-list li:last-child {
		border-bottom: none;
	}
	.bar {
		width: 3px;
		height: 24px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.sl-date {
		min-width: 120px;
		font-weight: 500;
	}
	.sl-time {
		min-width: 110px;
		color: var(--text-secondary);
	}
	.next {
		font-size: 10px;
		color: var(--text-tertiary);
	}
	.sl-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sl-role,
	.sl-hours {
		color: var(--text-tertiary);
		font-size: var(--text-12);
		white-space: nowrap;
	}

	.empty-title {
		font-size: var(--text-16);
		font-weight: 500;
		color: var(--text-primary);
		margin-bottom: var(--space-1);
	}

	@media (max-width: 767px) {
		.shift-list li {
			flex-wrap: wrap;
			gap: var(--space-2);
		}
		.sl-date,
		.sl-time {
			min-width: 0;
		}
	}
</style>
