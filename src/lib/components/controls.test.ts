// Tests for the shared control helpers, including the WCAG contrast picker that the
// accessibility check caught choosing white on mid-tone saffron.

import { describe, it, expect } from 'vitest';
import { contrastOn, contrastRatio, initials, clamp, tintOf } from './controls.svelte';

const STAFF_PALETTE = [
	'#0B6E4F',
	'#2B6CB0',
	'#B7791F',
	'#7B3F9D',
	'#2F855A',
	'#C0392B',
	'#1F6F78',
	'#8A5A2B',
	'#44608A',
	'#6B5B95',
	'#3E7C59',
	'#9A6A3A',
	'#30657F',
	'#8C4F6D'
];

describe('contrast helpers', () => {
	it('computes known WCAG ratios', () => {
		expect(Math.round(contrastRatio('#000000', '#FFFFFF') * 100) / 100).toBe(21);
		expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
	});

	it('picks dark ink on the mid-tone saffron, not white', () => {
		// This is the case axe-core flagged: white on #B7791F is only 3.64:1.
		expect(contrastOn('#B7791F')).toBe('#0F1A2A');
		expect(contrastRatio(contrastOn('#B7791F'), '#B7791F')).toBeGreaterThanOrEqual(4.5);
	});

	it('picks white on the dark brand green', () => {
		expect(contrastOn('#0B6E4F')).toBe('#FFFFFF');
	});

	it('every avatar colour in the staff palette reaches AA for its initials', () => {
		for (const colour of STAFF_PALETTE) {
			const ink = contrastOn(colour);
			expect({ colour, ratio: contrastRatio(ink, colour) >= 4.5 }).toEqual({
				colour,
				ratio: true
			});
		}
	});

	it('falls back to dark ink for an unparseable colour', () => {
		expect(contrastOn('not-a-colour')).toBe('#0F1A2A');
		expect(contrastOn('var(--border-strong)')).toBe('#0F1A2A');
	});
});

describe('initials', () => {
	it('takes the first letter of the first two words', () => {
		expect(initials('Meena Raghavan')).toBe('MR');
		expect(initials('Arun')).toBe('A');
	});

	it('keeps Tamil and Devanagari graphemes whole', () => {
		// A conjunct or vowel sign must not be split off its base consonant.
		const tamil = initials('\u0BAA\u0BBF\u0BB0\u0BBF\u0BAF\u0BBE \u0B9A\u0BC1\u0BA8\u0BCD\u0BA4\u0BB0\u0BCD');
		expect(tamil.length).toBeGreaterThan(0);
		expect(tamil.startsWith('\u0BAA')).toBe(true);

		const hindi = initials('\u0915\u093E\u0930\u094D\u0924\u093F\u0915 \u0936\u0930\u094D\u092E\u093E');
		expect(hindi.startsWith('\u0915')).toBe(true);
	});

	it('handles empty and whitespace names', () => {
		expect(initials('')).toBe('?');
		expect(initials('   ')).toBe('?');
	});
});

describe('misc helpers', () => {
	it('clamps into range', () => {
		expect(clamp(5, 0, 10)).toBe(5);
		expect(clamp(-1, 0, 10)).toBe(0);
		expect(clamp(99, 0, 10)).toBe(10);
	});

	it('produces a soft tint per theme', () => {
		expect(tintOf('#0B6E4F', false)).toMatch(/^rgba\(/);
		expect(tintOf('#0B6E4F', true)).toMatch(/^rgba\(/);
		expect(tintOf('nope', false)).toBe('var(--chip-tint-neutral)');
	});
});
