<script lang="ts">
	// Leave: staff, dates, type and status. Only Approved leave blocks scheduling;
	// Pending shows a warning. Adding leave over existing shifts shows which shifts it
	// affects. Marking someone sick for a day offers eligible replacements.
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Select from '#lib/components/Select.svelte';
	import DateField from '#lib/components/DateField.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import { app } from '#lib/state.svelte';
	import type { Leave, LeaveStatus, LeaveType, Shift } from '#lib/types';
	import { dateInRange, dateToUtc, formatDate, formatTime, startOfWeek } from '#lib/logic/time';
	import { rankReplacements } from '#lib/logic/generator';
	import { assignShift } from '#lib/logic/editor';
	import { contrastOn, initials } from '#lib/components/controls.svelte';

	let editing = $state<Leave | null>(null);
	let isNew = $state(false);
	let confirmDelete = $state<Leave | null>(null);
	let filterStatus = $state<'all' | LeaveStatus>('all');
	let formError = $state('');
	/** Sick cover flow: the shift being re-covered. */
	let coveringShift = $state<Shift | null>(null);

	const filtered = $derived(
		[...app.data.leave]
			.filter((l) => filterStatus === 'all' || l.status === filterStatus)
			.sort((a, b) => dateToUtc(b.startDate) - dateToUtc(a.startDate))
	);

	/** Shifts across all weeks that the given leave range covers. */
	function affectedShifts(staffId: string, start: string, end: string): Shift[] {
		if (!staffId) return [];
		return Object.values(app.data.rosters)
			.flatMap((r) => r.shifts)
			.filter((s) => s.staffId === staffId && dateInRange(s.date, start, end))
			.sort((a, b) => dateToUtc(a.date) - dateToUtc(b.date));
	}

	const editingAffected = $derived(
		editing ? affectedShifts(editing.staffId, editing.startDate, editing.endDate) : []
	);

	function startNew() {
		isNew = true;
		formError = '';
		editing = {
			id: `leave-${Date.now().toString(36)}`,
			staffId: app.activeStaff[0]?.id ?? '',
			startDate: app.today,
			endDate: app.today,
			type: 'Paid',
			status: 'Pending',
			note: ''
		};
	}

	function startEdit(leave: Leave) {
		isNew = false;
		formError = '';
		editing = structuredClone($state.snapshot(leave)) as Leave;
	}

	function save() {
		if (!editing) return;
		if (!editing.staffId) {
			formError = 'Choose who the leave is for.';
			return;
		}
		if (dateToUtc(editing.endDate) < dateToUtc(editing.startDate)) {
			formError = 'The end date is before the start date. Swap them around.';
			return;
		}
		const record = { ...editing };
		app.commit(isNew ? 'Add leave' : 'Edit leave', (d) => {
			const index = d.leave.findIndex((l) => l.id === record.id);
			if (index >= 0) d.leave[index] = record;
			else d.leave.push(record);
		});
		const name = app.staffById(record.staffId)?.name ?? 'Staff';
		app.toast(
			record.status === 'Approved'
				? `${record.type} leave approved for ${name}. Their shifts in that period now show an error.`
				: `${record.type} leave recorded for ${name} as ${record.status.toLowerCase()}.`,
			record.status === 'Approved' ? 'warning' : 'success'
		);
		editing = null;
	}

	function setStatus(leave: Leave, status: LeaveStatus) {
		app.commit('Change leave status', (d) => {
			const found = d.leave.find((l) => l.id === leave.id);
			if (found) found.status = status;
		});
		app.toast(`Leave ${status.toLowerCase()}.`, status === 'Declined' ? 'info' : 'success');
	}

	function remove() {
		if (!confirmDelete) return;
		const leave = confirmDelete;
		app.commit('Delete leave', (d) => {
			d.leave = d.leave.filter((l) => l.id !== leave.id);
		});
		confirmDelete = null;
		app.toast('Leave entry removed.', 'info');
	}

	/** Open the replacement chooser for a shift that clashes with approved leave. */
	function startCover(shift: Shift) {
		coveringShift = structuredClone($state.snapshot(shift)) as Shift;
	}

	const coverCandidates = $derived.by(() => {
		if (!coveringShift) return [];
		// Rank against the week the shift belongs to.
		const weekStart = startOfWeek(coveringShift.date, app.data.business.weekStartDay);
		const roster = app.data.rosters[weekStart];
		return rankReplacements(coveringShift, {
			weekStart,
			staff: $state.snapshot(app.data.staff),
			templates: $state.snapshot(app.data.templates),
			coverage: $state.snapshot(app.data.coverage),
			leave: $state.snapshot(app.data.leave),
			rules: $state.snapshot(app.data.rules),
			business: $state.snapshot(app.data.business),
			previousWeek: $state.snapshot(
				app.data.rosters[
					startOfWeek(coveringShift.date, app.data.business.weekStartDay)
				]?.shifts ?? []
			),
			existing: $state.snapshot(roster?.shifts ?? [])
		}).slice(0, 8);
	});

	function assignCover(staffId: string | null) {
		if (!coveringShift) return;
		const shift = coveringShift;
		const weekStart = startOfWeek(shift.date, app.data.business.weekStartDay);
		app.commit('Assign cover', (d) => {
			const roster = app.ensureRoster(d, weekStart);
			roster.shifts = assignShift(roster.shifts, shift.id, staffId);
		});
		app.toast(
			staffId
				? `${app.staffById(staffId)?.name ?? 'Person'} now covers that shift.`
				: 'The shift is now an open slot.',
			'success'
		);
		coveringShift = null;
	}

	const TYPES: LeaveType[] = ['Paid', 'Unpaid', 'Sick'];
</script>

<PageHeader
	title="Leave"
	description="Approved leave blocks scheduling. Pending leave shows a warning so you can decide before publishing."
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
		<button type="button" class="btn btn-primary" onclick={startNew} disabled={app.data.staff.length === 0}>
			<Icon name="plus" size={16} /> Add leave
		</button>
	{/snippet}
</PageHeader>

{#if app.data.leave.length === 0}
	<div class="card">
		<div class="empty-state">
			<Icon name="leave" size={28} />
			<div>
				<p class="empty-title">No leave recorded</p>
				<p>
					Record holidays, unpaid days and sickness here. Only approved leave stops the generator
					from using someone.
				</p>
			</div>
			<button type="button" class="btn btn-primary" onclick={startNew} disabled={app.data.staff.length === 0}>
				Add a leave entry
			</button>
		</div>
	</div>
{:else if filtered.length === 0}
	<div class="card">
		<div class="empty-state">
			<Icon name="filter" size={24} />
			<p>No {filterStatus.toLowerCase()} leave. Change the filter to see other entries.</p>
		</div>
	</div>
{:else}
	<div class="table-wrap">
		<table class="data">
			<thead>
				<tr>
					<th scope="col">Person</th>
					<th scope="col">Dates</th>
					<th scope="col" class="num">Days</th>
					<th scope="col">Type</th>
					<th scope="col">Status</th>
					<th scope="col" class="num">Shifts affected</th>
					<th scope="col"><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as leave (leave.id)}
					{@const person = app.staffById(leave.staffId)}
					{@const days = Math.round((dateToUtc(leave.endDate) - dateToUtc(leave.startDate)) / 86400000) + 1}
					{@const affected = affectedShifts(leave.staffId, leave.startDate, leave.endDate)}
					<tr>
						<th scope="row" class="person">
							<span class="avatar" style="background: {person?.colour ?? 'var(--border-strong)'}; color: {contrastOn(person?.colour ?? '#CDD2DA')}" aria-hidden="true">
								{initials(person?.name ?? '?')}
							</span>
							<span>{person?.name ?? 'Unknown person'}</span>
						</th>
						<td class="tnum">
							{formatDate(leave.startDate)}
							{#if leave.startDate !== leave.endDate}
								&ndash; {formatDate(leave.endDate)}
							{/if}
							{#if leave.note}
								<span class="note" title={leave.note}>{leave.note}</span>
							{/if}
						</td>
						<td class="num tnum">{days}</td>
						<td>
							<span class="pill" class:pill-danger={leave.type === 'Sick'}>{leave.type}</span>
						</td>
						<td>
							<span
								class="pill"
								class:pill-success={leave.status === 'Approved'}
								class:pill-warn={leave.status === 'Pending'}
							>
								<Icon
									name={leave.status === 'Approved' ? 'success' : leave.status === 'Pending' ? 'warning' : 'close'}
									size={13}
								/>
								{leave.status}
							</span>
						</td>
						<td class="num">
							{#if affected.length > 0}
								<button type="button" class="affected-btn tnum" onclick={() => startEdit(leave)}>
									{affected.length}
								</button>
							{:else}
								<span class="tnum muted">0</span>
							{/if}
						</td>
						<td class="actions">
							{#if leave.status === 'Pending'}
								<button type="button" class="btn btn-sm" onclick={() => setStatus(leave, 'Approved')}>
									Approve
								</button>
								<button type="button" class="btn btn-sm btn-quiet" onclick={() => setStatus(leave, 'Declined')}>
									Decline
								</button>
							{/if}
							{#if leave.type === 'Sick' && leave.status === 'Approved' && affected.length > 0}
								<button type="button" class="btn btn-sm" onclick={() => startCover(affected[0])}>
									<Icon name="swaps" size={14} /> Find cover
								</button>
							{/if}
							<button type="button" class="btn btn-sm btn-quiet" aria-label="Edit leave" onclick={() => startEdit(leave)}>
								<Icon name="edit" size={14} />
							</button>
							<button type="button" class="btn btn-sm btn-quiet" aria-label="Delete leave" onclick={() => (confirmDelete = leave)}>
								<Icon name="trash" size={14} />
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Leave editor -->
<Dialog
	open={editing !== null}
	title={isNew ? 'Add leave' : 'Edit leave'}
	description="Approved leave blocks scheduling for those dates. Pending leave only raises a warning."
	onclose={() => (editing = null)}
>
	{#if editing}
		<div class="form">
			<div class="field">
				<span class="label" id="lv-person">Person</span>
				<Select
					value={editing.staffId}
					ariaLabel="Person taking leave"
					options={app.data.staff.map((s) => ({
						value: s.id,
						label: s.name,
						description: s.active ? undefined : 'inactive'
					}))}
					onchange={(v) => (editing!.staffId = v)}
				/>
			</div>

			<div class="row">
				<div class="field">
					<span class="label">Start date</span>
					<DateField
						value={editing.startDate}
						ariaLabel="Leave start date"
						weekStartDay={app.data.business.weekStartDay}
						onchange={(d) => {
							editing!.startDate = d;
							if (dateToUtc(editing!.endDate) < dateToUtc(d)) editing!.endDate = d;
						}}
					/>
				</div>
				<div class="field">
					<span class="label">End date</span>
					<DateField
						value={editing.endDate}
						ariaLabel="Leave end date"
						weekStartDay={app.data.business.weekStartDay}
						onchange={(d) => (editing!.endDate = d)}
					/>
				</div>
			</div>

			<div class="row">
				<div class="field">
					<span class="label">Type</span>
					<Segmented
						value={editing.type}
						ariaLabel="Leave type"
						segments={TYPES.map((t) => ({ value: t, label: t }))}
						onchange={(v) => (editing!.type = v as LeaveType)}
					/>
				</div>
				<div class="field">
					<span class="label">Status</span>
					<Segmented
						value={editing.status}
						ariaLabel="Leave status"
						segments={[
							{ value: 'Pending', label: 'Pending' },
							{ value: 'Approved', label: 'Approved' },
							{ value: 'Declined', label: 'Declined' }
						]}
						onchange={(v) => (editing!.status = v as LeaveStatus)}
					/>
				</div>
			</div>

			<div class="field">
				<label class="label" for="lv-note">Note</label>
				<input id="lv-note" class="input" type="text" bind:value={editing.note} placeholder="Optional" />
			</div>

			{#if formError}
				<p class="error-text">
					<Icon name="error" size={14} />
					{formError}
				</p>
			{/if}

			{#if editingAffected.length > 0}
				<div class="affected">
					<p class="affected-title">
						<Icon name="warning" size={16} />
						This leave covers {editingAffected.length} scheduled shift{editingAffected.length === 1 ? '' : 's'}
					</p>
					<ul>
						{#each editingAffected.slice(0, 8) as shift (shift.id)}
							{@const template = app.templateById(shift.templateId)}
							<li>
								<span class="tnum">{formatDate(shift.date)}</span>
								<span>
									{template?.name}
									{#if template}
										<span class="tnum">
											{formatTime(template.startMin)}&ndash;{formatTime(template.endMin)}
										</span>
									{/if}
									&middot; {shift.role}
								</span>
								<button type="button" class="btn btn-sm" onclick={() => startCover(shift)}>
									Find cover
								</button>
							</li>
						{/each}
					</ul>
					{#if editingAffected.length > 8}
						<p class="more tnum">and {editingAffected.length - 8} more</p>
					{/if}
					<p class="affected-help">
						Approving this leave leaves those shifts in place and flags them as errors, so you can
						decide who covers them.
					</p>
				</div>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
		<button type="button" class="btn btn-primary" onclick={save}>
			{isNew ? 'Add leave' : 'Save changes'}
		</button>
	{/snippet}
</Dialog>

<!-- Sick cover: eligible replacements ranked by fairness and rule safety -->
<Dialog
	open={coveringShift !== null}
	title="Find cover for this shift"
	description="Replacements are ranked by rule safety first, then by fairness."
	onclose={() => (coveringShift = null)}
>
	{#if coveringShift}
		{@const template = app.templateById(coveringShift.templateId)}
		<div class="form">
			<p class="cover-shift tnum">
				<Icon name="clock" size={16} />
				{template?.name}
				{#if template}
					{formatTime(template.startMin)}&ndash;{formatTime(template.endMin)}
				{/if}
				&middot; {coveringShift.role} &middot; {formatDate(coveringShift.date)}
			</p>
			<ul class="candidates">
				{#each coverCandidates as candidate (candidate.staffId)}
					{@const c = app.staffById(candidate.staffId)}
					<li>
						<span class="avatar" style="background: {c?.colour ?? 'var(--border-strong)'}; color: {contrastOn(c?.colour ?? '#CDD2DA')}" aria-hidden="true">
							{initials(candidate.name)}
						</span>
						<span class="cand-text">
							<span class="cand-name">{candidate.name}</span>
							{#if candidate.blocked}
								<span class="cand-reason blocked">{candidate.blocked}</span>
							{:else if candidate.warnings > 0}
								<span class="cand-reason warn">
									Allowed, with {candidate.warnings} warning{candidate.warnings === 1 ? '' : 's'}
								</span>
							{:else}
								<span class="cand-reason ok">No rule issues</span>
							{/if}
						</span>
						<button
							type="button"
							class="btn btn-sm"
							disabled={!!candidate.blocked}
							onclick={() => assignCover(candidate.staffId)}
						>
							Assign
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (coveringShift = null)}>Cancel</button>
		<button type="button" class="btn" onclick={() => assignCover(null)}>Leave slot open</button>
	{/snippet}
</Dialog>

<Dialog
	open={confirmDelete !== null}
	title="Delete this leave entry?"
	description="Shifts in that period stop showing a leave error."
	onclose={() => (confirmDelete = null)}
>
	<p class="confirm-text">This only removes the leave record. No shifts are changed.</p>
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmDelete = null)}>Cancel</button>
		<button type="button" class="btn btn-danger" onclick={remove}>Delete</button>
	{/snippet}
</Dialog>

<style>
	.person {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 400;
		text-align: left;
	}
	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		flex-shrink: 0;
		border-radius: 50%;
		color: #fff;
		font-size: 10px;
		font-weight: 600;
	}
	.note {
		display: block;
		font-size: var(--text-12);
		color: var(--text-tertiary);
		max-width: 34ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.muted {
		color: var(--text-tertiary);
	}
	.affected-btn {
		border: none;
		background: var(--saffron-tint);
		color: var(--saffron);
		font: inherit;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		cursor: pointer;
	}
	.actions {
		display: flex;
		gap: var(--space-1);
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.row {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.row > .field {
		flex: 1;
		min-width: 160px;
	}

	.affected {
		padding: var(--space-3);
		border: 1px solid color-mix(in srgb, var(--saffron) 35%, transparent);
		border-radius: var(--radius-card);
		background: var(--saffron-tint);
	}
	.affected-title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-13);
		font-weight: 600;
		color: var(--saffron);
		margin-bottom: var(--space-2);
	}
	.affected ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.affected li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-12);
		flex-wrap: wrap;
	}
	.affected li > span:first-child {
		font-weight: 600;
		min-width: 90px;
	}
	.affected li > span:nth-child(2) {
		flex: 1;
		color: var(--text-secondary);
	}
	.more,
	.affected-help {
		font-size: var(--text-12);
		color: var(--text-secondary);
		margin-top: var(--space-2);
		line-height: var(--lh-normal);
	}

	.cover-shift {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		background: var(--surface-subtle);
		font-size: var(--text-13);
		font-weight: 500;
		flex-wrap: wrap;
	}
	.candidates {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.candidates li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.cand-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.cand-name {
		font-size: var(--text-13);
		font-weight: 500;
	}
	.cand-reason {
		font-size: var(--text-12);
	}
	.cand-reason.ok {
		color: var(--success);
	}
	.cand-reason.warn {
		color: var(--saffron);
	}
	.cand-reason.blocked {
		color: var(--text-tertiary);
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
