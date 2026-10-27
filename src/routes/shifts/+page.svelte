<script lang="ts">
	// Shifts and coverage: shift templates (may cross midnight), and for each template
	// and weekday how many people are needed per role, with a copy-from-another-day
	// shortcut. Paid hours are calculated from the template.
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Select from '#lib/components/Select.svelte';
	import TimeField from '#lib/components/TimeField.svelte';
	import { app } from '#lib/state.svelte';
	import type { CoverageNeed, ShiftTemplate, Weekday } from '#lib/types';
	import { formatDuration, formatTime, nominalSpanMin, weekdayName } from '#lib/logic/time';

	let editing = $state<ShiftTemplate | null>(null);
	let isNew = $state(false);
	let confirmDelete = $state<ShiftTemplate | null>(null);
	let copyFrom = $state<{ templateId: string; from: Weekday } | null>(null);
	let nameError = $state('');

	const DISPLAY_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
	const PALETTE = ['#0B6E4F', '#2B6CB0', '#B7791F', '#7B3F9D', '#1F6F78', '#C0392B'];

	/** Paid minutes from the template alone, before any daylight-saving adjustment. */
	function paidFromTemplate(t: ShiftTemplate): number {
		return Math.max(0, nominalSpanMin(t.startMin, t.endMin) - t.unpaidBreakMin);
	}

	function startNew() {
		isNew = true;
		nameError = '';
		editing = {
			id: `tpl-${Date.now().toString(36)}`,
			name: '',
			startMin: 9 * 60,
			endMin: 17 * 60,
			unpaidBreakMin: 30,
			colour: PALETTE[app.data.templates.length % PALETTE.length],
			days: [1, 2, 3, 4, 5]
		};
	}

	function startEdit(template: ShiftTemplate) {
		isNew = false;
		nameError = '';
		editing = structuredClone($state.snapshot(template)) as ShiftTemplate;
	}

	function save() {
		if (!editing) return;
		const name = editing.name.trim();
		if (!name) {
			nameError = 'Give the shift a name, for example Morning or Night.';
			return;
		}
		if (editing.days.length === 0) {
			nameError = 'Choose at least one day this shift runs.';
			return;
		}
		if (paidFromTemplate(editing) <= 0) {
			nameError = 'The unpaid break is longer than the shift. Shorten the break or extend the shift.';
			return;
		}
		const record = { ...editing, name };
		app.commit(isNew ? 'Add shift template' : 'Edit shift template', (d) => {
			const index = d.templates.findIndex((t) => t.id === record.id);
			if (index >= 0) d.templates[index] = record;
			else d.templates.push(record);
		});
		app.toast(isNew ? `${name} added.` : `${name} updated.`, 'success');
		editing = null;
	}

	function remove() {
		if (!confirmDelete) return;
		const template = confirmDelete;
		app.commit('Delete shift template', (d) => {
			d.templates = d.templates.filter((t) => t.id !== template.id);
			d.coverage = d.coverage.filter((c) => c.templateId !== template.id);
			for (const roster of Object.values(d.rosters)) {
				roster.shifts = roster.shifts.filter((s) => s.templateId !== template.id);
			}
		});
		confirmDelete = null;
		app.toast(`${template.name} and its shifts were removed.`, 'info');
	}

	/** How many shifts across all weeks use this template. */
	function usageCount(templateId: string): number {
		return Object.values(app.data.rosters)
			.flatMap((r) => r.shifts)
			.filter((s) => s.templateId === templateId).length;
	}

	function needFor(templateId: string, weekday: Weekday, role: string): CoverageNeed | undefined {
		return app.data.coverage.find(
			(c) => c.templateId === templateId && c.weekday === weekday && c.role === role
		);
	}

	function setNeed(
		templateId: string,
		weekday: Weekday,
		role: string,
		field: 'min' | 'ideal',
		value: number
	) {
		app.commit('Change coverage need', (d) => {
			const existing = d.coverage.find(
				(c) => c.templateId === templateId && c.weekday === weekday && c.role === role
			);
			if (existing) {
				if (field === 'min') existing.min = Math.max(0, value);
				else existing.ideal = value > 0 ? value : undefined;
				// A need of zero with no ideal is the same as no need at all.
				if (existing.min === 0 && !existing.ideal) {
					d.coverage = d.coverage.filter((c) => c.id !== existing.id);
				}
			} else if (value > 0) {
				d.coverage.push({
					id: `cov-${templateId}-${weekday}-${role}-${Date.now().toString(36)}`,
					templateId,
					weekday,
					role,
					min: field === 'min' ? value : 0,
					ideal: field === 'ideal' ? value : undefined
				});
			}
		});
	}

	function doCopyDay(toDay: Weekday) {
		if (!copyFrom) return;
		const { templateId, from } = copyFrom;
		app.commit('Copy coverage from another day', (d) => {
			const source = d.coverage.filter((c) => c.templateId === templateId && c.weekday === from);
			d.coverage = d.coverage.filter(
				(c) => !(c.templateId === templateId && c.weekday === toDay)
			);
			for (const need of source) {
				d.coverage.push({
					...need,
					id: `cov-${templateId}-${toDay}-${need.role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
					weekday: toDay
				});
			}
		});
		app.toast(`Coverage copied from ${weekdayName(from)} to ${weekdayName(toDay)}.`, 'success');
		copyFrom = null;
	}

	const roles = $derived(app.roles.length > 0 ? app.roles : ['Staff']);
</script>

<PageHeader
	title="Shifts and coverage"
	description="Shift templates set the times and paid hours. Coverage needs say how many people each role needs on each day."
>
	{#snippet actions()}
		<button type="button" class="btn btn-primary" onclick={startNew}>
			<Icon name="plus" size={16} /> Add shift template
		</button>
	{/snippet}
</PageHeader>

{#if app.data.templates.length === 0}
	<div class="card">
		<div class="empty-state">
			<Icon name="shifts" size={28} />
			<div>
				<p class="empty-title">No shift templates yet</p>
				<p>
					A template sets the start time, end time and unpaid break. Add one, or load a preset in
					Settings for a ready-made retail, restaurant or clinic pattern.
				</p>
			</div>
			<div class="empty-actions">
				<button type="button" class="btn btn-primary" onclick={startNew}>Add a shift template</button>
				<a class="btn" href="/settings">Load a preset</a>
			</div>
		</div>
	</div>
{:else}
	<section class="templates">
		<h2>Shift templates</h2>
		<div class="template-grid">
			{#each app.data.templates as template (template.id)}
				{@const overnight = template.endMin <= template.startMin}
				<article class="template-card">
					<span class="bar" style="background: {template.colour}" aria-hidden="true"></span>
					<div class="tc-body">
						<header>
							<h3>{template.name}</h3>
							<span class="times tnum">
								{formatTime(template.startMin)}&ndash;{formatTime(template.endMin)}
								{#if overnight}<span class="pill pill-info">Crosses midnight</span>{/if}
							</span>
						</header>
						<dl>
							<div>
								<dt>Paid hours</dt>
								<dd class="tnum">{formatDuration(paidFromTemplate(template))}</dd>
							</div>
							<div>
								<dt>Unpaid break</dt>
								<dd class="tnum">{template.unpaidBreakMin} min</dd>
							</div>
							<div>
								<dt>Runs on</dt>
								<dd>
									{DISPLAY_DAYS.filter((d) => template.days.includes(d))
										.map((d) => weekdayName(d, true))
										.join(', ') || 'No days'}
								</dd>
							</div>
						</dl>
						<div class="tc-actions">
							<button type="button" class="btn btn-sm" onclick={() => startEdit(template)}>
								<Icon name="edit" size={14} /> Edit
							</button>
							<button type="button" class="btn btn-sm btn-quiet" onclick={() => (confirmDelete = template)}>
								<Icon name="trash" size={14} /> Delete
							</button>
						</div>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<section class="coverage">
		<header class="sec-head">
			<h2>Coverage needs</h2>
			<p>
				The minimum is a hard requirement the generator fills and the understaffed check uses. The
				ideal is a nicer-to-have number shown beside it.
			</p>
		</header>

		{#each app.data.templates as template (template.id)}
			<div class="cov-block">
				<header class="cov-head">
					<span class="bar" style="background: {template.colour}" aria-hidden="true"></span>
					<h3>{template.name}</h3>
					<span class="times tnum">
						{formatTime(template.startMin)}&ndash;{formatTime(template.endMin)}
					</span>
				</header>
				<div class="table-wrap">
					<table class="data">
						<thead>
							<tr>
								<th scope="col">Role</th>
								{#each DISPLAY_DAYS as day (day)}
									<th scope="col" class="num" class:dim={!template.days.includes(day)}>
										{weekdayName(day, true)}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each roles as role (role)}
								<tr>
									<th scope="row">{role}</th>
									{#each DISPLAY_DAYS as day (day)}
										{@const need = needFor(template.id, day, role)}
										{@const runs = template.days.includes(day)}
										<td class="num cov-cell" class:dim={!runs}>
											<span class="need-inputs">
												<input
													class="input mini tnum"
													type="number"
													min="0"
													max="20"
													value={need?.min ?? 0}
													disabled={!runs}
													aria-label="Minimum {role} needed on {weekdayName(day)} for {template.name}"
													onchange={(e) =>
														setNeed(template.id, day, role, 'min', Number((e.currentTarget as HTMLInputElement).value))}
												/>
												<input
													class="input mini ideal tnum"
													type="number"
													min="0"
													max="20"
													value={need?.ideal ?? ''}
													disabled={!runs}
													placeholder="-"
													aria-label="Ideal {role} on {weekdayName(day)} for {template.name}"
													onchange={(e) =>
														setNeed(template.id, day, role, 'ideal', Number((e.currentTarget as HTMLInputElement).value))}
												/>
											</span>
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="cov-foot">
					<span class="legend-note">Top box: minimum. Bottom box: ideal (optional).</span>
					<button
						type="button"
						class="btn btn-sm"
						onclick={() => (copyFrom = { templateId: template.id, from: 1 })}
					>
						<Icon name="copy" size={14} /> Copy a day
					</button>
				</div>
			</div>
		{/each}
	</section>
{/if}

<!-- Template editor -->
<Dialog
	open={editing !== null}
	title={isNew ? 'Add shift template' : `Edit ${editing?.name || 'template'}`}
	description="An end time at or before the start time means the shift crosses midnight. It belongs to the day it starts."
	onclose={() => (editing = null)}
>
	{#if editing}
		<div class="form">
			<div class="field">
				<label class="label" for="tpl-name">Name</label>
				<input
					id="tpl-name"
					class="input"
					type="text"
					bind:value={editing.name}
					placeholder="For example Morning, Evening or Night bake"
					aria-invalid={nameError ? 'true' : undefined}
					aria-describedby={nameError ? 'tpl-error' : undefined}
				/>
				{#if nameError}
					<p class="error-text" id="tpl-error">
						<Icon name="error" size={14} />
						{nameError}
					</p>
				{/if}
			</div>

			<div class="row">
				<div class="field">
					<label class="label" for="tpl-start">Start time</label>
					<TimeField
						id="tpl-start"
						value={editing.startMin}
						ariaLabel="Start time"
						onchange={(m) => (editing!.startMin = m)}
					/>
				</div>
				<div class="field">
					<label class="label" for="tpl-end">End time</label>
					<TimeField
						id="tpl-end"
						value={editing.endMin}
						ariaLabel="End time"
						onchange={(m) => (editing!.endMin = m)}
					/>
				</div>
				<div class="field">
					<label class="label" for="tpl-break">Unpaid break (minutes)</label>
					<input id="tpl-break" class="input tnum" type="number" min="0" max="240" step="5" bind:value={editing.unpaidBreakMin} />
				</div>
			</div>

			<p class="calc tnum">
				<Icon name="clock" size={16} />
				Paid hours: {formatDuration(paidFromTemplate(editing))}
				{#if editing.endMin <= editing.startMin}
					&middot; crosses midnight and ends the next day
				{/if}
			</p>

			<fieldset class="days">
				<legend class="label">Days this shift runs</legend>
				<div class="day-toggles">
					{#each DISPLAY_DAYS as day (day)}
						<label class="day-chip" class:on={editing.days.includes(day)}>
							<input
								type="checkbox"
								checked={editing.days.includes(day)}
								onchange={(e) => {
									const on = (e.currentTarget as HTMLInputElement).checked;
									editing!.days = on
										? [...editing!.days, day]
										: editing!.days.filter((d) => d !== day);
								}}
							/>
							{weekdayName(day, true)}
						</label>
					{/each}
				</div>
			</fieldset>

			<div class="field">
				<span class="label" id="tpl-colour-label">Colour</span>
				<div class="swatches" role="radiogroup" aria-labelledby="tpl-colour-label">
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
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
		<button type="button" class="btn btn-primary" onclick={save}>
			{isNew ? 'Add template' : 'Save changes'}
		</button>
	{/snippet}
</Dialog>

<!-- Copy a day's coverage -->
<Dialog
	open={copyFrom !== null}
	title="Copy coverage from one day to another"
	description="This replaces the target day's coverage for this shift template."
	onclose={() => (copyFrom = null)}
>
	{#if copyFrom}
		<div class="form">
			<div class="field">
				<span class="label">Copy from</span>
				<Select
					value={String(copyFrom.from)}
					ariaLabel="Copy coverage from this day"
					options={DISPLAY_DAYS.map((d) => ({ value: String(d), label: weekdayName(d) }))}
					onchange={(v) => (copyFrom = { ...copyFrom!, from: Number(v) as Weekday })}
				/>
			</div>
			<div class="field">
				<span class="label">Copy to</span>
				<ul class="copy-targets">
					{#each DISPLAY_DAYS.filter((d) => d !== copyFrom!.from) as day (day)}
						<li>
							<button type="button" class="btn" onclick={() => doCopyDay(day)}>
								{weekdayName(day)}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}
</Dialog>

<Dialog
	open={confirmDelete !== null}
	title="Delete {confirmDelete?.name}?"
	description="Its coverage needs and every shift using it will be removed from all weeks."
	onclose={() => (confirmDelete = null)}
>
	<p class="confirm-text">
		{confirmDelete ? usageCount(confirmDelete.id) : 0} scheduled shifts use this template and will be
		deleted.
	</p>
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmDelete = null)}>Cancel</button>
		<button type="button" class="btn btn-danger" onclick={remove}>Delete template</button>
	{/snippet}
</Dialog>

<style>
	h2 {
		margin-bottom: var(--space-3);
	}
	.sec-head {
		margin-bottom: var(--space-3);
	}
	.sec-head p {
		font-size: var(--text-13);
		color: var(--text-secondary);
		max-width: 70ch;
	}
	.templates {
		margin-bottom: var(--space-8);
	}
	.template-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-3);
	}
	.template-card {
		display: flex;
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		background: var(--surface);
		overflow: hidden;
	}
	.bar {
		width: 4px;
		flex-shrink: 0;
	}
	.tc-body {
		flex: 1;
		padding: var(--space-3);
		min-width: 0;
	}
	.tc-body header {
		margin-bottom: var(--space-2);
	}
	.times {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-13);
		color: var(--text-secondary);
		margin-top: 2px;
		flex-wrap: wrap;
	}
	.tc-body dl {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0 0 var(--space-3);
	}
	.tc-body dl > div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
		font-size: var(--text-13);
	}
	.tc-body dt {
		color: var(--text-tertiary);
	}
	.tc-body dd {
		margin: 0;
		font-weight: 500;
		text-align: right;
	}
	.tc-actions {
		display: flex;
		gap: var(--space-2);
	}

	.cov-block {
		margin-bottom: var(--space-6);
	}
	.cov-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.cov-head .bar {
		width: 3px;
		height: 18px;
		border-radius: 2px;
	}
	.cov-head h3 {
		font-size: var(--text-14);
	}
	.cov-cell {
		padding: var(--space-1) var(--space-2);
	}
	.cov-cell.dim,
	th.dim {
		opacity: 0.4;
	}
	.need-inputs {
		display: flex;
		flex-direction: column;
		gap: 2px;
		align-items: flex-end;
	}
	.input.mini {
		width: 54px;
		height: 28px;
		padding: 0 var(--space-1);
		text-align: right;
		font-size: var(--text-13);
	}
	.input.mini.ideal {
		height: 24px;
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}
	.cov-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-top: var(--space-2);
		flex-wrap: wrap;
	}
	.legend-note {
		font-size: var(--text-12);
		color: var(--text-tertiary);
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
		min-width: 120px;
	}
	.calc {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		background: var(--brand-tint);
		color: var(--brand);
		font-size: var(--text-13);
		font-weight: 500;
	}
	.days {
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		padding: var(--space-3);
		margin: 0;
	}
	.days legend {
		padding: 0 var(--space-1);
	}
	.day-toggles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.day-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 32px;
		padding: 0 var(--space-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-control);
		background: var(--surface);
		font-size: var(--text-13);
		font-weight: 500;
		cursor: pointer;
		transition: all var(--motion-fast) var(--ease-out);
	}
	.day-chip.on {
		background: var(--brand-tint);
		border-color: var(--brand);
		color: var(--brand);
	}
	.day-chip input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}
	.day-chip:has(input:focus-visible) {
		box-shadow: var(--focus-ring);
	}
	.swatches {
		display: flex;
		gap: var(--space-1);
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
	.copy-targets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		list-style: none;
		margin: 0;
		padding: 0;
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
	.confirm-text {
		font-size: var(--text-13);
		color: var(--text-secondary);
	}
</style>
