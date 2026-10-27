<script lang="ts">
	// About: what ShiftSync is, what it is not, how the rules engine and generator work,
	// and their honest limits.
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { DEFAULT_RULES } from '#lib/logic/rules';
	import { HARD_RULE_IDS } from '#lib/logic/rules';

	const hard = DEFAULT_RULES.filter((r) => HARD_RULE_IDS.includes(r.id));
	const soft = DEFAULT_RULES.filter((r) => !HARD_RULE_IDS.includes(r.id));
</script>

<PageHeader title="About ShiftSync" description="Plan shifts. Keep it fair." />

<div class="sections">
	<section class="card card-pad">
		<h2>What this is</h2>
		<p>
			ShiftSync is a free staff roster planner for one manager. You add your staff, shift
			templates, coverage needs and rules; it builds a weekly roster, highlights every rule
			violation and understaffed shift, and lets you fix things by dragging shifts around with
			live validation.
		</p>
	</section>

	<section class="card card-pad warn-card">
		<h2>
			<Icon name="info" size={18} />
			This is a single-manager tool
		</h2>
		<p>
			<strong>There is no login and no staff portal in this version.</strong> Everything happens in
			one browser, on one device, for one person: the manager. Staff cannot sign in, cannot see
			their shifts in the app, and cannot request swaps or leave themselves. You record those
			requests on their behalf on the Leave and Swaps pages.
		</p>
		<p>
			To share a roster, use the exports on the Reports page: a PDF, a spreadsheet, a per-person
			calendar file, or a short plain text version to paste into a message. ShiftSync cannot send
			email, SMS or push notifications, because it has no server to send them from.
		</p>
	</section>

	<section class="card card-pad">
		<h2>Where your data lives</h2>
		<p>
			All data is stored only in this browser&rsquo;s localStorage. Nothing is uploaded, and there
			is no database, no cloud storage and no account. The only request to a server is the PDF
			export, which renders one page and stores nothing.
		</p>
		<p>
			That means clearing your browser data, switching browser or using private browsing will lose
			the roster. Export a backup regularly from
			<a href="/privacy">Privacy and backup</a>; ShiftSync reminds you after seven days.
		</p>
	</section>

	<section class="card card-pad">
		<h2>How the rules engine works</h2>
		<p>
			One pure function, <code>validate()</code>, takes the roster, staff, templates, leave, rules
			and the previous week, and returns a list of issues. Each issue carries a severity, the
			person, the shift, the date, a plain message and a suggested fix. The same function runs
			everywhere: the editor, the generator, drag-and-drop previews, swap approval and the
			reports. Nothing can disagree with anything else, because there is only one implementation.
		</p>

		<h3>Hard rules (errors)</h3>
		<p class="sub">The generator never breaks these. Breaking one shows a red error.</p>
		<ul class="rule-list">
			{#each hard as rule (rule.id)}
				<li>
					<strong>{rule.name}</strong>
					{#if rule.value !== undefined}
						<span class="pill tnum">default {rule.value} {rule.unit}</span>
					{/if}
					<span class="rule-text">{rule.explanation}</span>
				</li>
			{/each}
		</ul>

		<h3>Soft rules (warnings)</h3>
		<p class="sub">
			The generator scores these and tries to minimise them, but will still produce a roster that
			carries a few.
		</p>
		<ul class="rule-list">
			{#each soft as rule (rule.id)}
				<li>
					<strong>{rule.name}</strong>
					{#if rule.value !== undefined}
						<span class="pill tnum">default {rule.value} {rule.unit}</span>
					{/if}
					<span class="rule-text">{rule.explanation}</span>
				</li>
			{/each}
		</ul>

		<h3>Time handling</h3>
		<ul class="plain">
			<li>
				A shift that crosses midnight belongs to the day it starts and counts all of its hours on
				that day.
			</li>
			<li>Every calculation uses minutes, and every date is a plain civil date, never a timestamp.</li>
			<li>
				Real durations are resolved through your business time zone, so a 23-hour or 25-hour
				daylight-saving day produces the correct paid hours.
			</li>
			<li>
				The previous week&rsquo;s roster is read when it exists, so rest gaps and consecutive-day
				runs are correct across week, month and year boundaries.
			</li>
		</ul>
	</section>

	<section class="card card-pad">
		<h2>How the generator works</h2>
		<p>It is a deterministic, seeded heuristic, in three steps:</p>
		<ol class="steps">
			<li>
				<strong>Hardest slots first.</strong> Every required slot is listed from the coverage
				needs, then sorted by how few people are eligible for it, with weekend and night slots
				next.
			</li>
			<li>
				<strong>Best fit by fairness.</strong> Each slot goes to the eligible person who scores
				best: below their contracted minimum, fewer hours so far, fewer weekend and night shifts,
				not a preferred day off, no split shift, and a similar pattern to last week.
			</li>
			<li>
				<strong>A short improvement pass.</strong> Shifts are moved and swapped at random to
				reduce the soft-rule penalty, and any change that would break a hard rule is rejected
				outright.
			</li>
		</ol>
		<p class="honest">
			<Icon name="info" size={18} />
			<span>
				<strong>The generator is a heuristic.</strong> It builds a good roster that follows your
				rules, but it does not guarantee the best possible one. A different seed may produce a
				fairer result, so try a couple and compare them.
			</span>
		</p>
		<p>
			It runs in a Web Worker with a time limit of about three seconds and a Cancel button, so the
			page never freezes. Given the same seed and the same input it always produces exactly the
			same roster: the improvement pass is bounded by a fixed number of iterations, not by elapsed
			time, so a slow laptop and a fast one agree.
		</p>
		<p>
			When a slot cannot be filled, ShiftSync tells you why in plain language, naming who was
			blocked and what blocked them &mdash; for example &ldquo;No available Cashier for Evening on
			Tuesday: Meena is on paid leave, Arun is already at 40 hours&rdquo;. If the problem cannot
			be solved at all, it says so rather than handing you a roster that quietly breaks a rule.
		</p>
	</section>

	<section class="card card-pad legal-card">
		<h2>
			<Icon name="warning" size={18} />
			Not legal advice
		</h2>
		<p>
			Working-time rules differ by country, state, industry and individual employment contract.
			The defaults in ShiftSync &mdash; 11 hours of rest, 48 hours a week, 6 consecutive days
			&mdash; are common European conventions offered as a starting point, not a legal standard.
			Every one of them can be edited or switched off.
		</p>
		<p>
			ShiftSync checks the rules <em>you</em> configure. It does not know your jurisdiction and it
			cannot tell you whether a roster is lawful. Check your local working-time law and your
			contracts, and treat the labour cost figure as a rough estimate rather than payroll.
		</p>
	</section>

	<section class="card card-pad">
		<h2>Sample data</h2>
		<p>
			On first open ShiftSync loads a clearly fictional business, Greenleaf Cafe, with 14 invented
			staff in four roles, three shift templates including an overnight bake, coverage needs, a few
			approved and pending leave entries, a published roster for the current week and a generated
			draft for next week with two deliberate warnings. No real person, business or employee data
			is used anywhere. Replace it with your own at any time from Settings.
		</p>
	</section>

	<section class="card card-pad">
		<h2>Built with</h2>
		<ul class="plain">
			<li>SvelteKit and TypeScript, deployed on Vercel&rsquo;s free Hobby plan.</li>
			<li>
				Server routes only for PDF generation, using pdf-lib. Everything else runs in the browser.
			</li>
			<li>
				Self-hosted Inter, Noto Sans Tamil and Noto Sans Devanagari under the SIL Open Font
				License. No third-party font CDN.
			</li>
			<li>Hand-written SVG charts and a custom SVG icon set. No chart or scheduling library.</li>
		</ul>
		<p class="note">
			Vercel&rsquo;s free Hobby plan is for non-commercial use. If you run ShiftSync for a real
			business, host it somewhere that permits commercial use.
		</p>
	</section>
</div>

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
		margin-bottom: var(--space-2);
	}
	h3 {
		font-size: var(--text-14);
		margin: var(--space-4) 0 var(--space-1);
	}
	p {
		font-size: var(--text-14);
		color: var(--text-secondary);
		line-height: 1.6;
		max-width: 76ch;
	}
	p + p {
		margin-top: var(--space-2);
	}
	.sub {
		font-size: var(--text-13);
		margin-bottom: var(--space-2);
	}
	strong {
		color: var(--text-primary);
		font-weight: 600;
	}
	code {
		font-family: inherit;
		font-size: 0.92em;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
	}

	.warn-card {
		border-color: color-mix(in srgb, var(--info) 30%, var(--border));
		background: var(--info-tint);
	}
	.warn-card h2 :global(svg) {
		color: var(--info);
	}
	.legal-card {
		border-color: color-mix(in srgb, var(--saffron) 35%, var(--border));
		background: var(--saffron-tint);
	}
	.legal-card h2 :global(svg) {
		color: var(--saffron);
	}

	.rule-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.rule-list li {
		padding: var(--space-2) var(--space-3);
		border-left: 2px solid var(--border-strong);
		background: var(--surface-subtle);
		border-radius: 0 var(--radius-control) var(--radius-control) 0;
	}
	.rule-text {
		display: block;
		font-size: var(--text-13);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
		margin-top: 2px;
	}
	.rule-list .pill {
		margin-left: var(--space-2);
	}

	.plain {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.plain li {
		font-size: var(--text-14);
		color: var(--text-secondary);
		line-height: 1.6;
		max-width: 76ch;
	}

	.steps {
		margin: var(--space-2) 0 var(--space-3);
		padding-left: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.steps li {
		font-size: var(--text-14);
		color: var(--text-secondary);
		line-height: 1.6;
		max-width: 76ch;
	}

	.honest {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3);
		margin: var(--space-3) 0;
		border: 1px solid color-mix(in srgb, var(--info) 30%, transparent);
		border-radius: var(--radius-card);
		background: var(--info-tint);
		color: var(--text-primary);
	}
	.honest :global(svg) {
		color: var(--info);
		flex-shrink: 0;
		margin-top: 2px;
	}

	.note {
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
		font-size: var(--text-13);
		color: var(--text-tertiary);
	}
</style>
