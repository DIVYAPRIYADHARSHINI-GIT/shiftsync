<script lang="ts">
	// Privacy and backup: where the data lives, the storage meter, JSON export and a
	// validated import that never silently overwrites existing data.
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { app } from '#lib/state.svelte';
	import { formatBytes } from '#lib/store/roster-store';
	import {
		backupFileName,
		buildBackup,
		daysSinceBackup,
		validateBackup,
		type BackupCheck
	} from '#lib/logic/backup';
	import { downloadBlob } from '#lib/exporters.svelte';
	import { formatDate } from '#lib/logic/time';

	let fileInput = $state<HTMLInputElement | null>(null);
	let check = $state<BackupCheck | null>(null);
	let pendingFileName = $state('');

	const backupDays = $derived(daysSinceBackup(app.data.settings.lastBackupAt, Date.now()));
	const rosterCount = $derived(Object.keys(app.data.rosters).length);
	const shiftCount = $derived(
		Object.values(app.data.rosters).reduce((sum, r) => sum + r.shifts.length, 0)
	);

	function exportBackup() {
		const envelope = buildBackup(
			$state.snapshot(app.data) as typeof app.data,
			new Date().toISOString()
		);
		downloadBlob(
			backupFileName(app.data.business.name, envelope.exportedAt),
			JSON.stringify(envelope, null, 2),
			'application/json'
		);
		app.markBackedUp();
		app.toast('Backup exported. Keep it somewhere safe.', 'success');
	}

	async function onFileChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		pendingFileName = file.name;
		try {
			const text = await file.text();
			check = validateBackup(text);
		} catch {
			check = {
				ok: false,
				error: 'The file could not be read.',
				detail: 'It may be too large or the browser blocked access. Try exporting a fresh backup.'
			};
		}
		// Allow re-choosing the same file after a failed attempt.
		input.value = '';
	}

	function applyImport() {
		if (!check?.ok) return;
		app.importBackup(check.data);
		const summary = check.summary;
		check = null;
		app.toast(
			`Backup imported: ${summary.staff} staff, ${summary.rosters} roster weeks, ${summary.leave} leave entries.`,
			'success'
		);
	}
</script>

<PageHeader
	title="Privacy and backup"
	description="Where your roster data lives, how much space it uses, and how to keep a copy of it."
/>

<div class="sections">
	<section class="card card-pad highlight">
		<h2>
			<Icon name="shield" size={18} />
			Data stays in this browser
		</h2>
		<p>
			ShiftSync stores every staff member, shift, roster, leave entry and swap request in this
			browser&rsquo;s localStorage, under the single key
			<code>shiftsync:data:v1</code>. Nothing is uploaded, synced or shared. There is no account,
			no login, no analytics and no tracking.
		</p>
		<p>
			The only request ShiftSync ever makes to a server is the PDF export: the rows needed for that
			one page are posted to <code>/api/pdf</code>, rendered, returned, and never stored or logged.
			Every other export &mdash; CSV, the calendar file, the plain text versions and this backup
			&mdash; is built entirely inside your browser.
		</p>
		<ul class="facts">
			<li><Icon name="check" size={14} /> No database, no cloud storage, no file storage service</li>
			<li><Icon name="check" size={14} /> No API keys and no paid services</li>
			<li><Icon name="check" size={14} /> No accounts, no staff portal, no email or push sending</li>
			<li>
				<Icon name="warning" size={14} />
				Clearing your browser data, using a different browser, or private browsing will lose the
				roster unless you have a backup
			</li>
		</ul>
	</section>

	<section class="card card-pad">
		<header>
			<h2>Storage</h2>
			<p>
				Browsers give a site about 5 MB of localStorage. ShiftSync checks the size before every
				save and warns you rather than losing a change.
			</p>
		</header>
		<div class="meter-row">
			<div
				class="meter"
				role="progressbar"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(app.storage.fraction * 100)}
				aria-label="Storage used"
			>
				<span
					class="meter-fill"
					class:warn={app.storage.fraction > 0.75}
					class:full={app.storage.fraction > 0.92}
					style="width: {Math.max(1.5, app.storage.fraction * 100)}%"
				></span>
			</div>
			<p class="meter-text tnum">
				{formatBytes(app.storage.usedBytes)} of about {formatBytes(app.storage.limitBytes)} used
				({Math.round(app.storage.fraction * 100)}%)
			</p>
		</div>
		<dl class="counts">
			<div>
				<dt>Staff</dt>
				<dd class="tnum">{app.data.staff.length}</dd>
			</div>
			<div>
				<dt>Roster weeks</dt>
				<dd class="tnum">{rosterCount}</dd>
			</div>
			<div>
				<dt>Shifts</dt>
				<dd class="tnum">{shiftCount}</dd>
			</div>
			<div>
				<dt>Leave entries</dt>
				<dd class="tnum">{app.data.leave.length}</dd>
			</div>
			<div>
				<dt>Swap requests</dt>
				<dd class="tnum">{app.data.swaps.length}</dd>
			</div>
		</dl>
		{#if app.storage.health !== 'ok'}
			<p class="storage-warning">
				<Icon name="warning" size={16} />
				{app.storage.message ?? 'There is a problem with browser storage on this device.'}
			</p>
		{/if}
	</section>

	<section class="card card-pad" class:due={app.backupDue}>
		<header>
			<h2>Backup</h2>
			<p>
				Export a JSON file with everything in it. Import restores it on this or another browser.
			</p>
		</header>

		<div class="backup-status">
			<Icon name={app.backupDue ? 'warning' : 'success'} size={18} />
			<div>
				<p class="bs-title">
					{#if backupDays === null}
						No backup exported yet
					{:else if backupDays === 0}
						Last backup: today
					{:else}
						Last backup: {backupDays} day{backupDays === 1 ? '' : 's'} ago
					{/if}
				</p>
				<p class="bs-text">
					{#if app.data.settings.lastBackupAt}
						<span class="tnum">{formatDate(app.data.settings.lastBackupAt.slice(0, 10))}</span>
						&middot;
					{/if}
					ShiftSync reminds you after seven days without a backup.
				</p>
			</div>
		</div>

		<div class="backup-actions">
			<button type="button" class="btn btn-primary" onclick={exportBackup}>
				<Icon name="download" size={16} /> Export a backup
			</button>
			<button type="button" class="btn" onclick={() => fileInput?.click()}>
				<Icon name="upload" size={16} /> Import a backup
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				class="sr-only"
				aria-label="Choose a backup file to import"
				onchange={onFileChosen}
			/>
		</div>
		<p class="help">
			Import never overwrites silently: ShiftSync checks the file, shows you what is in it, and asks
			you to confirm before replacing anything.
		</p>
	</section>

	<section class="card card-pad">
		<header>
			<h2>What ShiftSync does not do</h2>
		</header>
		<ul class="nots">
			<li>
				<strong>No staff portal.</strong> This is a single-manager tool. Staff cannot sign in, see
				their shifts in the app or request swaps themselves; you record requests on their behalf.
			</li>
			<li>
				<strong>No notifications.</strong> There is no server to send email, SMS or push from.
				Use the PDF, calendar file or &ldquo;Copy for WhatsApp&rdquo; exports to share the roster.
			</li>
			<li>
				<strong>No legal advice.</strong> Working-time rules differ by country, state and
				employment contract. ShiftSync checks the rules you configure; it does not know your law.
			</li>
			<li>
				<strong>No payroll.</strong> The labour cost figure is an estimate from the hourly rates
				you typed in, and it ignores tax, allowances and statutory overtime.
			</li>
		</ul>
	</section>
</div>

<!-- Import confirmation: validated, summarised and never silent -->
<Dialog
	open={check !== null}
	title={check?.ok ? 'Import this backup?' : 'This file cannot be imported'}
	description={check?.ok
		? 'Everything currently in this browser will be replaced by the contents of the file.'
		: 'Nothing has been changed. Your current data is untouched.'}
	onclose={() => (check = null)}
>
	{#if check}
		{#if check.ok}
			<p class="file-name tnum">{pendingFileName}</p>
			<dl class="import-summary">
				<div>
					<dt>Staff</dt>
					<dd class="tnum">{check.summary.staff}</dd>
				</div>
				<div>
					<dt>Shift templates</dt>
					<dd class="tnum">{check.summary.templates}</dd>
				</div>
				<div>
					<dt>Roster weeks</dt>
					<dd class="tnum">{check.summary.rosters}</dd>
				</div>
				<div>
					<dt>Leave entries</dt>
					<dd class="tnum">{check.summary.leave}</dd>
				</div>
				<div>
					<dt>Swap requests</dt>
					<dd class="tnum">{check.summary.swaps}</dd>
				</div>
			</dl>
			{#if check.migratedFrom}
				<p class="migrate-note">
					<Icon name="info" size={14} />
					This backup uses schema version {check.migratedFrom} and will be upgraded to the current
					version as it is imported.
				</p>
			{/if}
			<p class="warn-note">
				<Icon name="warning" size={16} />
				Your current {app.data.staff.length} staff and {rosterCount} roster week{rosterCount === 1 ? '' : 's'}
				will be replaced. Export a backup first if you have not already.
			</p>
		{:else}
			<div class="import-error" role="alert">
				<p class="ie-title">
					<Icon name="error" size={18} />
					{check.error}
				</p>
				{#if check.detail}<p class="ie-detail">{check.detail}</p>{/if}
				<p class="file-name tnum">{pendingFileName}</p>
			</div>
		{/if}
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (check = null)}>
			{check?.ok ? 'Cancel' : 'Close'}
		</button>
		{#if check?.ok}
			<button type="button" class="btn" onclick={exportBackup}>Export current data first</button>
			<button type="button" class="btn btn-primary" onclick={applyImport}>
				Replace my data
			</button>
		{/if}
	{/snippet}
</Dialog>

<style>
	.sections {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		max-width: 860px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-16);
	}
	header {
		margin-bottom: var(--space-3);
	}
	header p,
	section > p {
		font-size: var(--text-13);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
		margin-top: var(--space-1);
		max-width: 76ch;
	}
	.highlight {
		border-color: color-mix(in srgb, var(--success) 30%, var(--border));
		background: var(--success-tint);
	}
	.highlight h2 :global(svg) {
		color: var(--success);
	}
	code {
		font-family: inherit;
		font-size: 0.92em;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.facts {
		list-style: none;
		margin: var(--space-3) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.facts li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: var(--text-13);
		line-height: var(--lh-normal);
	}
	.facts :global(svg) {
		flex-shrink: 0;
		margin-top: 3px;
		color: var(--success);
	}
	.facts li:last-child :global(svg) {
		color: var(--saffron);
	}

	.meter-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
		flex-wrap: wrap;
	}
	.meter {
		flex: 1;
		min-width: 180px;
		height: 8px;
		border-radius: 4px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		overflow: hidden;
	}
	.meter-fill {
		display: block;
		height: 100%;
		background: var(--brand);
		transition: width var(--motion-slow) var(--ease-out);
	}
	.meter-fill.warn {
		background: var(--saffron);
	}
	.meter-fill.full {
		background: var(--danger);
	}
	.meter-text {
		font-size: var(--text-12);
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-6);
		margin: 0;
	}
	.counts > div {
		display: flex;
		flex-direction: column;
	}
	.counts dt {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}
	.counts dd {
		margin: 0;
		font-size: var(--text-20);
		font-weight: 600;
	}
	.storage-warning {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		background: var(--danger-tint);
		color: var(--text-primary);
		font-size: var(--text-13);
		line-height: var(--lh-normal);
	}
	.storage-warning :global(svg) {
		color: var(--danger);
		flex-shrink: 0;
		margin-top: 2px;
	}

	.due {
		border-color: color-mix(in srgb, var(--saffron) 40%, var(--border));
	}
	.backup-status {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3);
		margin-bottom: var(--space-3);
		border-radius: var(--radius-card);
		background: var(--surface-subtle);
	}
	.backup-status :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
		color: var(--success);
	}
	.due .backup-status :global(svg) {
		color: var(--saffron);
	}
	.bs-title {
		font-size: var(--text-14);
		font-weight: 500;
	}
	.bs-text {
		font-size: var(--text-12);
		color: var(--text-secondary);
		margin-top: 2px;
	}
	.backup-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: var(--space-2);
	}

	.nots {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.nots li {
		font-size: var(--text-13);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
		max-width: 80ch;
	}
	.nots strong {
		color: var(--text-primary);
		font-weight: 600;
	}

	.file-name {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		padding: var(--space-1) var(--space-2);
		background: var(--surface-subtle);
		border-radius: var(--radius-control);
		display: inline-block;
		margin-bottom: var(--space-3);
	}
	.import-summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: var(--space-3);
		margin: 0 0 var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
	}
	.import-summary > div {
		display: flex;
		flex-direction: column;
	}
	.import-summary dt {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}
	.import-summary dd {
		margin: 0;
		font-size: var(--text-16);
		font-weight: 600;
	}
	.migrate-note,
	.warn-note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		font-size: var(--text-12);
		line-height: var(--lh-normal);
		margin-bottom: var(--space-2);
	}
	.migrate-note {
		background: var(--info-tint);
	}
	.migrate-note :global(svg) {
		color: var(--info);
		flex-shrink: 0;
		margin-top: 2px;
	}
	.warn-note {
		background: var(--saffron-tint);
	}
	.warn-note :global(svg) {
		color: var(--saffron);
		flex-shrink: 0;
		margin-top: 1px;
	}

	.import-error {
		padding: var(--space-3);
		border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
		border-radius: var(--radius-card);
		background: var(--danger-tint);
	}
	.ie-title {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: var(--text-14);
		font-weight: 600;
	}
	.ie-title :global(svg) {
		color: var(--danger);
		flex-shrink: 0;
		margin-top: 1px;
	}
	.ie-detail {
		font-size: var(--text-13);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
		margin: var(--space-2) 0 var(--space-3);
	}
</style>
