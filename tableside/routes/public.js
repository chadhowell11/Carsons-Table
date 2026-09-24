// @ts-check
// Public surface: /healthz, /t/:slug/tokens.css, /sites/:slug/* and the site
// renderer catch-all. Phase 0 renders a tenant shell; Phase 1 swaps in
// renderer/render.js.
import express from 'express';
import { readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgPool } from '../lib/db.js';
import { registryStatus } from '../lib/tenants.js';
import { PLATFORM_DISPLAY_NAME } from '../lib/platform.js';
import { HttpError } from '../lib/errors.js';
import { tokensCss } from '../renderer/tokens.js';
import { composeShell, composePaused } from '../renderer/shell.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANDING = readFileSync(join(ROOT, 'renderer', 'platform-landing.html'), 'utf8').replaceAll('{{PLATFORM_DISPLAY_NAME}}', PLATFORM_DISPLAY_NAME);
/** Only asset types are served from sites/<slug>/; partials and brand.json are not. */
const SITE_ASSET_EXT = new Set(['.webp', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff2', '.css']);

/**
 * /healthz performs a real write (OHF §12): a read-only probe would report
 * healthy while every save fails.
 * @param {{ pool?: () => any }} [deps]
 * @returns {import('express').RequestHandler}
 */
export function healthz({ pool = pgPool } = {}) {
  return async (req, res) => {
    const out = { ok: false, db: 'error', write: 'error', registry: registryStatus() };
    try {
      await pool().query('select 1');
      out.db = 'ok';
      await pool().query('insert into platform.heartbeat (id, at) values (1, now()) on conflict (id) do update set at = excluded.at');
      out.write = 'ok';
    } catch (e) {
      console.error('healthz:', /** @type {Error} */ (e).message);
    }
    out.ok = out.db === 'ok' && out.write === 'ok' && !!out.registry.loaded_at;
    res.set('Cache-Control', 'no-store').status(out.ok ? 200 : 503).json(out);
  };
}

/** @param {any} req @param {string} slug */
function sameTenant(req, slug) {
  if (!req.tenant || req.tenant.slug !== slug) throw new HttpError(404, 'NOT_FOUND');
}

export function assetsRouter() {
  const r = express.Router();
  r.get('/t/:slug/tokens.css', (req, res) => {
    sameTenant(req, req.params.slug);
    const css = tokensCss(/** @type {any} */ (req).tenant.brand);
    res.set('Cache-Control', 'public, max-age=300').type('text/css').send(css);
  });
  r.get('/sites/:slug/*path', (req, res, next) => {
    sameTenant(req, req.params.slug);
    const rel = /** @type {string[]} */ (/** @type {any} */ (req.params).path).join('/');
    if (!SITE_ASSET_EXT.has(extname(rel).toLowerCase())) throw new HttpError(404, 'NOT_FOUND');
    res.sendFile(rel, { root: join(ROOT, 'sites', req.params.slug), dotfiles: 'deny', maxAge: '1h' }, (err) => {
      if (err) next(new HttpError(404, 'NOT_FOUND'));
    });
  });
  return r;
}

export function siteRouter() {
  const r = express.Router();
  r.get('/{*path}', (req, res) => {
    const t = /** @type {any} */ (req).tenant;
    res.set('Cache-Control', 'public, max-age=60');
    if (!t) return res.type('html').send(LANDING);
    if (t.status === 'paused') return res.status(503).set('Retry-After', '3600').type('html').send(composePaused({ tenant: t }));
    if (req.path !== '/') throw new HttpError(404, 'NOT_FOUND');
    res.type('html').send(composeShell({ tenant: t }));
  });
  return r;
}
