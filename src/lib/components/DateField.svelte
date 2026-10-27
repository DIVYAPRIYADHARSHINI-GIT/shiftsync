<script lang="ts">
	// Custom date picker: a readable text trigger plus a month-grid popover.
	// Works entirely on civil date strings, so a date is never shifted by a time zone.
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import {
		addDays,
		dateToUtc,
		formatDate,
		isDateStr,
		monthName,
		startOfWeek,
		toDateStr,
		weekdayName,
		weekdayOf
	} from '../logic/time';
	import type { DateStr, Weekday } from '../types';

	interface Props {
		value: DateStr;
		onchange: (date: DateStr) => void;
		id?: string;
		ariaLabel?: string;
		disabled?: boolean;
		weekStartDay?: 0 | 1;
		/** Highlight the whole week containing the hovered day (for the week switcher). */
		weekMode?: boolean;
		small?: boolean;
	}

	let {
		value,
		onchange,
		id,
		ariaLabel = 'Choose a date',
		disabled = false,
		weekStartDay = 1,
		weekMode = false,
		small = false
	}: Props = $props();

	let open = $state(false);
	// Seeded once from the incoming value; both are re-seeded when the picker opens.
	let viewMonth = $state(untrack(() => value).slice(0, 7));
	let focusDate = $state(untrack(() => value));
	let trigger = $state<HTMLButtonElement | null>(null);
	let gridEl = $state<HTMLDivElement | null>(null);

	const monthLabel = $derived(
		`${monthName(`${viewMonth}-01`)} ${viewMonth.slice(0, 4)}`
	);

	const weekdayHeaders = $derived(
		Array.from({ length: 7 }, (_, i) => weekdayName(((weekStartDay + i) % 7) as Weekday, true))
	);

	/** Six rows of seven civil dates covering the viewed month. */
	const days = $derived.by(() => {
		const first = `${viewMonth}-01`;
		const gridStart = startOfWeek(first, weekStartDay);
		return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
	});

	function openPicker() {
		if (disabled) return;
		viewMonth = value.slice(0, 7);
		focusDate = value;
		open = true;
		queueMicrotask(() => gridEl?.focus());
	}

	function close(refocus = true) {
		open = false;
		if (refocus) trigger?.focus();
	}

	function pick(date: DateStr) {
		onchange(date);
		close();
	}

	function shiftMonth(delta: number) {
		const [y, m] = viewMonth.split('-').map(Number);
		const next = new Date(Date.UTC(y, m - 1 + delta, 1));
		viewMonth = toDateStr(next.getTime()).slice(0, 7);
	}

	function moveFocus(days: number) {
		focusDate = addDays(focusDate, days);
		if (focusDate.slice(0, 7) !== viewMonth) viewMonth = focusDate.slice(0, 7);
	}

	function onGridKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowLeft':
				event.preventDefault();
				moveFocus(-1);
				break;
			case 'ArrowRight':
				event.preventDefault();
				moveFocus(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				moveFocus(-7);
				break;
			case 'ArrowDown':
				event.preventDefault();
				moveFocus(7);
				break;
			case 'PageUp':
				event.preventDefault();
				shiftMonth(-1);
				break;
			case 'PageDown':
				event.preventDefault();
				shiftMonth(1);
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				pick(focusDate);
				break;
			case 'Escape':
				event.preventDefault();
				close();
				break;
		}
	}

	const selectedWeek = $derived(
		weekMode ? startOfWeek(value, weekStartDay) : null
	);

	function inSelectedWeek(date: DateStr): boolean {
		if (!selectedWeek) return false;
		const diff = (dateToUtc(date) - dateToUtc(selectedWeek)) / 86_400_000;
		return diff >= 0 && diff < 7;
	}
</script>

<div class="date-field">
	<button
		bind:this={trigger}
		{id}
		type="button"
		class="trigger"
		class:small
		{disabled}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-label="{ariaLabel}: {isDateStr(value) ? formatDate(value) : 'not set'}"
		onclick={() => (open ? close() : openPicker())}
	>
		<Icon name="calendar" size={16} />
		<span class="tnum">{isDateStr(value) ? formatDate(value) : 'Choose a date'}</span>
	</button>

	{#if open}
		<div class="backdrop" role="presentation" onclick={() => close(false)}></div>
		<div class="panel popover" role="dialog" aria-label={ariaLabel}>
			<div class="panel-head">
				<button type="button" class="btn btn-quiet btn-icon btn-sm" aria-label="Previous month" onclick={() => shiftMonth(-1)}>
					<Icon name="chevron-left" size={16} />
				</button>
				<span class="month" aria-live="polite">{monthLabel}</span>
				<button type="button" class="btn btn-quiet btn-icon btn-sm" aria-label="Next month" onclick={() => shiftMonth(1)}>
					<Icon name="chevron-right" size={16} />
				</button>
			</div>
			<div class="weekdays" aria-hidden="true">
				{#each weekdayHeaders as name}<span>{name}</span>{/each}
			</div>
			<div
				bind:this={gridEl}
				class="grid"
				role="grid"
				tabindex="-1"
				aria-label={monthLabel}
				onkeydown={onGridKeydown}
			>
				{#each days as date (date)}
					{@const outside = date.slice(0, 7) !== viewMonth}
					{@const isWeekend = weekdayOf(date) === 0 || weekdayOf(date) === 6}
					<button
						type="button"
						role="gridcell"
						class="day tnum"
						class:outside
						class:weekend={isWeekend}
						class:selected={date === value}
						class:in-week={inSelectedWeek(date)}
						class:focused={date === focusDate}
						tabindex={date === focusDate ? 0 : -1}
						aria-selected={date === value}
						aria-label={formatDate(date)}
						onclick={() => pick(date)}
					>
						{Number(date.slice(8))}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.date-field {
		position: relative;
		display: inline-block;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: var(--control-h);
		padding: 0 var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text-primary);
		font-family: inherit;
		font-size: var(--text-14);
		cursor: pointer;
		white-space: nowrap;
		transition: border-color var(--motion-fast) var(--ease-out);
	}
	.trigger.small {
		height: var(--control-h-sm);
		font-size: var(--text-13);
	}
	.trigger:hover:not(:disabled) {
		border-color: var(--text-tertiary);
	}
	.trigger:disabled {
		background: var(--surface-subtle);
		color: var(--text-tertiary);
		cursor: not-allowed;
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
	}
	.panel {
		position: absolute;
		z-index: 50;
		top: calc(100% + 4px);
		left: 0;
		width: 268px;
		padding: var(--space-2);
		animation: pop var(--motion-fast) var(--ease-out);
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(-2px);
		}
	}
	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding-bottom: var(--space-2);
	}
	.month {
		font-size: var(--text-14);
		font-weight: 600;
	}
	.weekdays,
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.weekdays span {
		padding: var(--space-1) 0;
		text-align: center;
		font-size: var(--text-12);
		font-weight: 600;
		color: var(--text-tertiary);
	}
	.grid:focus-visible {
		box-shadow: none;
	}
	.day {
		height: 32px;
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text-primary);
		font-family: inherit;
		font-size: var(--text-13);
		cursor: pointer;
		transition: background var(--motion-fast) var(--ease-out);
	}
	.day:hover {
		background: var(--surface-subtle);
	}
	.day.outside {
		color: var(--text-tertiary);
	}
	.day.weekend:not(.selected) {
		background: color-mix(in srgb, var(--surface-subtle) 60%, transparent);
	}
	.day.in-week {
		background: var(--brand-tint);
	}
	.day.selected {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--on-brand);
		font-weight: 600;
	}
	.day.focused:not(.selected) {
		border-color: var(--brand);
	}
</style>
