<script lang="ts">
	// Issues panel: all errors and warnings grouped by severity, click to jump to the
	// shift, plus fix suggestions naming concrete replacements.
	import Icon from './Icon.svelte';
	import { app } from '../state.svelte';
	import { rankReplacements } from '../logic/generator';
	import type { Issue } from '../types';
	import { formatDate } from '../logic/time';

	interface Props {
		open: boolean;
		onclose: () => void;
		onjump: (issue: Issue) => void;
	}
	let { open, onclose, onjump }: Props = $props();

	/** Concrete replacement names for an issue that points at a shift. */
	function suggestions(issue: Issue): string[] {
		if (!issue.shiftId) return [];
		const shift = app.roster.shifts.find((s) => s.id === issue.shiftId);
		if (!shift) return [];
		return rankReplacements($state.snapshot(shift), {
			weekStart: app.currentWeek,
			staff: $state.snapshot(app.data.staff),
			templates: $state.snapshot(app.data.templates),
			coverage: $state.snapshot(app.data.coverage),
			leave: $state.snapshot(app.data.leave),
			rules: $state.snapshot(app.data.rules),
			business: $state.snapshot(app.data.business),
			previousWeek: $state.snapshot(app.previousWeekShifts),
			existing: $state.snapshot(app.roster.shifts)
		})
			.filter((c) => !c.blocked)
			.slice(0, 3)
			.map((c) => c.name);
	}
</script>

{#if open}
	<aside class="issues-panel" aria-label="Issues">
		<header>
			<h2>Issues</h2>
			<div class="counts">
				{#if app.errors.length}
					<span class="pill pill-danger tnum">{app.errors.length} errors</span>
				{/if}
				{#if app.warnings.length}
					<span class="pill pill-warn tnum">{app.warnings.length} warnings</span>
				{/if}
			</div>
			<button type="button" class="btn btn-quiet btn-icon btn-sm" aria-label="Close issues panel" onclick={onclose}>
				<Icon name="close" size={16} />
			</button>
		</header>

		<div class="body">
			{#if app.issues.length === 0}
				<div class="clean">
					<Icon name="success" size={24} />
					<p class="clean-title">No issues this week</p>
					<p class="clean-text">
						Every shift follows your rules and all coverage needs are met.
					</p>
				</div>
			{:else}
				{#each [{ severity: 'Error' as const, list: app.errors }, { severity: 'Warning' as const, list: app.warnings }] as group (group.severity)}
					{#if group.list.length > 0}
						<section>
							<h3 class:error={group.severity === 'Error'}>
								<Icon name={group.severity === 'Error' ? 'error' : 'warning'} size={16} />
								{group.severity === 'Error' ? 'Errors' : 'Warnings'}
								<span class="tnum">({group.list.length})</span>
							</h3>
							<ul>
								{#each group.list as issue, index (issue.type + issue.message + index)}
									{@const fixes = group.severity === 'Error' ? suggestions(issue) : []}
									<li>
										<button
											type="button"
											class="issue"
											class:clickable={!!issue.shiftId || !!issue.date}
											onclick={() => onjump(issue)}
										>
											<span class="issue-msg">{issue.message}</span>
											<span class="issue-fix">{issue.suggestedFix}</span>
											{#if fixes.length > 0}
												<span class="replacements">
													Replace with: {fixes.join(', ')}
												</span>
											{/if}
											{#if issue.date}
												<span class="issue-date tnum">{formatDate(issue.date)}</span>
											{/if}
										</button>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				{/each}

				<p class="legal">
					Rules differ by country and employer. ShiftSync checks the rules you set here and is
					not legal advice.
				</p>
			{/if}
		</div>
	</aside>
{/if}

<style>
	.issues-panel {
		display: flex;
		flex-direction: column;
		width: 340px;
		flex-shrink: 0;
		height: 100%;
		background: var(--surface);
		border-left: 1px solid var(--border);
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	header h2 {
		font-size: var(--text-16);
		flex-shrink: 0;
	}
	.counts {
		display: flex;
		gap: var(--space-1);
		flex: 1;
		flex-wrap: wrap;
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	h3 {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-12);
		font-weight: 600;
		color: var(--saffron);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	h3.error {
		color: var(--danger);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.issue {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--surface-subtle);
		text-align: left;
		font-family: inherit;
		cursor: default;
		transition: border-color var(--motion-fast) var(--ease-out);
	}
	.issue.clickable {
		cursor: pointer;
	}
	.issue.clickable:hover {
		border-color: var(--brand);
		background: var(--brand-tint);
	}
	.issue-msg {
		font-size: var(--text-13);
		font-weight: 500;
		color: var(--text-primary);
		line-height: var(--lh-normal);
	}
	.issue-fix {
		font-size: var(--text-12);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
	}
	.replacements {
		font-size: var(--text-12);
		color: var(--brand);
		font-weight: 500;
		margin-top: 2px;
	}
	.issue-date {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}

	.clean {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-8) var(--space-4);
		text-align: center;
	}
	.clean :global(svg) {
		color: var(--success);
	}
	.clean-title {
		font-size: var(--text-14);
		font-weight: 500;
	}
	.clean-text {
		font-size: var(--text-13);
		color: var(--text-secondary);
	}
	.legal {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		line-height: var(--lh-normal);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border);
	}

	@media (max-width: 900px) {
		.issues-panel {
			position: fixed;
			inset: auto 0 0 0;
			width: auto;
			max-height: 70vh;
			border-left: none;
			border-top: 1px solid var(--border);
			border-radius: var(--radius-card) var(--radius-card) 0 0;
			box-shadow: var(--shadow-popover);
			z-index: 60;
		}
	}
</style>
