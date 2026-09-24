// @ts-check
// Dev fixture tenants and logins (spec §3.1). Used by scripts/seed-dev.js and by
// the DB tests and probes, so all three agree on what "the dev tenants" are.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTenant } from './create-tenant.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = (/** @type {string} */ slug) => JSON.parse(readFileSync(join(ROOT, 'sites', slug, 'brand.json'), 'utf8'));

/** Dev-only credentials. Valid nowhere but a local stack. */
export const DEV_PASSWORD = 'dev-password-not-secret';
export const DEV_USERS = Object.freeze({
  carsonsOwner: 'owner@carsons-table.localhost',
  carsonsStaff: 'staff@carsons-table.localhost',
  demoOwner: 'owner@demo.localhost',
});
export const DEV_HOSTS = Object.freeze({
  carsons: 'carsons-table.localhost', carsonsAlias: 'carsonstable.localhost', demo: 'demo.localhost',
});

/** Idempotent. @param {{ log?: (m: string) => void }} [o] */
export async function seedDev({ log = console.log } = {}) {
  await createTenant({
    slug: 'carsons-table', name: "Carson's Table", timezone: 'America/Chicago', currency: 'USD', status: 'draft',
    hosts: [DEV_HOSTS.carsons], aliases: [DEV_HOSTS.carsonsAlias],
    brand: brand('carsons-table'), features: ['ordering', 'reservations', 'specials', 'events', 'gallery'],
    owners: [
      { email: DEV_USERS.carsonsOwner, password: DEV_PASSWORD, role: 'owner' },
      { email: DEV_USERS.carsonsStaff, password: DEV_PASSWORD, role: 'staff' },
    ],
    upsert: true, log,
  });
  await createTenant({
    slug: 'demo-bistro', name: 'Demo Bistro', timezone: 'America/New_York', currency: 'USD', status: 'live',
    hosts: [DEV_HOSTS.demo], brand: brand('demo-bistro'), features: ['specials', 'events'],
    owners: [{ email: DEV_USERS.demoOwner, password: DEV_PASSWORD, role: 'owner' }],
    upsert: true, log,
  });
}
