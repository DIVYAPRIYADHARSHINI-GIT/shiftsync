<script lang="ts">
	// Right-hand inspector: shift details, validation results, eligible people ranked by
	// fit, and quick actions. Becomes a bottom sheet on mobile.
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';
	import Toggle from './Toggle.svelte';
	import { app } from '../state.svelte';
	import { rankReplacements } from '../logic/generator';
	import { formatDate, formatDuration, formatTime, toHours, weekdayName, weekdayOf } from '../logic/time';
	import { closedDayFor, resolveShift, shiftLabel } from '../logic/validate';
	import { contrastOn, initials } from './controls.svelte';

	interface Props {
		shiftId: string | null;
		onclose: () => void;
		onassign: (shiftId: string, staffId: string | null) => void;
		onremove: (shiftId: string) => void;
		ontoggleLock: (shiftId: string) => void;
		ontoggleOverride: (shiftId: string) => void;
		onchangeTemplate: (shiftId: string, templateId: string) => void;
		onchangeRole: (shiftId: string, role: string) => void;
	}

	let {
		shiftId,
		onclose,
		onassign,
		onremove,
		ontoggleLock,
		ontoggleOverride,
		onchangeTemplate,
		onchangeRole
	}: Props = $props();

	const shift = $derived(app.roster.shifts.find((s) => s.id === shiftId) ?? null);
	const template = $derived(shift ? app.templateById(shift.templateId) : undefined);
	const resolved = $derived(
		shift && template
			? resolveShift($state.snapshot(shift), $state.snapshot(app.data.templates), app.data.business.timeZone)
			: null
	);
	const issues = $derived(shiftId ? app.issuesForShift(shiftId) : []);
	const person = $derived(app.staffById(shift?.staffId));
	const closed = $derived(shift ? closedDayFor(app.data.business, shift.date) : undefined);

	/** Eligible people ranked by fit. Recomputed only while a shift is selected. */
	const candidates = $derived.by(() => {
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
			existing: $state.snapshot(app.roster.shifts),
			lockedStaffIds: [],
			lockedDates: []
		}).slice(0, 8);
	});
</script>

{#if shift && template}
	<aside class="inspector" aria-label="Shift details">
		<header>
			<div class="head-titles">
				<h2>{template.name}</h2>
				<p class="when tnum">
					{weekdayName(weekdayOf(shift.date))}
					{formatDate(shift.date)}
					&middot;
					{formatTime(template.startMin)}&ndash;{formatTime(template.endMin)}
					{#if template.endMin <= template.startMin}<span class="next-day">ends next day</span>{/if}
				</p>
			</div>
			<button type="button" class="btn btn-quiet btn-icon btn-sm" aria-label="Close details" onclick={onclose}>
				<Icon name="close" size={16} />
			</button>
		</header>

		<div class="body">
			<section>
				<dl class="facts">
					<div>
						<dt>Paid hours</dt>
						<dd class="tnum">{resolved ? formatDuration(resolved.paidMinutes) : '-'}</dd>
					</div>
					<div>
						<dt>Unpaid break</dt>
						<dd class="tnum">{template.unpaidBreakMin} min</dd>
					</div>
					<div>
						<dt>Assigned to</dt>
						<dd>{person?.name ?? 'Open slot'}</dd>
					</div>
				</dl>
			</section>

			<section>
				<div class="field">
					<label class="label" for="insp-person">Person</label>
					<Select
						id="insp-person"
						value={shift.staffId ?? ''}
						options={[
							{ value: '', label: 'Open slot' },
							...app.data.staff
								.filter((s) => s.active)
								.map((s) => ({
									value: s.id,
									label: s.name,
									description: s.roles.includes(shift.role) ? undefined : `not a ${shift.role}`
								}))
						]}
						onchange={(v) => onassign(shift.id, v || null)}
					/>
				</div>

				<div class="two">
					<div class="field">
						<label class="label" for="insp-template">Shift</label>
						<Select
							id="insp-template"
							value={shift.templateId}
							options={app.data.templates.map((t) => ({ value: t.id, label: shiftLabel(t) }))}
							onchange={(v) => onchangeTemplate(shift.id, v)}
						/>
					</div>
					<div class="field">
						<label class="label" for="insp-role">Role</label>
						<Select
							id="insp-role"
							value={shift.role}
							options={app.roles.map((r) => ({ value: r, label: r }))}
							onchange={(v) => onchangeRole(shift.id, v)}
						/>
					</div>
				</div>

				<div class="switches">
					<Toggle
						checked={shift.locked}
						label="Lock this shift"
						onchange={() => ontoggleLock(shift.id)}
					/>
					{#if closed}
						<Toggle
							checked={shift.closedDayOverride === true}
							label="Allow on closed day ({closed.name})"
							onchange={() => ontoggleOverride(shift.id)}
						/>
					{/if}
				</div>
			</section>

			<section>
				<h3>Validation</h3>
				{#if issues.length === 0}
					<p class="clean">
						<Icon name="success" size={16} />
						No rule issues for this shift.
					</p>
				{:else}
					<ul class="issues">
						{#each issues as issue (issue.message)}
							<li class:error={issue.severity === 'Error'}>
								<Icon name={issue.severity === 'Error' ? 'error' : 'warning'} size={16} />
								<div>
									<p class="issue-msg">{issue.message}</p>
									<p class="issue-fix">{issue.suggestedFix}</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section>
				<h3>Eligible people, best fit first</h3>
				<ul class="candidates">
					{#each candidates as candidate (candidate.staffId)}
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
										{candidate.warnings} warning{candidate.warnings === 1 ? '' : 's'}
									</span>
								{:else}
									<span class="cand-reason ok">No rule issues</span>
								{/if}
							</span>
							<button
								type="button"
								class="btn btn-sm"
								disabled={!!candidate.blocked}
								onclick={() => onassign(shift.id, candidate.staffId)}
							>
								Assign
							</button>
						</li>
					{/each}
				</ul>
			</section>
		</div>

		<footer>
			<button type="button" class="btn btn-sm" onclick={() => onassign(shift.id, null)}>
				<Icon name="person" size={14} /> Make open
			</button>
			<button type="button" class="btn btn-sm btn-danger" onclick={() => onremove(shift.id)}>
				<Icon name="trash" size={14} /> Remove shift
			</button>
		</footer>
	</aside>
{/if}

<style>
	.inspector {
		display: flex;
		flex-direction: column;
		width: 320px;
		flex-shrink: 0;
		height: 100%;
		background: var(--surface);
		border-left: 1px solid var(--border);
		animation: slide var(--motion-slow) var(--ease-out);
	}
	@keyframes slide {
		from {
			opacity: 0;
			transform: translateX(8px);
		}
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.head-titles h2 {
		font-size: var(--text-16);
	}
	.when {
		font-size: var(--text-12);
		color: var(--text-secondary);
		margin-top: 2px;
	}
	.next-day {
		color: var(--text-tertiary);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	h3 {
		font-size: var(--text-13);
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.facts {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
	}
	.facts > div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		font-size: var(--text-13);
	}
	.facts dt {
		color: var(--text-tertiary);
	}
	.facts dd {
		margin: 0;
		font-weight: 500;
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}
	.switches {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.clean {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-13);
		color: var(--success);
	}
	.issues,
	.candidates {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.issues li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-2);
		border-radius: var(--radius-control);
		background: var(--saffron-tint);
		font-size: var(--text-12);
		line-height: var(--lh-normal);
	}
	.issues li :global(svg) {
		color: var(--saffron);
		flex-shrink: 0;
		margin-top: 1px;
	}
	.issues li.error {
		background: var(--danger-tint);
	}
	.issues li.error :global(svg) {
		color: var(--danger);
	}
	.issue-msg {
		font-weight: 500;
		color: var(--text-primary);
	}
	.issue-fix {
		color: var(--text-secondary);
		margin-top: 2px;
	}

	.candidates li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
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
	.cand-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.cand-name {
		font-size: var(--text-13);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cand-reason {
		font-size: var(--text-12);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	footer {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--border);
		background: var(--surface-subtle);
	}
	footer .btn {
		flex: 1;
	}

	@media (max-width: 900px) {
		.inspector {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			max-height: 72vh;
			border-left: none;
			border-top: 1px solid var(--border);
			border-radius: var(--radius-card) var(--radius-card) 0 0;
			box-shadow: var(--shadow-popover);
			z-index: 60;
			animation: rise var(--motion-slow) var(--ease-out);
		}
		@keyframes rise {
			from {
				transform: translateY(12px);
				opacity: 0;
			}
		}
	}
</style>
