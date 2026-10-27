<script lang="ts">
	// Accessible switch. Renders as a real button with role="switch".
	interface Props {
		checked: boolean;
		onchange: (checked: boolean) => void;
		id?: string;
		label: string;
		/** Hide the visible label when the context already names the control. */
		hideLabel?: boolean;
		disabled?: boolean;
		describedBy?: string;
	}
	let {
		checked,
		onchange,
		id,
		label,
		hideLabel = false,
		disabled = false,
		describedBy
	}: Props = $props();
</script>

<button
	{id}
	type="button"
	role="switch"
	class="toggle"
	aria-checked={checked}
	aria-label={hideLabel ? label : undefined}
	aria-describedby={describedBy}
	{disabled}
	onclick={() => onchange(!checked)}
>
	<span class="track" class:on={checked}>
		<span class="thumb"></span>
	</span>
	{#if !hideLabel}<span class="text">{label}</span>{/if}
</button>

<style>
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 24px;
		padding: 0;
		border: none;
		background: none;
		color: var(--text-primary);
		font-family: inherit;
		font-size: var(--text-14);
		cursor: pointer;
		text-align: left;
	}
	.toggle:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.track {
		position: relative;
		flex-shrink: 0;
		width: 36px;
		height: 20px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: var(--surface-subtle);
		transition:
			background var(--motion-base) var(--ease-out),
			border-color var(--motion-base) var(--ease-out);
	}
	.track.on {
		background: var(--brand);
		border-color: var(--brand);
	}
	.thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--surface);
		box-shadow: 0 1px 2px rgba(15, 26, 42, 0.2);
		transition: transform var(--motion-base) var(--ease-out);
	}
	.track.on .thumb {
		transform: translateX(16px);
	}
	.text {
		line-height: var(--lh-normal);
	}
</style>
