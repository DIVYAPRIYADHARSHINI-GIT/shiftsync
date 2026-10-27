<script lang="ts">
	// Slim collapsible left sidebar. Becomes a bottom tab bar on mobile (handled in
	// the layout, which renders MobileTabs instead below 768 px).
	import { page } from '$app/state';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		collapsed: boolean;
		oncollapse: (collapsed: boolean) => void;
	}
	let { collapsed, oncollapse }: Props = $props();

	const NAV: { href: string; label: string; icon: IconName }[] = [
		{ href: '/', label: 'Roster', icon: 'roster' },
		{ href: '/staff', label: 'Staff', icon: 'staff' },
		{ href: '/shifts', label: 'Shifts and coverage', icon: 'shifts' },
		{ href: '/leave', label: 'Leave', icon: 'leave' },
		{ href: '/swaps', label: 'Swaps', icon: 'swaps' },
		{ href: '/hours', label: 'Hours summary', icon: 'hours' },
		{ href: '/reports', label: 'Reports', icon: 'reports' },
		{ href: '/settings', label: 'Settings', icon: 'settings' }
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path.startsWith(href);
	}
</script>

<nav class="sidebar" class:collapsed aria-label="Main">
	<div class="brand">
		<span class="mark" aria-hidden="true">
			<Icon name="logo" size={20} />
		</span>
		{#if !collapsed}
			<span class="wordmark">
				<span class="name">ShiftSync</span>
				<span class="tagline">Plan shifts. Keep it fair.</span>
			</span>
		{/if}
	</div>

	<ul class="items">
		{#each NAV as item (item.href)}
			{@const active = isActive(item.href)}
			<li>
				<a
					href={item.href}
					class="item"
					class:active
					aria-current={active ? 'page' : undefined}
					title={collapsed ? item.label : undefined}
				>
					<span class="indicator" aria-hidden="true"></span>
					<Icon name={item.icon} size={20} />
					{#if !collapsed}<span class="text">{item.label}</span>{/if}
				</a>
			</li>
		{/each}
	</ul>

	<div class="foot">
		<a href="/about" class="item quiet" class:active={isActive('/about')} title={collapsed ? 'About' : undefined}>
			<span class="indicator" aria-hidden="true"></span>
			<Icon name="info" size={20} />
			{#if !collapsed}<span class="text">About</span>{/if}
		</a>
		<a href="/privacy" class="item quiet" class:active={isActive('/privacy')} title={collapsed ? 'Privacy and backup' : undefined}>
			<span class="indicator" aria-hidden="true"></span>
			<Icon name="shield" size={20} />
			{#if !collapsed}<span class="text">Privacy and backup</span>{/if}
		</a>
		<button
			type="button"
			class="collapse"
			onclick={() => oncollapse(!collapsed)}
			aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			<Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} />
			{#if !collapsed}<span class="text">Collapse</span>{/if}
		</button>
	</div>
</nav>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		width: 232px;
		flex-shrink: 0;
		height: 100%;
		padding: var(--space-3) var(--space-2);
		background: var(--surface);
		border-right: 1px solid var(--border);
		transition: width var(--motion-slow) var(--ease-out);
	}
	.sidebar.collapsed {
		width: 60px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		margin-bottom: var(--space-4);
		min-width: 0;
	}
	.mark {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border-radius: var(--radius-control);
		background: var(--brand-tint);
		color: var(--brand);
	}
	.wordmark {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.name {
		font-size: var(--text-14);
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.2;
	}
	.tagline {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.items {
		flex: 1;
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 0;
		overflow-y: auto;
	}

	.item {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		height: var(--control-h);
		padding: 0 var(--space-2) 0 var(--space-3);
		border-radius: var(--radius-control);
		color: var(--text-secondary);
		font-size: var(--text-14);
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
		transition:
			background var(--motion-fast) var(--ease-out),
			color var(--motion-fast) var(--ease-out);
	}
	.item:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
		text-decoration: none;
	}
	.item.active {
		background: var(--brand-tint);
		color: var(--brand);
	}
	.indicator {
		position: absolute;
		left: 0;
		top: 8px;
		bottom: 8px;
		width: 3px;
		border-radius: 0 2px 2px 0;
		background: transparent;
	}
	.item.active .indicator {
		background: var(--brand);
	}
	.text {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.foot {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: var(--space-2);
		margin-top: var(--space-2);
		border-top: 1px solid var(--border);
	}
	.collapse {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		height: var(--control-h);
		padding: 0 var(--space-2) 0 var(--space-3);
		border: none;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text-tertiary);
		font-family: inherit;
		font-size: var(--text-13);
		cursor: pointer;
	}
	.collapse:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.sidebar.collapsed .item,
	.sidebar.collapsed .collapse {
		justify-content: center;
		padding: 0;
	}
	.sidebar.collapsed .brand {
		justify-content: center;
		padding: var(--space-2) 0;
	}

	/* Tablet: always use the icon rail so the top bar keeps room for its primary action. */
	@media (max-width: 1024px) {
		.sidebar {
			width: 60px;
		}
		.sidebar .text,
		.sidebar .wordmark {
			display: none;
		}
		.sidebar .item,
		.sidebar .collapse {
			justify-content: center;
			padding: 0;
		}
		.sidebar .brand {
			justify-content: center;
			padding: var(--space-2) 0;
		}
		.collapse {
			display: none;
		}
	}
</style>
