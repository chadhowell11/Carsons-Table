// Guard 6: migrations are append-only. An edited applied file, an unrecorded
// file or a vanished file fails the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ledgerProblems, LEDGER, MIGRATIONS_DIR } from '../../scripts/migrate.js';
import { FIXTURES } from '../helpers/paths.js';

test('migrations/.checksums matches every migration file', () => {
  assert.deepEqual(ledgerProblems(MIGRATIONS_DIR, LEDGER), []);
});

test('positive control: edited and unrecorded migrations are refused', () => {
  const dir = join(FIXTURES, 'ledger');
  const p = ledgerProblems(dir, join(dir, '.checksums')).join('\n');
  assert.match(p, /0001_first\.sql: edited after it was recorded/);
  assert.match(p, /0002_unrecorded\.sql: not in ledger/);
});
