// @ts-check
// resolveTenant — the first middleware (spec §3.2). After it, req.tenant is the
// only tenant handle: a registry descriptor with the client factory attached,
// or null for an unknown host (routes/public.js serves the platform landing).
import { attachClients } from '../lib/db.js';
import { getByHost, normalizeHost } from '../lib/tenants.js';
import { HttpError } from '../lib/errors.js';

/** @type {import('express').RequestHandler} */
export function resolveTenant(req, res, next) {
  const host = normalizeHost(req.headers.host);
  const desc = getByHost(host);
  res.vary('Host');
  if (!desc) { /** @type {any} */ (req).tenant = null; return next(); }
  if (desc.status === 'archived') return next(new HttpError(404, 'TENANT_ARCHIVED'));
  /** @type {any} */ (req).tenant = attachClients(desc);
  next();
}
