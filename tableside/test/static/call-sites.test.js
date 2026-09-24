// Guard 2: every privileged client call site is marked and listed in
// docs/ARCHITECTURE.md with the right count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { callSiteViolations } from './guards.js';
import { ROOT, FIXTURES } from '../helpers/paths.js';

test('adminClient / adminSystemClient call sites match docs/ARCHITECTURE.md', () => {
  assert.deepEqual(callSiteViolations(ROOT), []);
});

test('positive control: unmarked, miscounted, unlisted and stale entries fail', () => {
  const v = callSiteViolations(join(FIXTURES, 'callsites')).join('\n');
  assert.match(v, /routes\/listed\.js:5: adminClient use without a \/\/ authorize-then-write/);
  assert.match(v, /routes\/listed\.js: adminClient used 2×, documented 1×/);
  assert.match(v, /routes\/unlisted\.js: privileged client used but not listed/);
  assert.match(v, /routes\/gone\.js: documented .* but has no privileged call sites/);
});
