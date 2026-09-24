// @ts-check
// attachUser: verifies a Bearer token through req.tenant.forToken(jwt).auth.getUser().
// requireStaff(minRole): membership via platform.staff_memberships using the
// RLS-bound client (a user can read only their own rows).
// Status codes name the right party: no token 401, no membership 403 (never 401),
// auth service or datastore down 503 (never "invalid login").
import { HttpError } from '../lib/errors.js';
import { ROLE_RANK, ROLES } from '../lib/enums.js';

/** @param {any} error */
const isServiceFailure = (error) => !error.status || error.status >= 500 || error.name === 'AuthRetryableFetchError';

/** @type {import('express').RequestHandler} */
export async function attachUser(req, res, next) {
  const r = /** @type {any} */ (req);
  const h = req.headers.authorization;
  if (!h || !r.tenant) return next();
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) { r.authError = 'INVALID_TOKEN'; return next(); }
  const jwt = m[1];
  let result;
  try {
    result = await r.tenant.forToken(jwt).auth.getUser(jwt);
  } catch {
    return next(new HttpError(503, 'AUTH_UNAVAILABLE'));
  }
  const { data, error } = result;
  if (error) {
    if (isServiceFailure(error)) return next(new HttpError(503, 'AUTH_UNAVAILABLE'));
    r.authError = 'INVALID_TOKEN';
    return next();
  }
  r.user = { id: data.user.id, email: data.user.email || null };
  r.jwt = jwt;
  next();
}

/**
 * @param {typeof ROLES[number]} [minRole]
 * @returns {import('express').RequestHandler}
 */
export function requireStaff(minRole = 'staff') {
  if (!(/** @type {readonly string[]} */ (ROLES)).includes(minRole)) throw new Error(`requireStaff: unknown role ${minRole}`);
  return async (req, res, next) => {
    const r = /** @type {any} */ (req);
    if (!r.tenant) return next(new HttpError(404, 'NO_TENANT'));
    if (!r.user) return next(new HttpError(401, r.authError || 'NOT_SIGNED_IN'));
    let result;
    try {
      result = await r.tenant.forToken(r.jwt).schema('platform').from('staff_memberships')
        .select('role').eq('tenant_id', r.tenant.id).eq('user_id', r.user.id).maybeSingle();
    } catch {
      return next(new HttpError(503, 'STORE_READ_UNAVAILABLE'));
    }
    if (result.error) return next(new HttpError(503, 'STORE_READ_UNAVAILABLE'));
    if (!result.data) return next(new HttpError(403, 'NOT_A_MEMBER'));
    const role = result.data.role;
    if (!(role in ROLE_RANK) || ROLE_RANK[role] < ROLE_RANK[minRole]) return next(new HttpError(403, 'INSUFFICIENT_ROLE'));
    r.staff = { userId: r.user.id, role };
    next();
  };
}

/** @type {import('express').RequestHandler} */
export async function requirePlatformAdmin(req, res, next) {
  const r = /** @type {any} */ (req);
  if (!r.tenant) return next(new HttpError(404, 'NO_TENANT'));
  if (!r.user) return next(new HttpError(401, r.authError || 'NOT_SIGNED_IN'));
  let result;
  try {
    result = await r.tenant.forToken(r.jwt).schema('platform').from('platform_admins').select('user_id').eq('user_id', r.user.id).maybeSingle();
  } catch {
    return next(new HttpError(503, 'STORE_READ_UNAVAILABLE'));
  }
  if (result.error) return next(new HttpError(503, 'STORE_READ_UNAVAILABLE'));
  if (!result.data) return next(new HttpError(403, 'NOT_PLATFORM_ADMIN'));
  next();
}
