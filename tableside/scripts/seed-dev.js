// @ts-check
// Dev fixtures (spec §3.1): two tenants on *.localhost, served from one process.
//   carsons-table  carsons-table.localhost, carsonstable.localhost   draft (noindex)
//   demo-bistro    demo.localhost                                    live
// Idempotent. Refuses to run in production or against a non-local Supabase.
//
//   npm run seed:dev      (node --env-file=.dev-stack/env scripts/seed-dev.js)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTenant } from './create-tenant.js';
import { IS_PRODUCTION } from '../lib/platform.js';
import { systemPublicConfig } from '../lib/db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = (/** @type {string} */ slug) => JSON.parse(readFileSync(join(ROOT, 'sites', slug, 'brand.json'), 'utf8'));

/** Dev-only credentials, printed below. Never valid anywhere but a local stack. */
export const DEV_PASSWORD = 'dev-password-not-secret';
export const DEV_USERS = Object.freeze({
  carsonsOwner: 'owner@carsons-table.localhost',
  demoOwner: 'owner@demo.localhost',
  carsonsStaff: 'staff@carsons-table.localhost',
});

const url = systemPublicConfig().url;
if (IS_PRODUCTION || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  console.error(`seed-dev refuses to run here (production=${IS_PRODUCTION}, supabase=${url})`);
  process.exit(1);
}

await createTenant({
  slug: 'carsons-table', name: "Carson's Table", timezone: 'America/Chicago', currency: 'USD', status: 'draft',
  hosts: ['carsons-table.localhost'], aliases: ['carsonstable.localhost'],
  brand: brand('carsons-table'), features: ['ordering', 'reservations', 'specials', 'events', 'gallery'],
  owners: [
    { email: DEV_USERS.carsonsOwner, password: DEV_PASSWORD, role: 'owner' },
    { email: DEV_USERS.carsonsStaff, password: DEV_PASSWORD, role: 'staff' },
  ],
  upsert: true,
});
await createTenant({
  slug: 'demo-bistro', name: 'Demo Bistro', timezone: 'America/New_York', currency: 'USD', status: 'live',
  hosts: ['demo.localhost'], brand: brand('demo-bistro'), features: ['specials', 'events'],
  owners: [{ email: DEV_USERS.demoOwner, password: DEV_PASSWORD, role: 'owner' }],
  upsert: true,
});
console.log(`\ndev logins (password "${DEV_PASSWORD}"):\n  ${Object.values(DEV_USERS).join('\n  ')}`);
