<script lang="ts">
	// Bottom tab bar used instead of the sidebar below 768 px. 44 px touch targets.
	import { page } from '$app/state';
	import Icon, { type IconName } from './Icon.svelte';

	const TABS: { href: string; label: string; icon: IconName }[] = [
		{ href: '/', label: 'Roster', icon: 'roster' },
		{ href: '/staff', label: 'Staff', icon: 'staff' },
		{ href: '/leave', label: 'Leave', icon: 'leave' },
		{ href: '/hours', label: 'Hours', icon: 'hours' },
		{ href: '/settings', label: 'Settings', icon: 'settings' }
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path.startsWith(href);
	}
</script>

<nav class="tabs" aria-label="Main">
	{#each TABS as tab (tab.href)}
		{@const active = isActive(tab.href)}
		<a href={tab.href} class="tab" class:active aria-current={active ? 'page' : undefined}>
			<Icon name={tab.icon} size={20} />
			<span>{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.tabs {
		display: flex;
		align-items: stretch;
		background: var(--surface);
		border-top: 1px solid var(--border);
		padding-bottom: env(safe-area-inset-bottom);
		flex-shrink: 0;
	}
	.tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 52px;
		padding: var(--space-1) 2px;
		color: var(--text-tertiary);
		font-size: var(--text-12);
		font-weight: 500;
		text-decoration: none;
	}
	.tab:hover {
		text-decoration: none;
	}
	.tab.active {
		color: var(--brand);
	}
	.tab span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
</style>
