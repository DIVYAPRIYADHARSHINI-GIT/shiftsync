<script lang="ts">
	// Modal dialog with focus trap, Escape to close and a labelled heading.
	// Used for every destructive confirmation and every record editor.
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { trapFocus } from './controls.svelte';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
		/** Wider dialog for forms with two columns. */
		wide?: boolean;
	}

	let { open, title, description, onclose, children, footer, wide = false }: Props = $props();

	let panel = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!open || !panel) return;
		const release = trapFocus(panel);
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			release();
			document.body.style.overflow = previousOverflow;
		};
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
	<div class="overlay">
		<div class="scrim" role="presentation" onclick={onclose}></div>
		<div
			bind:this={panel}
			class="panel"
			class:wide
			role="dialog"
			aria-modal="true"
			aria-labelledby="dialog-title"
			aria-describedby={description ? 'dialog-desc' : undefined}
		>
			<header>
				<div class="titles">
					<h2 id="dialog-title">{title}</h2>
					{#if description}<p id="dialog-desc" class="desc">{description}</p>{/if}
				</div>
				<button type="button" class="btn btn-quiet btn-icon btn-sm" aria-label="Close dialog" onclick={onclose}>
					<Icon name="close" size={16} />
				</button>
			</header>
			<div class="body">
				{@render children()}
			</div>
			{#if footer}
				<footer>{@render footer()}</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: rgba(15, 26, 42, 0.38);
		animation: fade var(--motion-base) var(--ease-out);
	}
	:global(.dark) .scrim {
		background: rgba(0, 0, 0, 0.6);
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	.panel {
		position: relative;
		display: flex;
		flex-direction: column;
		width: min(520px, 100%);
		max-height: min(86vh, 760px);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-popover);
		animation: rise var(--motion-slow) var(--ease-out);
	}
	.panel.wide {
		width: min(760px, 100%);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.titles {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.desc {
		font-size: var(--text-13);
		color: var(--text-secondary);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-4);
	}
	footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--border);
		background: var(--surface-subtle);
		border-radius: 0 0 var(--radius-card) var(--radius-card);
	}
	@media (max-width: 480px) {
		.overlay {
			padding: 0;
			align-items: flex-end;
		}
		.panel,
		.panel.wide {
			width: 100%;
			max-height: 92vh;
			border-radius: var(--radius-card) var(--radius-card) 0 0;
		}
	}
</style>
