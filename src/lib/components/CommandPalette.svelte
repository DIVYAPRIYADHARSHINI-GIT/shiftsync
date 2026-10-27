<script lang="ts">
	// Quiet command palette (Cmd/Ctrl + K): jump to a page, a person, a day, or run an action.
	import { goto } from '$app/navigation';
	import Icon, { type IconName } from './Icon.svelte';
	import { app } from '../state.svelte';
	import { addDays, formatDate, formatDayHeader, weekDates } from '../logic/time';
	import { initials } from './controls.svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
		ongenerate: () => void;
	}
	let { open, onclose, ongenerate }: Props = $props();

	interface Command {
		id: string;
		label: string;
		hint?: string;
		icon: IconName;
		group: string;
		run: () => void;
	}

	let query = $state('');
	let activeIndex = $state(0);
	let input = $state<HTMLInputElement | null>(null);

	const commands = $derived.by<Command[]>(() => {
		const out: Command[] = [];

		for (const nav of [
			{ href: '/', label: 'Roster', icon: 'roster' as IconName },
			{ href: '/staff', label: 'Staff', icon: 'staff' as IconName },
			{ href: '/shifts', label: 'Shifts and coverage', icon: 'shifts' as IconName },
			{ href: '/leave', label: 'Leave', icon: 'leave' as IconName },
			{ href: '/swaps', label: 'Swaps', icon: 'swaps' as IconName },
			{ href: '/hours', label: 'Hours summary', icon: 'hours' as IconName },
			{ href: '/reports', label: 'Reports', icon: 'reports' as IconName },
			{ href: '/settings', label: 'Settings', icon: 'settings' as IconName },
			{ href: '/privacy', label: 'Privacy and backup', icon: 'shield' as IconName },
			{ href: '/about', label: 'About', icon: 'info' as IconName }
		]) {
			out.push({
				id: `go-${nav.href}`,
				label: nav.label,
				icon: nav.icon,
				group: 'Go to',
				run: () => goto(nav.href)
			});
		}

		out.push(
			{
				id: 'act-generate',
				label: 'Generate roster',
				hint: 'For the open week',
				icon: 'generate',
				group: 'Actions',
				run: ongenerate
			},
			{
				id: 'act-today',
				label: 'Go to this week',
				icon: 'calendar',
				group: 'Actions',
				run: () => {
					app.goToToday();
					goto('/');
				}
			},
			{
				id: 'act-next',
				label: 'Next week',
				icon: 'chevron-right',
				group: 'Actions',
				run: () => {
					app.nextWeek();
					goto('/');
				}
			},
			{
				id: 'act-prev',
				label: 'Previous week',
				icon: 'chevron-left',
				group: 'Actions',
				run: () => {
					app.prevWeek();
					goto('/');
				}
			},
			{
				id: 'act-undo',
				label: 'Undo last change',
				icon: 'undo',
				group: 'Actions',
				run: () => app.undo()
			},
			{
				id: 'act-theme',
				label: app.data.settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
				icon: app.data.settings.theme === 'dark' ? 'sun' : 'moon',
				group: 'Actions',
				run: () => app.setTheme(app.data.settings.theme === 'dark' ? 'light' : 'dark')
			}
		);

		for (const person of app.data.staff) {
			out.push({
				id: `staff-${person.id}`,
				label: person.name,
				hint: person.roles.join(', '),
				icon: 'person',
				group: 'Staff',
				run: () => goto(`/hours?person=${person.id}`)
			});
		}

		for (const date of weekDates(app.currentWeek)) {
			out.push({
				id: `day-${date}`,
				label: formatDayHeader(date),
				hint: 'Open this day',
				icon: 'calendar',
				group: 'Days',
				run: () => goto(`/?day=${date}`)
			});
		}

		return out;
	});

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return commands.slice(0, 12);
		return commands
			.filter(
				(c) =>
					c.label.toLowerCase().includes(q) ||
					c.group.toLowerCase().includes(q) ||
					(c.hint ?? '').toLowerCase().includes(q)
			)
			.slice(0, 20);
	});

	$effect(() => {
		if (open) {
			query = '';
			activeIndex = 0;
			queueMicrotask(() => input?.focus());
		}
	});

	// Keep the highlight inside the filtered list as the query narrows it.
	$effect(() => {
		const max = Math.max(0, filtered.length - 1);
		if (activeIndex > max) activeIndex = max;
	});

	function run(index: number) {
		const command = filtered[index];
		if (!command) return;
		onclose();
		command.run();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = (activeIndex + 1) % Math.max(1, filtered.length);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = (activeIndex - 1 + filtered.length) % Math.max(1, filtered.length);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			run(activeIndex);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		}
	}
</script>

{#if open}
	<div class="overlay">
		<div class="scrim" role="presentation" onclick={onclose}></div>
		<div class="palette popover" role="dialog" aria-modal="true" aria-label="Command palette">
			<div class="search">
				<Icon name="search" size={18} />
				<input
					bind:this={input}
					bind:value={query}
					type="text"
					role="combobox"
					aria-expanded="true"
					aria-controls="palette-list"
					aria-activedescendant={filtered[activeIndex] ? `palette-${filtered[activeIndex].id}` : undefined}
					aria-label="Search pages, staff, days and actions"
					placeholder="Search pages, staff, days and actions"
					autocomplete="off"
					onkeydown={onKeydown}
				/>
				<kbd>Esc</kbd>
			</div>
			<ul id="palette-list" role="listbox" aria-label="Results">
				{#each filtered as command, index (command.id)}
					{@const newGroup = index === 0 || filtered[index - 1].group !== command.group}
					{#if newGroup}
						<li class="group" role="presentation">{command.group}</li>
					{/if}
					<!-- Arrow keys and Enter are handled by the combobox input above, which is
					     the correct ARIA pattern for a search palette. -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id="palette-{command.id}"
						role="option"
						aria-selected={index === activeIndex}
						class="result"
						class:active={index === activeIndex}
						onclick={() => run(index)}
						onmouseenter={() => (activeIndex = index)}
					>
						{#if command.group === 'Staff'}
							<span class="avatar" aria-hidden="true">{initials(command.label)}</span>
						{:else}
							<Icon name={command.icon} size={18} />
						{/if}
						<span class="label">{command.label}</span>
						{#if command.hint}<span class="hint">{command.hint}</span>{/if}
					</li>
				{:else}
					<li class="no-results" role="presentation">
						No matches for &ldquo;{query}&rdquo;. Try a page, a person or a day.
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 95;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 10vh var(--space-4) var(--space-4);
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: rgba(15, 26, 42, 0.3);
	}
	:global(.dark) .scrim {
		background: rgba(0, 0, 0, 0.55);
	}
	.palette {
		position: relative;
		width: min(560px, 100%);
		max-height: 60vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: rise var(--motion-slow) var(--ease-out);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
	}
	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		border-bottom: 1px solid var(--border);
		color: var(--text-tertiary);
	}
	.search input {
		flex: 1;
		border: none;
		background: none;
		color: var(--text-primary);
		font-family: inherit;
		font-size: var(--text-14);
		outline: none;
	}
	.search input::placeholder {
		color: var(--text-tertiary);
	}
	kbd {
		font-family: inherit;
		font-size: var(--text-12);
		padding: 1px 5px;
		border: 1px solid var(--border-strong);
		border-radius: 4px;
		color: var(--text-tertiary);
	}
	ul {
		flex: 1;
		overflow-y: auto;
		list-style: none;
		margin: 0;
		padding: var(--space-1);
	}
	.group {
		padding: var(--space-2) var(--space-2) var(--space-1);
		font-size: var(--text-12);
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.result {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		border-radius: var(--radius-control);
		color: var(--text-primary);
		font-size: var(--text-14);
		cursor: pointer;
	}
	.result.active {
		background: var(--brand-tint);
		color: var(--brand);
	}
	.label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hint {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		white-space: nowrap;
	}
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--surface-subtle);
		font-size: 10px;
		font-weight: 600;
		color: var(--text-secondary);
		flex-shrink: 0;
	}
	.no-results {
		padding: var(--space-6) var(--space-3);
		text-align: center;
		font-size: var(--text-13);
		color: var(--text-tertiary);
	}
</style>
