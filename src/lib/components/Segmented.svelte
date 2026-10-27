<script lang="ts">
	// Segmented control. Implemented as a radiogroup so arrow keys move between options.
	import Icon, { type IconName } from './Icon.svelte';

	interface Segment {
		value: string;
		label: string;
		icon?: IconName;
	}

	interface Props {
		value: string;
		segments: Segment[];
		onchange: (value: string) => void;
		ariaLabel: string;
		small?: boolean;
		/** Show icons only, with the label as the accessible name. */
		iconOnly?: boolean;
	}

	let { value, segments, onchange, ariaLabel, small = false, iconOnly = false }: Props = $props();

	function onKeydown(event: KeyboardEvent, index: number) {
		let next = -1;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % segments.length;
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
			next = (index - 1 + segments.length) % segments.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = segments.length - 1;
		if (next >= 0) {
			event.preventDefault();
			onchange(segments[next].value);
			(event.currentTarget as HTMLElement).parentElement
				?.querySelectorAll<HTMLButtonElement>('button')
				[next]?.focus();
		}
	}
</script>

<div class="segmented" class:small role="radiogroup" aria-label={ariaLabel}>
	{#each segments as segment, index (segment.value)}
		<button
			type="button"
			role="radio"
			aria-checked={segment.value === value}
			aria-label={iconOnly ? segment.label : undefined}
			class="seg"
			class:active={segment.value === value}
			tabindex={segment.value === value ? 0 : -1}
			onclick={() => onchange(segment.value)}
			onkeydown={(e) => onKeydown(e, index)}
		>
			{#if segment.icon}<Icon name={segment.icon} size={small ? 14 : 16} />{/if}
			{#if !iconOnly}<span>{segment.label}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.segmented {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-control);
		background: var(--surface-subtle);
		gap: 2px;
	}
	.seg {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		height: calc(var(--control-h) - 6px);
		padding: 0 var(--space-3);
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--text-secondary);
		font-family: inherit;
		font-size: var(--text-13);
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background var(--motion-fast) var(--ease-out),
			color var(--motion-fast) var(--ease-out);
	}
	.small .seg {
		height: calc(var(--control-h-sm) - 6px);
		padding: 0 var(--space-2);
		font-size: var(--text-12);
	}
	.seg:hover:not(.active) {
		color: var(--text-primary);
	}
	.seg.active {
		background: var(--surface);
		color: var(--text-primary);
		box-shadow: 0 1px 2px rgba(15, 26, 42, 0.06);
	}
</style>
