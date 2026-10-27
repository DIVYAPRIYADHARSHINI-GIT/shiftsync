// PDF render checks.
//
// Parsing the PDF is not enough: a document can be structurally valid and still render as
// blank or missing glyphs. pdf-lib's glyph subsetter silently dropped most characters from
// the bundled Inter faces ("Greenleaf Cafe" came out as "G    C"), and only rasterising the
// page and reading the text back catches that.
//
// These probes extract the text layer with pdf.js and also rasterise page 1 to confirm ink
// is actually drawn where the grid is expected.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.SS_BASE ?? 'http://localhost:4199';
const OUT = process.env.SS_DOWNLOADS ?? '/tmp/ss-e2e';

let browser: Browser;

/** A Latin-only roster, which is the case the generated PDF handles. */
const PAYLOAD = {
	businessName: 'Greenleaf Cafe',
	weekLabel: '2026-W44',
	weekRange: '26 Oct - 1 Nov 2026',
	status: 'Published',
	days: [
		{ date: '2026-10-26', label: 'Mon 26 Oct' },
		{ date: '2026-10-27', label: 'Tue 27 Oct' },
		{ date: '2026-10-28', label: 'Wed 28 Oct' },
		{ date: '2026-10-29', label: 'Thu 29 Oct' },
		{ date: '2026-10-30', label: 'Fri 30 Oct' },
		{ date: '2026-10-31', label: 'Sat 31 Oct' },
		{ date: '2026-11-01', label: 'Sun 1 Nov' }
	],
	staffOrder: ['Meena Raghavan', 'Arun Selvaraj', 'Divya Nair', 'Leela Krishnan'],
	shifts: [
		{
			date: '2026-10-26',
			start: '07:00',
			end: '15:00',
			overnight: false,
			templateName: 'Morning',
			templateColour: '#0B6E4F',
			role: 'Supervisor',
			person: 'Meena Raghavan',
			paidHours: 7.5
		},
		{
			date: '2026-10-26',
			start: '22:00',
			end: '06:00',
			overnight: true,
			templateName: 'Night bake',
			templateColour: '#7B3F9D',
			role: 'Cook',
			person: 'Arun Selvaraj',
			paidHours: 7.25
		},
		{
			date: '2026-10-31',
			start: '14:30',
			end: '22:30',
			overnight: false,
			templateName: 'Evening',
			templateColour: '#2B6CB0',
			role: 'Cashier',
			person: '',
			paidHours: 7.5
		}
	],
	templates: [
		{ name: 'Morning', colour: '#0B6E4F', times: '07:00-15:00' },
		{ name: 'Evening', colour: '#2B6CB0', times: '14:30-22:30' },
		{ name: 'Night bake', colour: '#7B3F9D', times: '22:00-06:00' }
	],
	summary: [
		{ name: 'Meena Raghavan', roles: 'Supervisor, Barista', hours: 7.5, shifts: 1 },
		{ name: 'Arun Selvaraj', roles: 'Supervisor, Cook', hours: 7.25, shifts: 1 },
		{ name: 'Divya Nair', roles: 'Cashier', hours: 0, shifts: 0 },
		{ name: 'Leela Krishnan', roles: 'Supervisor, Cashier', hours: 0, shifts: 0 }
	],
	includePersonPages: true,
	timeZone: 'Asia/Kolkata',
	generatedAt: '2026-10-27T10:30:00Z'
};

/**
 * Load pdf.js from local node_modules (no network) into a page.
 *
 * Injected with addScriptTag rather than a dynamic import inside evaluate(), because Vite
 * rewrites `import()` in probe source into its SSR helper, which has no browser equivalent.
 */
async function loadPdfJs(page: import('playwright').Page): Promise<void> {
	const lib = readFileSync(
		fileURLToPath(new URL('../node_modules/pdfjs-dist/build/pdf.min.mjs', import.meta.url)),
		'utf8'
	);
	const worker = readFileSync(
		fileURLToPath(new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)),
		'utf8'
	);
	await page.addScriptTag({
		content: `
			const libUrl = URL.createObjectURL(new Blob([${JSON.stringify(lib)}], { type: 'text/javascript' }));
			const workerUrl = URL.createObjectURL(new Blob([${JSON.stringify(worker)}], { type: 'text/javascript' }));
			import(libUrl).then((m) => {
				m.GlobalWorkerOptions.workerSrc = workerUrl;
				window.__pdfjs = m;
			});
		`,
		type: 'module'
	});
	await page.waitForFunction(() => Boolean((window as unknown as { __pdfjs?: unknown }).__pdfjs), {
		timeout: 30_000
	});
}

async function fetchPdf(): Promise<Buffer> {
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(BASE, { waitUntil: 'domcontentloaded' });
	const result = await page.evaluate(async (body) => {
		const response = await fetch('/api/pdf', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) return { status: response.status, bytes: [] as number[] };
		return { status: response.status, bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
	}, PAYLOAD);
	await context.close();
	expect(result.status).toBe(200);
	return Buffer.from(result.bytes);
}

beforeAll(async () => {
	mkdirSync(OUT, { recursive: true });
	browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
	await browser?.close();
});

describe('generated PDF renders real text', () => {
	it('contains the expected words in its text layer', async () => {
		const bytes = await fetchPdf();
		const path = join(OUT, 'render-check.pdf');
		writeFileSync(path, bytes);

		// Extract the text layer with pdf.js, in a browser page so the worker is available.
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(BASE, { waitUntil: 'domcontentloaded' });
		await loadPdfJs(page);
		const text = await page.evaluate(async (data) => {
			const pdfjs = (window as unknown as { __pdfjs: typeof import('pdfjs-dist') }).__pdfjs;
			const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
			const pages: string[] = [];
			for (let i = 1; i <= doc.numPages; i++) {
				const p = await doc.getPage(i);
				const content = await p.getTextContent();
				pages.push(content.items.map((it: { str: string }) => it.str).join(' '));
			}
			return pages;
		}, Array.from(bytes));
		await context.close();

		// pdf.js splits a drawn string into separate text items wherever the PDF repositions
		// the cursor, so also compare against a whitespace-stripped form.
		const all = text.join(' \n ');
		const tight = all.replace(/\s+/g, '');
		// The exact strings that came out mangled when glyph subsetting was enabled.
		for (const needle of [
			'Greenleaf Cafe',
			'Published',
			'Meena Raghavan',
			'Arun Selvaraj',
			'Supervisor',
			'Morning',
			'Night bake',
			'07:00-15:00',
			'Mon 26 Oct',
			'Staff'
		]) {
			const found = all.includes(needle) || tight.includes(needle.replace(/\s+/g, ''));
			expect({ needle, found }).toEqual({ needle, found: true });
		}
		// The open slot is reported rather than silently dropped.
		expect(all).toMatch(/Open slots/);
		// And the not-legal-advice footer is carried into the document.
		expect(all).toMatch(/not legal advice/);
	}, 90_000);

	it('draws ink across the grid area of page 1', async () => {
		const bytes = await fetchPdf();
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(BASE, { waitUntil: 'domcontentloaded' });
		await loadPdfJs(page);
		const stats = await page.evaluate(async (data) => {
			const pdfjs = (window as unknown as { __pdfjs: typeof import('pdfjs-dist') }).__pdfjs;
			const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
			const p = await doc.getPage(1);
			const viewport = p.getViewport({ scale: 1.5 });
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			const ctx = canvas.getContext('2d')!;
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			await p.render({ canvasContext: ctx, viewport, canvas }).promise;
			const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);
			let dark = 0;
			for (let i = 0; i < px.length; i += 4) {
				if (px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200) dark++;
			}
			return { width: canvas.width, height: canvas.height, dark, total: px.length / 4 };
		}, Array.from(bytes));
		await context.close();

		// Landscape A4 at 1.5x.
		expect(stats.width).toBeGreaterThan(stats.height);
		// A page of real text and rules has a meaningful amount of non-white pixels. The
		// subsetting bug dropped this close to the blank-page floor.
		const inkFraction = stats.dark / stats.total;
		expect(inkFraction).toBeGreaterThan(0.01);
	}, 90_000);

	it('is a valid multi-page A4 landscape document', async () => {
		const bytes = await fetchPdf();
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
		for (const p of doc.getPages()) {
			expect(Math.round(p.getWidth())).toBe(842);
			expect(Math.round(p.getHeight())).toBe(595);
		}
	}, 60_000);
});
