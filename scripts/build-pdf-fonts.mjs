// Build the TTF faces the PDF route embeds, from the pinned @fontsource packages.
//
// WHY THIS EXISTS
// ---------------
// `pdf-lib` + `@pdf-lib/fontkit` cannot read Brotli-compressed `.woff2`, so the server
// route needs plain `.ttf`. The `.woff` files in @fontsource are zlib-compressed, which
// fontTools can decompress without Brotli, so they are the source of truth here and the
// web app and the PDF provably use the same typeface.
//
// It also pins down a real rendering bug found during PDF QA. Earlier builds used TTFs
// copied from another project, and with those:
//   - `subset: true`  -> pdf.js rendered ZERO ink (invisible text)
//   - `subset: false` -> text rendered, but the ToUnicode CMap was wrong, so the text
//                        layer extracted "07:00-15:00" as "07Ů00Ŝ15Ů00" (broken
//                        copy-paste, search and screen-reader output)
// Rebuilt from @fontsource, `subset: true` produces correct ink AND a correct text layer.
// `probes/pdf-render.probe.ts` asserts both, so a regression here fails the suite.
//
// Run: node scripts/build-pdf-fonts.mjs    (requires python3 with fontTools)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}static/fonts`;

/** Target TTF stem -> source .woff inside node_modules/@fontsource. */
const FACES = {
	'inter-regular': '@fontsource/inter/files/inter-latin-400-normal.woff',
	'inter-bold': '@fontsource/inter/files/inter-latin-600-normal.woff',
	'noto-sans-tamil': '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff',
	'noto-sans-devanagari':
		'@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff'
};

mkdirSync(out, { recursive: true });

for (const [stem, relative] of Object.entries(FACES)) {
	const source = `${root}node_modules/${relative}`;
	if (!existsSync(source)) {
		console.error(`missing source font: ${relative}`);
		process.exitCode = 1;
		continue;
	}
	execFileSync(
		'python3',
		[
			'-c',
			[
				'import sys',
				'from fontTools.ttLib import TTFont',
				'f = TTFont(sys.argv[1])',
				'f.flavor = None',
				'f.save(sys.argv[2])',
				'print("%s: %d glyphs" % (sys.argv[3], f["maxp"].numGlyphs))'
			].join('\n'),
			source,
			`${out}/${stem}.ttf`,
			stem
		],
		{ stdio: 'inherit' }
	);
}
