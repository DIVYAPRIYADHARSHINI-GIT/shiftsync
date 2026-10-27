<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import MobileTabs from '#lib/components/MobileTabs.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import Toasts from '#lib/components/Toasts.svelte';
	import CommandPalette from '#lib/components/CommandPalette.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { app } from '#lib/state.svelte';
	import { formatBytes } from '#lib/store/roster-store';
	import { daysSinceBackup } from '#lib/logic/backup';

	let { children } = $props();

	let collapsed = $state(false);
	let paletteOpen = $state(false);
	let mobileNavOpen = $state(false);

	onMount(() => {
		app.init();
		collapsed = localStorage.getItem('shiftsync:sidebar') === 'collapsed';
		// Keep the saved theme in step with the system when it is set to follow it.
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const onSystemChange = () => app.applyTheme();
		mq.addEventListener('change', onSystemChange);
		const onBeforeUnload = () => app.flush();
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => {
			mq.removeEventListener('change', onSystemChange);
			window.removeEventListener('beforeunload', onBeforeUnload);
		};
	});

	function setCollapsed(next: boolean) {
		collapsed = next;
		try {
			localStorage.setItem('shiftsync:sidebar', next ? 'collapsed' : 'expanded');
		} catch {
			// Sidebar preference is cosmetic: ignore a blocked storage write.
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			paletteOpen = !paletteOpen;
		}
	}

	/**
	 * Open the generate panel. The roster page watches for `?generate=1`, so this works
	 * both from another page and from the roster page itself (where the page has already
	 * cleared the parameter from a previous run).
	 */
	function requestGenerate() {
		goto('/?generate=1', { replaceState: page.url.pathname === '/' });
	}

	const backupDays = $derived(
		daysSinceBackup(app.data.settings.lastBackupAt, Date.now())
	);
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
	<title>ShiftSync - Plan shifts. Keep it fair.</title>
</svelte:head>

<a href="#main" class="skip-link">Skip to main content</a>

<div class="shell">
	<div class="sidebar-slot">
		<Sidebar {collapsed} oncollapse={setCollapsed} />
	</div>

	<div class="main-column">
		<TopBar
			onopenPalette={() => (paletteOpen = true)}
			onopenMenu={() => (mobileNavOpen = true)}
			ongenerate={requestGenerate}
		/>

		{#if app.backupDue && app.loaded}
			<div class="banner" role="status">
				<Icon name="shield" size={16} />
				<p>
					{backupDays === null
						? 'You have not exported a backup yet. Your data only exists in this browser.'
						: `Your last backup was ${backupDays} days ago.`}
				</p>
				<a class="btn btn-sm" href="/privacy">Export a backup</a>
			</div>
		{/if}

		{#if app.storage.health === 'unavailable'}
			<div class="banner danger" role="alert">
				<Icon name="warning" size={16} />
				<p>
					{app.storage.message ??
						'This browser is blocking local storage, so changes will be lost when you close the tab.'}
				</p>
			</div>
		{/if}

		<main id="main" class="content" class:flush={page.url.pathname === '/'}>
			{@render children()}
		</main>

		<footer class="status-bar">
			<span class="badge" title="No roster data is ever uploaded. Everything is stored in this browser only.">
				<Icon name="shield" size={14} />
				Data stays in this browser
			</span>
			<span class="meter">
				<span class="sr-only">
					Storage used: {formatBytes(app.storage.usedBytes)} of {formatBytes(app.storage.limitBytes)}
				</span>
				<span class="meter-track">
					<span
						class="meter-fill"
						class:warn={app.storage.fraction > 0.75}
						class:full={app.storage.fraction > 0.92}
						style="width: {Math.max(2, app.storage.fraction * 100)}%"
					></span>
				</span>
				<span class="meter-text tnum">{formatBytes(app.storage.usedBytes)} used</span>
			</span>
			<a class="privacy-link" href="/privacy">Privacy and backup</a>
		</footer>
	</div>

	<div class="tabs-slot">
		<MobileTabs />
	</div>
</div>

{#if mobileNavOpen}
	<Dialog open title="Navigate" onclose={() => (mobileNavOpen = false)}>
		<nav aria-label="All pages">
			<ul class="mobile-nav">
				{#each [['/', 'Roster'], ['/staff', 'Staff'], ['/shifts', 'Shifts and coverage'], ['/leave', 'Leave'], ['/swaps', 'Swaps'], ['/hours', 'Hours summary'], ['/reports', 'Reports'], ['/settings', 'Settings'], ['/privacy', 'Privacy and backup'], ['/about', 'About']] as [href, label] (href)}
					<li>
						<a {href} onclick={() => (mobileNavOpen = false)}>{label}</a>
					</li>
				{/each}
			</ul>
		</nav>
	</Dialog>
{/if}

<CommandPalette open={paletteOpen} onclose={() => (paletteOpen = false)} ongenerate={requestGenerate} />
<Toasts />

<style>
	.shell {
		display: flex;
		height: 100%;
		overflow: hidden;
	}
	.sidebar-slot {
		display: contents;
	}
	.tabs-slot {
		display: none;
	}
	.main-column {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}
	.content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-6);
	}
	/* The roster page manages its own scroll containers, so the page itself does not scroll. */
	.content.flush {
		padding: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.banner {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: var(--saffron-tint);
		border-bottom: 1px solid color-mix(in srgb, var(--saffron) 30%, transparent);
		color: var(--text-primary);
		font-size: var(--text-13);
	}
	.banner :global(svg) {
		color: var(--saffron);
		flex-shrink: 0;
	}
	.banner p {
		flex: 1;
	}
	.banner.danger {
		background: var(--danger-tint);
		border-bottom-color: color-mix(in srgb, var(--danger) 30%, transparent);
	}
	.banner.danger :global(svg) {
		color: var(--danger);
	}

	.status-bar {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		height: 32px;
		padding: 0 var(--space-4);
		background: var(--surface);
		border-top: 1px solid var(--border);
		font-size: var(--text-12);
		color: var(--text-tertiary);
		flex-shrink: 0;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--success);
		font-weight: 500;
	}
	.meter {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.meter-track {
		display: block;
		width: 72px;
		height: 4px;
		border-radius: 2px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		overflow: hidden;
	}
	.meter-fill {
		display: block;
		height: 100%;
		background: var(--brand);
		transition: width var(--motion-slow) var(--ease-out);
	}
	.meter-fill.warn {
		background: var(--saffron);
	}
	.meter-fill.full {
		background: var(--danger);
	}
	.privacy-link {
		margin-left: auto;
		color: var(--text-tertiary);
	}
	.privacy-link:hover {
		color: var(--brand);
	}

	.mobile-nav {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.mobile-nav a {
		display: flex;
		align-items: center;
		min-height: 44px;
		padding: 0 var(--space-3);
		border-radius: var(--radius-control);
		color: var(--text-primary);
		font-size: var(--text-14);
		font-weight: 500;
	}
	.mobile-nav a:hover {
		background: var(--surface-subtle);
		text-decoration: none;
	}

	@media (max-width: 767px) {
		.shell {
			flex-direction: column;
		}
		.sidebar-slot {
			display: none;
		}
		.tabs-slot {
			display: block;
		}
		.content {
			padding: var(--space-4);
		}
		.meter-text,
		.privacy-link {
			display: none;
		}
	}
</style>
