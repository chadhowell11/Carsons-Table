// @ts-check
// THE ONLY file that reads DB secrets or constructs DB, auth or storage clients.
// A static guard (test/static/boundaries.test.js) fails the build if any other
// file imports @supabase/supabase-js or pg, or names TS_SUPABASE_* / TS_DB_URL.
//
// Handlers get clients through req.tenant (set by middleware/tenant.js):
//   await req.tenant.publicClient()  anon, tenant-scoped, RLS-bound
//   req.tenant.forToken(jwt)         RLS-bound as the calling staff user
//   req.tenant.adminClient           service role; only after server-side
//                                    authorization, with `// authorize-then-write`
//   req.tenant.publicConfig()        { url, anonKey } — safe for the browser
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { mintTenantAnonToken } from './jwt.js';
import { ANON_TOKEN_TTL_S } from './platform.js';

/** Env keys for the pooled project (D1). */
const POOLED_KEYS = Object.freeze({
  url: 'TS_SUPABASE_URL',
  anonKey: 'TS_SUPABASE_ANON_KEY',
  serviceKey: 'TS_SUPABASE_SERVICE_KEY',
  jwtSecret: 'TS_JWT_SECRET',
});
const DB_URL_KEY = 'TS_DB_URL';

/**
 * The names of the secrets this file reads. Tooling that has to write or set them
 * (dev-stack key generator, DB tests) imports these instead of spelling them, so
 * the boundary guard can stay absolute.
 */
export const ENV_KEYS = Object.freeze({ ...POOLED_KEYS, dbUrl: DB_URL_KEY });

/**
 * Which env keys a descriptor's clients read. The silo swap-point (D1): a
 * descriptor with envPrefix 'CT' reads CT_SUPABASE_URL etc. A silo tenant whose
 * prefixed keys are missing is a configuration error, not a reason to quietly
 * fall back to the pooled project (DECISIONS D11).
 * @param {{ envPrefix?: string | null }} [desc]
 */
export function envKeysFor(desc) {
  const p = desc && desc.envPrefix;
  if (!p) return POOLED_KEYS;
  if (!/^[A-Z][A-Z0-9_]*$/.test(p)) throw new Error(`envPrefix must be UPPER_SNAKE, got ${JSON.stringify(p)}`);
  return Object.freeze({
    url: `${p}_SUPABASE_URL`,
    anonKey: `${p}_SUPABASE_ANON_KEY`,
    serviceKey: `${p}_SUPABASE_SERVICE_KEY`,
    jwtSecret: `${p}_JWT_SECRET`,
  });
}

/**
 * @param {{ envPrefix?: string | null }} [desc]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveConfig(desc, env = process.env) {
  const keys = envKeysFor(desc);
  /** @type {Record<string, string>} */
  const out = {};
  const missing = [];
  for (const [field, key] of Object.entries(keys)) {
    const v = env[key];
    if (!v) missing.push(key); else out[field] = v;
  }
  if (missing.length) throw new Error(`Missing environment: ${missing.join(', ')}`);
  return /** @type {{url:string, anonKey:string, serviceKey:string, jwtSecret:string}} */ (out);
}

const CLIENT_OPTS = Object.freeze({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });

/** @param {string} url @param {string} key @param {string} [bearer] */
function makeClient(url, key, bearer) {
  return createClient(url, key, {
    auth: { ...CLIENT_OPTS },
    global: bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined,
  });
}

// Service clients are stateless and safe to share; cache one per project.
/** @type {Map<string, import('@supabase/supabase-js').SupabaseClient>} */
const serviceClients = new Map();
/** @param {{url:string, serviceKey:string}} cfg */
function serviceClientFor(cfg) {
  const k = `${cfg.url}\n${cfg.serviceKey}`;
  let c = serviceClients.get(k);
  if (!c) { c = makeClient(cfg.url, cfg.serviceKey); serviceClients.set(k, c); }
  return c;
}

// Minted anon tokens are reused until a minute before expiry.
/** @type {Map<string, { client: import('@supabase/supabase-js').SupabaseClient, expS: number }>} */
const anonClients = new Map();

/**
 * Attach the client factory to a registry descriptor. Handlers call only these.
 * @template {{ id: string, envPrefix?: string | null }} D
 * @param {D} desc
 */
export function attachClients(desc) {
  return {
    ...desc,
    /** Anonymous, tenant-scoped, RLS-bound. Claims { role:'anon', tenant_id, exp: now+5m }. */
    async publicClient() {
      const cfg = resolveConfig(desc);
      const nowS = Math.floor(Date.now() / 1000);
      const key = `${cfg.url}\n${desc.id}`;
      const hit = anonClients.get(key);
      if (hit && hit.expS - 60 > nowS) return hit.client;
      const token = await mintTenantAnonToken({ tenantId: desc.id, secret: cfg.jwtSecret, nowS, ttlS: ANON_TOKEN_TTL_S });
      const client = makeClient(cfg.url, cfg.anonKey, token);
      anonClients.set(key, { client, expS: nowS + ANON_TOKEN_TTL_S });
      return client;
    },
    /** RLS-bound as the calling staff user. jwt is the Supabase access token. @param {string} jwt */
    forToken(jwt) {
      if (!jwt) throw new Error('forToken: jwt is required');
      const cfg = resolveConfig(desc);
      return makeClient(cfg.url, cfg.anonKey, jwt);
    },
    /** Service role, bypasses RLS. Only after server-side authorization; call sites are grep-locked. */
    get adminClient() {
      return serviceClientFor(resolveConfig(desc));
    },
    /** url + anon key only. Safe for the browser. */
    publicConfig() {
      const cfg = resolveConfig(desc);
      return { url: cfg.url, anonKey: cfg.anonKey };
    },
  };
}

/** Platform-level service client (no tenant): registry load, create-tenant, import. */
export function adminSystemClient() {
  return serviceClientFor(resolveConfig());
}

/** url + anon key of the pooled project (scripts that must check where they point). */
export function systemPublicConfig() {
  const cfg = resolveConfig();
  return { url: cfg.url, anonKey: cfg.anonKey };
}

/** @type {pg.Pool | null} */
let pool = null;
/** Direct Postgres, for migrations and the health probe. */
export function pgPool() {
  if (!pool) {
    const url = process.env[DB_URL_KEY];
    if (!url) throw new Error(`Missing environment: ${DB_URL_KEY}`);
    pool = new pg.Pool({ connectionString: url, max: 4 });
  }
  return pool;
}

/** Close the shared pool (scripts and tests). */
export async function closePool() {
  if (pool) { const p = pool; pool = null; await p.end(); }
}

/** A standalone pg client for a given URL (scripts/tests that manage their own connection). @param {string} url */
export function pgClientFor(url) {
  return new pg.Client({ connectionString: url });
}
