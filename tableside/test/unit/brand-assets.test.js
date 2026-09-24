// Every /sites/<slug>/… path a tenant's brand.json points at exists on disk.
// (Caught by the Phase 0 probe: a missing favicon was a 404 on every admin page.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../helpers/paths.js';

const sites = readdirSync(join(ROOT, 'sites')).filter((d) => existsSync(join(ROOT, 'sites', d, 'brand.json')));

test('there are brand files to check', () => assert.ok(sites.length >= 2));

for (const slug of sites) {
  test(`${slug}: brand asset paths exist and stay inside sites/${slug}/`, () => {
    const brand = JSON.parse(readFileSync(join(ROOT, 'sites', slug, 'brand.json'), 'utf8'));
    for (const k of ['logo', 'favicon', 'ogImage']) {
      const p = brand[k];
      if (!p || !p.startsWith('/sites/')) continue;
      assert.ok(p.startsWith(`/sites/${slug}/`), `${k} points outside its own folder: ${p}`);
      assert.ok(existsSync(join(ROOT, p)), `${k} → ${p} does not exist`);
    }
  });
}
