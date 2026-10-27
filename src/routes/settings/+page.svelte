<script lang="ts">
	// Settings: business details, closed days and holidays, the rules engine editor,
	// presets, appearance and the sample data / start fresh actions.
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Select from '#lib/components/Select.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import DateField from '#lib/components/DateField.svelte';
	import { app } from '#lib/state.svelte';
	import { PRESETS, applyPresetRules, type Preset } from '#lib/store/presets';
	import { HARD_RULE_IDS } from '#lib/logic/rules';
	import { formatDate, monthName } from '#lib/logic/time';
	import type { Rule } from '#lib/types';

	let confirmSample = $state(false);
	let confirmFresh = $state(false);
	let confirmPreset = $state<Preset | null>(null);
	let newClosedDate = $state(app.today);
	let newClosedName = $state('');
	let newClosedRecurring = $state(false);

	const TIME_ZONES = [
		'Asia/Kolkata',
		'Asia/Dubai',
		'Asia/Singapore',
		'Europe/London',
		'Europe/Berlin',
		'Europe/Dublin',
		'America/New_York',
		'America/Chicago',
		'America/Los_Angeles',
		'Australia/Sydney',
		'Pacific/Auckland',
		'UTC'
	];
	const CURRENCIES = ['INR', 'GBP', 'EUR', 'USD', 'AUD', 'CAD', 'SGD', 'AED'];

	const hardRules = $derived(app.data.rules.filter((r) => HARD_RULE_IDS.includes(r.id)));
	const softRules = $derived(app.data.rules.filter((r) => !HARD_RULE_IDS.includes(r.id)));

	function updateBusiness<K extends keyof typeof app.data.business>(
		key: K,
		value: (typeof app.data.business)[K]
	) {
		app.commit('Change business settings', (d) => {
			d.business[key] = value;
		}, false);
	}

	function updateRule(id: Rule['id'], patch: Partial<Rule>) {
		app.commit('Change rule', (d) => {
			const rule = d.rules.find((r) => r.id === id);
			if (rule) Object.assign(rule, patch);
		}, false);
	}

	function addClosedDay() {
		const name = newClosedName.trim();
		if (!name) {
			app.toast('Give the closed day a name, for example a holiday name.', 'warning');
			return;
		}
		app.commit('Add closed day', (d) => {
			d.business.closedDays.push({
				id: `closed-${Date.now().toString(36)}`,
				name,
				...(newClosedRecurring
					? { recurringMonthDay: newClosedDate.slice(5) }
					: { date: newClosedDate })
			});
		});
		app.toast(
			newClosedRecurring
				? `${name} added as a yearly closure on ${newClosedDate.slice(8)} ${monthName(newClosedDate, true)}.`
				: `${name} added as a closure on ${formatDate(newClosedDate)}.`,
			'success'
		);
		newClosedName = '';
		newClosedRecurring = false;
	}

	function removeClosedDay(id: string) {
		app.commit('Remove closed day', (d) => {
			d.business.closedDays = d.business.closedDays.filter((c) => c.id !== id);
		});
	}

	function loadPreset(preset: Preset) {
		// JSON round-trip, not structuredClone: the preset objects reach this function as
		// Svelte reactive proxies, which structuredClone cannot clone.
		const templates = JSON.parse(JSON.stringify(preset.templates)) as Preset['templates'];
		const coverage = JSON.parse(JSON.stringify(preset.coverage)) as Preset['coverage'];
		app.commit('Load preset', (d) => {
			d.templates = templates;
			d.coverage = coverage;
			d.rules = applyPresetRules($state.snapshot(d.rules), preset);
		});
		confirmPreset = null;
		app.toast(
			`${preset.name} preset loaded. Templates, coverage and rule values were replaced; your staff and rosters were not changed.`,
			'success'
		);
	}
</script>

<PageHeader
	title="Settings"
	description="Business details, closed days, the rules ShiftSync checks, and your data."
/>

<div class="sections">
	<section class="card card-pad">
		<header>
			<h2>Business</h2>
			<p>
				The time zone decides when shifts actually start and end, including across daylight saving
				changes.
			</p>
		</header>
		<div class="grid-2">
			<div class="field">
				<label class="label" for="bs-name">Business name</label>
				<input
					id="bs-name"
					class="input"
					type="text"
					value={app.data.business.name}
					onchange={(e) => updateBusiness('name', (e.currentTarget as HTMLInputElement).value)}
				/>
			</div>
			<div class="field">
				<span class="label" id="bs-tz-label">Time zone</span>
				<Select
					value={app.data.business.timeZone}
					ariaLabel="Business time zone"
					options={TIME_ZONES.map((z) => ({ value: z, label: z }))}
					onchange={(v) => updateBusiness('timeZone', v)}
				/>
			</div>
			<div class="field">
				<span class="label">Week starts on</span>
				<Segmented
					value={String(app.data.business.weekStartDay)}
					ariaLabel="Week start day"
					segments={[
						{ value: '1', label: 'Monday' },
						{ value: '0', label: 'Sunday' }
					]}
					onchange={(v) => updateBusiness('weekStartDay', Number(v) as 0 | 1)}
				/>
			</div>
			<div class="field">
				<span class="label">Currency</span>
				<Select
					value={app.data.business.currency}
					ariaLabel="Currency"
					options={CURRENCIES.map((c) => ({ value: c, label: c }))}
					onchange={(v) => updateBusiness('currency', v)}
				/>
			</div>
		</div>
	</section>

	<section class="card card-pad">
		<header>
			<h2>Closed days and public holidays</h2>
			<p>
				No shifts are scheduled on these days unless you tick the override on an individual shift.
				A recurring closure repeats on the same date every year.
			</p>
		</header>

		<div class="closed-list">
			{#each app.data.business.closedDays as closed (closed.id)}
				<span class="pill closed-pill">
					<Icon name={closed.recurringMonthDay ? 'history' : 'calendar'} size={13} />
					<span>
						{closed.name}
						<span class="tnum">
							{#if closed.recurringMonthDay}
								&middot; every {Number(closed.recurringMonthDay.slice(3))}
								{monthName(`2026-${closed.recurringMonthDay}`, true)}
							{:else if closed.date}
								&middot; {formatDate(closed.date)}
							{/if}
						</span>
					</span>
					<button type="button" aria-label="Remove {closed.name}" onclick={() => removeClosedDay(closed.id)}>
						<Icon name="close" size={12} />
					</button>
				</span>
			{:else}
				<p class="muted">No closed days set.</p>
			{/each}
		</div>

		<div class="add-closed">
			<div class="field grow">
				<label class="label" for="cd-name">Name</label>
				<input
					id="cd-name"
					class="input"
					type="text"
					bind:value={newClosedName}
					placeholder="For example Diwali or Stocktake"
				/>
			</div>
			<div class="field">
				<span class="label">Date</span>
				<DateField
					value={newClosedDate}
					ariaLabel="Closed date"
					weekStartDay={app.data.business.weekStartDay}
					onchange={(d) => (newClosedDate = d)}
				/>
			</div>
			<div class="field recur">
				<Toggle
					checked={newClosedRecurring}
					label="Repeat every year"
					onchange={(v) => (newClosedRecurring = v)}
				/>
			</div>
			<button type="button" class="btn" onclick={addClosedDay}>
				<Icon name="plus" size={16} /> Add
			</button>
		</div>
	</section>

	<section class="card card-pad">
		<header>
			<h2>Rules</h2>
			<p>
				Hard rules are errors the generator never breaks. Soft rules are warnings it tries to
				minimise. Switch any rule off or change its value to match your workplace.
			</p>
			<p class="legal">
				<Icon name="info" size={14} />
				Rules differ by country and employer. These defaults are a starting point and are not legal
				advice. Check your local working-time law and your employment contracts.
			</p>
		</header>

		<h3 class="rule-group">
			<Icon name="error" size={14} />
			Hard rules (errors)
		</h3>
		<ul class="rules">
			{#each hardRules as rule (rule.id)}
				<li>
					<div class="rule-main">
						<Toggle
							checked={rule.enabled}
							label={rule.name}
							onchange={(v) => updateRule(rule.id, { enabled: v })}
						/>
						<p class="rule-help" title={rule.explanation}>{rule.explanation}</p>
					</div>
					{#if rule.value !== undefined}
						<div class="rule-value">
							<label class="sr-only" for="rule-{rule.id}">{rule.name} value in {rule.unit}</label>
							<input
								id="rule-{rule.id}"
								class="input tnum"
								type="number"
								min="0"
								max="168"
								value={rule.value}
								disabled={!rule.enabled}
								onchange={(e) =>
									updateRule(rule.id, { value: Number((e.currentTarget as HTMLInputElement).value) })}
							/>
							<span class="unit">{rule.unit}</span>
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		<h3 class="rule-group warn">
			<Icon name="warning" size={14} />
			Soft rules (warnings)
		</h3>
		<ul class="rules">
			{#each softRules as rule (rule.id)}
				<li>
					<div class="rule-main">
						<Toggle
							checked={rule.enabled}
							label={rule.name}
							onchange={(v) => updateRule(rule.id, { enabled: v })}
						/>
						<p class="rule-help" title={rule.explanation}>{rule.explanation}</p>
					</div>
					{#if rule.value !== undefined}
						<div class="rule-value">
							<label class="sr-only" for="rule-{rule.id}">{rule.name} value in {rule.unit}</label>
							<input
								id="rule-{rule.id}"
								class="input tnum"
								type="number"
								min="0"
								max="168"
								value={rule.value}
								disabled={!rule.enabled}
								onchange={(e) =>
									updateRule(rule.id, { value: Number((e.currentTarget as HTMLInputElement).value) })}
							/>
							<span class="unit">{rule.unit}</span>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<section class="card card-pad">
		<header>
			<h2>Presets</h2>
			<p>
				A preset fills in shift templates, coverage needs and rule values for a common kind of
				business. Your staff, leave and rosters are left alone, and everything stays editable.
			</p>
		</header>
		<div class="presets">
			{#each PRESETS as preset (preset.id)}
				<article class="preset">
					<h3>{preset.name}</h3>
					<p>{preset.description}</p>
					<dl>
						<div>
							<dt>Shifts</dt>
							<dd class="tnum">{preset.templates.length}</dd>
						</div>
						<div>
							<dt>Roles</dt>
							<dd class="tnum">{preset.roles.length}</dd>
						</div>
						<div>
							<dt>Coverage rows</dt>
							<dd class="tnum">{preset.coverage.length}</dd>
						</div>
					</dl>
					<button type="button" class="btn" onclick={() => (confirmPreset = preset)}>
						Load preset
					</button>
				</article>
			{/each}
		</div>
	</section>

	<section class="card card-pad">
		<header>
			<h2>Appearance</h2>
			<p>Theme and density are saved with your data in this browser.</p>
		</header>
		<div class="grid-2">
			<div class="field">
				<span class="label">Theme</span>
				<Segmented
					value={app.data.settings.theme}
					ariaLabel="Theme"
					segments={[
						{ value: 'light', label: 'Light', icon: 'sun' },
						{ value: 'dark', label: 'Dark', icon: 'moon' },
						{ value: 'system', label: 'System' }
					]}
					onchange={(v) => app.setTheme(v as 'light' | 'dark' | 'system')}
				/>
			</div>
			<div class="field">
				<span class="label">Density</span>
				<Segmented
					value={app.data.settings.density}
					ariaLabel="Density"
					segments={[
						{ value: 'comfortable', label: 'Comfortable' },
						{ value: 'compact', label: 'Compact' }
					]}
					onchange={(v) => app.setDensity(v as 'comfortable' | 'compact')}
				/>
			</div>
			<div class="field">
				<label class="label" for="ot-mult">Overtime multiplier</label>
				<input
					id="ot-mult"
					class="input tnum"
					type="number"
					min="1"
					max="3"
					step="0.1"
					value={app.data.settings.overtimeMultiplier}
					onchange={(e) =>
						app.commit('Change overtime multiplier', (d) => {
							d.settings.overtimeMultiplier = Number((e.currentTarget as HTMLInputElement).value);
						}, false)}
				/>
				<span class="help">Used only by the labour cost estimate.</span>
			</div>
		</div>
	</section>

	<section class="card card-pad">
		<header>
			<h2>Your data</h2>
			<p>
				Everything is stored only in this browser. Export a backup from
				<a href="/privacy">Privacy and backup</a> before you clear anything.
			</p>
		</header>
		<div class="data-actions">
			<div class="data-action">
				<div>
					<p class="da-title">Load sample data</p>
					<p class="da-text">
						Replaces everything with the fictional Greenleaf Cafe: 14 staff, three shift
						templates, coverage needs, leave and two weeks of roster.
					</p>
				</div>
				<button type="button" class="btn" onclick={() => (confirmSample = true)}>
					<Icon name="download" size={16} /> Load sample data
				</button>
			</div>
			<div class="data-action">
				<div>
					<p class="da-title">Start fresh</p>
					<p class="da-text">
						Removes all staff, shifts, rosters, leave and swaps. Your business name and time zone
						are kept.
					</p>
				</div>
				<button type="button" class="btn btn-danger" onclick={() => (confirmFresh = true)}>
					<Icon name="trash" size={16} /> Start fresh
				</button>
			</div>
		</div>
	</section>
</div>

<Dialog
	open={confirmSample}
	title="Load the sample business?"
	description="This replaces all current staff, shifts, rosters, leave and swaps with the fictional Greenleaf Cafe."
	onclose={() => (confirmSample = false)}
>
	<p class="confirm-text">
		Your current data cannot be recovered afterwards unless you exported a backup first.
	</p>
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmSample = false)}>Cancel</button>
		<a class="btn" href="/privacy">Export a backup first</a>
		<button
			type="button"
			class="btn btn-primary"
			onclick={() => {
				app.loadSample();
				confirmSample = false;
			}}
		>
			Load sample data
		</button>
	{/snippet}
</Dialog>

<Dialog
	open={confirmFresh}
	title="Clear all data?"
	description="Every staff member, shift, roster, leave entry and swap request will be removed from this browser."
	onclose={() => (confirmFresh = false)}
>
	<p class="confirm-text">
		This cannot be undone. Your business name, time zone, week start and currency are kept so you
		can start entering real data straight away.
	</p>
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmFresh = false)}>Cancel</button>
		<a class="btn" href="/privacy">Export a backup first</a>
		<button
			type="button"
			class="btn btn-danger"
			onclick={() => {
				app.startFresh();
				confirmFresh = false;
			}}
		>
			Clear everything
		</button>
	{/snippet}
</Dialog>

<Dialog
	open={confirmPreset !== null}
	title="Load the {confirmPreset?.name} preset?"
	description="Shift templates, coverage needs and rule values are replaced. Staff, leave and rosters are not touched."
	onclose={() => (confirmPreset = null)}
>
	{#if confirmPreset}
		<p class="confirm-text">
			Your {app.data.templates.length} current shift template{app.data.templates.length === 1 ? '' : 's'}
			and {app.data.coverage.length} coverage row{app.data.coverage.length === 1 ? '' : 's'} will be
			replaced. Existing shifts that used a removed template stay in the roster but will show an
			error until you reassign them.
		</p>
		<p class="confirm-text">
			Roles in this preset: {confirmPreset.roles.join(', ')}. Add those roles to your staff so the
			generator can fill the slots.
		</p>
	{/if}
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmPreset = null)}>Cancel</button>
		<button
			type="button"
			class="btn btn-primary"
			onclick={() => confirmPreset && loadPreset(confirmPreset)}
		>
			Load preset
		</button>
	{/snippet}
</Dialog>

<style>
	.sections {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		max-width: 980px;
	}
	header {
		margin-bottom: var(--space-4);
	}
	h2 {
		font-size: var(--text-16);
	}
	header p {
		font-size: var(--text-13);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
		margin-top: var(--space-1);
		max-width: 76ch;
	}
	.legal {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		margin-top: var(--space-2);
		padding: var(--space-2);
		border-radius: var(--radius-control);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		font-size: var(--text-12);
	}
	.legal :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
		color: var(--info);
	}

	.grid-2 {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--space-3);
	}

	.closed-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
	}
	.closed-pill button {
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
	.closed-pill button:hover {
		opacity: 1;
	}
	.add-closed {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.add-closed .field.grow {
		flex: 1;
		min-width: 180px;
	}
	.recur {
		padding-bottom: var(--space-2);
	}
	.muted {
		color: var(--text-tertiary);
		font-size: var(--text-13);
	}

	.rule-group {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-12);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--danger);
		margin: var(--space-2) 0;
	}
	.rule-group.warn {
		color: var(--saffron);
		margin-top: var(--space-6);
	}
	.rules {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.rules li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--border);
	}
	.rules li:last-child {
		border-bottom: none;
	}
	.rule-main {
		flex: 1;
		min-width: 0;
	}
	.rule-help {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		line-height: var(--lh-normal);
		margin-top: 2px;
		max-width: 72ch;
	}
	.rule-value {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}
	.rule-value .input {
		width: 72px;
		text-align: right;
	}
	.unit {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		width: 44px;
	}

	.presets {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: var(--space-3);
	}
	.preset {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		background: var(--surface-subtle);
	}
	.preset h3 {
		font-size: var(--text-14);
	}
	.preset p {
		flex: 1;
		font-size: var(--text-12);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
	}
	.preset dl {
		display: flex;
		gap: var(--space-4);
		margin: 0;
	}
	.preset dl > div {
		display: flex;
		flex-direction: column;
	}
	.preset dt {
		font-size: 11px;
		color: var(--text-tertiary);
	}
	.preset dd {
		margin: 0;
		font-size: var(--text-14);
		font-weight: 600;
	}

	.data-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.data-action {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		flex-wrap: wrap;
	}
	.da-title {
		font-size: var(--text-14);
		font-weight: 500;
	}
	.da-text {
		font-size: var(--text-12);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
		max-width: 64ch;
		margin-top: 2px;
	}
	.confirm-text {
		font-size: var(--text-13);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
		margin-bottom: var(--space-2);
	}
</style>
