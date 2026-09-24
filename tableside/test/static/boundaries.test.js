// Guard 1: only lib/db.js constructs clients or names DB secrets; only
// lib/email.js names email secrets; process.env only in the allow-listed files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { boundaryViolations } from './guards.js';
import { ROOT, FIXTURES } from '../helpers/paths.js';

test('repo respects the client/secret boundary', () => {
  assert.deepEqual(boundaryViolations(ROOT), []);
});

test('positive control: the guard catches each kind of violation', () => {
  const v = boundaryViolations(join(FIXTURES, 'boundary'));
  const joined = v.join('\n');
  assert.match(joined, /routes\/sneaky\.js: imports @supabase\/supabase-js or pg/);
  assert.match(joined, /routes\/sneaky\.js: names a DB secret/);
  assert.match(joined, /routes\/sneaky\.js: names an email secret/);
  assert.match(joined, /routes\/sneaky\.js: reads process\.env/);
  assert.ok(!joined.includes('lib/db.js: imports'), 'lib/db.js is the allowed file');
});
