// Design QA screenshot runner: every main page at four widths in both themes.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SS_BASE ?? 'http://localhost:4199';
const OUT = process.env.SS_SHOTS ?? '/tmp/ss-shots';
const WIDTHS = (process.env.SS_WIDTHS ?? '1440,1024,768,390').split(',').map(Number);
const THEMES = (process.env.SS_THEMES ?? 'light,dark').split(',');
const PAGES = (process.env.SS_PAGES ??
  '/:roster-staff,/?view=shift:roster-shift,/?view=coverage:coverage,/staff:staff,/shifts:shifts,/leave:leave,/swaps:swaps,/hours:hours,/reports:reports,/settings:settings,/about:about,/privacy:privacy')
  .split(',')
  .map((entry) => { const i = entry.lastIndexOf(':'); return { path: entry.slice(0, i), name: entry.slice(i + 1) }; });

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problems = [];

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    // Theme is driven by the OS colour scheme: the app's default theme is 'system', and
    // writing localStorage directly would be undone by the app's own beforeunload flush.
    const context = await browser.newContext({
      viewport: { width, height: width < 500 ? 844 : 900 },
      deviceScaleFactor: 1,
      colorScheme: theme === 'dark' ? 'dark' : 'light'
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => problems.push(`${theme} ${width} :: pageerror :: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`${theme} ${width} ${page.url()} :: ${m.text()}`); });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    for (const target of PAGES) {
      await page.goto(BASE + target.path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(450);
      // Horizontal page scroll is a defect: only the grid may scroll.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) problems.push(`${theme} ${width} ${target.name} :: horizontal page scroll ${overflow}px`);
      // Viewport capture only: the app shell is a fixed-height flex layout whose inner
      // regions scroll, so fullPage would pad the image rather than reveal more content.
      await page.screenshot({ path: `${OUT}/${target.name}-${width}-${theme}.png` });
    }
    await context.close();
  }
}
await browser.close();
if (problems.length) { console.log('PROBLEMS:'); for (const p of [...new Set(problems)]) console.log(' -', p); }
else console.log('No console errors or horizontal page scroll found.');
