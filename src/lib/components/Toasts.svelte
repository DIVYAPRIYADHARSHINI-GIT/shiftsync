<script lang="ts">
	// Toast stack. Confirmations and a single undo action, announced politely.
	import Icon, { type IconName } from './Icon.svelte';
	import { app } from '../state.svelte';

	const TONE_ICON: Record<string, IconName> = {
		info: 'info',
		success: 'success',
		warning: 'warning',
		danger: 'error'
	};
</script>

<div class="toasts" role="region" aria-label="Notifications">
	<div aria-live="polite" aria-atomic="false">
		{#each app.toasts as toast (toast.id)}
			<div class="toast" class:success={toast.tone === 'success'} class:warning={toast.tone === 'warning'} class:danger={toast.tone === 'danger'}>
				<Icon name={TONE_ICON[toast.tone]} size={18} />
				<p>{toast.message}</p>
				{#if toast.undo}
					<button
						type="button"
						class="btn btn-sm undo"
						onclick={() => {
							toast.undo?.();
							app.dismissToast(toast.id);
						}}
					>
						Undo
					</button>
				{/if}
				<button
					type="button"
					class="btn btn-quiet btn-icon btn-sm"
					aria-label="Dismiss notification"
					onclick={() => app.dismissToast(toast.id)}
				>
					<Icon name="close" size={14} />
				</button>
			</div>
		{/each}
	</div>
</div>

<style>
	.toasts {
		position: fixed;
		right: var(--space-4);
		bottom: var(--space-4);
		z-index: 95;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		pointer-events: none;
		max-width: min(420px, calc(100vw - 32px));
	}
	.toasts > div {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.toast {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-left: 3px solid var(--info);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-popover);
		color: var(--text-primary);
		pointer-events: auto;
		animation: slide-in var(--motion-slow) var(--ease-out);
	}
	.toast :global(svg) {
		color: var(--info);
		flex-shrink: 0;
	}
	.toast.success {
		border-left-color: var(--success);
	}
	.toast.success :global(svg) {
		color: var(--success);
	}
	.toast.warning {
		border-left-color: var(--saffron);
	}
	.toast.warning :global(svg) {
		color: var(--saffron);
	}
	.toast.danger {
		border-left-color: var(--danger);
	}
	.toast.danger :global(svg) {
		color: var(--danger);
	}
	.toast p {
		flex: 1;
		font-size: var(--text-13);
		line-height: var(--lh-normal);
	}
	.undo {
		flex-shrink: 0;
	}
	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	@media (max-width: 767px) {
		.toasts {
			right: var(--space-3);
			left: var(--space-3);
			bottom: 64px;
			max-width: none;
		}
	}
</style>
