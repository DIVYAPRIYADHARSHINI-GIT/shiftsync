<script lang="ts">
	// Reports: PDF, CSV, ICS and the plain text "Copy for WhatsApp" versions.
	// Everything is generated from the data in this browser. There is no email or push
	// sending because there is no server to send from.
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Select from '#lib/components/Select.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { app } from '#lib/state.svelte';
	import {
		copyText,
		exportPersonIcs,
		exportRosterCsv,
		exportRosterPdf,
		personWeekText,
		wholeWeekText
	} from '#lib/exporters.svelte';
	import { formatWeekRange, isoWeekLabel } from '#lib/logic/time';
	import { safeFileStem } from '#lib/logic/csv';

	let includePersonPages = $state(true);
	let personId = $state('');
	let busy = $state(false);
	let previewText = $state<{ title: string; body: string } | null>(null);

	const weekLabel = $derived(isoWeekLabel(app.currentWeek));
	const pdfName = $derived(`Roster_${safeFileStem(app.data.business.name)}_${weekLabel}.pdf`);
	const shiftCount = $derived(app.roster.shifts.filter((s) => s.staffId).length);

	async function doPdf() {
		busy = true;
		const result = await exportRosterPdf(includePersonPages);
		busy = false;
		if (result.ok) {
			app.toast('Roster PDF downloaded.', 'success');
			return;
		}
		if (result.fallbackToPrint) {
			// Tamil or Devanagari names: the browser's text shaper renders them correctly.
			app.toast(result.message ?? 'Opening the print view instead.', 'warning');
			window.open('/print', '_blank', 'noopener');
			return;
		}
		app.toast(result.message ?? 'The PDF could not be generated.', 'danger');
	}

	function showWholeWeek() {
		previewText = { title: 'Whole week as plain text', body: wholeWeekText() };
	}

	function showPersonWeek() {
		if (!personId) {
			app.toast('Choose a person first.', 'warning');
			return;
		}
		previewText = {
			title: `${app.staffById(personId)?.name ?? 'Person'} as plain text`,
			body: personWeekText(personId)
		};
	}
</script>

<PageHeader
	title="Reports"
	description="Export the roster for {formatWeekRange(app.currentWeek)} as a PDF, a spreadsheet, a calendar file, or plain text to paste into a message."
/>

<div class="grid">
	<section class="card card-pad">
		<header>
			<h2>
				<Icon name="print" size={18} />
				Weekly roster PDF
			</h2>
			<p>
				A clean landscape grid on one page with a legend, plus an optional per-person page list.
			</p>
		</header>
		<div class="body">
			<Toggle
				checked={includePersonPages}
				label="Include a per-person page list"
				onchange={(v) => (includePersonPages = v)}
			/>
			<p class="filename tnum">{pdfName}</p>
			<p class="script-note">
				<Icon name="info" size={14} />
				Staff names in Tamil or Hindi cannot be shaped correctly by the PDF generator. When the
				roster contains them, ShiftSync opens the print view instead, which uses the
				browser&rsquo;s own text shaper. Choose &ldquo;Save as PDF&rdquo; in the print dialog.
			</p>
		</div>
		<footer>
			<button type="button" class="btn btn-primary" disabled={busy} onclick={doPdf}>
				{#if busy}
					Preparing
				{:else}
					<Icon name="download" size={16} /> Download PDF
				{/if}
			</button>
			<a class="btn" href="/print" target="_blank" rel="noopener">
				<Icon name="print" size={16} /> Open print view
			</a>
		</footer>
	</section>

	<section class="card card-pad">
		<header>
			<h2>
				<Icon name="reports" size={18} />
				Spreadsheet (CSV)
			</h2>
			<p>
				Long format, one row per shift: date, shift, role, person, start, end and paid hours. The
				hours summary has its own export on the Hours summary page.
			</p>
		</header>
		<div class="body">
			<p class="stat tnum">
				{shiftCount} assigned shift{shiftCount === 1 ? '' : 's'} this week
			</p>
			<p class="help">
				Written with a UTF-8 byte order mark so Excel opens Tamil and Hindi names correctly.
			</p>
		</div>
		<footer>
			<button type="button" class="btn" onclick={exportRosterCsv}>
				<Icon name="download" size={16} /> Export roster CSV
			</button>
			<a class="btn" href="/hours">Hours summary CSV</a>
		</footer>
	</section>

	<section class="card card-pad">
		<header>
			<h2>
				<Icon name="calendar" size={18} />
				Calendar file (ICS)
			</h2>
			<p>
				One person&rsquo;s shifts as a calendar file to add to a phone. Times are written as UTC
				instants resolved through {app.data.business.timeZone}, so overnight shifts land correctly
				in any calendar app.
			</p>
		</header>
		<div class="body">
			<div class="field">
				<span class="label">Person</span>
				<Select
					value={personId}
					placeholder="Choose a person"
					ariaLabel="Person for the calendar file"
					options={app.activeStaff.map((s) => ({ value: s.id, label: s.name }))}
					onchange={(v) => (personId = v)}
				/>
			</div>
		</div>
		<footer>
			<button
				type="button"
				class="btn"
				disabled={!personId}
				onclick={() => exportPersonIcs(personId)}
			>
				<Icon name="download" size={16} /> Export calendar file
			</button>
		</footer>
	</section>

	<section class="card card-pad">
		<header>
			<h2>
				<Icon name="copy" size={18} />
				Copy for WhatsApp
			</h2>
			<p>
				A short plain text version you can paste into any message. ShiftSync cannot send messages
				itself: there is no server and no account behind it.
			</p>
		</header>
		<div class="body">
			<p class="help">
				Choose a person above for their week, or copy the whole week for the team group.
			</p>
		</div>
		<footer>
			<button type="button" class="btn" onclick={showWholeWeek}>Whole week</button>
			<button type="button" class="btn" disabled={!personId} onclick={showPersonWeek}>
				One person
			</button>
		</footer>
	</section>
</div>

<Dialog
	open={previewText !== null}
	wide
	title={previewText?.title ?? 'Plain text'}
	description="Check it reads well, then copy it to the clipboard."
	onclose={() => (previewText = null)}
>
	{#if previewText}
		<pre class="preview">{previewText.body}</pre>
	{/if}
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (previewText = null)}>Close</button>
		<button
			type="button"
			class="btn btn-primary"
			onclick={() => {
				if (previewText) copyText(previewText.body, 'Roster');
			}}
		>
			<Icon name="copy" size={16} /> Copy to clipboard
		</button>
	{/snippet}
</Dialog>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: var(--space-4);
	}
	section {
		display: flex;
		flex-direction: column;
	}
	header {
		margin-bottom: var(--space-3);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-16);
	}
	h2 :global(svg) {
		color: var(--brand);
	}
	header p {
		font-size: var(--text-13);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
		margin-top: var(--space-1);
	}
	.body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	.filename {
		font-size: var(--text-12);
		color: var(--text-tertiary);
		padding: var(--space-1) var(--space-2);
		background: var(--surface-subtle);
		border-radius: var(--radius-control);
		align-self: flex-start;
	}
	.script-note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		font-size: var(--text-12);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
	}
	.script-note :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
		color: var(--info);
	}
	.stat {
		font-size: var(--text-14);
		font-weight: 500;
	}
	footer {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.preview {
		margin: 0;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		background: var(--surface-subtle);
		font-family: inherit;
		font-size: var(--text-12);
		line-height: 1.6;
		white-space: pre-wrap;
		max-height: 50vh;
		overflow-y: auto;
	}
</style>
