// @ts-check
// Shared, brand-agnostic admin pages (spec §7.1). Each admin/<page>.html carries a
// <!--BRAND-HEAD--> marker replaced per request with the tenant's tokens.css,
// favicon and window.__BRAND__. No file under admin/ names a tenant.
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { HttpError } from '../lib/errors.js';
import { escapeHtml, scriptJson } from '../renderer/html.js';
import { fontsHref } from '../renderer/tokens.js';
import { IS_PRODUCTION } from '../lib/platform.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = join(ROOT, 'admin');
const SUPABASE_UMD = createRequire(import.meta.url).resolve('@supabase/supabase-js/dist/umd/supabase.js');

/** Pages that exist. A page is added here when its file is. */
export const ADMIN_PAGES = Object.freeze(['index', 'login']);
const MARKER = '<!--BRAND-HEAD-->';

/** @type {Map<string, string>} */
const cache = new Map();
/** @param {string} page */
function pageSource(page) {
  if (IS_PRODUCTION && cache.has(page)) return /** @type {string} */ (cache.get(page));
  const src = readFileSync(join(ADMIN, `${page}.html`), 'utf8');
  if (!src.includes(MARKER)) throw new Error(`admin/${page}.html is missing ${MARKER}`);
  cache.set(page, src);
  return src;
}

/** @param {any} tenant */
export function brandHead(tenant) {
  const brand = {
    name: tenant.name, slug: tenant.slug, logo: tenant.brand.logo || null,
    features: tenant.features, supabase: tenant.publicConfig(),
    timezone: tenant.timezone, currency: tenant.currency,
  };
  return [
    '<meta name="robots" content="noindex,nofollow">',
    `<link rel="stylesheet" href="${escapeHtml(fontsHref(tenant.brand))}">`,
    `<link rel="stylesheet" href="/t/${escapeHtml(tenant.slug)}/tokens.css">`,
    tenant.brand.favicon ? `<link rel="icon" href="${escapeHtml(tenant.brand.favicon)}">` : '',
    `<script>window.__BRAND__=${scriptJson(brand)};</script>`,
  ].filter(Boolean).join('\n');
}

export function adminPagesRouter() {
  const r = express.Router();
  r.use('/admin', (req, res, next) => {
    if (!(/** @type {any} */ (req)).tenant) return next(new HttpError(404, 'NO_TENANT'));
    res.set('Cache-Control', 'no-store');
    next();
  });
  r.get('/admin/vendor/supabase.js', (req, res) => res.type('application/javascript').sendFile(SUPABASE_UMD));
  r.use('/admin/js', express.static(join(ADMIN, 'js'), { fallthrough: false, index: false }));
  r.use('/admin/css', express.static(join(ADMIN, 'css'), { fallthrough: false, index: false }));
  r.get(['/admin', '/admin/', '/admin/:page'], (req, res) => {
    const page = (req.params.page || 'index').replace(/\.html$/, '');
    if (!ADMIN_PAGES.includes(page) || !existsSync(join(ADMIN, `${page}.html`))) throw new HttpError(404, 'NOT_FOUND');
    const html = pageSource(page).replace(MARKER, brandHead(/** @type {any} */ (req).tenant));
    res.type('html').send(html);
  });
  return r;
}
