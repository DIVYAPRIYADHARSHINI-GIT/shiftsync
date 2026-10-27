<script lang="ts">
	// Custom accessible select. No raw browser control: a listbox button plus a popover,
	// with full keyboard support (arrows, Home/End, type-ahead, Escape) and aria wiring.
	import Icon from './Icon.svelte';

	interface Option {
		value: string;
		label: string;
		description?: string;
		disabled?: boolean;
	}

	interface Props {
		value: string;
		options: Option[];
		onchange: (value: string) => void;
		id?: string;
		placeholder?: string;
		disabled?: boolean;
		small?: boolean;
		ariaLabel?: string;
		invalid?: boolean;
		fullWidth?: boolean;
	}

	let {
		value,
		options,
		onchange,
		id,
		placeholder = 'Choose',
		disabled = false,
		small = false,
		ariaLabel,
		invalid = false,
		fullWidth = true
	}: Props = $props();

	let open = $state(false);
	let activeIndex = $state(-1);
	let trigger = $state<HTMLButtonElement | null>(null);
	let list = $state<HTMLUListElement | null>(null);
	let typeAhead = '';
	let typeAheadTimer: ReturnType<typeof setTimeout> | null = null;

	const selected = $derived(options.find((o) => o.value === value));

	function openList() {
		if (disabled) return;
		open = true;
		activeIndex = Math.max(
			0,
			options.findIndex((o) => o.value === value)
		);
		queueMicrotask(() => list?.focus());
	}

	function close(refocus = true) {
		open = false;
		activeIndex = -1;
		if (refocus) trigger?.focus();
	}

	function pick(index: number) {
		const option = options[index];
		if (!option || option.disabled) return;
		onchange(option.value);
		close();
	}

	function move(delta: number) {
		if (options.length === 0) return;
		let next = activeIndex;
		for (let i = 0; i < options.length; i++) {
			next = (next + delta + options.length) % options.length;
			if (!options[next].disabled) break;
		}
		activeIndex = next;
		scrollActiveIntoView();
	}

	function scrollActiveIntoView() {
		queueMicrotask(() => {
			const el = list?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
			el?.scrollIntoView({ block: 'nearest' });
		});
	}

	function onListKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				move(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				move(-1);
				break;
			case 'Home':
				event.preventDefault();
				activeIndex = options.findIndex((o) => !o.disabled);
				scrollActiveIntoView();
				break;
			case 'End':
				event.preventDefault();
				for (let i = options.length - 1; i >= 0; i--) {
					if (!options[i].disabled) {
						activeIndex = i;
						break;
					}
				}
				scrollActiveIntoView();
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				pick(activeIndex);
				break;
			case 'Escape':
				event.preventDefault();
				close();
				break;
			case 'Tab':
				close(false);
				break;
			default:
				if (event.key.length === 1) {
					typeAhead += event.key.toLowerCase();
					if (typeAheadTimer) clearTimeout(typeAheadTimer);
					typeAheadTimer = setTimeout(() => (typeAhead = ''), 600);
					const match = options.findIndex(
						(o) => !o.disabled && o.label.toLowerCase().startsWith(typeAhead)
					);
					if (match >= 0) {
						activeIndex = match;
						scrollActiveIntoView();
					}
				}
		}
	}

	function onTriggerKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openList();
		}
	}
</script>

<div class="select" class:full={fullWidth}>
	<button
		bind:this={trigger}
		{id}
		type="button"
		class="select-trigger"
		class:small
		class:invalid
		{disabled}
		role="combobox"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls="{id ?? 'sel'}-listbox"
		aria-label={ariaLabel}
		aria-invalid={invalid ? true : undefined}
		onclick={() => (open ? close() : openList())}
		onkeydown={onTriggerKeydown}
	>
		<span class="value" class:placeholder={!selected}>{selected?.label ?? placeholder}</span>
		<Icon name="chevron-down" size={16} />
	</button>

	{#if open}
		<!-- Click-away backdrop. Keyboard users leave with Escape or Tab. -->
		<div
			class="backdrop"
			role="presentation"
			onclick={() => close(false)}
			onwheel={() => close(false)}
		></div>
		<ul
			bind:this={list}
			id="{id ?? 'sel'}-listbox"
			class="options popover"
			role="listbox"
			tabindex="-1"
			aria-activedescendant={activeIndex >= 0 ? `${id ?? 'sel'}-opt-${activeIndex}` : undefined}
			onkeydown={onListKeydown}
		>
			{#each options as option, index (option.value)}
				<!-- Keyboard handling for options lives on the parent listbox, which is the
				     correct ARIA combobox pattern: the list owns focus and arrow keys. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{id ?? 'sel'}-opt-{index}"
					data-index={index}
					role="option"
					aria-selected={option.value === value}
					aria-disabled={option.disabled || undefined}
					class:active={index === activeIndex}
					class:chosen={option.value === value}
					class:disabled={option.disabled}
					onclick={() => pick(index)}
					onmouseenter={() => (activeIndex = index)}
				>
					<span class="opt-label">{option.label}</span>
					{#if option.description}<span class="opt-desc">{option.description}</span>{/if}
					{#if option.value === value}
						<Icon name="check" size={16} class="opt-check" />
					{/if}
				</li>
			{:else}
				<li class="opt-empty" role="presentation">No options available</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.select {
		position: relative;
		display: inline-block;
	}
	.select.full {
		display: block;
		width: 100%;
	}
	.select-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		width: 100%;
		height: var(--control-h);
		padding: 0 var(--space-2) 0 var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text-primary);
		font-family: inherit;
		font-size: var(--text-14);
		text-align: left;
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--ease-out);
	}
	.select-trigger.small {
		height: var(--control-h-sm);
		font-size: var(--text-13);
	}
	.select-trigger:hover:not(:disabled) {
		border-color: var(--text-tertiary);
	}
	.select-trigger:disabled {
		background: var(--surface-subtle);
		color: var(--text-tertiary);
		cursor: not-allowed;
	}
	.select-trigger.invalid {
		border-color: var(--danger);
	}
	.value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.value.placeholder {
		color: var(--text-tertiary);
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
	}
	.options {
		position: absolute;
		z-index: 50;
		top: calc(100% + 4px);
		left: 0;
		min-width: 100%;
		max-height: 280px;
		overflow-y: auto;
		margin: 0;
		padding: var(--space-1);
		list-style: none;
		animation: pop var(--motion-fast) var(--ease-out);
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(-2px);
		}
	}
	.options:focus-visible {
		box-shadow: var(--shadow-popover);
	}
	.options li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2);
		border-radius: var(--radius-control);
		font-size: var(--text-14);
		color: var(--text-primary);
		cursor: pointer;
		white-space: nowrap;
	}
	.options li.active {
		background: var(--surface-subtle);
	}
	.options li.chosen {
		color: var(--brand);
		font-weight: 500;
	}
	.options li.disabled {
		color: var(--text-tertiary);
		cursor: not-allowed;
	}
	.opt-label {
		flex: 1;
	}
	.opt-desc {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}
	.opt-empty {
		padding: var(--space-2);
		color: var(--text-tertiary);
		font-size: var(--text-13);
		cursor: default;
	}
	:global(.opt-check) {
		flex-shrink: 0;
	}
</style>
