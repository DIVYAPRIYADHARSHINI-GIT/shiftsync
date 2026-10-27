<script lang="ts">
	// Roster editor: the hero page. Three views, drag and drop with live validation,
	// a keyboard/touch alternative, bulk actions, undo/redo, the issues panel, the
	// inspector, the generate panel, publishing and snapshots.
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import StaffGrid from '#lib/components/StaffGrid.svelte';
	import ShiftGrid from '#lib/components/ShiftGrid.svelte';
	import CoverageView from '#lib/components/CoverageView.svelte';
	import Inspector from '#lib/components/Inspector.svelte';
	import IssuesPanel from '#lib/components/IssuesPanel.svelte';
	import GeneratePanel from '#lib/components/GeneratePanel.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Select from '#lib/components/Select.svelte';
	import DayList from '#lib/components/DayList.svelte';
	import { app } from '#lib/state.svelte';
	import type { DateStr, Issue, Shift } from '#lib/types';
	import {
		addShift,
		assignShift,
		bulkAssign,
		clearWeek,
		copyLastWeek,
		materialiseOpenSlots,
		moveShift,
		pasteShifts,
		removeShifts,
		setClosedDayOverride,
		setLocked,
		swapShifts
	} from '#lib/logic/editor';
	import { formatDate, formatWeekRange } from '#lib/logic/time';

	let selectedShiftId = $state<string | null>(null);
	let selectedCells = $state<string[]>([]);
	let announcement = $state('');
	let issuesOpen = $state(false);
	let generateOpen = $state(false);
	let actionsOpen = $state(false);
	let publishWarningOpen = $state(false);
	let clearConfirmOpen = $state(false);
	let snapshotsOpen = $state(false);
	let clipboard = $state<Shift[]>([]);
	let keyboardTarget = $state<'move' | 'swap' | null>(null);
	let isNarrow = $state(false);

	const view = $derived(page.url.searchParams.get('view') ?? 'staff');
	const selectedShift = $derived(app.roster.shifts.find((s) => s.id === selectedShiftId) ?? null);
	const published = $derived(app.roster.status === 'Published');

	// Open the generate panel whenever the top bar or the palette asks via ?generate=1.
	// The parameter is cleared straight afterwards so the next request re-triggers this,
	// and so reloading the page does not reopen the panel unexpectedly.
	$effect(() => {
		if (page.url.searchParams.get('generate') !== '1') return;
		generateOpen = true;
		const params = new URLSearchParams(page.url.search);
		params.delete('generate');
		const query = params.toString();
		goto(`${page.url.pathname}${query ? `?${query}` : ''}`, { replaceState: true });
	});

	$effect(() => {
		const mq = window.matchMedia('(max-width: 767px)');
		const update = () => (isNarrow = mq.matches);
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	});

	function announce(message: string) {
		announcement = message;
	}

	function edit(label: string, next: Shift[], message?: string) {
		app.setShifts(label, next);
		if (message) announce(message);
	}

	function handleMove(shiftId: string, staffId: string | null, date: DateStr) {
		edit('Move shift', moveShift(app.roster.shifts, shiftId, staffId, date));
	}

	function handleSwap(aId: string, bId: string) {
		edit('Swap shifts', swapShifts(app.roster.shifts, aId, bId));
	}

	function handleAssign(shiftId: string, staffId: string | null) {
		edit(
			staffId ? 'Assign shift' : 'Open slot',
			assignShift(app.roster.shifts, shiftId, staffId),
			staffId
				? `Assigned to ${app.staffById(staffId)?.name ?? 'person'}.`
				: 'Shift is now an open slot.'
		);
	}

	function handleAddForStaff(date: DateStr, staffId: string) {
		const template = app.data.templates[0];
		if (!template) {
			app.toast('Add a shift template first in Shifts and coverage.', 'warning');
			return;
		}
		const person = app.staffById(staffId);
		const role = person?.roles[0] ?? app.roles[0] ?? 'Staff';
		const next = addShift(app.roster.shifts, date, template.id, role, staffId);
		edit('Add shift', next);
		selectedShiftId = next[next.length - 1].id;
	}

	function handleAddSlot(date: DateStr, templateId: string, role: string) {
		const next = addShift(app.roster.shifts, date, templateId, role, null);
		edit('Add open slot', next);
		selectedShiftId = next[next.length - 1].id;
	}

	function handleRemove(shiftId: string) {
		const before = $state.snapshot(app.roster.shifts) as Shift[];
		edit('Remove shift', removeShifts(app.roster.shifts, [shiftId]));
		selectedShiftId = null;
		app.toast('Shift removed.', 'info', () => app.setShifts('Restore shift', before));
	}

	function toggleLock(shiftId: string) {
		const shift = app.roster.shifts.find((s) => s.id === shiftId);
		edit(
			shift?.locked ? 'Unlock shift' : 'Lock shift',
			setLocked(app.roster.shifts, [shiftId], !shift?.locked),
			shift?.locked ? 'Shift unlocked.' : 'Shift locked. The generator will keep it.'
		);
	}

	function toggleOverride(shiftId: string) {
		const shift = app.roster.shifts.find((s) => s.id === shiftId);
		edit(
			'Change closed-day override',
			setClosedDayOverride(app.roster.shifts, [shiftId], !shift?.closedDayOverride)
		);
	}

	function changeTemplate(shiftId: string, templateId: string) {
		edit(
			'Change shift template',
			app.roster.shifts.map((s) => (s.id === shiftId ? { ...s, templateId } : s))
		);
	}

	function changeRole(shiftId: string, role: string) {
		edit(
			'Change role',
			app.roster.shifts.map((s) => (s.id === shiftId ? { ...s, role } : s))
		);
	}

	// --- Week-level actions ---------------------------------------------------

	function doCopyLastWeek() {
		const previous = app.previousWeekShifts;
		if (previous.length === 0) {
			app.toast('The previous week has no shifts to copy.', 'warning');
			actionsOpen = false;
			return;
		}
		edit(
			'Copy last week',
			copyLastWeek(
				$state.snapshot(app.roster.shifts) as Shift[],
				$state.snapshot(previous) as Shift[],
				$state.snapshot(app.data.business)
			),
			`Copied ${previous.length} shifts from the previous week.`
		);
		actionsOpen = false;
	}

	function doClearWeek() {
		const lockedCount = app.roster.shifts.filter((s) => s.locked).length;
		edit('Clear week', clearWeek(app.roster.shifts));
		selectedShiftId = null;
		clearConfirmOpen = false;
		app.toast(
			lockedCount
				? `Week cleared. ${lockedCount} locked shift${lockedCount === 1 ? '' : 's'} kept.`
				: 'Week cleared.',
			'info'
		);
	}

	function doFillOpenSlots() {
		edit(
			'Add open slots',
			materialiseOpenSlots(
				$state.snapshot(app.roster.shifts) as Shift[],
				$state.snapshot(app.data.coverage),
				$state.snapshot(app.data.templates),
				app.currentWeek,
				$state.snapshot(app.data.business)
			),
			'Open slots added for every coverage need.'
		);
		actionsOpen = false;
	}

	function cellMatches(shift: Shift): boolean {
		return selectedCells.some((key) => {
			const [staffId, date] = key.split('|');
			return shift.staffId === staffId && shift.date === date;
		});
	}

	function doCopySelection() {
		const shifts = app.roster.shifts.filter((s) => cellMatches(s));
		if (shifts.length === 0) {
			app.toast('Select one or more cells first.', 'warning');
			return;
		}
		clipboard = $state.snapshot(shifts) as Shift[];
		app.toast(`Copied ${shifts.length} shift${shifts.length === 1 ? '' : 's'}.`, 'success');
	}

	function doPasteInto(date: DateStr, staffId: string | null) {
		if (clipboard.length === 0) {
			app.toast('Nothing has been copied yet.', 'warning');
			return;
		}
		edit(
			'Paste shifts',
			pasteShifts(app.roster.shifts, clipboard, date, staffId),
			`Pasted ${clipboard.length} shift${clipboard.length === 1 ? '' : 's'}.`
		);
	}

	function doPasteToSelection() {
		if (selectedCells.length === 0) {
			app.toast('Select a cell to paste into.', 'warning');
			return;
		}
		const [staffId, date] = selectedCells[0].split('|');
		doPasteInto(date, staffId);
	}

	function doBulkDelete() {
		const ids = app.roster.shifts.filter((s) => cellMatches(s)).map((s) => s.id);
		if (ids.length === 0) return;
		const before = $state.snapshot(app.roster.shifts) as Shift[];
		edit('Delete selected shifts', removeShifts(app.roster.shifts, ids));
		selectedCells = [];
		app.toast(`Deleted ${ids.length} shift${ids.length === 1 ? '' : 's'}.`, 'info', () =>
			app.setShifts('Restore shifts', before)
		);
	}

	function doBulkAssign(staffId: string) {
		const ids = app.roster.shifts.filter((s) => cellMatches(s)).map((s) => s.id);
		if (ids.length === 0) {
			app.toast('The selected cells have no shifts to assign.', 'warning');
			return;
		}
		edit(
			'Bulk assign',
			bulkAssign(app.roster.shifts, ids, staffId),
			`Assigned ${ids.length} shifts to ${app.staffById(staffId)?.name ?? 'person'}.`
		);
		selectedCells = [];
	}

	function publish() {
		app.commit('Publish roster', (d) => {
			const roster = app.ensureRoster(d, app.currentWeek);
			roster.status = 'Published';
			roster.publishedAt = new Date().toISOString();
		});
		app.toast('Roster published.', 'success');
		actionsOpen = false;
	}

	function unpublish() {
		app.commit('Return roster to draft', (d) => {
			const roster = app.ensureRoster(d, app.currentWeek);
			roster.status = 'Draft';
		});
		publishWarningOpen = false;
		app.toast('Roster returned to draft. You can edit it freely.', 'info');
	}

	function saveSnapshot() {
		const label = `Saved ${formatDate(app.today)} at ${new Date().toTimeString().slice(0, 5)}`;
		app.commit('Save snapshot', (d) => {
			const roster = app.ensureRoster(d, app.currentWeek);
			roster.snapshots = [
				...roster.snapshots,
				{
					id: `snap-${Date.now().toString(36)}`,
					createdAt: new Date().toISOString(),
					label,
					shifts: structuredClone($state.snapshot(roster.shifts)) as Shift[]
				}
			].slice(-10);
		});
		app.toast('Snapshot saved.', 'success');
	}

	function restoreSnapshot(id: string) {
		const snapshot = app.roster.snapshots.find((s) => s.id === id);
		if (!snapshot) return;
		edit('Restore snapshot', structuredClone($state.snapshot(snapshot.shifts)) as Shift[]);
		snapshotsOpen = false;
		app.toast(`Restored "${snapshot.label}".`, 'success');
	}

	function jumpToIssue(issue: Issue) {
		if (issue.shiftId) {
			selectedShiftId = issue.shiftId;
			announce(`Selected the shift for: ${issue.message}`);
		} else if (issue.date) {
			announce(`Issue on ${formatDate(issue.date)}: ${issue.message}`);
		}
	}

	// --- Keyboard and touch alternative to drag and drop -----------------------

	function keyboardMove(staffId: string) {
		if (!selectedShiftId || !selectedShift) return;
		handleMove(selectedShiftId, staffId, selectedShift.date);
		announce(`Moved to ${app.staffById(staffId)?.name ?? 'person'}.`);
		keyboardTarget = null;
	}

	function keyboardSwap(otherShiftId: string) {
		if (!selectedShiftId) return;
		handleSwap(selectedShiftId, otherShiftId);
		announce('Shifts swapped.');
		keyboardTarget = null;
	}

	const swapCandidates = $derived(
		selectedShift ? app.roster.shifts.filter((s) => s.id !== selectedShift.id && s.staffId) : []
	);

	function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		const meta = event.metaKey || event.ctrlKey;
		if (meta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
			event.preventDefault();
			app.undo();
			announce('Undone.');
		} else if (
			meta &&
			(event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))
		) {
			event.preventDefault();
			app.redo();
			announce('Redone.');
		} else if (meta && event.key.toLowerCase() === 'c') {
			doCopySelection();
		} else if (meta && event.key.toLowerCase() === 'v') {
			doPasteToSelection();
		} else if (event.key === 'Delete' || event.key === 'Backspace') {
			if (selectedShiftId) {
				event.preventDefault();
				handleRemove(selectedShiftId);
			} else if (selectedCells.length) {
				event.preventDefault();
				doBulkDelete();
			}
		} else if (event.key === 'Escape') {
			selectedShiftId = null;
			selectedCells = [];
			keyboardTarget = null;
		} else if (event.key.toLowerCase() === 'l' && selectedShiftId) {
			toggleLock(selectedShiftId);
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if !app.loaded}
	<div class="skeleton-page">
		<div class="skeleton toolbar-skel"></div>
		<div class="skeleton grid-skel"></div>
	</div>
{:else}
	<div class="roster-page">
		{#if published}
			<div class="publish-banner" role="status">
				<Icon name="success" size={16} />
				<p>
					This roster is published for {formatWeekRange(app.currentWeek)}. Changes you make now
					revise a roster your staff have already seen.
				</p>
				<button type="button" class="btn btn-sm" onclick={() => (publishWarningOpen = true)}>
					Return to draft
				</button>
			</div>
		{/if}

		<div class="toolbar">
			<!-- Phone-only: the status pill the top bar drops at narrow widths. -->
			<span
				class="pill mobile-only"
				class:pill-success={published}
				class:pill-info={!published}
			>
				<Icon name={published ? 'success' : 'edit'} size={13} />
				{app.roster.status}
			</span>

			<div class="counts">
				{#if app.errors.length}
					<button type="button" class="pill pill-danger as-button" onclick={() => (issuesOpen = true)}>
						<Icon name="error" size={14} />
						<span class="tnum">{app.errors.length}</span>
						error{app.errors.length === 1 ? '' : 's'}
					</button>
				{/if}
				{#if app.warnings.length}
					<button type="button" class="pill pill-warn as-button" onclick={() => (issuesOpen = true)}>
						<Icon name="warning" size={14} />
						<span class="tnum">{app.warnings.length}</span>
						warning{app.warnings.length === 1 ? '' : 's'}
					</button>
				{/if}
				{#if !app.errors.length && !app.warnings.length}
					<span class="pill pill-success">
						<Icon name="success" size={14} />
						No issues
					</span>
				{/if}
			</div>

			{#if selectedCells.length > 0}
				<div class="bulk" role="group" aria-label="Bulk actions">
					<span class="bulk-count tnum">{selectedCells.length} selected</span>
					<div class="bulk-assign">
						<Select
							value=""
							small
							fullWidth={false}
							placeholder="Assign to"
							ariaLabel="Assign selected cells to a person"
							options={app.activeStaff.map((s) => ({ value: s.id, label: s.name }))}
							onchange={(v) => v && doBulkAssign(v)}
						/>
					</div>
					<button type="button" class="btn btn-sm" onclick={doCopySelection}>
						<Icon name="copy" size={14} /> Copy
					</button>
					<button type="button" class="btn btn-sm" onclick={doPasteToSelection} disabled={clipboard.length === 0}>
						Paste
					</button>
					<button type="button" class="btn btn-sm btn-danger" onclick={doBulkDelete}>
						<Icon name="trash" size={14} /> Delete
					</button>
					<button type="button" class="btn btn-quiet btn-sm" onclick={() => (selectedCells = [])}>
						Clear
					</button>
				</div>
			{/if}

			<div class="spacer"></div>

			<button
				type="button"
				class="btn btn-sm"
				disabled={app.undoDepth === 0}
				aria-keyshortcuts="Control+Z"
				onclick={() => {
					app.undo();
					announce('Undone.');
				}}
			>
				<Icon name="undo" size={14} />
				<span class="hide-sm">Undo</span>
			</button>
			<button
				type="button"
				class="btn btn-sm"
				disabled={app.redoDepth === 0}
				onclick={() => {
					app.redo();
					announce('Redone.');
				}}
			>
				<Icon name="redo" size={14} />
				<span class="hide-sm">Redo</span>
			</button>
			<button type="button" class="btn btn-sm" aria-pressed={issuesOpen} onclick={() => (issuesOpen = !issuesOpen)}>
				<Icon name="alert" size={14} />
				<span class="hide-sm">Issues</span>
			</button>
			<button type="button" class="btn btn-sm" onclick={() => (actionsOpen = true)}>
				<Icon name="more" size={14} />
				<span class="hide-sm">Week actions</span>
			</button>
		</div>

		<div class="work-area">
			<div class="grid-area">
				{#if view === 'coverage'}
					<CoverageView />
				{:else if isNarrow}
					<DayList
						{selectedShiftId}
						onselectShift={(id) => (selectedShiftId = id)}
						onassign={handleAssign}
						onremove={handleRemove}
						onaddShift={handleAddForStaff}
					/>
				{:else if view === 'shift'}
					<ShiftGrid
						{selectedShiftId}
						onselectShift={(id) => (selectedShiftId = id)}
						onaddSlot={handleAddSlot}
						onmoveShift={handleMove}
						onannounce={announce}
					/>
				{:else}
					<StaffGrid
						{selectedShiftId}
						{selectedCells}
						onselectShift={(id) => (selectedShiftId = id)}
						onselectCells={(keys) => (selectedCells = keys)}
						onaddShift={handleAddForStaff}
						onmoveShift={handleMove}
						onswapShifts={handleSwap}
						onannounce={announce}
					/>
				{/if}

				{#if selectedShift && view !== 'coverage'}
					<div class="keyboard-actions" role="group" aria-label="Actions for the selected shift">
						<span class="ka-label">Selected shift</span>
						<button type="button" class="btn btn-sm" onclick={() => (keyboardTarget = 'move')}>
							Move to
						</button>
						<button type="button" class="btn btn-sm" onclick={() => (keyboardTarget = 'swap')}>
							Swap with
						</button>
						<button type="button" class="btn btn-sm" onclick={() => toggleLock(selectedShift.id)}>
							<Icon name={selectedShift.locked ? 'unlock' : 'lock'} size={14} />
							{selectedShift.locked ? 'Unlock' : 'Lock'}
						</button>
						<button type="button" class="btn btn-sm btn-danger" onclick={() => handleRemove(selectedShift.id)}>
							Remove
						</button>
					</div>
				{/if}
			</div>

			{#if selectedShiftId && view !== 'coverage'}
				<Inspector
					shiftId={selectedShiftId}
					onclose={() => (selectedShiftId = null)}
					onassign={handleAssign}
					onremove={handleRemove}
					ontoggleLock={toggleLock}
					ontoggleOverride={toggleOverride}
					onchangeTemplate={changeTemplate}
					onchangeRole={changeRole}
				/>
			{/if}

			<IssuesPanel open={issuesOpen} onclose={() => (issuesOpen = false)} onjump={jumpToIssue} />
		</div>

		<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
	</div>

	<GeneratePanel open={generateOpen} onclose={() => (generateOpen = false)} />

	<Dialog
		open={keyboardTarget !== null}
		title={keyboardTarget === 'move' ? 'Move shift to' : 'Swap shift with'}
		description={keyboardTarget === 'move'
			? 'Choose the person who should take this shift.'
			: 'Choose the shift to exchange people with.'}
		onclose={() => (keyboardTarget = null)}
	>
		{#if keyboardTarget === 'move'}
			<ul class="choice-list">
				{#each app.activeStaff as person (person.id)}
					<li>
						<button type="button" onclick={() => keyboardMove(person.id)}>
							<span>{person.name}</span>
							<span class="choice-sub">{person.roles.join(', ')}</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else if keyboardTarget === 'swap'}
			<ul class="choice-list">
				{#each swapCandidates as candidate (candidate.id)}
					{@const t = app.templateById(candidate.templateId)}
					<li>
						<button type="button" onclick={() => keyboardSwap(candidate.id)}>
							<span>{app.staffById(candidate.staffId)?.name ?? 'Open slot'}</span>
							<span class="choice-sub tnum">{t?.name} &middot; {formatDate(candidate.date)}</span>
						</button>
					</li>
				{:else}
					<li class="choice-empty">There are no other assigned shifts this week.</li>
				{/each}
			</ul>
		{/if}
	</Dialog>

	<Dialog open={actionsOpen} title="Week actions" onclose={() => (actionsOpen = false)}>
		<ul class="action-list">
			<li>
				<button type="button" onclick={doCopyLastWeek}>
					<Icon name="copy" size={18} />
					<span>
						<span class="al-title">Copy last week</span>
						<span class="al-sub">Bring every shift forward seven days. Locked shifts are kept.</span>
					</span>
				</button>
			</li>
			<li>
				<button type="button" onclick={doFillOpenSlots}>
					<Icon name="plus" size={18} />
					<span>
						<span class="al-title">Add open slots</span>
						<span class="al-sub">Create a dashed card for every coverage need not yet met.</span>
					</span>
				</button>
			</li>
			<li>
				<button
					type="button"
					onclick={() => {
						saveSnapshot();
						actionsOpen = false;
					}}
				>
					<Icon name="history" size={18} />
					<span>
						<span class="al-title">Save a snapshot</span>
						<span class="al-sub">Keep a copy of this week that you can restore later.</span>
					</span>
				</button>
			</li>
			<li>
				<button
					type="button"
					onclick={() => {
						snapshotsOpen = true;
						actionsOpen = false;
					}}
				>
					<Icon name="list" size={18} />
					<span>
						<span class="al-title">Version history</span>
						<span class="al-sub">
							{app.roster.snapshots.length} snapshot{app.roster.snapshots.length === 1 ? '' : 's'}
							saved for this week.
						</span>
					</span>
				</button>
			</li>
			{#if published}
				<li>
					<button
						type="button"
						onclick={() => {
							publishWarningOpen = true;
							actionsOpen = false;
						}}
					>
						<Icon name="edit" size={18} />
						<span>
							<span class="al-title">Return to draft</span>
							<span class="al-sub">Unpublish so the roster can be edited without a warning.</span>
						</span>
					</button>
				</li>
			{:else}
				<li>
					<button type="button" onclick={publish}>
						<Icon name="publish" size={18} />
						<span>
							<span class="al-title">Publish roster</span>
							<span class="al-sub">Mark this week as final. You can still edit it afterwards.</span>
						</span>
					</button>
				</li>
			{/if}
			<li>
				<button
					type="button"
					class="danger"
					onclick={() => {
						clearConfirmOpen = true;
						actionsOpen = false;
					}}
				>
					<Icon name="trash" size={18} />
					<span>
						<span class="al-title">Clear week</span>
						<span class="al-sub">Remove every shift except the locked ones.</span>
					</span>
				</button>
			</li>
		</ul>
	</Dialog>

	<Dialog
		open={clearConfirmOpen}
		title="Clear this week?"
		description="Every shift for {formatWeekRange(app.currentWeek)} will be removed. You can undo this straight afterwards."
		onclose={() => (clearConfirmOpen = false)}
	>
		<p class="confirm-text">
			{app.roster.shifts.filter((s) => !s.locked).length} shifts will be removed and
			{app.roster.shifts.filter((s) => s.locked).length} locked shifts will be kept.
		</p>
		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (clearConfirmOpen = false)}>Cancel</button>
			<button type="button" class="btn btn-danger" onclick={doClearWeek}>Clear week</button>
		{/snippet}
	</Dialog>

	<Dialog
		open={publishWarningOpen}
		title="This roster is published"
		description="Staff may already be working to these shifts. Return it to draft before making changes so it is clear the roster is being revised."
		onclose={() => (publishWarningOpen = false)}
	>
		<p class="confirm-text">
			You can also edit a published roster directly. Publishing again after your changes makes the
			new version final.
		</p>
		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (publishWarningOpen = false)}>
				Keep published
			</button>
			<button type="button" class="btn btn-primary" onclick={unpublish}>Return to draft</button>
		{/snippet}
	</Dialog>

	<Dialog
		open={snapshotsOpen}
		title="Version history"
		description="Snapshots of this week that you can restore."
		onclose={() => (snapshotsOpen = false)}
	>
		{#if app.roster.snapshots.length === 0}
			<div class="empty-state">
				<Icon name="history" size={24} />
				<p>No snapshots yet for this week.</p>
				<button type="button" class="btn btn-primary" onclick={saveSnapshot}>
					Save a snapshot now
				</button>
			</div>
		{:else}
			<ul class="snapshot-list">
				{#each [...app.roster.snapshots].reverse() as snapshot (snapshot.id)}
					<li>
						<span class="snap-text">
							<span class="snap-label">{snapshot.label}</span>
							<span class="snap-sub tnum">
								{snapshot.shifts.length} shifts &middot;
								{snapshot.createdAt.slice(0, 10)}
							</span>
						</span>
						<button type="button" class="btn btn-sm" onclick={() => restoreSnapshot(snapshot.id)}>
							Restore
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</Dialog>
{/if}

<style>
	.roster-page {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.publish-banner {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: var(--success-tint);
		border-bottom: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
		font-size: var(--text-13);
		flex-shrink: 0;
	}
	.publish-banner :global(svg) {
		color: var(--success);
		flex-shrink: 0;
	}
	.publish-banner p {
		flex: 1;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		flex-shrink: 0;
		flex-wrap: wrap;
	}
	.counts {
		display: flex;
		gap: var(--space-2);
	}
	.as-button {
		cursor: pointer;
		font-family: inherit;
	}
	.as-button:hover {
		filter: brightness(0.97);
	}
	.spacer {
		flex: 1;
	}
	.bulk {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-left: var(--space-3);
		margin-left: var(--space-1);
		border-left: 1px solid var(--border);
	}
	.bulk-count {
		font-size: var(--text-12);
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.bulk-assign {
		width: 140px;
	}

	.work-area {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.grid-area {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.keyboard-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border-top: 1px solid var(--border);
		background: var(--surface-subtle);
		flex-shrink: 0;
		flex-wrap: wrap;
	}
	.ka-label {
		font-size: var(--text-12);
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.choice-list,
	.action-list,
	.snapshot-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.choice-list button,
	.action-list button {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: 44px;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text-primary);
		font-family: inherit;
		font-size: var(--text-14);
		text-align: left;
		cursor: pointer;
		transition:
			border-color var(--motion-fast) var(--ease-out),
			background var(--motion-fast) var(--ease-out);
	}
	.choice-list button:hover,
	.action-list button:hover {
		border-color: var(--brand);
		background: var(--brand-tint);
	}
	.choice-list button {
		justify-content: space-between;
	}
	.choice-sub,
	.al-sub,
	.snap-sub {
		font-size: var(--text-12);
		color: var(--text-tertiary);
	}
	.action-list button > span:last-child {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.al-title {
		font-weight: 500;
	}
	.action-list button.danger:hover {
		border-color: var(--danger);
		background: var(--danger-tint);
	}
	.choice-empty {
		padding: var(--space-4);
		text-align: center;
		color: var(--text-tertiary);
		font-size: var(--text-13);
	}
	.snapshot-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
	}
	.snap-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.snap-label {
		font-size: var(--text-13);
		font-weight: 500;
	}
	.confirm-text {
		font-size: var(--text-13);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
	}

	.skeleton-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		flex: 1;
	}
	.toolbar-skel {
		height: 36px;
	}
	.grid-skel {
		flex: 1;
		min-height: 300px;
	}

	.mobile-only {
		display: none;
	}

	@media (max-width: 900px) {
		.hide-sm {
			/* Visually hidden, still the button’s accessible name. */
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
		}
		.bulk {
			width: 100%;
			border-left: none;
			padding-left: 0;
			margin-left: 0;
			flex-wrap: wrap;
		}
	}

	@media (max-width: 767px) {
		.mobile-only {
			display: inline-flex;
		}
		/* Keep the whole toolbar on one line at phone widths: the status pill and issue
		   counts shrink, and the icon-only buttons stay pinned to the right. */
		.toolbar {
			flex-wrap: nowrap;
			gap: var(--space-1);
			padding: var(--space-2) var(--space-3);
		}
		.counts {
			min-width: 0;
			gap: var(--space-1);
		}
		.counts .pill,
		.mobile-only {
			min-width: 0;
			overflow: hidden;
		}
	}
</style>
