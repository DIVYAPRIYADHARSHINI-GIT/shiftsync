<script lang="ts">
	// Staff: roles, colour, contracted hours, rate, weekly availability pattern,
	// specific unavailable dates, preferred days off and notes. Activate/deactivate
	// without deleting history.
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Select from '#lib/components/Select.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import TimeField from '#lib/components/TimeField.svelte';
	import DateField from '#lib/components/DateField.svelte';
	import { app } from '#lib/state.svelte';
	import type { DayAvailability, Staff, Weekday, WeeklyAvailability } from '#lib/types';
	import { formatDate, formatTime, toHours, weekdayName } from '#lib/logic/time';
	import { resolveAll } from '#lib/logic/validate';
	import { contrastOn, initials } from '#lib/components/controls.svelte';

	let editing = $state<Staff | null>(null);
	let isNew = $state(false);
	let confirmDelete = $state<Staff | null>(null);
	let showInactive = $state(false);
	let sortKey = $state<'name' | 'hours' | 'roles'>('name');
	let newRole = $state('');
	let newUnavailableDate = $state(app.today);
	let nameError = $state('');

	const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
	/** Monday-first ordering for display, matching the roster. */
	const DISPLAY_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

	const PALETTE = [
		'#0B6E4F',
		'#2B6CB0',
		'#B7791F',
		'#7B3F9D',
		'#2F855A',
		'#C0392B',
		'#1F6F78',
		'#8A5A2B',
		'#44608A',
		'#6B5B95'
	];

	const visible = $derived(
		[...app.data.staff]
			.filter((s) => showInactive || s.active)
			.sort((a, b) => {
				if (sortKey === 'hours') return b.maxWeeklyHours - a.maxWeeklyHours;
				if (sortKey === 'roles') return a.roles.join().localeCompare(b.roles.join());
				return a.name.localeCompare(b.name);
			})
	);

	/** Scheduled hours for the open week, shown beside the contracted range. */
	function scheduledHours(staffId: string): number {
		const mine = app.roster.shifts.filter((s) => s.staffId === staffId);
		return toHours(
			resolveAll(
				$state.snapshot(mine),
				$state.snapshot(app.data.templates),
				app.data.business.timeZone
			).reduce((sum, r) => sum + r.paidMinutes, 0)
		);
	}

	function blankAvailability(): WeeklyAvailability {
		return Array.from({ length: 7 }, () => ({ kind: 'all-day' as const })) as WeeklyAvailability;
	}

	function startNew() {
		isNew = true;
		nameError = '';
		editing = {
			id: `staff-${Date.now().toString(36)}`,
			name: '',
			roles: [],
			colour: PALETTE[app.data.staff.length % PALETTE.length],
			minWeeklyHours: 16,
			maxWeeklyHours: 40,
			hourlyRate: undefined,
			availability: blankAvailability(),
			unavailableDates: [],
			preferredDaysOff: [],
			notes: '',
			active: true
		};
	}

	function startEdit(person: Staff) {
		isNew = false;
		nameError = '';
		editing = structuredClone($state.snapshot(person)) as Staff;
	}

	function save() {
		if (!editing) return;
		const name = editing.name.trim();
		if (!name) {
			nameError = 'Enter the person\u2019s name so you can find them on the roster.';
			return;
		}
		const duplicate = app.data.staff.some(
			(s) => s.id !== editing!.id && s.name.trim().toLowerCase() === name.toLowerCase()
		);
		if (duplicate) {
			nameError = 'Another person already has this name. Add a surname or initial to tell them apart.';
			return;
		}
		if (editing.minWeeklyHours > editing.maxWeeklyHours) {
			nameError = '';
			app.toast('The contracted minimum cannot be above the maximum.', 'warning');
			return;
		}
		const record = { ...editing, name };
		app.commit(isNew ? 'Add staff' : 'Edit staff', (d) => {
			const index = d.staff.findIndex((s) => s.id === record.id);
			if (index >= 0) d.staff[index] = record;
			else d.staff.push(record);
		});
		app.toast(isNew ? `${name} added.` : `${name} updated.`, 'success');
		editing = null;
	}

	function toggleActive(person: Staff) {
		app.commit(person.active ? 'Deactivate staff' : 'Activate staff', (d) => {
			const found = d.staff.find((s) => s.id === person.id);
			if (found) found.active = !found.active;
		});
		app.toast(
			person.active
				? `${person.name} deactivated. Their past shifts are kept.`
				: `${person.name} is active again.`,
			'info'
		);
	}

	function remove() {
		if (!confirmDelete) return;
		const person = confirmDelete;
		app.commit('Delete staff', (d) => {
			d.staff = d.staff.filter((s) => s.id !== person.id);
			// Their shifts become open slots rather than vanishing silently.
			for (const roster of Object.values(d.rosters)) {
				for (const shift of roster.shifts) {
					if (shift.staffId === person.id) shift.staffId = null;
				}
			}
			d.leave = d.leave.filter((l) => l.staffId !== person.id);
		});
		confirmDelete = null;
		app.toast(`${person.name} deleted. Their shifts are now open slots.`, 'info');
	}

	function addRole() {
		const role = newRole.trim();
		if (!editing || !role) return;
		if (!editing.roles.includes(role)) editing.roles = [...editing.roles, role];
		newRole = '';
	}

	function setDayKind(day: Weekday, kind: DayAvailability['kind']) {
		if (!editing) return;
		const current = editing.availability[day];
		const next: DayAvailability =
			kind === 'between'
				? { kind, fromMin: current.fromMin ?? 9 * 60, toMin: current.toMin ?? 17 * 60 }
				: { kind };
		editing.availability[day] = next;
	}

	/** Shifts that an unavailable date would clash with, shown as a warning. */
	function clashingShifts(person: Staff, date: string): number {
		return Object.values(app.data.rosters)
			.flatMap((r) => r.shifts)
			.filter((s) => s.staffId === person.id && s.date === date).length;
	}
</script>

<PageHeader
	title="Staff"
	description="The people you roster, their roles, contracted hours and when they are available."
>
	{#snippet actions()}
		<Toggle
			checked={showInactive}
			label="Show inactive"
			onchange={(v) => (showInactive = v)}
		/>
		<button type="button" class="btn btn-primary" onclick={startNew}>
			<Icon name="plus" size={16} /> Add staff
		</button>
	{/snippet}
</PageHeader>

{#if app.data.staff.length === 0}
	<div class="card">
		<div class="empty-state">
			<Icon name="staff" size={28} />
			<div>
				<p class="empty-title">No staff yet</p>
				<p>Add the people you roster, or load the sample business to see how ShiftSync works.</p>
			</div>
			<div class="empty-actions">
				<button type="button" class="btn btn-primary" onclick={startNew}>Add your first staff member</button>
				<a class="btn" href="/settings">Load sample data</a>
			</div>
		</div>
	</div>
{:else}
	<div class="table-wrap">
		<table class="data">
			<thead>
				<tr>
					<th scope="col">
						<button type="button" class="sort" onclick={() => (sortKey = 'name')}>
							Person
							{#if sortKey === 'name'}<Icon name="chevron-down" size={14} />{/if}
						</button>
					</th>
					<th scope="col">
						<button type="button" class="sort" onclick={() => (sortKey = 'roles')}>
							Roles
							{#if sortKey === 'roles'}<Icon name="chevron-down" size={14} />{/if}
						</button>
					</th>
					<th scope="col" class="num">
						<button type="button" class="sort" onclick={() => (sortKey = 'hours')}>
							Contracted
							{#if sortKey === 'hours'}<Icon name="chevron-down" size={14} />{/if}
						</button>
					</th>
					<th scope="col" class="num">This week</th>
					<th scope="col">Availability</th>
					<th scope="col">Status</th>
					<th scope="col"><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each visible as person (person.id)}
					{@const hours = scheduledHours(person.id)}
					{@const offDays = person.availability.filter((a) => a.kind === 'unavailable').length}
					<tr>
						<th scope="row" class="person">
							<span class="avatar" style="background: {person.colour}; color: {contrastOn(person.colour)}" aria-hidden="true">
								{initials(person.name)}
							</span>
							<span class="person-text">
								<span class="p-name">{person.name}</span>
								{#if person.notes}<span class="p-note" title={person.notes}>{person.notes}</span>{/if}
							</span>
						</th>
						<td>
							<span class="roles">
								{#each person.roles as role (role)}
									<span class="pill">{role}</span>
								{:else}
									<span class="muted">No role set</span>
								{/each}
							</span>
						</td>
						<td class="num tnum">{person.minWeeklyHours}&ndash;{person.maxWeeklyHours}h</td>
						<td class="num tnum" class:over={hours > person.maxWeeklyHours}>{hours}h</td>
						<td class="tnum">
							{#if offDays === 0}
								Every day
							{:else}
								{7 - offDays} of 7 days
							{/if}
							{#if person.unavailableDates.length > 0}
								<span class="muted">
									&middot; {person.unavailableDates.length} date{person.unavailableDates.length === 1 ? '' : 's'} off
								</span>
							{/if}
						</td>
						<td>
							<span class="pill" class:pill-success={person.active}>
								<Icon name={person.active ? 'success' : 'close'} size={13} />
								{person.active ? 'Active' : 'Inactive'}
							</span>
						</td>
						<td class="actions">
							<button type="button" class="btn btn-sm" onclick={() => startEdit(person)}>
								<Icon name="edit" size={14} /> Edit
							</button>
							<button type="button" class="btn btn-sm btn-quiet" onclick={() => toggleActive(person)}>
								{person.active ? 'Deactivate' : 'Activate'}
							</button>
							<button
								type="button"
								class="btn btn-sm btn-quiet"
								aria-label="Delete {person.name}"
								onclick={() => (confirmDelete = person)}
							>
								<Icon name="trash" size={14} />
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Staff editor -->
<Dialog
	open={editing !== null}
	wide
	title={isNew ? 'Add staff' : `Edit ${editing?.name || 'staff'}`}
	description="Roles decide which slots this person can fill. Availability and leave decide when."
	onclose={() => (editing = null)}
>
	{#if editing}
		<div class="form">
			<div class="row">
				<div class="field grow">
					<label class="label" for="st-name">Name</label>
					<input
						id="st-name"
						class="input"
						type="text"
						bind:value={editing.name}
						aria-invalid={nameError ? 'true' : undefined}
						aria-describedby={nameError ? 'st-name-error' : undefined}
						placeholder="Full name as it should appear on the roster"
					/>
					{#if nameError}
						<p class="error-text" id="st-name-error">
							<Icon name="error" size={14} />
							{nameError}
						</p>
					{/if}
				</div>
				<div class="field">
					<span class="label" id="st-colour-label">Colour</span>
					<div class="swatches" role="radiogroup" aria-labelledby="st-colour-label">
						{#each PALETTE as colour (colour)}
							<button
								type="button"
								role="radio"
								aria-checked={editing.colour === colour}
								aria-label="Colour {colour}"
								class="swatch"
								class:chosen={editing.colour === colour}
								style="background: {colour}"
								onclick={() => (editing!.colour = colour)}
							></button>
						{/each}
					</div>
				</div>
			</div>

			<div class="field">
				<span class="label">Roles</span>
				<div class="role-editor">
					{#each editing.roles as role (role)}
						<span class="pill role-pill">
							{role}
							<button
								type="button"
								aria-label="Remove the {role} role"
								onclick={() => (editing!.roles = editing!.roles.filter((r) => r !== role))}
							>
								<Icon name="close" size={12} />
							</button>
						</span>
					{/each}
				</div>
				<div class="row tight">
					{#if app.roles.filter((r) => !editing!.roles.includes(r)).length > 0}
						<Select
							value=""
							placeholder="Add an existing role"
							ariaLabel="Add an existing role"
							options={app.roles
								.filter((r) => !editing!.roles.includes(r))
								.map((r) => ({ value: r, label: r }))}
							onchange={(v) => {
								if (v) editing!.roles = [...editing!.roles, v];
							}}
						/>
					{/if}
					<input
						class="input"
						type="text"
						bind:value={newRole}
						placeholder="Or type a new role"
						aria-label="New role name"
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								addRole();
							}
						}}
					/>
					<button type="button" class="btn" onclick={addRole} disabled={!newRole.trim()}>Add</button>
				</div>
			</div>

			<div class="row">
				<div class="field">
					<label class="label" for="st-min">Contracted minimum hours</label>
					<input id="st-min" class="input tnum" type="number" min="0" max="80" bind:value={editing.minWeeklyHours} />
				</div>
				<div class="field">
					<label class="label" for="st-max">Contracted maximum hours</label>
					<input id="st-max" class="input tnum" type="number" min="0" max="80" bind:value={editing.maxWeeklyHours} />
				</div>
				<div class="field">
					<label class="label" for="st-rate">Hourly rate ({app.data.business.currency})</label>
					<input
						id="st-rate"
						class="input tnum"
						type="number"
						min="0"
						step="1"
						bind:value={editing.hourlyRate}
						placeholder="Optional"
					/>
					<span class="help">Used only for the labour cost estimate.</span>
				</div>
			</div>

			<fieldset class="availability">
				<legend class="label">Weekly availability</legend>
				{#each DISPLAY_DAYS as day (day)}
					{@const avail = editing.availability[day]}
					<div class="avail-row">
						<span class="avail-day">{weekdayName(day)}</span>
						<Segmented
							value={avail.kind}
							small
							ariaLabel="Availability on {weekdayName(day)}"
							segments={[
								{ value: 'all-day', label: 'All day' },
								{ value: 'between', label: 'Between' },
								{ value: 'unavailable', label: 'Not available' }
							]}
							onchange={(v) => setDayKind(day, v as DayAvailability['kind'])}
						/>
						{#if avail.kind === 'between'}
							<span class="avail-times">
								<TimeField
									value={avail.fromMin ?? 9 * 60}
									small
									ariaLabel="Available from on {weekdayName(day)}"
									onchange={(m) => (editing!.availability[day] = { ...avail, fromMin: m })}
								/>
								<span class="to">to</span>
								<TimeField
									value={avail.toMin ?? 17 * 60}
									small
									ariaLabel="Available until on {weekdayName(day)}"
									onchange={(m) => (editing!.availability[day] = { ...avail, toMin: m })}
								/>
							</span>
						{/if}
						<label class="pref">
							<input
								type="checkbox"
								checked={editing.preferredDaysOff.includes(day)}
								onchange={(e) => {
									const on = (e.currentTarget as HTMLInputElement).checked;
									editing!.preferredDaysOff = on
										? [...editing!.preferredDaysOff, day]
										: editing!.preferredDaysOff.filter((d) => d !== day);
								}}
							/>
							Prefers off
						</label>
					</div>
				{/each}
			</fieldset>

			<div class="field">
				<span class="label">Specific unavailable dates</span>
				<div class="date-list">
					{#each editing.unavailableDates as date (date)}
						{@const clashes = clashingShifts(editing, date)}
						<span class="pill date-pill" class:pill-warn={clashes > 0}>
							<span class="tnum">{formatDate(date)}</span>
							{#if clashes > 0}
								<span class="clash" title="{clashes} shift{clashes === 1 ? '' : 's'} already scheduled">
									{clashes} shift{clashes === 1 ? '' : 's'}
								</span>
							{/if}
							<button
								type="button"
								aria-label="Remove {formatDate(date)}"
								onclick={() => (editing!.unavailableDates = editing!.unavailableDates.filter((d) => d !== date))}
							>
								<Icon name="close" size={12} />
							</button>
						</span>
					{:else}
						<span class="muted">None added</span>
					{/each}
				</div>
				<div class="row tight">
					<DateField
						value={newUnavailableDate}
						ariaLabel="Unavailable date"
						weekStartDay={app.data.business.weekStartDay}
						onchange={(d) => (newUnavailableDate = d)}
					/>
					<button
						type="button"
						class="btn"
						onclick={() => {
							if (!editing!.unavailableDates.includes(newUnavailableDate)) {
								editing!.unavailableDates = [...editing!.unavailableDates, newUnavailableDate].sort();
							}
						}}
					>
						Add date
					</button>
				</div>
			</div>

			<div class="field">
				<label class="label" for="st-notes">Notes</label>
				<textarea
					id="st-notes"
					class="textarea"
					bind:value={editing.notes}
					placeholder="Anything the manager should remember, for example training or keyholder status"
				></textarea>
			</div>

			<Toggle
				checked={editing.active}
				label="Active (available for rostering)"
				onchange={(v) => (editing!.active = v)}
			/>
		</div>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
		<button type="button" class="btn btn-primary" onclick={save}>
			{isNew ? 'Add staff' : 'Save changes'}
		</button>
	{/snippet}
</Dialog>

<Dialog
	open={confirmDelete !== null}
	title="Delete {confirmDelete?.name}?"
	description="Their shifts become open slots and their leave entries are removed. Deactivating keeps the history instead."
	onclose={() => (confirmDelete = null)}
>
	<p class="confirm-text">
		This cannot be undone from the Staff page. Export a backup first if you might need the record.
	</p>
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmDelete = null)}>Cancel</button>
		<button
			type="button"
			class="btn"
			onclick={() => {
				if (confirmDelete) toggleActive(confirmDelete);
				confirmDelete = null;
			}}
		>
			Deactivate instead
		</button>
		<button type="button" class="btn btn-danger" onclick={remove}>Delete</button>
	{/snippet}
</Dialog>

<style>
	.sort {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		padding: 0;
	}
	.sort:hover {
		color: var(--brand);
	}
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
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border-radius: 50%;
		color: #fff;
		font-size: 11px;
		font-weight: 600;
	}
	.person-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.p-name {
		font-weight: 500;
	}
	.p-note {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		max-width: 28ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.roles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.muted {
		color: var(--text-tertiary);
		font-size: var(--text-12);
	}
	.over {
		color: var(--danger);
		font-weight: 600;
	}
	.actions {
		display: flex;
		gap: var(--space-1);
		justify-content: flex-end;
	}

	.empty-title {
		font-size: var(--text-16);
		font-weight: 500;
		color: var(--text-primary);
		margin-bottom: var(--space-1);
	}
	.empty-actions {
		display: flex;
		gap: var(--space-2);
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
	.row.tight {
		gap: var(--space-2);
		align-items: flex-end;
	}
	.row > .field {
		flex: 1;
		min-width: 140px;
	}
	.row > .field.grow {
		flex: 2;
		min-width: 200px;
	}
	.swatches {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
	}
	.swatch {
		width: 24px;
		height: 24px;
		border: 2px solid transparent;
		border-radius: 50%;
		cursor: pointer;
		padding: 0;
	}
	.swatch.chosen {
		border-color: var(--text-primary);
		box-shadow: inset 0 0 0 2px var(--surface);
	}
	.role-editor {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		min-height: 24px;
	}
	.role-pill button,
	.date-pill button {
		display: inline-flex;
		align-items: center;
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		padding: 0;
		margin-left: 2px;
		opacity: 0.7;
	}
	.role-pill button:hover,
	.date-pill button:hover {
		opacity: 1;
	}

	.availability {
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		padding: var(--space-3);
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.availability legend {
		padding: 0 var(--space-1);
	}
	.avail-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.avail-day {
		width: 84px;
		flex-shrink: 0;
		font-size: var(--text-13);
		font-weight: 500;
	}
	.avail-times {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.to {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}
	.pref {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-12);
		color: var(--text-secondary);
		margin-left: auto;
		cursor: pointer;
	}

	.date-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.clash {
		font-size: 10px;
		opacity: 0.85;
	}
	.confirm-text {
		font-size: var(--text-13);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
	}

	@media (max-width: 600px) {
		.actions {
			flex-direction: column;
		}
	}
</style>
