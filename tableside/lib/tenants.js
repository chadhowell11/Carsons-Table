// @ts-check
// Tenant registry (spec §3.1, D2). Source of truth is platform.tenants +
// platform.tenant_domains; this module holds an in-memory copy keyed by
// normalized host, behind Tatami's getByHost() interface.
//
// Failure is not absence: a failed refresh keeps the last good registry and
// records the error. It never swaps in an empty map (which would turn every
// restaurant's site into the platform landing page).
import { adminSystemClient } from './db.js';
import { FEATURES } from './enums.js';
import { REGISTRY_TTL_MS } from './platform.js';

/**
 * @typedef {{
 *   id: string, slug: string, name: string, status: 'draft'|'live'|'paused'|'archived',
 *   primaryHost: string | null, hosts: string[], timezone: string, currency: string,
 *   features: Record<typeof FEATURES[number], boolean>, brand: Record<string, any>,
 *   envPrefix: string | null
 * }} TenantDescriptor
 */

/** @type {{ byHost: Map<string, TenantDescriptor>, bySlug: Map<string, TenantDescriptor>, loadedAt: Date | null, lastError: string | null }} */
let state = { byHost: new Map(), bySlug: new Map(), loadedAt: null, lastError: null };

/** Lowercase, strip port and trailing dot. '[::1]:3000' -> '::1'. @param {string | undefined | null} h */
export function normalizeHost(h) {
  if (!h) return '';
  let s = String(h).trim().toLowerCase();
  if (s.startsWith('[')) { const end = s.indexOf(']'); s = end > 0 ? s.slice(1, end) : s; }
  else { const i = s.indexOf(':'); if (i >= 0) s = s.slice(0, i); }
  return s.replace(/\.$/, '');
}

/** @param {Record<string, unknown> | null | undefined} raw */
export function normalizeFeatures(raw) {
  const f = /** @type {Record<string, boolean>} */ ({});
  for (const k of FEATURES) f[k] = !!(raw && raw[k] === true);
  return /** @type {TenantDescriptor['features']} */ (f);
}

/**
 * Pure: rows as returned by the registry query -> lookup maps.
 * Only verified domains resolve; a domain awaiting DNS has no traffic to route.
 * @param {any[]} rows
 */
export function buildRegistry(rows) {
  /** @type {Map<string, TenantDescriptor>} */ const byHost = new Map();
  /** @type {Map<string, TenantDescriptor>} */ const bySlug = new Map();
  for (const r of rows) {
    const domains = (r.tenant_domains || []).filter((/** @type {any} */ d) => d.verified_at);
    const hosts = domains.map((/** @type {any} */ d) => normalizeHost(d.host)).sort();
    const primary = domains.find((/** @type {any} */ d) => d.is_primary);
    /** @type {TenantDescriptor} */
    const desc = Object.freeze({
      id: r.id, slug: r.slug, name: r.name, status: r.status,
      primaryHost: primary ? normalizeHost(primary.host) : (hosts[0] || null),
      hosts: Object.freeze(hosts),
      timezone: r.timezone, currency: String(r.currency).trim(),
      features: Object.freeze(normalizeFeatures(r.features)),
      brand: Object.freeze({ ...(r.brand || {}) }),
      envPrefix: r.env_prefix || null,
    });
    bySlug.set(desc.slug, desc);
    for (const h of hosts) {
      const prior = byHost.get(h);
      if (prior && prior.id !== desc.id) throw new Error(`host ${h} claimed by both ${prior.slug} and ${desc.slug}`);
      byHost.set(h, desc);
    }
  }
  return { byHost, bySlug };
}

const QUERY = 'id, slug, name, status, timezone, currency, features, brand, env_prefix, tenant_domains(host, is_primary, verified_at)';

/**
 * Read the registry from the database and swap it in. Throws on failure
 * (and leaves the current registry in place).
 * @param {{ client?: any, now?: () => Date }} [opts]
 */
export async function load({ client, now = () => new Date() } = {}) {
  const c = client || adminSystemClient();
  const { data, error } = await c.schema('platform').from('tenants').select(QUERY);
  if (error || !Array.isArray(data)) {
    const msg = error ? `${error.code || ''} ${error.message}`.trim() : 'registry query returned no data';
    state = { ...state, lastError: msg };
    throw new Error(`registry load failed: ${msg}`);
  }
  const { byHost, bySlug } = buildRegistry(data);
  state = { byHost, bySlug, loadedAt: now(), lastError: null };
  return bySlug.size;
}

/** Same as load(), named for call sites that re-read. */
export const refresh = load;

/** @param {string | undefined | null} host */
export function getByHost(host) { return state.byHost.get(normalizeHost(host)); }
/** @param {string} slug */
export function getBySlug(slug) { return state.bySlug.get(slug); }
/** @returns {TenantDescriptor[]} */
export function uniqueTenants() { return [...state.bySlug.values()].filter((d) => d.status !== 'archived'); }
export function registryStatus() {
  return { tenants: uniqueTenants().length, loaded_at: state.loadedAt ? state.loadedAt.toISOString() : null, last_error: state.lastError };
}

/** @type {NodeJS.Timeout | null} */
let timer = null;
/** Re-read every TTL; errors are logged and the last good registry is kept. @param {{ log?: (m: string) => void }} [o] */
export function startAutoRefresh({ log = console.error } = {}) {
  stopAutoRefresh();
  timer = setInterval(() => { load().catch((e) => log(String(e.message || e))); }, REGISTRY_TTL_MS);
  timer.unref();
}
export function stopAutoRefresh() { if (timer) clearInterval(timer); timer = null; }

/** Test hook: install a registry directly from rows. @param {any[]} rows @param {Date} [at] */
export function __setRegistryForTests(rows, at = new Date(0)) {
  const { byHost, bySlug } = buildRegistry(rows);
  state = { byHost, bySlug, loadedAt: at, lastError: null };
}
