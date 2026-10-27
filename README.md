# ShiftSync

**Plan shifts. Keep it fair.**

A free staff roster planner for a single manager. Add your staff, shift templates, coverage
needs and rules; ShiftSync builds a weekly roster automatically, highlights every rule
violation and understaffed shift, and lets you fix things by drag and drop with live
validation.

**Live demo:** https://shiftsync-cyan.vercel.app

---

## Purpose

Small teams usually plan rosters in a spreadsheet, where nothing checks that the roster is
actually legal or fair. ShiftSync keeps the spreadsheet's directness but adds a rules engine:
every change is validated as you make it, and the generator fills the week without ever
breaking a hard rule.

It is deliberately small in scope:

- **One manager, one browser.** There is no login, no staff portal and no server-side data.
- **No accounts, no API keys, no paid services.** Everything runs on free tooling.
- **Your data never leaves your browser.** See [Storage and backup](#storage-and-backup).

## Features

### Setup data
- **Business settings:** name, time zone, week start day (Monday or Sunday), currency, and a
  list of closed days / public holidays with an "add recurring" option for annual closures.
- **Staff:** name, one or more roles, colour, contracted weekly hours (minimum and maximum),
  optional hourly rate, a weekly availability pattern (available all day / between times /
  not available, per day), specific unavailable dates, preferred days off, and notes. Staff
  can be activated and deactivated without deleting their history.
- **Shift templates:** name, start time, end time (may cross midnight), unpaid break minutes,
  colour, and the weekdays the shift runs. Paid hours are calculated from the template.
- **Coverage needs:** for each shift template and weekday, how many people are needed per
  role (a minimum, and an optional ideal), with a copy-from-another-day shortcut.
- **Leave:** staff, start and end date, type (Paid, Unpaid, Sick) and status (Pending,
  Approved, Declined). Only **Approved** leave blocks scheduling; Pending raises a warning.
  Adding leave over existing shifts shows exactly which shifts it affects.
- **Presets:** one-click Retail, Restaurant and Clinic (with night shifts) presets that fill
  in templates, coverage and rule values, all editable afterwards.

### Rules engine
Every rule has a name, a plain-language explanation used directly as its tooltip, a severity,
an on/off switch and (where relevant) an editable numeric value.

**Hard rules — errors the generator never breaks:**

| Rule | Default |
| --- | --- |
| No overlapping shifts for one person | — |
| Person must hold the required role | — |
| Person is not on approved leave | — |
| Person is available (weekly pattern and specific dates) | — |
| Maximum hours per day | 10 hours |
| Maximum hours per week | 48 hours |
| Minimum rest between two shifts | 11 hours |
| Maximum consecutive working days | 6 days |
| Not scheduled on closed days unless overridden | — |

**Soft rules — warnings the generator scores and tries to minimise:**
preferred days off, hours close to the contracted range, balanced hours between people of the
same role, fair rotation of weekend and night shifts, no "clopening" (closing late then
opening early), no split shifts, and a similar pattern from week to week.

### Auto-generate roster
- Generate one week or up to four, using the coverage needs.
- Runs in a **Web Worker** with a ~3 second limit, a progress indicator and a Cancel button,
  so the page never freezes.
- Options: keep locked shifts, generate only empty slots, regenerate with a different seed,
  and compare two results side by side.
- Results panel: percentage of required slots filled, every unfilled slot with a plain reason
  ("No available Cashier for Evening on Tuesday: Meena is on paid leave, Arun is already at
  40 hours"), warnings, and per-person fairness numbers.

### Roster editor
- **Week grid, staff view:** rows are staff, columns are days. Sticky header row and first
  column, today highlighted, weekends tinted, a coverage strip per day, and a slim progress
  bar of scheduled hours against each person's contracted range.
- **Shift view:** rows are shift + role, columns are days, with open slots as dashed saffron
  cards that list the eligible people.
- **Coverage view:** an hour-by-hour bar of staff on duty against the number needed, plus a
  month overview with a status dot per day.
- Drag and drop to assign, move and swap, with **live validation**: valid drop cells get a
  green outline, invalid ones a red outline and the reason on hover.
- A full **keyboard and touch alternative**: select a shift, then Move to / Swap with / Lock /
  Remove, with screen reader announcements.
- Click an empty cell to add a shift, multi-select cells for bulk assign and delete, copy and
  paste, "Copy last week", "Clear week", and undo / redo.
- **Issues panel** grouped by severity with click-to-jump and concrete fix suggestions
  ("Replace with: Priya, Karthik").
- Draft / Published status, with a banner and a warning before editing a published roster,
  plus lightweight version history (save and restore snapshots).

### Swaps and leave changes
- Swap requests recorded by the manager (there are no staff accounts): from person and shift,
  to person or open, reason, and a Pending / Approved / Declined status.
- Before approving, **both resulting rosters are validated** and any rule breaks are listed.
  Approving applies the change. A full history is kept.
- Sick leave: marking someone sick shows their shifts and offers eligible replacements ranked
  by rule safety first, then by fairness.

### Staff views and hours
- Hours and fairness summary for any period: scheduled hours against the contracted range,
  overtime above the weekly maximum, weekend and night shift counts, days off, longest run of
  consecutive days, and a fairness indicator, as SVG bar charts and a sortable table.
- "My shifts" view for any one person.
- Optional estimated labour cost using hourly rates and an overtime multiplier, clearly
  labelled as an estimate and **not payroll**.

### Export and sharing
- **PDF** of the weekly roster from the single server route: a clean landscape grid that fits
  on one page with a legend, plus an optional per-person page list. File names like
  `Roster_GreenleafCafe_2026-W44.pdf`.
- **CSV** in long format (date, shift, role, person, start, end, paid hours) and of the hours
  summary, written with a UTF-8 BOM so Excel opens Tamil and Hindi names correctly.
- **ICS** calendar file per person, with correct time zones and overnight shifts.
- **"Copy for WhatsApp"**: a short plain text version of one person's week or the whole week.
  There is no email or push sending, because there is no server to send from.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | SvelteKit 3 + Svelte 5 runes, TypeScript |
| Styling | Tailwind 4 plus a hand-written design-token layer in `src/app.css` |
| Hosting | Vercel, free Hobby plan, `@sveltejs/adapter-vercel` (runtime `nodejs22.x`) |
| Storage | Browser `localStorage` only, behind a `RosterStore` interface |
| Server routes | **One** — `POST /api/pdf` for PDF generation |
| PDF | `pdf-lib` + `@pdf-lib/fontkit` |
| Fonts | Self-hosted Inter, Noto Sans Tamil, Noto Sans Devanagari (SIL Open Font License) |
| Charts & icons | Hand-written SVG. No chart or scheduling library. |
| Tests | Vitest (unit + property-based), Playwright probes, axe-core |

Dependencies are pinned to exact versions, each at least two weeks old at the time of build.

### Logic modules

All business logic lives in plain TypeScript modules with **no UI dependencies** and an
injectable clock, so each is unit-testable in isolation:

| Module | Responsibility |
| --- | --- |
| `logic/time.ts` | Civil dates, minutes-from-midnight, midnight crossing, DST, week/month/year boundaries |
| `logic/rules.ts` | The rule set, defaults, merge-on-upgrade |
| `logic/validate.ts` | The single pure `validate()` function and the drag-and-drop check |
| `logic/generator.ts` | Seeded deterministic generator, fairness scoring, replacement ranking |
| `logic/coverage.ts` | Hour-by-hour coverage and day status roll-ups |
| `logic/hours.ts` | Hours, overtime, cost estimate, fairness indicator |
| `logic/editor.ts` | Pure roster-editing operations (add, move, swap, copy, paste, lock) |
| `logic/swaps.ts` | Swap evaluation and application |
| `logic/csv.ts`, `logic/ics.ts` | CSV and ICS output |
| `logic/backup.ts` | JSON backup validation |
| `store/roster-store.ts` | The `RosterStore` interface and its localStorage implementation |
| `store/schema.ts` | Versioned schema and the migration list |

---

## How the rules engine works

There is exactly **one** validation function:

```ts
validate({ shifts, staff, templates, coverage, leave, rules, business, previousWeek, weekStart })
  => Issue[]
```

Each `Issue` carries a type, a severity, the person, the shift, the date, a clear message and
a suggested fix. The same function runs in the editor, the generator, the drag-and-drop
preview, swap approval and every report — so nothing can disagree with anything else.

**Time handling, stated precisely:**

- A date is always the civil string `YYYY-MM-DD`, never a `Date` object, so a date can never
  be shifted by a day through a time-zone conversion.
- Times are always minutes from midnight. A shift whose end time is at or before its start
  time **crosses midnight**, belongs to the day it **starts**, and counts all of its hours on
  that day.
- Real durations are resolved through the business time zone, so a 23-hour (spring forward) or
  25-hour (autumn) day produces the correct paid hours.
- The previous week's roster is read when it exists, so rest gaps and consecutive-day runs are
  correct across week, month and year boundaries.

## How the generator works, and its limits

A deterministic, seeded heuristic in three steps:

1. **Hardest slots first.** Every required slot is built from the coverage needs, then sorted
   by how few people are eligible, with weekend and night slots next.
2. **Best fit by fairness.** Each slot goes to the eligible person scoring best on: below their
   contracted minimum, fewer hours so far, fewer weekend and night shifts, not a preferred day
   off, no split shift, and a similar pattern to last week.
3. **A short improvement pass.** Shifts are moved and swapped to reduce the soft-rule penalty.
   Any candidate change that would break a hard rule is rejected outright.

**Limits, stated honestly:**

> The generator is a heuristic. It builds a good roster that follows your rules, but it does
> **not** guarantee the best possible one. A different seed may produce a fairer result.

- Determinism comes from a **fixed iteration budget**, not from elapsed time, so the same seed
  produces the same roster on a slow laptop and a fast one. The ~3 second wall clock is only a
  safety stop, reported separately when it fires.
- When a slot cannot be filled, ShiftSync names what blocked each candidate rather than
  silently leaving a gap. If the problem is impossible it says so, instead of returning a
  roster that quietly breaks a rule.
- It optimises the rules you configured. It does not know your industry, your local law, or
  anything you did not tell it.

## Rules differ by country and employer — not legal advice

Working-time rules differ by country, state, industry and individual employment contract. The
defaults here (11 hours rest, 48 hours a week, 6 consecutive days) are common European
working-time conventions offered as a **starting point**, and every one of them can be edited
or switched off.

**ShiftSync checks the rules you configure. It is not legal advice**, it does not know your
jurisdiction, and it cannot tell you whether a roster is lawful. Check your local working-time
law and your employment contracts. The labour cost figure is a rough estimate from the hourly
rates you typed in, not payroll: it ignores tax, allowances and statutory overtime.

## Storage and backup

**All data is stored only in this browser**, in `localStorage` under the single key
`shiftsync:data:v1`. Nothing is uploaded, synced or shared. There is no database, no cloud
storage, no account, no analytics and no tracking.

The only request ShiftSync ever makes to a server is the PDF export: the rows for that one
page are posted to `/api/pdf`, rendered and returned. Nothing is stored or logged. Every other
export — CSV, ICS, the plain text versions and the JSON backup — is built entirely in the
browser.

**Limits you should know about:**

- Clearing browser data, switching browser, or private browsing **loses the roster** unless you
  have a backup.
- Browsers allow roughly **5 MB** of localStorage. ShiftSync checks the size before every save,
  warns rather than losing a change, and shows a live storage meter.
- Every storage access is wrapped in `try`/`catch`; saves are debounced. If storage is blocked
  the app keeps working in memory for the session and says so in a banner.
- A **"Data stays in this browser"** badge is always visible, and a reminder appears after
  **7 days** without a backup.
- **Backup:** export a JSON file with everything in it. Import validates the file, shows you
  exactly what it contains, and **never overwrites silently** — it always asks first, and
  rejects malformed files with a clear, specific error.

### PDF fonts

The faces the PDF route embeds are generated by `scripts/build-pdf-fonts.mjs` from the pinned
`@fontsource` `.woff` files, so the web app and the PDF provably use the same typeface.
`pdf-lib` cannot read Brotli-compressed `.woff2`, and the `.woff` files are zlib-compressed,
so fontTools can convert them without Brotli.

This is not incidental. Visual QA of the generated PDF found that with TTFs taken from
elsewhere, `pdf-lib` produced two *different* broken results from the same code:

| Embedding | Result |
| --- | --- |
| `subset: true` | pdf.js rendered **zero ink** &mdash; completely invisible text |
| `subset: false` | Text rendered, but the `ToUnicode` CMap was wrong, so the text layer extracted `07:00-15:00` as `07Ů00Ŝ15Ů00`, breaking copy-paste, search and screen readers |

Rebuilt from `@fontsource`, `subset: true` gives correct ink **and** a correct text layer.
`probes/pdf-render.probe.ts` asserts both, so either regression fails the suite instead of
shipping silently. Do not replace `static/fonts/*.ttf` by hand &mdash; run the build script.

### Tamil, Hindi and other complex scripts

`pdf-lib` embeds fonts but has **no complex-script shaping engine**, so it cannot correctly lay
out Tamil or Devanagari glyph clusters (consonant conjuncts and reordered vowel signs).

Rather than emit a PDF with broken text, the `/api/pdf` route **detects those scripts and
returns HTTP 422** with a clear message. The app then falls back to the **`/print` route**,
which renders the same landscape grid using the browser's own text shaper — choose
"Save as PDF" in the print dialog. Latin-only rosters use the generated PDF directly.

## Sample data

On first open ShiftSync loads a clearly fictional business, **Greenleaf Cafe**: 14 invented
staff across four roles with varied availability and contracts, three shift templates
(Morning, Evening, and an overnight Night bake), coverage needs, four leave entries (approved
and pending), a pending swap request, a **published** roster for the current week and a
**generated draft** for next week carrying two deliberate warnings, so the editor, issues
panel, coverage view and hours summary all show realistic content immediately.

Names deliberately include Tamil and Devanagari script to exercise complex-script rendering.
**No real person, business or employee data is used anywhere.** Settings has "Load sample
data" and "Start fresh", each behind a confirmation dialog.

---

## Setup

Requires Node.js 20 or newer.

```bash
git clone https://github.com/DIVYAPRIYADHARSHINI-GIT/shiftsync.git
cd shiftsync
npm install
npm run dev          # http://localhost:5173
```

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (Vercel adapter) |
| `npm run preview` | Serve the production build locally |
| `npm run check` | `svelte-check` type and a11y diagnostics |
| `npm test` | Unit and property-based tests (Vitest) |
| `npm run probe` | Playwright browser probes against a running server |
| `node scripts/build-pdf-fonts.mjs` | Rebuild the PDF route's TTF faces from the pinned @fontsource sources |
| `node scripts/shots.mjs` | Design QA screenshots at 4 widths x 2 themes |
| `node scripts/a11y.mjs` | axe-core accessibility check over every page |

The probe and QA scripts target `http://localhost:4199` by default; override with `SS_BASE`.

### Environment variables

**None.** ShiftSync has no API keys, no secrets and no configuration. That is deliberate.

## Testing

- **191 unit tests** across the logic modules: time and duration maths (midnight crossing,
  DST 23/25-hour days, week/month/year boundaries), every rule in the validator, coverage
  calculation, the seeded generator, fairness metrics, swap validation, hours and overtime,
  CSV output, ICS output, JSON backup validation with malformed files, and the contrast
  helpers.
- **Property-based tests** generate random staff, templates, rules, coverage and leave across
  random time zones and week starts, then assert the invariant that matters most: *the
  generator never breaks a hard rule* — including with a previous week present, with locked
  shifts, and across repeated seeds.
- **47 end-to-end browser checks** covering the full flow from the brief.
- **3 PDF render checks** that rasterise the generated PDF with pdf.js and read its text
  layer back, because a structurally valid PDF can still render blank or with the wrong
  characters (see [PDF fonts](#pdf-fonts)).
- **6 clean-state checks** asserting a first-time visitor sees only the sample data.
- **48 axe-core page checks** (12 pages x 2 widths x 2 themes) with zero serious or critical
  violations.
- A 50-staff / full-week performance test confirms the generator does not freeze the page.

## Accessibility

- WCAG AA contrast verified in **both** themes by axe-core, with separate darker "ink" colour
  tokens for small text sitting on a tint.
- Full keyboard operation, including a complete non-drag alternative for the roster grid, a
  command palette (Cmd/Ctrl + K), visible 2 px focus rings, skip link, landmarks and ARIA
  labels.
- Screen reader announcements for grid actions via a polite live region.
- Status is always conveyed by an icon **and** a text label, never by colour alone.
- 44 px touch targets on mobile; responsive from 360 px to 1920 px with no horizontal page
  scroll (only the grid scrolls).
- `prefers-reduced-motion` respected.

## Non-commercial use

Vercel's free Hobby plan is for **non-commercial use only**. If you run ShiftSync for a real
business, host it somewhere that permits commercial use — the app itself is a static site plus
one serverless function, so it will run on any static host with a Node function.

## Live demo

- **Live app:** https://shiftsync-cyan.vercel.app
- **Repository:** https://github.com/DIVYAPRIYADHARSHINI-GIT/shiftsync

The live site opens with the Greenleaf Cafe sample data. Everything you then do stays in your
own browser.

## Licence

Application code is provided as-is for demonstration. The bundled fonts (Inter, Noto Sans
Tamil, Noto Sans Devanagari) are used under the SIL Open Font License.
