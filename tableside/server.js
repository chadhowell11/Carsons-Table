// @ts-check
// Boot: migrate -> load registry -> listen. A failure in either of the first two
// stops the process: serving with an unknown schema or an empty registry would
// show every restaurant the platform landing page.
import { createApp } from './app.js';
import { migrate } from './scripts/migrate.js';
import { load, startAutoRefresh, registryStatus } from './lib/tenants.js';

const port = Number(process.env.PORT || 3000);

try {
  await migrate({ log: (m) => console.log(`[migrate] ${m}`) });
  const n = await load();
  console.log(`[registry] ${n} tenants loaded`);
} catch (e) {
  console.error(`[boot] ${/** @type {Error} */ (e).message}`);
  process.exit(1);
}
startAutoRefresh();
process.on('SIGHUP', () => {
  load().then(() => console.log(`[registry] refreshed on SIGHUP: ${JSON.stringify(registryStatus())}`))
    .catch((e) => console.error(`[registry] SIGHUP refresh failed, keeping last good registry: ${e.message}`));
});

createApp().listen(port, () => console.log(`[http] listening on :${port}`));
