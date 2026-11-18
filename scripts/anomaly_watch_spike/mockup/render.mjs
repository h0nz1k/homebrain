// Render all mockup states with Playwright + QA (overflow, min font size on phones).
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const requireWorkspace = createRequire(
  resolve(process.env.ANOMALY_WORKSPACE_DEPS ?? repo, 'package.json'),
);
const { chromium } = requireWorkspace('@playwright/test');

const base = process.argv[2];
const out = process.argv[3];
const only = process.argv[4];
if (!base || !out)
  throw new Error('Usage: node render.mjs <preview-url> <output-directory> [name-filter]');
await mkdir(out, { recursive: true });
const VPS = {
  mobile: [360, 800],
  tablet: [800, 1280],
  desktop: [1440, 900],
  kiosk: [1280, 800],
};
const STATES = ['ok', 'observations', 'suspicion', 'confirmed'];
const jobs = [];
for (const view of ['dnes', 'detail'])
  for (const state of STATES)
    for (const theme of ['dark', 'light'])
      for (const [vp, size] of Object.entries(VPS)) {
        if (vp === 'kiosk' && view !== 'dnes') continue;
        jobs.push({ view, state, theme, vp, size });
      }

const browser = await chromium.launch({
  executablePath: process.env.ANOMALY_CHROMIUM,
});
const report = [];
for (const j of jobs) {
  const name = `${j.view}-${j.state}-${j.vp}-${j.theme}`;
  if (only && !name.includes(only)) continue;
  const page = await browser.newPage({
    viewport: { width: j.size[0], height: j.size[1] },
    deviceScaleFactor: 2,
  });
  await page.goto(`${base}/?view=${j.view}&state=${j.state}&theme=${j.theme}`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.aw-page').waitFor();
  const qa = await page.evaluate((vp) => {
    const doc = document.documentElement;
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > doc.clientWidth + 0.5 || r.left < -0.5))
        over.push(el.className || el.tagName);
    }
    const small = [];
    const touch = [...document.querySelectorAll('button, summary')]
      .filter((el) => getComputedStyle(el).visibility !== 'hidden')
      .filter((el) => {
        const r = el.getBoundingClientRect();
        // The switch has an extended pointer target using a pseudo-element.
        const height = el.matches('.hb-switch')
          ? parseFloat(getComputedStyle(el, '::before').height)
          : r.height;
        return r.width < 43.5 || height < 43.5;
      })
      .map((el) => el.textContent.trim() || el.getAttribute('aria-label'));
    if (vp === 'mobile')
      for (const el of document.querySelectorAll('body *')) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 13 && el.getBoundingClientRect().height)
          small.push(`${fs}px:${el.textContent.trim().slice(0, 24)}`);
      }
    return {
      touch,
      scroll: doc.scrollWidth > doc.clientWidth,
      over: [...new Set(over)].slice(0, 6),
      small: [...new Set(small)].slice(0, 8),
    };
  }, j.vp);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  report.push({ name, ...qa });
  if (qa.scroll || qa.over.length || qa.small.length || qa.touch.length)
    console.log('QA', name, JSON.stringify(qa));
  await page.close();
}
await browser.close();
console.log(`rendered ${report.length}`);

if (
  report.some(
    ({ scroll, over, small, touch }) => scroll || over.length || small.length || touch.length,
  )
)
  process.exitCode = 1;
