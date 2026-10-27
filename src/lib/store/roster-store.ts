// RosterStore: the ONE interface every part of the app uses to read and write data.
//
// There is exactly one implementation today - LocalRosterStore, backed by the browser's
// localStorage. No database, no server, no network. A future database implementation
// would satisfy this same interface without touching the UI.
//
// Safety rules implemented here, from the brief:
//  - try/catch on every storage access, so a blocked or full store never breaks a page.
//  - debounced saving (250 ms) so typing in a form does not write on every keystroke.
//  - a size check before saving, with a clear error when the quota would be exceeded.
//  - graceful handling when storage is unavailable (private mode, blocked cookies):
//    the app keeps working in memory for the session and says so.

import type { AppData } from '../types';
import { CURRENT_SCHEMA_VERSION, STORAGE_KEY, emptyData, migrate, normalise } from './schema';

export type StorageHealth = 'ok' | 'unavailable' | 'full';

export interface StorageInfo {
	health: StorageHealth;
	/** Bytes used by this app's key. */
	usedBytes: number;
	/** Conservative practical limit for localStorage (5 MB in every major browser). */
	limitBytes: number;
	/** 0..1 */
	fraction: number;
	message?: string;
}

export interface RosterStore {
	load(): AppData;
	/** Debounced write. Returns the storage health after queuing. */
	save(data: AppData): StorageHealth;
	/** Immediate write, used before navigation and export. */
	flush(): StorageHealth;
	clear(): void;
	info(): StorageInfo;
	/** Replace everything at once (sample data, backup import, start fresh). */
	replaceAll(data: AppData): StorageHealth;
}

const LIMIT_BYTES = 5 * 1024 * 1024;
const DEBOUNCE_MS = 250;

function byteLength(value: string): number {
	// Keep this dependency-free and fast enough for a 5 MB string.
	return new Blob([value]).size;
}

export class LocalRosterStore implements RosterStore {
	private cache: AppData | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private pending: AppData | null = null;
	private health: StorageHealth = 'ok';
	private lastMessage: string | undefined;

	private storage(): Storage | null {
		try {
			if (typeof localStorage === 'undefined') return null;
			// Touch the API so private-mode failures surface immediately.
			const probe = '__shiftsync_probe__';
			localStorage.setItem(probe, '1');
			localStorage.removeItem(probe);
			return localStorage;
		} catch {
			this.health = 'unavailable';
			this.lastMessage =
				'This browser is blocking local storage, so changes will be lost when you close the tab. Allow site data for this page to keep your roster.';
			return null;
		}
	}

	load(): AppData {
		if (this.cache) return this.cache;
		const s = this.storage();
		if (!s) {
			this.cache = emptyData();
			return this.cache;
		}
		try {
			const raw = s.getItem(STORAGE_KEY);
			if (!raw) {
				this.cache = emptyData();
				return this.cache;
			}
			const parsed = JSON.parse(raw) as AppData;
			const version = Number(parsed.schemaVersion) || 1;
			this.cache =
				version < CURRENT_SCHEMA_VERSION ? migrate(parsed, version) : normalise(parsed);
			return this.cache;
		} catch {
			// Corrupt JSON: start from empty rather than crash, and keep the bad copy so
			// the manager can still recover it by hand from devtools if they want.
			this.lastMessage =
				'The saved roster could not be read and was skipped. Import your latest backup to restore it.';
			this.cache = emptyData();
			return this.cache;
		}
	}

	save(data: AppData): StorageHealth {
		this.cache = data;
		this.pending = data;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
		return this.health;
	}

	flush(): StorageHealth {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		const data = this.pending ?? this.cache;
		this.pending = null;
		if (!data) return this.health;
		const s = this.storage();
		if (!s) return this.health;
		let serialised: string;
		try {
			serialised = JSON.stringify(data);
		} catch {
			this.health = 'full';
			this.lastMessage = 'The roster could not be prepared for saving.';
			return this.health;
		}
		if (byteLength(serialised) > LIMIT_BYTES) {
			this.health = 'full';
			this.lastMessage =
				'This roster is larger than the browser storage limit. Export a backup, then remove old weeks in Settings.';
			return this.health;
		}
		try {
			s.setItem(STORAGE_KEY, serialised);
			this.health = 'ok';
			this.lastMessage = undefined;
		} catch {
			this.health = 'full';
			this.lastMessage =
				'Browser storage is full, so the last change was not saved. Export a backup, then remove old weeks in Settings.';
		}
		return this.health;
	}

	replaceAll(data: AppData): StorageHealth {
		this.cache = data;
		this.pending = data;
		return this.flush();
	}

	clear(): void {
		this.cache = emptyData();
		this.pending = null;
		const s = this.storage();
		try {
			s?.removeItem(STORAGE_KEY);
		} catch {
			// Nothing to do: the in-memory copy is already reset.
		}
	}

	info(): StorageInfo {
		const s = this.storage();
		if (!s) {
			return {
				health: 'unavailable',
				usedBytes: 0,
				limitBytes: LIMIT_BYTES,
				fraction: 0,
				message: this.lastMessage
			};
		}
		let usedBytes = 0;
		try {
			usedBytes = byteLength(s.getItem(STORAGE_KEY) ?? '');
		} catch {
			usedBytes = 0;
		}
		return {
			health: this.health,
			usedBytes,
			limitBytes: LIMIT_BYTES,
			fraction: Math.min(1, usedBytes / LIMIT_BYTES),
			message: this.lastMessage
		};
	}
}

/** In-memory store used by unit tests and by server-side rendering. */
export class MemoryRosterStore implements RosterStore {
	private data: AppData = emptyData();
	load(): AppData {
		return this.data;
	}
	save(data: AppData): StorageHealth {
		this.data = data;
		return 'ok';
	}
	flush(): StorageHealth {
		return 'ok';
	}
	replaceAll(data: AppData): StorageHealth {
		this.data = data;
		return 'ok';
	}
	clear(): void {
		this.data = emptyData();
	}
	info(): StorageInfo {
		const bytes = byteLength(JSON.stringify(this.data));
		return { health: 'ok', usedBytes: bytes, limitBytes: LIMIT_BYTES, fraction: bytes / LIMIT_BYTES };
	}
}

export function createStore(): RosterStore {
	if (typeof window === 'undefined') return new MemoryRosterStore();
	return new LocalRosterStore();
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
