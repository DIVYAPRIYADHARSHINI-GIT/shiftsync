<script lang="ts">
	// One page-header pattern used by every page: title, short description, actions right.
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		actions?: Snippet;
	}
	let { title, description, actions }: Props = $props();
</script>

<header class="page-header">
	<div class="titles">
		<h1>{title}</h1>
		{#if description}<p class="desc">{description}</p>{/if}
	</div>
	{#if actions}
		<div class="actions">{@render actions()}</div>
	{/if}
</header>

<style>
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-bottom: var(--space-6);
	}
	.titles {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.desc {
		font-size: var(--text-14);
		color: var(--text-secondary);
		max-width: 68ch;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	@media (max-width: 600px) {
		.page-header {
			margin-bottom: var(--space-4);
		}
		.actions {
			width: 100%;
		}
	}
</style>
