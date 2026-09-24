// apiFetch(path, init) — the only way admin pages call /api/admin/*.
// Reads a fresh access token per request, refreshes within 60s of expiry,
// retries once on 401 and then routes to login. On any non-ok response it
// THROWS ApiError carrying the server's body verbatim. It never returns null
// for a failure (OHF §6).
import { supabase } from './supabase-client.js';

export class ApiError extends Error {
  constructor(status, body) {
    const b = body && typeof body === 'object' ? body : {};
    super(typeof b.message === 'string' ? b.message : `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = typeof b.code === 'string' ? b.code : `HTTP_${status}`;
    this.body = body;
  }
}

const REFRESH_WITHIN_MS = 60_000;

async function accessToken(force) {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session) return null;
  if (force || session.expires_at * 1000 - Date.now() < REFRESH_WITHIN_MS) {
    const r = await supabase.auth.refreshSession();
    session = r.data.session;
  }
  return session ? session.access_token : null;
}

export function toLogin() {
  if (location.pathname === '/admin/login') return;
  location.assign(`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`);
}

export async function apiFetch(path, init = {}, { retried = false, redirectOn401 = true } = {}) {
  const token = await accessToken(retried);
  if (!token) {
    if (redirectOn401) toLogin();
    throw new ApiError(401, { code: 'NOT_SIGNED_IN', message: 'Sign in to continue.' });
  }
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  let res;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: "Couldn't reach the server. Check your connection and try again." });
  }
  if (res.status === 401 && !retried) return apiFetch(path, init, { retried: true, redirectOn401 });
  const text = await res.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = { code: 'NON_JSON', message: text.slice(0, 300) }; } }
  if (!res.ok) {
    if (res.status === 401 && redirectOn401) toLogin();
    throw new ApiError(res.status, body || { code: `HTTP_${res.status}`, message: res.statusText || `Request failed (${res.status})` });
  }
  return body;
}
