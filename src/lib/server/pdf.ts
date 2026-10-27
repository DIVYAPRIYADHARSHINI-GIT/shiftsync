// PDF generation with pdf-lib (MIT) and fontkit — the ONLY server route in ShiftSync.
//
// The route receives the rows the browser already computed and renders them. It stores
// nothing, logs nothing and needs no API key. No roster data is persisted server side.
//
// SCRIPT SUPPORT, stated plainly:
//   Inter (Latin), Noto Sans Tamil and Noto Sans Devanagari are embedded, so the glyphs
//   are present. pdf-lib has NO complex-script shaping engine, so Tamil and Devanagari
//   clusters (consonant conjuncts and reordered vowel signs such as ி, ெ, ी, े) cannot be
//   laid out correctly here. When a roster contains those scripts the route returns HTTP
//   422 with a clear message and the client falls back to the browser's print-to-PDF
//   route at /print, which uses the real text shaper in the browser.

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PdfShift {
	date: string;
	/** 'HH:MM' */
	start: string;
	end: string;
	overnight: boolean;
	templateName: string;
	templateColour: string;
	role: string;
	person: string;
	paidHours: number;
}

export interface PdfPersonRow {
	name: string;
	roles: string;
	hours: number;
	shifts: number;
}

export interface PdfRequest {
	businessName: string;
	weekLabel: string;
	weekRange: string;
	status: string;
	/** Civil dates of the week in order, with a display label each. */
	days: { date: string; label: string }[];
	staffOrder: string[];
	shifts: PdfShift[];
	templates: { name: string; colour: string; times: string }[];
	summary: PdfPersonRow[];
	/** Include a per-person page list after the grid. */
	includePersonPages: boolean;
	timeZone: string;
	generatedAt: string;
}

// A4 landscape.
const PAGE = { width: 841.89, height: 595.28 };
const MARGIN = 28;
const INK = rgb(0.059, 0.102, 0.165); // #0F1A2A
const MUTED = rgb(0.29, 0.333, 0.408); // #4A5568
const FAINT = rgb(0.42, 0.463, 0.525);
const LINE = rgb(0.89, 0.902, 0.922); // #E3E6EB
const BRAND = rgb(0.043, 0.431, 0.31); // #0B6E4F
const SAFFRON = rgb(0.718, 0.475, 0.122);
const SUBTLE = rgb(0.945, 0.953, 0.965);

const fontCache = new Map<string, Uint8Array>();

/**
 * adapter-vercel copies `static/` into the function bundle, so `<fn root>/static/fonts`
 * is the production path. Module-relative candidates keep `vite dev` and `vite preview`
 * working too.
 */
async function readFontFile(stem: string): Promise<Uint8Array | null> {
	const cached = fontCache.get(stem);
	if (cached) return cached;
	// TTF, not WOFF2: pdf-lib/fontkit cannot read Brotli-compressed WOFF2.
	const file = `${stem}.ttf`;
	const here = fileURLToPath(new URL('.', import.meta.url));
	const candidates = [
		join(process.cwd(), 'static', 'fonts', file),
		join(process.cwd(), 'client', 'fonts', file),
		join(here, 'static', 'fonts', file),
		join(here, '..', 'static', 'fonts', file)
	];
	for (const path of candidates) {
		try {
			const bytes = new Uint8Array(await readFile(path));
			fontCache.set(stem, bytes);
			return bytes;
		} catch {
			// Try the next candidate.
		}
	}
	return null;
}

/** Scripts pdf-lib cannot shape. Detected so the route can refuse rather than mangle. */
const TAMIL = /[\u0B80-\u0BFF]/;
const DEVANAGARI = /[\u0900-\u097F]/;

export function detectComplexScript(request: PdfRequest): 'Tamil' | 'Hindi' | null {
	const text = [
		request.businessName,
		...request.staffOrder,
		...request.shifts.map((s) => `${s.person}${s.role}${s.templateName}`),
		...request.summary.map((r) => r.name)
	].join('');
	if (TAMIL.test(text)) return 'Tamil';
	if (DEVANAGARI.test(text)) return 'Hindi';
	return null;
}

function hexToRgb(hex: string) {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return BRAND;
	const n = parseInt(m[1], 16);
	return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Truncate to fit a column width, with an ellipsis. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
	if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
	let cut = text;
	while (cut.length > 1 && font.widthOfTextAtSize(`${cut}\u2026`, size) > maxWidth) {
		cut = cut.slice(0, -1);
	}
	return `${cut}\u2026`;
}

export async function buildRosterPdf(request: PdfRequest): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);

	// Inter is embedded for a consistent look; Helvetica is the fallback when the font
	// file is missing from the bundle, so the route still returns a usable PDF.
	const regularBytes = await readFontFile('inter-regular');
	const boldBytes = await readFontFile('inter-bold');
	// `subset: true` is correct ONLY with the faces built by scripts/build-pdf-fonts.mjs
	// from the pinned @fontsource .woff sources. Do not swap these TTFs for arbitrary ones.
	//
	// With TTFs from another source, pdf-lib produced two different broken results:
	//   subset: true  -> pdf.js rendered zero ink, i.e. completely invisible text
	//   subset: false -> text rendered, but the ToUnicode CMap was wrong and the text layer
	//                    extracted "07:00-15:00" as "07Ů00Ŝ15Ů00", breaking copy-paste,
	//                    search and screen-reader output
	// `probes/pdf-render.probe.ts` rasterises page 1 and reads the text layer back, so a
	// regression in either direction fails the suite rather than shipping silently.
	const regular = regularBytes
		? await doc.embedFont(regularBytes, { subset: true })
		: await doc.embedFont(StandardFonts.Helvetica);
	const bold = boldBytes
		? await doc.embedFont(boldBytes, { subset: true })
		: await doc.embedFont(StandardFonts.HelveticaBold);

	doc.setTitle(`Roster ${request.businessName} ${request.weekLabel}`);
	doc.setProducer('ShiftSync');
	doc.setCreator('ShiftSync');

	drawGridPage(doc, request, regular, bold);
	if (request.includePersonPages) drawPersonPages(doc, request, regular, bold);

	return doc.save();
}

function drawHeader(
	page: PDFPage,
	request: PdfRequest,
	regular: PDFFont,
	bold: PDFFont,
	subtitle: string
) {
	page.drawText(request.businessName, {
		x: MARGIN,
		y: PAGE.height - MARGIN - 12,
		size: 15,
		font: bold,
		color: INK
	});
	page.drawText(subtitle, {
		x: MARGIN,
		y: PAGE.height - MARGIN - 28,
		size: 10,
		font: regular,
		color: MUTED
	});
	const right = `${request.status} \u00B7 ${request.weekLabel}`;
	page.drawText(right, {
		x: PAGE.width - MARGIN - regular.widthOfTextAtSize(right, 10),
		y: PAGE.height - MARGIN - 12,
		size: 10,
		font: regular,
		color: request.status === 'Published' ? BRAND : MUTED
	});
	page.drawLine({
		start: { x: MARGIN, y: PAGE.height - MARGIN - 36 },
		end: { x: PAGE.width - MARGIN, y: PAGE.height - MARGIN - 36 },
		thickness: 1,
		color: LINE
	});
}

function drawFooter(page: PDFPage, request: PdfRequest, regular: PDFFont, note: string) {
	page.drawText(note, {
		x: MARGIN,
		y: MARGIN - 10,
		size: 8,
		font: regular,
		color: FAINT
	});
	const stamp = `Generated ${request.generatedAt.slice(0, 16).replace('T', ' ')} \u00B7 ${request.timeZone}`;
	page.drawText(stamp, {
		x: PAGE.width - MARGIN - regular.widthOfTextAtSize(stamp, 8),
		y: MARGIN - 10,
		size: 8,
		font: regular,
		color: FAINT
	});
}

/** The weekly grid: one landscape page with a legend, fitted to the page. */
function drawGridPage(
	doc: PDFDocument,
	request: PdfRequest,
	regular: PDFFont,
	bold: PDFFont
) {
	const page = doc.addPage([PAGE.width, PAGE.height]);
	drawHeader(page, request, regular, bold, `Roster for ${request.weekRange}`);

	const legendH = 20;
	const top = PAGE.height - MARGIN - 48;
	const bottom = MARGIN + legendH + 10;
	const nameW = 116;
	const gridLeft = MARGIN + nameW;
	const gridW = PAGE.width - MARGIN - gridLeft;
	const colW = gridW / request.days.length;
	const headerH = 22;
	const rows = request.staffOrder.length || 1;
	// Fill the available height: with only a few staff the grid would otherwise sit in a
	// short band at the top of an otherwise empty landscape page. Rows still collapse to a
	// 16 pt floor for a large team, and the cap keeps a 2-person roster from looking absurd.
	const available = top - headerH - bottom;
	const rowH = Math.max(16, Math.min(56, available / rows));

	// Day headers
	for (const [index, day] of request.days.entries()) {
		const x = gridLeft + index * colW;
		page.drawRectangle({
			x,
			y: top - headerH,
			width: colW,
			height: headerH,
			color: SUBTLE,
			borderColor: LINE,
			borderWidth: 0.5
		});
		page.drawText(fit(day.label, bold, 9, colW - 8), {
			x: x + 4,
			y: top - headerH + 7,
			size: 9,
			font: bold,
			color: INK
		});
	}
	page.drawRectangle({
		x: MARGIN,
		y: top - headerH,
		width: nameW,
		height: headerH,
		color: SUBTLE,
		borderColor: LINE,
		borderWidth: 0.5
	});
	page.drawText('Staff', {
		x: MARGIN + 4,
		y: top - headerH + 7,
		size: 9,
		font: bold,
		color: MUTED
	});

	// Staff rows
	for (const [rowIndex, name] of request.staffOrder.entries()) {
		const y = top - headerH - (rowIndex + 1) * rowH;
		if (y < bottom) break;

		page.drawRectangle({
			x: MARGIN,
			y,
			width: nameW,
			height: rowH,
			borderColor: LINE,
			borderWidth: 0.5
		});
		const personHours = request.summary.find((s) => s.name === name)?.hours;
		page.drawText(fit(name, regular, 8.5, nameW - 30), {
			x: MARGIN + 4,
			y: y + rowH / 2 - 3,
			size: 8.5,
			font: regular,
			color: INK
		});
		if (personHours !== undefined) {
			const label = `${personHours}h`;
			page.drawText(label, {
				x: MARGIN + nameW - 4 - regular.widthOfTextAtSize(label, 7.5),
				y: y + rowH / 2 - 3,
				size: 7.5,
				font: regular,
				color: FAINT
			});
		}

		for (const [colIndex, day] of request.days.entries()) {
			const x = gridLeft + colIndex * colW;
			page.drawRectangle({
				x,
				y,
				width: colW,
				height: rowH,
				borderColor: LINE,
				borderWidth: 0.5
			});

			const cellShifts = request.shifts.filter((s) => s.person === name && s.date === day.date);
			const chipH = Math.min(14, (rowH - 2) / Math.max(1, cellShifts.length));
			for (const [i, shift] of cellShifts.entries()) {
				const cy = y + rowH - 1 - (i + 1) * chipH;
				// Solid left colour bar, matching the interface.
				page.drawRectangle({
					x: x + 1.5,
					y: cy,
					width: 2.5,
					height: chipH - 1,
					color: hexToRgb(shift.templateColour)
				});
				// The role is dropped before the time is truncated: the time range is the piece
				// a manager actually reads off the grid, and the role is already implied by the
				// shift. `fit` then guarantees nothing spills past the cell border.
				const time = `${shift.start}-${shift.end}${shift.overnight ? '+1' : ''}`;
				const full = `${time} ${shift.role}`;
				const maxTextW = colW - 10;
				const text =
					regular.widthOfTextAtSize(full, 7) <= maxTextW ? full : fit(time, regular, 7, maxTextW);
				page.drawText(text, {
					x: x + 6,
					y: cy + chipH / 2 - 3.2,
					size: 7,
					font: regular,
					color: INK
				});
			}
		}
	}

	// Open slots are listed under the grid rather than drawn as a row.
	const openSlots = request.shifts.filter((s) => s.person === '');
	if (openSlots.length > 0) {
		const text = `Open slots: ${openSlots
			.slice(0, 8)
			.map((s) => `${s.role} ${s.templateName} ${s.date.slice(8)}/${s.date.slice(5, 7)}`)
			.join(', ')}${openSlots.length > 8 ? ` and ${openSlots.length - 8} more` : ''}`;
		page.drawText(fit(text, regular, 8, PAGE.width - MARGIN * 2), {
			x: MARGIN,
			y: MARGIN + legendH + 1,
			size: 8,
			font: regular,
			color: SAFFRON
		});
	}

	// Legend
	let lx = MARGIN;
	for (const template of request.templates) {
		page.drawRectangle({
			x: lx,
			y: MARGIN + 3,
			width: 8,
			height: 8,
			color: hexToRgb(template.colour)
		});
		const label = `${template.name} ${template.times}`;
		page.drawText(label, {
			x: lx + 12,
			y: MARGIN + 3.5,
			size: 8,
			font: regular,
			color: MUTED
		});
		lx += 12 + regular.widthOfTextAtSize(label, 8) + 16;
		if (lx > PAGE.width - MARGIN - 80) break;
	}

	drawFooter(
		page,
		request,
		regular,
		'ShiftSync \u00B7 Rules differ by country and employer; this is not legal advice.'
	);
}

/** Optional per-person page list after the grid. */
function drawPersonPages(
	doc: PDFDocument,
	request: PdfRequest,
	regular: PDFFont,
	bold: PDFFont
) {
	const perPage = 3;
	const people = request.staffOrder.filter((name) =>
		request.shifts.some((s) => s.person === name)
	);

	for (let start = 0; start < people.length; start += perPage) {
		const page = doc.addPage([PAGE.width, PAGE.height]);
		drawHeader(page, request, regular, bold, `Individual shifts for ${request.weekRange}`);

		const group = people.slice(start, start + perPage);
		const colW = (PAGE.width - MARGIN * 2 - 24 * (group.length - 1)) / group.length;

		for (const [index, name] of group.entries()) {
			const x = MARGIN + index * (colW + 24);
			let y = PAGE.height - MARGIN - 60;
			const row = request.summary.find((s) => s.name === name);

			page.drawText(fit(name, bold, 11, colW), { x, y, size: 11, font: bold, color: INK });
			y -= 14;
			if (row) {
				page.drawText(`${row.roles} \u00B7 ${row.hours}h over ${row.shifts} shifts`, {
					x,
					y,
					size: 8.5,
					font: regular,
					color: MUTED
				});
				y -= 12;
			}
			page.drawLine({
				start: { x, y },
				end: { x: x + colW, y },
				thickness: 0.5,
				color: LINE
			});
			y -= 14;

			const mine = request.shifts
				.filter((s) => s.person === name)
				.sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));

			for (const shift of mine) {
				if (y < MARGIN + 20) break;
				page.drawRectangle({
					x,
					y: y - 2,
					width: 2.5,
					height: 11,
					color: hexToRgb(shift.templateColour)
				});
				const dayLabel = request.days.find((d) => d.date === shift.date)?.label ?? shift.date;
				page.drawText(fit(dayLabel, regular, 8.5, 72), {
					x: x + 6,
					y,
					size: 8.5,
					font: regular,
					color: INK
				});
				const detail = `${shift.start}-${shift.end}${shift.overnight ? '+1' : ''} \u00B7 ${shift.role}`;
				page.drawText(fit(detail, regular, 8.5, colW - 84), {
					x: x + 82,
					y,
					size: 8.5,
					font: regular,
					color: MUTED
				});
				y -= 13;
			}

			if (mine.length === 0) {
				page.drawText('No shifts this week.', { x, y, size: 8.5, font: regular, color: FAINT });
			}
		}

		drawFooter(page, request, regular, 'ShiftSync \u00B7 Individual shift list');
	}
}
