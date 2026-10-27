// Central app state, built on Svelte 5 runes.
//
// Rules this file follows to avoid reactive loops and frozen pages:
//  - Exactly ONE source of truth: `data`. Everything else is derived.
//  - Derived values are $derived / $derived.by, never effects that write back into state.
//  - Every mutation goes through `commit()`, which pushes undo history and saves through
//    the RosterStore (debounced inside the store itself).
//  - Validation is memoised per week so typing in a form does not revalidate the roster.

import type {
	AppData,
	DateStr,
	Issue,
	Roster,
	Shift,
	Staff,
	ValidationInput
} from './types';
import { createStore, type RosterStore, type StorageInfo } from './store/roster-store';
import { emptyData } from './store/schema';
import { sampleData } from './store/sample-data';
import { validate, sortIssues } from './logic/validate';
import { addDays, startOfWeek, todayIn, systemClock, type Clock } from './logic/time';
import { backupReminderDue } from './logic/backup';

export interface Toast {
	id: number;
	message: string;
	tone: 'info' | 'success' | 'warning' | 'danger';
	/** Optional single undo action offered in the toast. */
	undo?: () => void;
}

const MAX_HISTORY = 40;

class AppState {
	private store: RosterStore = createStore();
	private clock: Clock = systemClock;

	/** THE source of truth. */
	data = $state<AppData>(emptyData());
	/** The week currently open in the editor, as its first date. */
	currentWeek = $state<DateStr>('2026-01-05');
	loaded = $state(false);
	storage = $state<StorageInfo>({ health: 'ok', usedBytes: 0, limitBytes: 5242880, fraction: 0 });
	toasts = $state<Toast[]>([]);

	/** Undo/redo stacks hold whole roster-week snapshots: small and simple to reason about. */
	private undoStack: { week: DateStr; shifts: Shift[]; label: string }[] = [];
	private redoStack: { week: DateStr; shifts: Shift[]; label: string }[] = [];
	undoDepth = $state(0);
	redoDepth = $state(0);

	// --- Derived -----------------------------------------------------------

	today = $derived(todayIn(this.data.business.timeZone, this.clock));

	roster = $derived<Roster>(
		this.data.rosters[this.currentWeek] ?? {
			weekStart: this.currentWeek,
			status: 'Draft',
			shifts: [],
			snapshots: []
		}
	);

	previousWeekShifts = $derived(
		this.data.rosters[addDays(this.currentWeek, -7)]?.shifts ?? []
	);

	activeStaff = $derived(this.data.staff.filter((s) => s.active));

	validationInput = $derived<ValidationInput>({
		shifts: this.roster.shifts,
		staff: this.data.staff,
		templates: this.data.templates,
		coverage: this.data.coverage,
		leave: this.data.leave,
		rules: this.data.rules,
		business: this.data.business,
		previousWeek: this.previousWeekShifts,
		weekStart: this.currentWeek
	});

	issues = $derived<Issue[]>(sortIssues(validate(this.validationInput)));
	errors = $derived(this.issues.filter((i) => i.severity === 'Error'));
	warnings = $derived(this.issues.filter((i) => i.severity === 'Warning'));

	backupDue = $derived(backupReminderDue(this.data.settings.lastBackupAt, this.clock.now()));

	// --- Lifecycle -----------------------------------------------------------

	/** Called once from the root layout in the browser. */
	init(clock: Clock = systemClock) {
		this.clock = clock;
		const loaded = this.store.load();
		// First open with nothing stored: show the sample business rather than a blank app.
		if (loaded.staff.length === 0 && Object.keys(loaded.rosters).length === 0) {
			this.data = sampleData(clock);
			this.store.replaceAll($state.snapshot(this.data) as AppData);
		} else {
			this.data = loaded;
		}
		this.currentWeek = startOfWeek(
			todayIn(this.data.business.timeZone, clock),
			this.data.business.weekStartDay
		);
		this.storage = this.store.info();
		this.loaded = true;
		this.applyTheme();
	}

	/** Persist the current data and refresh the storage meter. */
	private persist() {
		const health = this.store.save($state.snapshot(this.data) as AppData);
		this.storage = this.store.info();
		if (health === 'full') {
			this.toast(
				this.storage.message ?? 'Browser storage is full, so the last change was not saved.',
				'danger'
			);
		}
	}

	flush() {
		this.store.flush();
		this.storage = this.store.info();
	}

	// --- Mutation ------------------------------------------------------------

	/**
	 * Mutate the app data. `label` names the change for the undo toast.
	 * `recordUndo` captures the current week's shifts first so the change can be reversed.
	 */
	commit(label: string, mutate: (data: AppData) => void, recordUndo = true) {
		if (recordUndo) {
			this.undoStack.push({
				week: this.currentWeek,
				shifts: structuredClone($state.snapshot(this.roster.shifts)) as Shift[],
				label
			});
			if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
			this.redoStack = [];
		}
		mutate(this.data);
		this.undoDepth = this.undoStack.length;
		this.redoDepth = this.redoStack.length;
		this.persist();
	}

	/** Replace the open week's shifts. The common editor mutation. */
	setShifts(label: string, shifts: Shift[]) {
		this.commit(label, (d) => {
			const week = this.ensureRoster(d, this.currentWeek);
			week.shifts = shifts;
		});
	}

	ensureRoster(data: AppData, weekStart: DateStr): Roster {
		let roster = data.rosters[weekStart];
		if (!roster) {
			roster = { weekStart, status: 'Draft', shifts: [], snapshots: [] };
			data.rosters[weekStart] = roster;
		}
		return roster;
	}

	undo() {
		const entry = this.undoStack.pop();
		if (!entry) return;
		const week = entry.week;
		this.redoStack.push({
			week,
			shifts: structuredClone($state.snapshot(this.data.rosters[week]?.shifts ?? [])) as Shift[],
			label: entry.label
		});
		this.commit(
			`Undo ${entry.label}`,
			(d) => {
				this.ensureRoster(d, week).shifts = entry.shifts;
			},
			false
		);
		this.currentWeek = week;
		this.undoDepth = this.undoStack.length;
		this.redoDepth = this.redoStack.length;
	}

	redo() {
		const entry = this.redoStack.pop();
		if (!entry) return;
		const week = entry.week;
		this.undoStack.push({
			week,
			shifts: structuredClone($state.snapshot(this.data.rosters[week]?.shifts ?? [])) as Shift[],
			label: entry.label
		});
		this.commit(
			`Redo ${entry.label}`,
			(d) => {
				this.ensureRoster(d, week).shifts = entry.shifts;
			},
			false
		);
		this.currentWeek = week;
		this.undoDepth = this.undoStack.length;
		this.redoDepth = this.redoStack.length;
	}

	// --- Week navigation -----------------------------------------------------

	goToWeek(weekStart: DateStr) {
		this.currentWeek = startOfWeek(weekStart, this.data.business.weekStartDay);
	}
	nextWeek() {
		this.currentWeek = addDays(this.currentWeek, 7);
	}
	prevWeek() {
		this.currentWeek = addDays(this.currentWeek, -7);
	}
	goToToday() {
		this.currentWeek = startOfWeek(this.today, this.data.business.weekStartDay);
	}

	// --- Whole-data operations ----------------------------------------------

	loadSample() {
		this.data = sampleData(this.clock);
		this.store.replaceAll($state.snapshot(this.data) as AppData);
		this.storage = this.store.info();
		this.undoStack = [];
		this.redoStack = [];
		this.undoDepth = 0;
		this.redoDepth = 0;
		this.goToToday();
		this.applyTheme();
		this.toast('Sample data loaded for Greenleaf Cafe.', 'success');
	}

	startFresh() {
		const business = { ...$state.snapshot(this.data.business) };
		this.data = { ...emptyData(), business: { ...business, closedDays: [] } };
		this.store.replaceAll($state.snapshot(this.data) as AppData);
		this.storage = this.store.info();
		this.undoStack = [];
		this.redoStack = [];
		this.undoDepth = 0;
		this.redoDepth = 0;
		this.applyTheme();
		this.toast('All data cleared. Your business name and time zone were kept.', 'success');
	}

	/** Import a validated backup. Never called without an explicit confirmation. */
	importBackup(data: AppData) {
		this.data = data;
		this.store.replaceAll($state.snapshot(this.data) as AppData);
		this.storage = this.store.info();
		this.undoStack = [];
		this.redoStack = [];
		this.undoDepth = 0;
		this.redoDepth = 0;
		this.goToToday();
		this.applyTheme();
	}

	markBackedUp() {
		this.commit(
			'Export backup',
			(d) => {
				d.settings.lastBackupAt = new Date(this.clock.now()).toISOString();
			},
			false
		);
	}

	// --- Theme and density ----------------------------------------------------

	applyTheme() {
		if (typeof document === 'undefined') return;
		const theme = this.data.settings.theme;
		const dark =
			theme === 'dark' ||
			(theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.classList.toggle('dark', dark);
		document.documentElement.classList.toggle(
			'compact',
			this.data.settings.density === 'compact'
		);
	}

	setTheme(theme: AppData['settings']['theme']) {
		this.commit(
			'Change theme',
			(d) => {
				d.settings.theme = theme;
			},
			false
		);
		this.applyTheme();
	}

	setDensity(density: AppData['settings']['density']) {
		this.commit(
			'Change density',
			(d) => {
				d.settings.density = density;
			},
			false
		);
		this.applyTheme();
	}

	// --- Toasts ---------------------------------------------------------------

	private toastId = 0;

	toast(message: string, tone: Toast['tone'] = 'info', undo?: () => void) {
		const id = ++this.toastId;
		this.toasts = [...this.toasts, { id, message, tone, undo }];
		const life = undo ? 7000 : 4000;
		if (typeof window !== 'undefined') {
			setTimeout(() => this.dismissToast(id), life);
		}
	}

	dismissToast(id: number) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	// --- Lookups ---------------------------------------------------------------

	staffById(id: string | null | undefined): Staff | undefined {
		if (!id) return undefined;
		return this.data.staff.find((s) => s.id === id);
	}

	templateById(id: string) {
		return this.data.templates.find((t) => t.id === id);
	}

	/** All roles known to the business, from staff and coverage needs. */
	get roles(): string[] {
		const set = new Set<string>();
		for (const s of this.data.staff) for (const r of s.roles) set.add(r);
		for (const c of this.data.coverage) set.add(c.role);
		return [...set].sort();
	}

	/** Issues for one shift, used by chips and the inspector. */
	issuesForShift(shiftId: string): Issue[] {
		return this.issues.filter((i) => i.shiftId === shiftId);
	}

	issuesForStaffOnDate(staffId: string, date: DateStr): Issue[] {
		return this.issues.filter(
			(i) => i.staffId === staffId && (i.date === date || i.date === undefined)
		);
	}
}

export const app = new AppState();
