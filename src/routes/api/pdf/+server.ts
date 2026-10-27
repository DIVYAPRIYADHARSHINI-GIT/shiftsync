// The ONLY server route in ShiftSync.
//
// It takes the rows the browser already computed, renders a PDF and returns it. It
// stores nothing, logs nothing, needs no API key and uses no database or Vercel
// resource beyond the hosting function itself.

import type { RequestHandler } from './$types';
import { buildRosterPdf, detectComplexScript, type PdfRequest } from '#lib/server/pdf';

export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	let payload: PdfRequest;
	try {
		payload = (await request.json()) as PdfRequest;
	} catch {
		return new Response(JSON.stringify({ error: 'The request body was not valid JSON.' }), {
			status: 400,
			headers: { 'content-type': 'application/json' }
		});
	}

	if (!payload || !Array.isArray(payload.shifts) || !Array.isArray(payload.days)) {
		return new Response(
			JSON.stringify({ error: 'The roster data was incomplete. Reload the page and try again.' }),
			{ status: 400, headers: { 'content-type': 'application/json' } }
		);
	}

	// pdf-lib has no complex-script shaping engine. Refuse rather than emit broken text.
	const script = detectComplexScript(payload);
	if (script) {
		return new Response(
			JSON.stringify({
				error: `This roster contains ${script} text, which cannot be shaped correctly in the generated PDF.`,
				fallback: 'print',
				detail:
					'Use the print view instead: it renders the same layout with the browser\u2019s text shaper, then save as PDF from the print dialog.'
			}),
			{ status: 422, headers: { 'content-type': 'application/json' } }
		);
	}

	try {
		const bytes = await buildRosterPdf(payload);
		const stem = (payload.businessName || 'Roster')
			.normalize('NFKD')
			.replace(/[^\p{Letter}\p{Number}]+/gu, '')
			.slice(0, 40);
		const fileName = `Roster_${stem || 'Roster'}_${payload.weekLabel}.pdf`;
		return new Response(bytes as unknown as BodyInit, {
			status: 200,
			headers: {
				'content-type': 'application/pdf',
				'content-disposition': `attachment; filename="${fileName}"`,
				'cache-control': 'no-store'
			}
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: 'The PDF could not be generated.',
				detail: error instanceof Error ? error.message : 'Unknown error.'
			}),
			{ status: 500, headers: { 'content-type': 'application/json' } }
		);
	}
};
