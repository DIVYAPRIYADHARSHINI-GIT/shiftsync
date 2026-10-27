<script lang="ts">
	// Shift chip: solid left colour bar, time range in tabular numbers, template name,
	// a lock icon when locked and an issue badge with a count. Consistent height and
	// truncation, with a tooltip for long names.
	import Icon from './Icon.svelte';
	import type { Issue, Shift, ShiftTemplate } from '../types';
	import { formatTime } from '../logic/time';
	import { tintOf } from './controls.svelte';

	interface Props {
		shift: Shift;
		template: ShiftTemplate;
		issues: Issue[];
		selected?: boolean;
		dark?: boolean;
		/** Show the role instead of the template name (used in the shift view). */
		showRole?: boolean;
		/** Person's name, shown in the shift view where rows are shifts. */
		personName?: string;
		onselect?: () => void;
		ondragstart?: (event: DragEvent) => void;
		ondragend?: () => void;
		draggable?: boolean;
	}

	let {
		shift,
		template,
		issues,
		selected = false,
		dark = false,
		showRole = false,
		personName,
		onselect,
		ondragstart,
		ondragend,
		draggable = true
	}: Props = $props();

	const errorCount = $derived(issues.filter((i) => i.severity === 'Error').length);
	const warningCount = $derived(issues.filter((i) => i.severity === 'Warning').length);
	const label = $derived(showRole ? shift.role : template.name);
	const timeRange = $derived(`${formatTime(template.startMin)}-${formatTime(template.endMin)}`);
	const overnight = $derived(template.endMin <= template.startMin);
	const tooltip = $derived(
		[
			personName ?? label,
			`${template.name} ${timeRange}${overnight ? ' (ends next day)' : ''}`,
			shift.role,
			shift.locked ? 'Locked' : null,
			...issues.map((i) => `${i.severity}: ${i.message}`)
		]
			.filter(Boolean)
			.join('\n')
	);
</script>

<!--
	The accessible name starts with the SAME visible text the chip shows (the time range,
	then the person or template name), so voice control users can say what they see.
-->
<div
	class="chip"
	class:selected
	class:has-error={errorCount > 0}
	class:has-warning={errorCount === 0 && warningCount > 0}
	style="--chip-bar: {template.colour}; --chip-bg: {tintOf(template.colour, dark)}"
	role="button"
	tabindex="0"
	draggable={draggable ? 'true' : 'false'}
	aria-label="{timeRange} {overnight ? '+1 ' : ''}{personName ?? label}{errorCount
		? ` ${errorCount} error${errorCount === 1 ? '' : 's'}`
		: warningCount
			? ` ${warningCount} warning${warningCount === 1 ? '' : 's'}`
			: ''}, {shift.role}{overnight ? ', ends the next day' : ''}{shift.locked ? ', locked' : ''}"
	aria-pressed={selected}
	title={tooltip}
	onclick={(e) => {
		e.stopPropagation();
		onselect?.();
	}}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			onselect?.();
		}
	}}
	ondragstart={(e) => {
		if (!draggable) return;
		e.dataTransfer?.setData('text/plain', shift.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		ondragstart?.(e);
	}}
	ondragend={() => ondragend?.()}
>
	<span class="bar" aria-hidden="true"></span>
	<span class="body">
		<span class="line-1">
			<span class="time tnum">{timeRange}</span>
			{#if overnight}<span class="next-day" aria-hidden="true">+1</span>{/if}
		</span>
		<span class="line-2">{personName ?? label}</span>
	</span>
	<span class="marks">
		{#if shift.locked}
			<Icon name="lock" size={13} label="Locked" />
		{/if}
		<!--
			The badge count is decorative here: the same counts are already spelled out in the
			chip's accessible name, and leaving the bare digit visible-but-unnamed fails
			WCAG 2.5.3 Label in Name.
		-->
		{#if errorCount > 0}
			<span class="issue error" aria-hidden="true">
				<Icon name="error" size={13} />
				<span class="tnum">{errorCount}</span>
			</span>
		{:else if warningCount > 0}
			<span class="issue warning" aria-hidden="true">
				<Icon name="warning" size={13} />
				<span class="tnum">{warningCount}</span>
			</span>
		{/if}
	</span>
</div>

<style>
	.chip {
		position: relative;
		display: flex;
		align-items: stretch;
		gap: var(--space-1);
		height: 42px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--chip-bg);
		color: var(--text-primary);
		cursor: grab;
		overflow: hidden;
		text-align: left;
		transition:
			transform var(--motion-fast) var(--ease-out),
			box-shadow var(--motion-fast) var(--ease-out),
			border-color var(--motion-fast) var(--ease-out);
	}
	:global(.compact) .chip {
		height: 34px;
	}
	.chip:hover {
		transform: translateY(-1px);
		box-shadow: 0 2px 6px rgba(15, 26, 42, 0.1);
		border-color: var(--border-strong);
	}
	.chip:active {
		cursor: grabbing;
	}
	.chip.selected {
		outline: 2px solid var(--brand);
		outline-offset: -1px;
		border-color: var(--brand);
	}
	.chip.has-error {
		border-color: color-mix(in srgb, var(--danger) 55%, transparent);
	}
	.chip.has-warning {
		border-color: color-mix(in srgb, var(--saffron) 55%, transparent);
	}

	.bar {
		width: 3px;
		flex-shrink: 0;
		background: var(--chip-bar);
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1px;
		padding: 0 var(--space-1) 0 var(--space-2);
	}
	.line-1 {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.time {
		font-size: var(--text-12);
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
	}
	.next-day {
		font-size: 10px;
		font-weight: 600;
		color: var(--text-tertiary);
		padding: 0 3px;
		border-radius: 3px;
		background: var(--surface-subtle);
	}
	.line-2 {
		font-size: var(--text-12);
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.compact) .line-2 {
		font-size: 11px;
	}
	.marks {
		display: flex;
		align-items: center;
		gap: 2px;
		padding-right: var(--space-1);
		color: var(--text-tertiary);
		flex-shrink: 0;
	}
	.issue {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		font-size: 10px;
		font-weight: 600;
		padding: 1px 3px;
		border-radius: 3px;
	}
	.issue.error {
		background: var(--danger-tint);
		color: var(--danger-ink);
	}
	.issue.warning {
		background: var(--saffron-tint);
		color: var(--saffron-ink);
	}
</style>
