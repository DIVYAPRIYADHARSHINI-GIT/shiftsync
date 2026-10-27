<script lang="ts">
	// Coverage view: for each day an hour-by-hour bar of staff on duty against the number
	// needed, with understaffed and overstaffed periods highlighted. Plus a month overview
	// with a status dot per day. SVG only, colour-blind-safe, with text alternatives.
	import Icon from './Icon.svelte';
	import { app } from '../state.svelte';
	import { dayCoverage, type DayStatus } from '../logic/coverage';
	import {
		addDays,
		formatDate,
		formatDayHeader,
		monthName,
		startOfWeek,
		weekDates,
		weekdayName,
		weekdayOf
	} from '../logic/time';

	const dates = $derived(weekDates(app.currentWeek));

	const days = $derived(
		dates.map((date) =>
			dayCoverage(
				date,
				$state.snapshot(app.roster.shifts),
				$state.snapshot(app.data.coverage),
				$state.snapshot(app.data.templates),
				$state.snapshot(app.data.business)
			)
		)
	);

	const peak = $derived(
		Math.max(
			1,
			...days.flatMap((d) => d.buckets.map((b) => Math.max(b.needed, b.scheduled)))
		)
	);

	const STATUS_LABEL: Record<DayStatus, string> = {
		closed: 'Closed',
		empty: 'No shifts',
		understaffed: 'Understaffed',
		warnings: 'Overstaffed',
		staffed: 'Fully staffed'
	};

	// --- Month overview ------------------------------------------------------
	const monthStart = $derived(`${app.currentWeek.slice(0, 7)}-01`);
	const monthGrid = $derived.by(() => {
		const first = startOfWeek(monthStart, app.data.business.weekStartDay);
		return Array.from({ length: 42 }, (_, i) => addDays(first, i));
	});

	/** Status of a day computed from whichever roster week it belongs to. */
	function monthDayStatus(date: string): DayStatus {
		const weekKey = startOfWeek(date, app.data.business.weekStartDay);
		const roster = app.data.rosters[weekKey];
		const result = dayCoverage(
			date,
			$state.snapshot(roster?.shifts ?? []),
			$state.snapshot(app.data.coverage),
			$state.snapshot(app.data.templates),
			$state.snapshot(app.data.business)
		);
		// Errors from the validator outrank a coverage-only view.
		const hasError = app.errors.some((i) => i.date === date);
		if (result.status === 'closed') return 'closed';
		if (hasError) return 'understaffed';
		return result.status;
	}

	const BAR_W = 26;
	const BAR_GAP = 2;
	const CHART_H = 110;
</script>

<div class="coverage">
	<section class="week-section">
		<header class="sec-head">
			<h2>Coverage through the day</h2>
			<p>
				People on duty each hour against the number your coverage needs ask for, for the week of
				{formatDate(app.currentWeek)}.
			</p>
		</header>

		<div class="legend" aria-hidden="true">
			<span><span class="swatch scheduled"></span> Scheduled</span>
			<span><span class="swatch needed"></span> Needed</span>
			<span><span class="swatch short"></span> Understaffed</span>
			<span><span class="swatch over"></span> Overstaffed</span>
		</div>

		<div class="day-charts">
			{#each days as day (day.date)}
				{@const wd = weekdayOf(day.date)}
				<article class="day-card" class:today={day.date === app.today}>
					<header>
						<div class="day-title">
							<span class="dow">{weekdayName(wd, true)}</span>
							<span class="dom tnum">{Number(day.date.slice(8))} {monthName(day.date, true)}</span>
						</div>
						<span
							class="pill"
							class:pill-success={day.status === 'staffed'}
							class:pill-warn={day.status === 'understaffed'}
							class:pill-info={day.status === 'warnings'}
						>
							<Icon
								name={day.status === 'staffed'
									? 'success'
									: day.status === 'understaffed'
										? 'warning'
										: day.status === 'closed'
											? 'info'
											: 'info'}
								size={13}
							/>
							{STATUS_LABEL[day.status]}
						</span>
					</header>

					{#if day.status === 'closed'}
						<p class="closed-note">This day is closed, so no coverage is required.</p>
					{:else}
						<svg
							class="chart"
							viewBox="0 0 {24 * (BAR_W + BAR_GAP)} {CHART_H}"
							role="img"
							aria-label="{formatDayHeader(day.date)}: {day.buckets
								.filter((b) => b.needed > 0 || b.scheduled > 0)
								.map(
									(b) =>
										`${String(b.hour).padStart(2, '0')}:00 ${b.scheduled} of ${b.needed} needed`
								)
								.join('; ') || 'no coverage needed'}"
						>
							<!-- Gridlines -->
							{#each [0, 0.5, 1] as fraction}
								<line
									x1="0"
									y1={CHART_H - fraction * CHART_H}
									x2={24 * (BAR_W + BAR_GAP)}
									y2={CHART_H - fraction * CHART_H}
									stroke="var(--border)"
									stroke-width="1"
								/>
							{/each}

							{#each day.buckets as bucket (bucket.hour)}
								{@const x = bucket.hour * (BAR_W + BAR_GAP)}
								{@const schedH = (bucket.scheduled / peak) * CHART_H}
								{@const needH = (bucket.needed / peak) * CHART_H}
								{@const short = bucket.scheduled < bucket.needed}
								{@const over = bucket.needed > 0 && bucket.scheduled > bucket.needed}
								<!-- Scheduled bar -->
								{#if bucket.scheduled > 0}
									<rect
										x={x + 1}
										y={CHART_H - schedH}
										width={BAR_W - 2}
										height={Math.max(1, schedH)}
										rx="2"
										fill={short ? 'var(--saffron)' : over ? 'var(--info)' : 'var(--brand)'}
										opacity={short ? 0.55 : 0.9}
									/>
								{/if}
								<!-- Needed line marker -->
								{#if bucket.needed > 0}
									<line
										x1={x + 1}
										y1={CHART_H - needH}
										x2={x + BAR_W - 1}
										y2={CHART_H - needH}
										stroke={short ? 'var(--danger)' : 'var(--text-secondary)'}
										stroke-width="2"
										stroke-linecap="round"
									/>
								{/if}
								<!-- Shortfall shading -->
								{#if short && bucket.needed > 0}
									<rect
										x={x + 1}
										y={CHART_H - needH}
										width={BAR_W - 2}
										height={Math.max(1, needH - schedH)}
										fill="var(--danger)"
										opacity="0.14"
									/>
								{/if}
							{/each}
						</svg>
						<!--
							Hour labels are real HTML so they stay on the 12 px type scale. SVG text in a
							scaled viewBox would be enlarged along with the bars.
						-->
						<div class="hour-axis" aria-hidden="true">
							{#each [0, 3, 6, 9, 12, 15, 18, 21] as hour}
								<span class="hour-tick tnum" style="left: {((hour + 0.5) / 24) * 100}%">
									{String(hour).padStart(2, '0')}
								</span>
							{/each}
						</div>

						<dl class="day-facts">
							<div>
								<dt>Shifts</dt>
								<dd class="tnum">{day.scheduledShifts}</dd>
							</div>
							<div>
								<dt>Open slots</dt>
								<dd class="tnum" class:bad={day.openSlots > 0}>{day.openSlots}</dd>
							</div>
							<div>
								<dt>Peak shortfall</dt>
								<dd class="tnum" class:bad={day.worstShortfall > 0}>{day.worstShortfall}</dd>
							</div>
							<div>
								<dt>Peak surplus</dt>
								<dd class="tnum">{day.worstSurplus}</dd>
							</div>
						</dl>
					{/if}
				</article>
			{/each}
		</div>
	</section>

	<section class="month-section">
		<header class="sec-head">
			<h2>Month overview</h2>
			<p>
				A status dot for every day of {monthName(monthStart)}
				{monthStart.slice(0, 4)}. Select a day to open its week.
			</p>
		</header>

		<div class="month">
			<div class="month-weekdays" aria-hidden="true">
				{#each Array.from({ length: 7 }, (_, i) => weekdayName(((app.data.business.weekStartDay + i) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6, true)) as name}
					<span>{name}</span>
				{/each}
			</div>
			<div class="month-grid">
				{#each monthGrid as date (date)}
					{@const outside = date.slice(0, 7) !== monthStart.slice(0, 7)}
					{@const status = monthDayStatus(date)}
					<button
						type="button"
						class="month-day"
						class:outside
						class:is-today={date === app.today}
						aria-label="{formatDate(date)}: {STATUS_LABEL[status]}"
						onclick={() => app.goToWeek(date)}
					>
						<span class="md-num tnum">{Number(date.slice(8))}</span>
						<span class="dot {status}" aria-hidden="true"></span>
					</button>
				{/each}
			</div>
			<div class="month-legend">
				{#each [['staffed', 'Fully staffed'], ['warnings', 'Overstaffed'], ['understaffed', 'Understaffed or errors'], ['empty', 'No shifts'], ['closed', 'Closed']] as [cls, label] (cls)}
					<span><span class="dot {cls}"></span> {label}</span>
				{/each}
			</div>
		</div>
	</section>
</div>

<style>
	.coverage {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}
	.sec-head {
		margin-bottom: var(--space-3);
	}
	.sec-head p {
		font-size: var(--text-13);
		color: var(--text-secondary);
		margin-top: var(--space-1);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		margin-bottom: var(--space-3);
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
		display: inline-block;
	}
	.swatch.scheduled {
		background: var(--brand);
	}
	.swatch.needed {
		background: var(--text-secondary);
		height: 3px;
	}
	.swatch.short {
		background: var(--saffron);
	}
	.swatch.over {
		background: var(--info);
	}

	.day-charts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: var(--space-3);
	}
	.day-card {
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		background: var(--surface);
	}
	.day-card.today {
		border-color: color-mix(in srgb, var(--brand) 45%, var(--border));
	}
	.day-card header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.day-title {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
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
	.chart {
		width: 100%;
		height: 104px;
		display: block;
	}
	.hour-axis {
		position: relative;
		height: 16px;
		margin-top: 2px;
	}
	.hour-tick {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}
	.closed-note {
		padding: var(--space-6) 0;
		text-align: center;
		font-size: var(--text-13);
		color: var(--text-tertiary);
	}
	.day-facts {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-2);
		margin: var(--space-2) 0 0;
		padding-top: var(--space-2);
		border-top: 1px solid var(--border);
	}
	.day-facts > div {
		display: flex;
		flex-direction: column;
	}
	.day-facts dt {
		font-size: 11px;
		color: var(--text-tertiary);
	}
	.day-facts dd {
		margin: 0;
		font-size: var(--text-14);
		font-weight: 600;
	}
	.day-facts dd.bad {
		color: var(--danger);
	}

	.month {
		max-width: 520px;
	}
	.month-weekdays,
	.month-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: var(--space-1);
	}
	.month-weekdays span {
		text-align: center;
		font-size: var(--text-12);
		font-weight: 600;
		color: var(--text-tertiary);
		padding-bottom: var(--space-1);
	}
	.month-day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: var(--space-2) 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text-primary);
		font-family: inherit;
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--ease-out);
	}
	.month-day:hover {
		border-color: var(--brand);
	}
	.month-day.outside {
		opacity: 0.45;
	}
	.month-day.is-today {
		border-color: var(--brand);
		background: var(--brand-tint);
	}
	.md-num {
		font-size: var(--text-13);
		font-weight: 500;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		display: inline-block;
		background: var(--border-strong);
	}
	.dot.staffed {
		background: var(--success);
	}
	.dot.warnings {
		background: var(--info);
	}
	.dot.understaffed {
		background: var(--saffron);
	}
	.dot.empty {
		background: var(--border-strong);
	}
	.dot.closed {
		background: transparent;
		border: 1.5px solid var(--border-strong);
	}
	.month-legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-3);
		font-size: var(--text-12);
		color: var(--text-secondary);
	}
	.month-legend span {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	@media (max-width: 767px) {
		.coverage {
			padding: var(--space-4);
			gap: var(--space-6);
		}
		.day-charts {
			grid-template-columns: 1fr;
		}
	}
</style>
