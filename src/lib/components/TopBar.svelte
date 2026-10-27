<script lang="ts">
	// Top bar: breadcrumbs, week switcher, view toggle, status pill, command palette hint
	// and the one primary action (Generate roster).
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from './Icon.svelte';
	import DateField from './DateField.svelte';
	import Segmented from './Segmented.svelte';
	import { app } from '../state.svelte';
	import { formatWeekRange, isoWeekLabel } from '../logic/time';

	interface Props {
		onopenPalette: () => void;
		onopenMenu: () => void;
		ongenerate: () => void;
	}
	let { onopenPalette, onopenMenu, ongenerate }: Props = $props();

	const CRUMBS: Record<string, string> = {
		'/': 'Roster',
		'/staff': 'Staff',
		'/shifts': 'Shifts and coverage',
		'/leave': 'Leave',
		'/swaps': 'Swaps',
		'/hours': 'Hours summary',
		'/reports': 'Reports',
		'/settings': 'Settings',
		'/about': 'About',
		'/privacy': 'Privacy and backup'
	};

	const crumb = $derived(CRUMBS[page.url.pathname] ?? 'Roster');
	const isRosterPage = $derived(page.url.pathname === '/');
	const view = $derived(page.url.searchParams.get('view') ?? 'staff');

	// Client-side navigation keeps the grid scroll position and avoids a full reload.
	function setView(next: string) {
		const params = new URLSearchParams(page.url.search);
		if (next === 'staff') params.delete('view');
		else params.set('view', next);
		const query = params.toString();
		goto(`${page.url.pathname}${query ? `?${query}` : ''}`, { replaceState: true });
	}
</script>

<header class="topbar">
	<button type="button" class="btn btn-quiet btn-icon menu-btn" aria-label="Open navigation" onclick={onopenMenu}>
		<Icon name="menu" size={20} />
	</button>

	<nav class="crumbs" aria-label="Breadcrumb">
		<ol>
			<li><span class="business">{app.data.business.name}</span></li>
			<li aria-hidden="true"><Icon name="chevron-right" size={14} /></li>
			<li><span aria-current="page">{crumb}</span></li>
		</ol>
	</nav>

	{#if isRosterPage}
		<div class="week-switcher">
			<div class="nav-group" role="group" aria-label="Change week">
				<button type="button" class="btn btn-sm btn-icon" aria-label="Previous week" onclick={() => app.prevWeek()}>
					<Icon name="chevron-left" size={16} />
				</button>
				<button type="button" class="btn btn-sm today" onclick={() => app.goToToday()}>Today</button>
				<button type="button" class="btn btn-sm btn-icon" aria-label="Next week" onclick={() => app.nextWeek()}>
					<Icon name="chevron-right" size={16} />
				</button>
			</div>
			<span class="date-slot">
				<DateField
					value={app.currentWeek}
					small
					weekMode
					weekStartDay={app.data.business.weekStartDay}
					ariaLabel="Jump to week"
					onchange={(d) => app.goToWeek(d)}
				/>
			</span>
			<span class="range tnum" aria-live="polite">
				{formatWeekRange(app.currentWeek)}
				<span class="iso">{isoWeekLabel(app.currentWeek)}</span>
			</span>
		</div>

		<div class="view-toggle">
			<Segmented
				value={view}
				ariaLabel="Roster view"
				small
				segments={[
					{ value: 'staff', label: 'Staff view', icon: 'staff' },
					{ value: 'shift', label: 'Shift view', icon: 'grid' },
					{ value: 'coverage', label: 'Coverage', icon: 'chart' }
				]}
				onchange={setView}
			/>
		</div>
	{/if}

	<div class="right">
		{#if isRosterPage}
			<span
				class="pill"
				class:pill-success={app.roster.status === 'Published'}
				class:pill-info={app.roster.status === 'Draft'}
			>
				<Icon name={app.roster.status === 'Published' ? 'success' : 'edit'} size={14} />
				{app.roster.status}
			</span>
		{/if}

		<button
			type="button"
			class="palette-hint"
			onclick={onopenPalette}
			aria-keyshortcuts="Control+K"
		>
			<Icon name="search" size={16} />
			<span class="hint-text">Jump to</span>
			<span class="sr-only">a page, person, day or action</span>
			<kbd aria-hidden="true">&#8984;K</kbd>
		</button>

		{#if isRosterPage}
			<button type="button" class="btn btn-primary" onclick={ongenerate}>
				<Icon name="generate" size={16} />
				<span class="btn-text">Generate roster</span>
			</button>
		{/if}
	</div>
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		height: 56px;
		padding: 0 var(--space-4);
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		min-width: 0;
		overflow: hidden;
	}
	.crumbs {
		min-width: 0;
		flex-shrink: 1;
	}
	.week-switcher,
	.view-toggle,
	.right {
		flex-shrink: 0;
	}
	.menu-btn {
		display: none;
	}

	.crumbs ol {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: var(--text-13);
		color: var(--text-tertiary);
	}
	.crumbs li {
		display: flex;
		align-items: center;
	}
	.business {
		color: var(--text-secondary);
		max-width: 22ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.crumbs [aria-current='page'] {
		color: var(--text-primary);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.crumbs li:last-child {
		min-width: 0;
	}

	.week-switcher {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: var(--space-2);
	}
	.nav-group {
		display: flex;
		gap: 2px;
	}
	.today {
		padding: 0 var(--space-2);
	}
	.range {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-size: var(--text-13);
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.iso {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}

	.view-toggle {
		margin-left: var(--space-2);
	}

	.right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}

	.palette-hint {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: var(--control-h-sm);
		padding: 0 var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--surface-subtle);
		color: var(--text-tertiary);
		font-family: inherit;
		font-size: var(--text-13);
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--ease-out);
	}
	.palette-hint:hover {
		border-color: var(--border-strong);
		color: var(--text-secondary);
	}
	kbd {
		font-family: inherit;
		font-size: var(--text-12);
		padding: 1px 5px;
		border: 1px solid var(--border-strong);
		border-radius: 4px;
		background: var(--surface);
	}

	@media (max-width: 1280px) {
		.range .iso {
			display: none;
		}
		/* Visually hidden, still part of the button’s accessible name. */
		.hint-text {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
		}
	}
	@media (max-width: 1100px) {
		.range {
			display: none;
		}
		.business,
		.crumbs li[aria-hidden='true'] {
			display: none;
		}
	}
	@media (max-width: 1024px) {
		.palette-hint {
			display: none;
		}
	}
	@media (max-width: 900px) {
		.view-toggle {
			display: none;
		}
	}
	@media (max-width: 767px) {
		.topbar {
			gap: var(--space-2);
			padding: 0 var(--space-3);
		}
		.menu-btn {
			display: inline-flex;
		}
		.crumbs .business,
		.crumbs li[aria-hidden='true'] {
			display: none;
		}
		.btn-text {
			/* Visually hidden, still the button’s accessible name. */
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
		}
		/* At phone widths the date picker, status pill and palette hint are dropped so the
		   top bar keeps only the breadcrumb, the week arrows and the primary action. The
		   same controls remain reachable from the roster toolbar and the navigation sheet. */
		.palette-hint,
		.date-slot,
		.right .pill {
			display: none;
		}
		.week-switcher {
			margin-left: 0;
		}
	}
</style>
