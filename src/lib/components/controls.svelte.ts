// Small shared helpers for the custom control components.

/** Initials for an avatar, correct for Tamil and Devanagari names too. */
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	// Use the first grapheme of the first two words, so conjunct consonants stay whole.
	const take = (word: string) => {
		const segmenter =
			typeof Intl !== 'undefined' && 'Segmenter' in Intl
				? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
				: null;
		if (segmenter) {
			for (const s of segmenter.segment(word)) return s.segment;
		}
		return word.slice(0, 1);
	};
	if (parts.length === 1) return take(parts[0]);
	return `${take(parts[0])}${take(parts[1])}`;
}

/** WCAG relative luminance of a #rrggbb colour. */
function relativeLuminance(hex: string): number | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const n = parseInt(m[1], 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	if (la === null || lb === null) return 1;
	const hi = Math.max(la, lb);
	const lo = Math.min(la, lb);
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * Readable text colour for a solid background, used by avatar initials.
 *
 * It compares the ACTUAL contrast ratio of dark ink and white against the background and
 * returns whichever wins. An earlier version used a fixed luminance threshold, which
 * picked white on the mid-tone saffron (#B7791F) at only 3.64:1 and failed WCAG AA.
 */
export function contrastOn(hex: string): string {
	const ink = '#0F1A2A';
	const white = '#FFFFFF';
	if (relativeLuminance(hex) === null) return ink;
	return contrastRatio(ink, hex) >= contrastRatio(white, hex) ? ink : white;
}

/** A soft tint of a template colour, used as the chip background. */
export function tintOf(hex: string, dark: boolean): string {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return 'var(--chip-tint-neutral)';
	const n = parseInt(m[1], 16);
	const r = (n >> 16) & 255;
	const g = (n >> 8) & 255;
	const b = n & 255;
	return dark
		? `rgba(${r}, ${g}, ${b}, 0.18)`
		: `rgba(${r}, ${g}, ${b}, 0.10)`;
}

/** Clamp a number into a range, used by steppers. */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Trap focus inside a dialog or sheet. Returns a cleanup function. */
export function trapFocus(node: HTMLElement): () => void {
	const selector =
		'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
	function focusables(): HTMLElement[] {
		return Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
			(el) => el.offsetParent !== null || el === document.activeElement
		);
	}
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const items = focusables();
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
	const previous = document.activeElement as HTMLElement | null;
	queueMicrotask(() => focusables()[0]?.focus());
	node.addEventListener('keydown', onKeydown);
	return () => {
		node.removeEventListener('keydown', onKeydown);
		previous?.focus?.();
	};
}
