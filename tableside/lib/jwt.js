// @ts-check
// Mints tenant-scoped anon tokens for public reads. Imported by lib/db.js (and by
// the dev-stack key generator, which signs the dev anon/service keys).
import { SignJWT } from 'jose';

/**
 * @param {Record<string, unknown>} claims  must include exp (seconds)
 * @param {string} secret HS256 secret
 */
export async function signJwt(claims, secret) {
  if (!secret) throw new Error('signJwt: secret is required');
  return new SignJWT({ ...claims }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(new TextEncoder().encode(secret));
}

/**
 * Claims: { role:'anon', tenant_id, iat, exp }. RLS reads tenant_id through
 * platform.jwt_tenant_id(); the browser never supplies it.
 * @param {{ tenantId: string, secret: string, nowS: number, ttlS: number }} p
 */
export async function mintTenantAnonToken({ tenantId, secret, nowS, ttlS }) {
  if (!tenantId) throw new Error('mintTenantAnonToken: tenantId is required');
  return signJwt({ role: 'anon', tenant_id: tenantId, iat: nowS, exp: nowS + ttlS }, secret);
}
