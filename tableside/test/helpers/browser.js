// Playwright launch + error capture for probes. Any pageerror or console.error
// fails the probe. Third-party font requests are stubbed so a probe never
// depends on Google's CDN (the stub is visible in the route list, not hidden).
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const FALLBACK = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function launch() {
  const def = chromium.executablePath();
  return chromium.launch({ executablePath: existsSync(def) ? def : FALLBACK });
}

export const WIDTHS = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }];

export async function openPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  return { ctx, page, errors };
}
