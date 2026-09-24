// Guard 5: every tenant table is born with tenant_id, RLS, four policies, the
// guard and audit triggers, a tenant_id index, integer-cents money and
// timestamptz; every enum in lib/enums.js matches its check constraint exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as enums from '../../lib/enums.js';
import { schemaViolations, enumViolations, parseMigrations } from './guards.js';
import { ROOT, FIXTURES } from '../helpers/paths.js';

const MIG = join(ROOT, 'migrations');

test('every tenant table in migrations/ is covered', () => {
  assert.deepEqual(schemaViolations(MIG), []);
});

test('every enum in lib/enums.js matches its SQL check constraint', () => {
  assert.deepEqual(enumViolations(enums, MIG), []);
});

test('positive control: a non-compliant table fails on every missing piece', () => {
  const v = schemaViolations(join(FIXTURES, 'schema-bad')).join('\n');
  for (const what of ['tenant_id uuid not null', 'enable row level security', 'policy widgets_read', 'policy widgets_insert',
    'policy widgets_update', 'policy widgets_delete', 'widgets_guard', 'widgets_audit', 'index leading with tenant_id',
    'price is a float/numeric money column', 'starts is a naive timestamp', 'total_cents needs a currency column']) {
    assert.ok(v.includes(what), `expected a violation mentioning "${what}"\n${v}`);
  }
});

test('negative control: a compliant table passes', () => {
  assert.deepEqual(schemaViolations(join(FIXTURES, 'schema-good')), []);
});

test('positive control: enum drift is caught in both directions', () => {
  const fake = { ENUM_COLUMNS: { KINDS: ['widgets.kind'], EXTRA: ['widgets.kind'] }, KINDS: ['a', 'b', 'c'], UNMAPPED: ['x'] };
  const v = enumViolations(fake, join(FIXTURES, 'schema-good')).join('\n');
  assert.match(v, /enums\.KINDS: widgets\.kind allows \[a,b\], enum is \[a,b,c\]/);
  assert.match(v, /enums\.UNMAPPED: not listed in ENUM_COLUMNS/);
  assert.match(v, /ENUM_COLUMNS\.EXTRA: no such enum/);
});

test('the parser actually sees the tenant tables (guards are not vacuous)', () => {
  const { tables } = parseMigrations(MIG);
  const tenantTables = [...tables.keys()].filter((t) => !t.startsWith('platform.'));
  assert.ok(tenantTables.length >= 1 || !tables.size, 'parsed no tables');
  assert.ok(tables.has('platform.tenants'));
});
