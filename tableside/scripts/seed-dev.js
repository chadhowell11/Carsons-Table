// @ts-check
// Dev fixtures: two tenants on *.localhost, served from one process.
//   carsons-table  carsons-table.localhost, carsonstable.localhost   draft (noindex)
//   demo-bistro    demo.localhost                                    live
// Idempotent. Refuses to run in production or against a non-local Supabase.
//
//   npm run seed:dev      (node --env-file=.dev-stack/env scripts/seed-dev.js)
import { seedDev, DEV_PASSWORD, DEV_USERS } from './dev-fixtures.js';
import { IS_PRODUCTION } from '../lib/platform.js';
import { systemPublicConfig } from '../lib/db.js';

const url = systemPublicConfig().url;
if (IS_PRODUCTION || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  console.error(`seed-dev refuses to run here (production=${IS_PRODUCTION}, supabase=${url})`);
  process.exit(1);
}
await seedDev();
console.log(`\ndev logins (password "${DEV_PASSWORD}"):\n  ${Object.values(DEV_USERS).join('\n  ')}`);
