<script lang="ts">
	// Swaps: recorded by the manager (there are no staff accounts). Before approving,
	// both resulting rosters are validated and any rule breaks are shown. Approving
	// applies the change. A history list is kept.
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Select from '#lib/components/Select.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import { app } from '#lib/state.svelte';
	import type { Shift, SwapRequest, SwapStatus } from '#lib/types';
	import { addDays, dateToUtc, formatDate, formatTime, startOfWeek } from '#lib/logic/time';
	import { evaluateSwap } from '#lib/logic/swaps';
	import { shiftLabel } from '#lib/logic/validate';
	import { contrastOn, initials } from '#lib/components/controls.svelte';

	let creating = $state(false);
	let draft = $state<SwapRequest | null>(null);
	let reviewing = $state<SwapRequest | null>(null);
	let confirmDelete = $state<SwapRequest | null>(null);
	let filterStatus = $state<'all' | SwapStatus>('all');
	let formError = $state('');

	const filtered = $derived(
		[...app.data.swaps]
			.filter((s) => filterStatus === 'all' || s.status === filterStatus)
			.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
	);

	/** Every assigned shift in the current and next four weeks, for the chooser. */
	const swappableShifts = $derived.by(() => {
		const out: { shift: Shift; weekStart: string }[] = [];
		for (let i = -1; i < 4; i++) {
			const weekStart = addDays(app.currentWeek, i * 7);
			const roster = app.data.rosters[weekStart];
			if (!roster) continue;
			for (const shift of roster.shifts) {
				if (shift.staffId) out.push({ shift, weekStart });
			}
		}
		return out.sort((a, b) => dateToUtc(a.shift.date) - dateToUtc(b.shift.date));
	});

	/** Find which roster week holds a shift. */
	function weekOf(shiftId: string): string | null {
		for (const [weekStart, roster] of Object.entries(app.data.rosters)) {
			if (roster.shifts.some((s) => s.id === shiftId)) return weekStart;
		}
		return null;
	}

	function shiftById(shiftId: string): Shift | undefined {
		return Object.values(app.data.rosters)
			.flatMap((r) => r.shifts)
			.find((s) => s.id === shiftId);
	}

	/** Validate a swap against the roster week it belongs to. */
	function evaluate(swap: SwapRequest) {
		const weekStart = weekOf(swap.shiftId);
		if (!weekStart) return null;
		const roster = app.data.rosters[weekStart];
		return evaluateSwap(
			{
				shifts: $state.snapshot(roster.shifts),
				staff: $state.snapshot(app.data.staff),
				templates: $state.snapshot(app.data.templates),
				coverage: $state.snapshot(app.data.coverage),
				leave: $state.snapshot(app.data.leave),
				rules: $state.snapshot(app.data.rules),
				business: $state.snapshot(app.data.business),
				previousWeek: $state.snapshot(app.data.rosters[addDays(weekStart, -7)]?.shifts ?? []),
				weekStart
			},
			$state.snapshot(swap) as SwapRequest
		);
	}

	const reviewResult = $derived(reviewing ? evaluate(reviewing) : null);
	const draftResult = $derived(draft && draft.shiftId ? evaluate(draft) : null);

	function startNew() {
		const first = swappableShifts[0];
		formError = '';
		draft = {
			id: `swap-${Date.now().toString(36)}`,
			createdAt: new Date().toISOString(),
			shiftId: first?.shift.id ?? '',
			fromStaffId: first?.shift.staffId ?? null,
			toStaffId: null,
			reason: '',
			status: 'Pending'
		};
		creating = true;
	}

	function saveDraft() {
		if (!draft) return;
		if (!draft.shiftId) {
			formError = 'Choose the shift being swapped.';
			return;
		}
		if (!draft.reason.trim()) {
			formError = 'Record why the swap was requested, so the history makes sense later.';
			return;
		}
		const record = { ...draft, reason: draft.reason.trim() };
		app.commit('Record swap request', (d) => {
			d.swaps.push(record);
		});
		app.toast('Swap request recorded as pending.', 'success');
		creating = false;
		draft = null;
	}

	function approve(swap: SwapRequest) {
		const weekStart = weekOf(swap.shiftId);
		if (!weekStart) {
			app.toast('That shift no longer exists, so the swap cannot be applied.', 'danger');
			return;
		}
		const result = evaluate(swap);
		if (!result) return;
		app.commit('Approve swap', (d) => {
			const roster = app.ensureRoster(d, weekStart);
			roster.shifts = result.resultingShifts;
			const found = d.swaps.find((s) => s.id === swap.id);
			if (found) {
				found.status = 'Approved';
				found.decidedAt = new Date().toISOString();
			}
		});
		reviewing = null;
		app.toast(
			result.addedWarnings.length > 0
				? `Swap approved with ${result.addedWarnings.length} warning${result.addedWarnings.length === 1 ? '' : 's'}.`
				: 'Swap approved and applied.',
			result.addedWarnings.length > 0 ? 'warning' : 'success'
		);
	}

	function decline(swap: SwapRequest) {
		app.commit('Decline swap', (d) => {
			const found = d.swaps.find((s) => s.id === swap.id);
			if (found) {
				found.status = 'Declined';
				found.decidedAt = new Date().toISOString();
			}
		});
		reviewing = null;
		app.toast('Swap declined. The roster is unchanged.', 'info');
	}

	function remove() {
		if (!confirmDelete) return;
		const swap = confirmDelete;
		app.commit('Delete swap request', (d) => {
			d.swaps = d.swaps.filter((s) => s.id !== swap.id);
		});
		confirmDelete = null;
		app.toast('Swap request removed from the history.', 'info');
	}

	function describeShift(shiftId: string): string {
		const shift = shiftById(shiftId);
		if (!shift) return 'Shift no longer exists';
		const template = app.templateById(shift.templateId);
		return template
			? `${template.name} ${formatTime(template.startMin)}-${formatTime(template.endMin)}, ${shift.role}, ${formatDate(shift.date)}`
			: `${shift.role}, ${formatDate(shift.date)}`;
	}
</script>

<PageHeader
	title="Swaps"
	description="Record a swap a member of staff asked for, check the rules it would break, then approve or decline it."
>
	{#snippet actions()}
		<Segmented
			value={filterStatus}
			small
			ariaLabel="Filter by status"
			segments={[
				{ value: 'all', label: 'All' },
				{ value: 'Pending', label: 'Pending' },
				{ value: 'Approved', label: 'Approved' },
				{ value: 'Declined', label: 'Declined' }
			]}
			onchange={(v) => (filterStatus = v as typeof filterStatus)}
		/>
		<button type="button" class="btn btn-primary" onclick={startNew} disabled={swappableShifts.length === 0}>
			<Icon name="plus" size={16} /> Record a swap
		</button>
	{/snippet}
</PageHeader>

<div class="note card card-pad">
	<Icon name="info" size={18} />
	<p>
		There are no staff accounts in this version, so swaps are recorded by you on their behalf.
		Nothing is sent to anyone: ShiftSync has no server and no email.
	</p>
</div>

{#if app.data.swaps.length === 0}
	<div class="card">
		<div class="empty-state">
			<Icon name="swaps" size={28} />
			<div>
				<p class="empty-title">No swap requests</p>
				<p>
					When someone asks to swap a shift, record it here. ShiftSync validates the result before
					you approve it.
				</p>
			</div>
			<button type="button" class="btn btn-primary" onclick={startNew} disabled={swappableShifts.length === 0}>
				Record a swap
			</button>
		</div>
	</div>
{:else if filtered.length === 0}
	<div class="card">
		<div class="empty-state">
			<Icon name="filter" size={24} />
			<p>No {filterStatus.toLowerCase()} swaps. Change the filter to see other entries.</p>
		</div>
	</div>
{:else}
	<div class="table-wrap">
		<table class="data">
			<thead>
				<tr>
					<th scope="col">Shift</th>
					<th scope="col">From</th>
					<th scope="col">To</th>
					<th scope="col">Reason</th>
					<th scope="col">Status</th>
					<th scope="col"><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as swap (swap.id)}
					{@const from = app.staffById(swap.fromStaffId)}
					{@const to = app.staffById(swap.toStaffId)}
					<tr>
						<th scope="row" class="shift-cell tnum">{describeShift(swap.shiftId)}</th>
						<td>
							<span class="person">
								<span class="avatar" style="background: {from?.colour ?? 'var(--border-strong)'}; color: {contrastOn(from?.colour ?? '#CDD2DA')}" aria-hidden="true">
									{initials(from?.name ?? '?')}
								</span>
								{from?.name ?? 'Open slot'}
							</span>
						</td>
						<td>
							{#if to}
								<span class="person">
									<span class="avatar" style="background: {to.colour}; color: {contrastOn(to.colour)}" aria-hidden="true">
										{initials(to.name)}
									</span>
									{to.name}
								</span>
							{:else}
								<span class="muted">Open slot</span>
							{/if}
						</td>
						<td class="reason" title={swap.reason}>{swap.reason}</td>
						<td>
							<span
								class="pill"
								class:pill-success={swap.status === 'Approved'}
								class:pill-warn={swap.status === 'Pending'}
							>
								<Icon
									name={swap.status === 'Approved' ? 'success' : swap.status === 'Pending' ? 'warning' : 'close'}
									size={13}
								/>
								{swap.status}
							</span>
						</td>
						<td class="actions">
							{#if swap.status === 'Pending'}
								<button type="button" class="btn btn-sm" onclick={() => (reviewing = swap)}>
									<Icon name="shield" size={14} /> Review
								</button>
							{/if}
							<button type="button" class="btn btn-sm btn-quiet" aria-label="Delete swap request" onclick={() => (confirmDelete = swap)}>
								<Icon name="trash" size={14} />
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Record a swap -->
<Dialog
	open={creating}
	title="Record a swap request"
	description="Choose the shift and who should take it. ShiftSync validates the result before you approve."
	onclose={() => {
		creating = false;
		draft = null;
	}}
>
	{#if draft}
		<div class="form">
			<div class="field">
				<span class="label">Shift</span>
				<Select
					value={draft.shiftId}
					ariaLabel="Shift being swapped"
					options={swappableShifts.map(({ shift }) => ({
						value: shift.id,
						label: describeShift(shift.id),
						description: app.staffById(shift.staffId)?.name
					}))}
					onchange={(v) => {
						const found = shiftById(v);
						draft = { ...draft!, shiftId: v, fromStaffId: found?.staffId ?? null };
					}}
				/>
			</div>

			<div class="field">
				<span class="label">Give the shift to</span>
				<Select
					value={draft.toStaffId ?? ''}
					ariaLabel="Person taking the shift"
					options={[
						{ value: '', label: 'Open slot (nobody)' },
						...app.activeStaff
							.filter((s) => s.id !== draft!.fromStaffId)
							.map((s) => ({ value: s.id, label: s.name, description: s.roles.join(', ') }))
					]}
					onchange={(v) => (draft = { ...draft!, toStaffId: v || null })}
				/>
			</div>

			<div class="field">
				<label class="label" for="swap-reason">Reason</label>
				<input
					id="swap-reason"
					class="input"
					type="text"
					bind:value={draft.reason}
					placeholder="For example: asked to attend a family function"
				/>
			</div>

			{#if formError}
				<p class="error-text">
					<Icon name="error" size={14} />
					{formError}
				</p>
			{/if}

			{#if draftResult}
				<div
					class="result"
					class:bad={!draftResult.ok}
					class:warn={draftResult.ok && draftResult.addedWarnings.length > 0}
				>
					<p class="result-summary">
						<Icon name={draftResult.ok ? (draftResult.addedWarnings.length ? 'warning' : 'success') : 'error'} size={16} />
						{draftResult.summary}
					</p>
					{#if draftResult.addedIssues.length > 0}
						<ul>
							{#each draftResult.addedIssues.slice(0, 5) as issue (issue.message)}
								<li>{issue.message}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<button
			type="button"
			class="btn"
			onclick={() => {
				creating = false;
				draft = null;
			}}
		>
			Cancel
		</button>
		<button type="button" class="btn btn-primary" onclick={saveDraft}>Record request</button>
	{/snippet}
</Dialog>

<!-- Review before approving -->
<Dialog
	open={reviewing !== null}
	title="Review this swap"
	description="Both the current and the resulting roster are validated. Approving applies the change."
	onclose={() => (reviewing = null)}
>
	{#if reviewing}
		<div class="form">
			<dl class="facts">
				<div>
					<dt>Shift</dt>
					<dd class="tnum">{describeShift(reviewing.shiftId)}</dd>
				</div>
				<div>
					<dt>From</dt>
					<dd>{app.staffById(reviewing.fromStaffId)?.name ?? 'Open slot'}</dd>
				</div>
				<div>
					<dt>To</dt>
					<dd>{app.staffById(reviewing.toStaffId)?.name ?? 'Open slot'}</dd>
				</div>
				<div>
					<dt>Reason</dt>
					<dd>{reviewing.reason}</dd>
				</div>
			</dl>

			{#if reviewResult}
				<div
					class="result"
					class:bad={!reviewResult.ok}
					class:warn={reviewResult.ok && reviewResult.addedWarnings.length > 0}
				>
					<p class="result-summary">
						<Icon name={reviewResult.ok ? (reviewResult.addedWarnings.length ? 'warning' : 'success') : 'error'} size={16} />
						{reviewResult.summary}
					</p>
					{#if reviewResult.addedErrors.length > 0}
						<p class="result-head">Rules this swap would break</p>
						<ul>
							{#each reviewResult.addedErrors as issue (issue.message)}
								<li>
									{issue.message}
									<span class="fix">{issue.suggestedFix}</span>
								</li>
							{/each}
						</ul>
					{/if}
					{#if reviewResult.addedWarnings.length > 0}
						<p class="result-head">Warnings</p>
						<ul>
							{#each reviewResult.addedWarnings as issue (issue.message)}
								<li>{issue.message}</li>
							{/each}
						</ul>
					{/if}
					{#if reviewResult.resolvedIssues.length > 0}
						<p class="result-head">Issues this swap resolves</p>
						<ul>
							{#each reviewResult.resolvedIssues.slice(0, 5) as issue (issue.message)}
								<li>{issue.message}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else}
				<p class="muted">That shift no longer exists, so this swap cannot be applied.</p>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (reviewing = null)}>Close</button>
		<button type="button" class="btn" onclick={() => reviewing && decline(reviewing)}>Decline</button>
		<button
			type="button"
			class="btn btn-primary"
			disabled={!reviewResult}
			onclick={() => reviewing && approve(reviewing)}
		>
			{reviewResult && !reviewResult.ok ? 'Approve anyway' : 'Approve swap'}
		</button>
	{/snippet}
</Dialog>

<Dialog
	open={confirmDelete !== null}
	title="Delete this swap request?"
	description="It is removed from the history. Any change already applied stays in place."
	onclose={() => (confirmDelete = null)}
>
	<p class="confirm-text">Approved swaps have already changed the roster. Deleting the record does not undo them.</p>
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmDelete = null)}>Cancel</button>
		<button type="button" class="btn btn-danger" onclick={remove}>Delete</button>
	{/snippet}
</Dialog>

<style>
	.note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		background: var(--info-tint);
		border-color: color-mix(in srgb, var(--info) 25%, transparent);
	}
	.note :global(svg) {
		color: var(--info);
		flex-shrink: 0;
	}
	.note p {
		font-size: var(--text-13);
		line-height: var(--lh-normal);
		max-width: 80ch;
	}

	.shift-cell {
		font-weight: 400;
		text-align: left;
		font-size: var(--text-13);
		max-width: 30ch;
	}
	.person {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		flex-shrink: 0;
		border-radius: 50%;
		color: #fff;
		font-size: 10px;
		font-weight: 600;
	}
	.reason {
		max-width: 28ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-secondary);
		font-size: var(--text-13);
	}
	.muted {
		color: var(--text-tertiary);
		font-size: var(--text-13);
	}
	.actions {
		display: flex;
		gap: var(--space-1);
		justify-content: flex-end;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.facts {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		background: var(--surface-subtle);
	}
	.facts > div {
		display: flex;
		gap: var(--space-3);
		font-size: var(--text-13);
	}
	.facts dt {
		width: 64px;
		flex-shrink: 0;
		color: var(--text-tertiary);
	}
	.facts dd {
		margin: 0;
		font-weight: 500;
	}

	.result {
		padding: var(--space-3);
		border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
		border-radius: var(--radius-card);
		background: var(--success-tint);
	}
	.result.warn {
		border-color: color-mix(in srgb, var(--saffron) 35%, transparent);
		background: var(--saffron-tint);
	}
	.result.bad {
		border-color: color-mix(in srgb, var(--danger) 35%, transparent);
		background: var(--danger-tint);
	}
	.result-summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-13);
		font-weight: 600;
	}
	.result :global(svg) {
		flex-shrink: 0;
	}
	.result-head {
		font-size: var(--text-12);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-secondary);
		margin-top: var(--space-2);
	}
	.result ul {
		list-style: none;
		margin: var(--space-1) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.result li {
		font-size: var(--text-12);
		line-height: var(--lh-normal);
	}
	.fix {
		display: block;
		color: var(--text-secondary);
	}

	.empty-title {
		font-size: var(--text-16);
		font-weight: 500;
		color: var(--text-primary);
		margin-bottom: var(--space-1);
	}
	.confirm-text {
		font-size: var(--text-13);
		color: var(--text-secondary);
	}
</style>
