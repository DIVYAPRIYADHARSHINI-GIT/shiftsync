<script lang="ts">
	// Custom time picker: a text entry that accepts 09:00, 0900 or 9, plus stepper
	// buttons in 15 minute increments. No raw browser time control.
	import Icon from './Icon.svelte';
	import { formatTime } from '../logic/time';
	import { untrack } from 'svelte';

	interface Props {
		/** Minutes from midnight. */
		value: number;
		onchange: (minutes: number) => void;
		id?: string;
		ariaLabel?: string;
		disabled?: boolean;
		small?: boolean;
	}

	let { value, onchange, id, ariaLabel, disabled = false, small = false }: Props = $props();

	// Seeded from the initial minutes; kept in step by the effect below while not focused.
	let text = $state(formatTime(untrack(() => value)));
	let invalid = $state(false);
	let focused = $state(false);

	// Keep the text in step with the value unless the field is being typed into.
	$effect(() => {
		if (!focused) {
			text = formatTime(value);
			invalid = false;
		}
	});

	/** Accepts '9', '930', '9:30', '09:30' and '2200'. */
	function parse(raw: string): number | null {
		const s = raw.trim().replace(/\s/g, '');
		if (!s) return null;
		let h: number;
		let m: number;
		const colon = /^(\d{1,2}):(\d{2})$/.exec(s);
		const compact = /^(\d{3,4})$/.exec(s);
		const hourOnly = /^(\d{1,2})$/.exec(s);
		if (colon) {
			h = Number(colon[1]);
			m = Number(colon[2]);
		} else if (compact) {
			const digits = compact[1].padStart(4, '0');
			h = Number(digits.slice(0, 2));
			m = Number(digits.slice(2));
		} else if (hourOnly) {
			h = Number(hourOnly[1]);
			m = 0;
		} else return null;
		if (h > 23 || m > 59) return null;
		return h * 60 + m;
	}

	function commit() {
		focused = false;
		const parsed = parse(text);
		if (parsed === null) {
			invalid = true;
			text = formatTime(value);
			invalid = false;
			return;
		}
		invalid = false;
		onchange(parsed);
		text = formatTime(parsed);
	}

	function step(delta: number) {
		const next = (((value + delta) % 1440) + 1440) % 1440;
		onchange(next);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			step(15);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			step(-15);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			commit();
		}
	}
</script>

<div class="time-field" class:small>
	<input
		{id}
		class="input tnum"
		class:small
		type="text"
		inputmode="numeric"
		autocomplete="off"
		bind:value={text}
		aria-label={ariaLabel}
		aria-invalid={invalid ? 'true' : undefined}
		{disabled}
		onfocus={() => (focused = true)}
		onblur={commit}
		onkeydown={onKeydown}
	/>
	<div class="steppers">
		<button
			type="button"
			class="step"
			{disabled}
			aria-label="Later by 15 minutes"
			onclick={() => step(15)}
		>
			<Icon name="chevron-up" size={14} />
		</button>
		<button
			type="button"
			class="step"
			{disabled}
			aria-label="Earlier by 15 minutes"
			onclick={() => step(-15)}
		>
			<Icon name="chevron-down" size={14} />
		</button>
	</div>
</div>

<style>
	.time-field {
		position: relative;
		display: inline-flex;
		width: 110px;
	}
	.input {
		padding-right: 28px;
		font-variant-numeric: tabular-nums;
	}
	.input.small {
		height: var(--control-h-sm);
		font-size: var(--text-13);
	}
	.steppers {
		position: absolute;
		right: 1px;
		top: 1px;
		bottom: 1px;
		display: flex;
		flex-direction: column;
		width: 24px;
	}
	.step {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
		padding: 0;
		border-radius: 3px;
	}
	.step:hover:not(:disabled) {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}
	.step:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
