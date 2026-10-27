<script lang="ts">
	// Generate roster panel: options, progress with Cancel, and the results panel with
	// fill rate, unfilled slots with a plain reason each, warnings and fairness numbers.
	import Icon from './Icon.svelte';
	import Dialog from './Dialog.svelte';
	import Toggle from './Toggle.svelte';
	import Select from './Select.svelte';
	import { app } from '../state.svelte';
	import type { GenerateResult } from '../logic/generator';
	import { fairnessScore } from '../logic/generator';
	import type { WorkerRequest, WorkerResponse } from '../workers/generator.worker';
	import { addDays, formatDate, weekDates } from '../logic/time';
	import { shiftLabel } from '../logic/validate';

	interface Props {
		open: boolean;
		onclose: () => void;
	}
	let { open, onclose }: Props = $props();

	let keepLocked = $state(true);
	let onlyEmpty = $state(false);
	let seed = $state(1);
	let weeks = $state(1);
	let running = $state(false);
	let progress = $state(0);
	let result = $state<GenerateResult | null>(null);
	/** Second result kept so the manager can compare two seeds side by side. */
	let comparison = $state<GenerateResult | null>(null);
	let errorMessage = $state<string | null>(null);
	let worker: Worker | null = null;

	const fairness = $derived(result ? fairnessScore(result.fairness) : 0);
	const comparisonFairness = $derived(comparison ? fairnessScore(comparison.fairness) : 0);

	function stopWorker() {
		worker?.terminate();
		worker = null;
		running = false;
		progress = 0;
	}

	function run(nextSeed = seed, keepAsComparison = false) {
		if (app.data.coverage.length === 0) {
			errorMessage =
				'There are no coverage needs yet. Set how many people each shift needs in Shifts and coverage, then generate.';
			return;
		}
		errorMessage = null;
		running = true;
		progress = 0;
		if (keepAsComparison && result) comparison = result;

		worker = new Worker(new URL('../workers/generator.worker.ts', import.meta.url), {
			type: 'module'
		});

		worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const data = event.data;
			if (data.type === 'progress') progress = data.fraction;
			else if (data.type === 'done') {
				result = data.result;
				stopWorker();
				if (data.result.cancelled) app.toast('Generation cancelled.', 'info');
			} else if (data.type === 'error') {
				errorMessage = data.message;
				stopWorker();
			}
		};
		worker.onerror = () => {
			errorMessage = 'The generator could not start in this browser.';
			stopWorker();
		};

		const request: WorkerRequest = {
			type: 'generate',
			options: {
				weekStart: app.currentWeek,
				staff: $state.snapshot(app.data.staff),
				templates: $state.snapshot(app.data.templates),
				coverage: $state.snapshot(app.data.coverage),
				leave: $state.snapshot(app.data.leave),
				rules: $state.snapshot(app.data.rules),
				business: $state.snapshot(app.data.business),
				previousWeek: $state.snapshot(app.previousWeekShifts),
				existing: $state.snapshot(app.roster.shifts),
				seed: nextSeed,
				keepLocked,
				onlyEmpty,
				// About 3 seconds, as the brief asks, as a safety stop only.
				timeBudgetMs: 3000
			}
		};
		worker.postMessage(request);
	}

	function cancel() {
		worker?.postMessage({ type: 'cancel' });
		// Give the worker a moment to return its partial result, then stop regardless.
		setTimeout(() => {
			if (running) stopWorker();
		}, 400);
	}

	function apply() {
		if (!result) return;
		const shifts = $state.snapshot(result.shifts);
		app.setShifts('Generate roster', shifts);
		app.commit(
			'Record seed',
			(d) => {
				d.rosters[app.currentWeek].lastSeed = result?.seed;
			},
			false
		);
		app.toast(
			`Roster generated: ${Math.round((result.fillRate ?? 0) * 100)} percent of required slots filled.`,
			'success'
		);
		// Generate the following weeks too when asked, each seeded from the one before.
		if (weeks > 1) applyFurtherWeeks();
		result = null;
		comparison = null;
		onclose();
	}

	/**
	 * Multi-week generation runs the remaining weeks on the main thread with a small
	 * iteration budget. Each week uses the previous week as history, so rest gaps and
	 * consecutive-day runs stay correct across the boundaries.
	 */
	async function applyFurtherWeeks() {
		const { generateRoster } = await import('../logic/generator');
		for (let i = 1; i < weeks; i++) {
			const weekStart = addDays(app.currentWeek, 7 * i);
			const previous = app.data.rosters[addDays(weekStart, -7)]?.shifts ?? [];
			const existing = app.data.rosters[weekStart]?.shifts ?? [];
			const weekResult = generateRoster({
				weekStart,
				staff: $state.snapshot(app.data.staff),
				templates: $state.snapshot(app.data.templates),
				coverage: $state.snapshot(app.data.coverage),
				leave: $state.snapshot(app.data.leave),
				rules: $state.snapshot(app.data.rules),
				business: $state.snapshot(app.data.business),
				previousWeek: $state.snapshot(previous),
				existing: $state.snapshot(existing),
				seed: seed + i,
				keepLocked,
				onlyEmpty,
				maxIterations: 300,
				timeBudgetMs: 1500
			});
			app.commit(`Generate week ${i + 1}`, (d) => {
				const roster = app.ensureRoster(d, weekStart);
				roster.shifts = weekResult.shifts;
				roster.lastSeed = weekResult.seed;
			});
		}
		app.toast(`Generated ${weeks} weeks from ${formatDate(app.currentWeek)}.`, 'success');
	}

	function discard() {
		result = null;
		comparison = null;
		errorMessage = null;
		onclose();
	}
</script>

<Dialog
	{open}
	wide
	title="Generate roster"
	description="Fills the coverage needs for the week of {formatDate(app.currentWeek)} using your rules. The generator never breaks a hard rule."
	onclose={discard}
>
	{#if errorMessage}
		<div class="notice danger" role="alert">
			<Icon name="warning" size={18} />
			<p>{errorMessage}</p>
		</div>
	{/if}

	{#if running}
		<div class="running">
			<p class="running-title">Building the roster</p>
			<div
				class="progress"
				role="progressbar"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(progress * 100)}
				aria-label="Generation progress"
			>
				<span class="progress-fill" style="width: {Math.max(3, progress * 100)}%"></span>
			</div>
			<p class="running-detail tnum">{Math.round(progress * 100)}% complete</p>
			<button type="button" class="btn" onclick={cancel}>
				<Icon name="cancel" size={16} /> Cancel
			</button>
		</div>
	{:else if result}
		<div class="results">
			<div class="score-row">
				<div class="score">
					<span class="score-value tnum">{Math.round(result.fillRate * 100)}%</span>
					<span class="score-label">of required slots filled</span>
					<span class="score-detail tnum">{result.filledSlots} of {result.requiredSlots}</span>
				</div>
				<div class="score">
					<span class="score-value tnum">{fairness}</span>
					<span class="score-label">fairness indicator</span>
					<span class="score-detail">100 means hours and unsocial shifts are even</span>
				</div>
				<div class="score">
					<span class="score-value tnum">{result.issues.filter((i) => i.severity === 'Warning').length}</span>
					<span class="score-label">warnings</span>
					<span class="score-detail tnum">seed {result.seed} &middot; {result.iterations} passes</span>
				</div>
			</div>

			{#if result.impossible}
				<div class="notice danger" role="alert">
					<Icon name="error" size={18} />
					<div>
						<p class="notice-title">This roster cannot be built</p>
						<p>{result.impossibleReason}</p>
					</div>
				</div>
			{/if}

			{#if result.hitTimeLimit}
				<div class="notice" role="status">
					<Icon name="clock" size={18} />
					<p>
						The time limit was reached before the improvement pass finished. The roster follows
						every hard rule, but a longer run might balance it better.
					</p>
				</div>
			{/if}

			{#if result.unfilled.length > 0}
				<section>
					<h3>Unfilled slots ({result.unfilled.length})</h3>
					<!--
						Keyed by index as well as identity: several slots for the SAME date, template
						and role can be unfilled at once, so those three fields are not unique.
					-->
					<ul class="reasons">
						{#each result.unfilled as slot, index (`${slot.date}|${slot.templateId}|${slot.role}|${index}`)}
							<li>
								<Icon name="warning" size={16} />
								<span>{slot.reason}</span>
							</li>
						{/each}
					</ul>
				</section>
			{:else if !result.impossible}
				<div class="notice success" role="status">
					<Icon name="success" size={18} />
					<p>Every required slot is filled.</p>
				</div>
			{/if}

			<section>
				<h3>Hours per person</h3>
				<div class="table-wrap">
					<table class="data">
						<thead>
							<tr>
								<th scope="col">Person</th>
								<th scope="col" class="num">Hours</th>
								<th scope="col" class="num">Contracted</th>
								<th scope="col" class="num">Weekend</th>
								<th scope="col" class="num">Night</th>
								<th scope="col" class="num">Days off</th>
							</tr>
						</thead>
						<tbody>
							{#each result.fairness.filter((r) => r.hours > 0) as row (row.staffId)}
								<tr>
									<td>{row.name}</td>
									<td class="num tnum">{row.hours}</td>
									<td class="num tnum">{row.minHours}&ndash;{row.maxHours}</td>
									<td class="num tnum">{row.weekendShifts}</td>
									<td class="num tnum">{row.nightShifts}</td>
									<td class="num tnum">{row.daysOff}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			{#if comparison}
				<section>
					<h3>Compared with the previous result</h3>
					<div class="compare">
						<div>
							<span class="compare-label">Previous (seed {comparison.seed})</span>
							<span class="tnum">{Math.round(comparison.fillRate * 100)}% filled &middot; fairness {comparisonFairness}</span>
						</div>
						<div>
							<span class="compare-label">This result (seed {result.seed})</span>
							<span class="tnum">{Math.round(result.fillRate * 100)}% filled &middot; fairness {fairness}</span>
						</div>
					</div>
				</section>
			{/if}
		</div>
	{:else}
		<div class="options">
			<div class="field">
				<span class="label">Weeks to generate</span>
				<Select
					value={String(weeks)}
					options={[
						{ value: '1', label: 'This week only' },
						{ value: '2', label: '2 weeks' },
						{ value: '3', label: '3 weeks' },
						{ value: '4', label: '4 weeks' }
					]}
					ariaLabel="Weeks to generate"
					onchange={(v) => (weeks = Number(v))}
				/>
				<span class="help">
					Later weeks use the week before as history, so rest gaps and consecutive days stay correct.
				</span>
			</div>

			<div class="switches">
				<Toggle
					checked={keepLocked}
					label="Keep locked shifts, people and days"
					onchange={(v) => (keepLocked = v)}
				/>
				<Toggle
					checked={onlyEmpty}
					label="Only fill empty slots"
					onchange={(v) => (onlyEmpty = v)}
				/>
			</div>

			<div class="field">
				<label class="label" for="gen-seed">Seed</label>
				<input
					id="gen-seed"
					class="input tnum"
					type="number"
					min="1"
					max="99999"
					bind:value={seed}
				/>
				<span class="help">
					The same seed always produces the same roster. Change it to try a different arrangement.
				</span>
			</div>

			<div class="summary">
				<p class="summary-title">This week</p>
				<ul>
					<li><span class="tnum">{app.activeStaff.length}</span> active staff</li>
					<li><span class="tnum">{app.data.templates.length}</span> shift templates</li>
					<li><span class="tnum">{app.data.coverage.length}</span> coverage needs</li>
					<li>
						<span class="tnum">{app.roster.shifts.filter((s) => s.locked).length}</span> locked shifts
					</li>
				</ul>
			</div>

			<p class="disclaimer">
				The generator is a heuristic. It builds a good roster that follows your rules, but it does
				not guarantee the best possible one.
			</p>
		</div>
	{/if}

	{#snippet footer()}
		{#if result && !running}
			<button type="button" class="btn" onclick={discard}>Discard</button>
			<button type="button" class="btn" onclick={() => run(seed + 1, true)}>
				<Icon name="generate" size={16} /> Try another seed
			</button>
			<button type="button" class="btn btn-primary" onclick={apply} disabled={result.impossible}>
				<Icon name="check" size={16} /> Apply this roster
			</button>
		{:else if !running}
			<button type="button" class="btn" onclick={discard}>Cancel</button>
			<button type="button" class="btn btn-primary" onclick={() => run(seed)}>
				<Icon name="generate" size={16} /> Generate roster
			</button>
		{/if}
	{/snippet}
</Dialog>

<style>
	.options,
	.results {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.switches {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.summary {
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		background: var(--surface-subtle);
	}
	.summary-title {
		font-size: var(--text-13);
		font-weight: 600;
		margin-bottom: var(--space-2);
	}
	.summary ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: var(--text-13);
		color: var(--text-secondary);
	}
	.summary li span {
		font-weight: 600;
		color: var(--text-primary);
	}
	.disclaimer {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		line-height: var(--lh-normal);
	}

	.running {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-8) 0;
	}
	.running-title {
		font-size: var(--text-16);
		font-weight: 500;
	}
	.progress {
		width: 100%;
		max-width: 320px;
		height: 6px;
		border-radius: 3px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		overflow: hidden;
	}
	.progress-fill {
		display: block;
		height: 100%;
		background: var(--brand);
		transition: width var(--motion-base) var(--ease-out);
	}
	.running-detail {
		font-size: var(--text-13);
		color: var(--text-secondary);
	}

	.score-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--space-3);
	}
	.score {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		background: var(--surface-subtle);
	}
	.score-value {
		font-size: var(--text-24);
		font-weight: 600;
		line-height: 1.1;
	}
	.score-label {
		font-size: var(--text-13);
		color: var(--text-secondary);
	}
	.score-detail {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}

	h3 {
		margin-bottom: var(--space-2);
	}
	.reasons {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: 200px;
		overflow-y: auto;
	}
	.reasons li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-2);
		border-radius: var(--radius-control);
		background: var(--saffron-tint);
		font-size: var(--text-13);
		line-height: var(--lh-normal);
	}
	.reasons :global(svg) {
		color: var(--saffron-ink);
		flex-shrink: 0;
		margin-top: 1px;
	}

	.notice {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		background: var(--info-tint);
		font-size: var(--text-13);
		line-height: var(--lh-normal);
	}
	.notice :global(svg) {
		color: var(--info);
		flex-shrink: 0;
	}
	.notice.danger {
		background: var(--danger-tint);
		border-color: color-mix(in srgb, var(--danger) 30%, transparent);
	}
	.notice.danger :global(svg) {
		color: var(--danger);
	}
	.notice.success {
		background: var(--success-tint);
		border-color: color-mix(in srgb, var(--success) 30%, transparent);
	}
	.notice.success :global(svg) {
		color: var(--success);
	}
	.notice-title {
		font-weight: 600;
		margin-bottom: 2px;
	}

	.compare {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}
	.compare > div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		font-size: var(--text-13);
	}
	.compare-label {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}
</style>
