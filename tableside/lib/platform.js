// @ts-check
// The only place the platform's name lives (D8: PROVISIONAL "tableside").
// Renaming the platform is a find-and-replace in this file plus package.json.
// Non-secret constants only. Secrets are read in lib/db.js and lib/email.js.

export const PLATFORM_NAME = 'tableside';
export const PLATFORM_DISPLAY_NAME = 'Tableside';
export const ENV_PREFIX = 'TS';

/** Host that serves the platform landing page. Unknown hosts fall back to it. */
export const DEFAULT_HOST = (process.env.TS_DEFAULT_HOST || 'localhost').toLowerCase();
export const PUBLIC_BASE_SCHEME = process.env.TS_PUBLIC_BASE_SCHEME || 'https';

/** Registry cache TTL (spec §3.1). */
export const REGISTRY_TTL_MS = 60_000;

/** Lifetime of the tenant-scoped anon token minted per request (spec §3.3). */
export const ANON_TOKEN_TTL_S = 5 * 60;

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
