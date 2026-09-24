// Browser probes for everything a user can see in Phase 0: the tenant shell on
// two hosts and the shared admin login. 1280 and 390 wide; pageerror and
// console.error fail the run. Each failure-state probe has a healthy control.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDevStackEnv } from '../helpers/stack.js';
import { launch, openPage, WIDTHS } from '../helpers/browser.js';

loadDevStackEnv();
const { createApp } = await import('../../app.js');
const tenants = await import('../../lib/tenants.js');
const db = await import('../../lib/db.js');
const { seedDev, DEV_USERS, DEV_PASSWORD, DEV_HOSTS } = await import('../../scripts/dev-fixtures.js');

let server; let port; let browser;
before(async () => {
  await seedDev({ log: () => {} });
  await tenants.load();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  port = server.address().port;
  browser = await launch();
});
after(async () => { await browser?.close(); server?.close(); await db.closePool(); });

const url = (host, path) => `http://${host}:${port}${path}`;

for (const vp of WIDTHS) {
  test(`[${vp.name}] shell: two tenants, two sets of tokens, no errors`, async () => {
    const { ctx, page, errors } = await openPage(browser, vp);
    try {
      await page.goto(url(DEV_HOSTS.carsons, '/'));
      assert.equal(await page.textContent('h1'), "Carson's Table");
      const carsonsField = await page.$eval('header', (el) => getComputedStyle(el).backgroundColor);
      assert.equal(carsonsField, 'rgb(35, 71, 25)', 'dark-dominant field is --t-dark #234719');
      assert.equal(await page.getAttribute('meta[name=robots]', 'content'), 'noindex,nofollow');

      await page.goto(url(DEV_HOSTS.demo, '/'));
      assert.equal(await page.textContent('h1'), 'Demo Bistro');
      const demoField = await page.$eval('header', (el) => getComputedStyle(el).backgroundColor);
      assert.equal(demoField, 'rgb(241, 245, 249)', 'light scheme field is --t-bg #F1F5F9');
      assert.equal(await page.$('meta[name=robots]'), null);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, 'no horizontal scroll');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });

  test(`[${vp.name}] login: owner signs in and lands on the admin with their role (control)`, async () => {
    const { ctx, page, errors } = await openPage(browser, vp);
    try {
      await page.goto(url(DEV_HOSTS.carsons, '/admin/login'));
      assert.equal(await page.textContent('[data-brand-name]'), "Carson's Table");
      await page.fill('#email', DEV_USERS.carsonsOwner);
      await page.fill('#password', DEV_PASSWORD);
      // Hold the token request so the in-flight state is observable.
      let release; const held = new Promise((r) => { release = r; });
      await page.route('**/auth/v1/token*', async (route) => { await held; await route.continue(); });
      await page.click('#signin');
      await page.waitForSelector('#signin[aria-busy="true"]');
      assert.equal(await page.textContent('#signin'), 'Signing in…');
      assert.equal(await page.isDisabled('#signin'), true, 'double-click guard');
      release();
      await page.waitForURL(url(DEV_HOSTS.carsons, '/admin/'));
      await page.waitForSelector('#me:not([hidden])');
      assert.equal(await page.textContent('#me-role'), 'owner');
      assert.equal(await page.textContent('#me-tenant'), "Carson's Table");
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });

  test(`[${vp.name}] login: wrong password says so, and the button comes back`, async () => {
    const { ctx, page, errors } = await openPage(browser, vp);
    try {
      await page.goto(url(DEV_HOSTS.carsons, '/admin/login'));
      await page.fill('#email', DEV_USERS.carsonsOwner);
      await page.fill('#password', 'wrong-password');
      await page.click('#signin');
      await page.waitForSelector('#msg.bad');
      assert.equal(await page.textContent('#msg'), 'That email and password don’t match.');
      assert.equal(await page.getAttribute('#signin', 'aria-busy'), null);
      assert.equal(await page.textContent('#signin'), 'Sign in');
      // The browser logs the auth service's 400 itself; that one line is expected.
      assert.deepEqual(errors.filter((e) => !/status of 400/.test(e)), []);
    } finally { await ctx.close(); }
  });

  test(`[${vp.name}] login: a real user from another restaurant sees "no access", not "invalid login"`, async () => {
    const { ctx, page, errors } = await openPage(browser, vp);
    try {
      await page.goto(url(DEV_HOSTS.carsons, '/admin/login'));
      await page.fill('#email', DEV_USERS.demoOwner);
      await page.fill('#password', DEV_PASSWORD);
      await page.click('#signin');
      await page.waitForSelector('[data-state="not-member"]:not([hidden])');
      assert.equal(await page.textContent('#not-member-msg'), "You don't have access to this restaurant's admin.");
      assert.equal(await page.textContent('#who'), DEV_USERS.demoOwner);
      assert.equal(await page.isVisible('[data-state="form"]'), false);
      assert.deepEqual(errors.filter((e) => !/status of 403/.test(e)), [], 'only the expected 403 from /api/admin/me');
    } finally { await ctx.close(); }
  });

  test(`[${vp.name}] admin without a session routes to login`, async () => {
    const { ctx, page, errors } = await openPage(browser, vp);
    try {
      await page.goto(url(DEV_HOSTS.demo, '/admin/'));
      await page.waitForURL(/\/admin\/login\?next=%2Fadmin%2F$/);
      assert.equal(await page.textContent('[data-brand-name]'), 'Demo Bistro');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}
