// Derived maps are complete for their enum (OHF §3): enumerate the source and
// fail on a missing or extra key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../lib/enums.js';

const complete = (name, list, map) => test(`${name} covers every value`, () => {
  assert.deepEqual(Object.keys(map).sort(), [...list].map(String).sort());
});
complete('DIETARY_LABELS', E.DIETARY_TAGS, E.DIETARY_LABELS);
complete('AVAILABILITY_LABELS', E.AVAILABILITY, E.AVAILABILITY_LABELS);
complete('ROLE_RANK', E.ROLES, E.ROLE_RANK);
test('DOW_LABELS has one label per DOW, Sunday first', () => {
  assert.equal(E.DOW_LABELS.length, E.DOW.length);
  assert.equal(E.DOW_LABELS[0], 'Sunday');
});
test('ROLE_RANK orders owner > manager > staff', () => {
  assert.ok(E.ROLE_RANK.owner > E.ROLE_RANK.manager && E.ROLE_RANK.manager > E.ROLE_RANK.staff);
});
test('positive control: the completeness check fails on a missing key', () => {
  const partial = { ...E.DIETARY_LABELS }; delete partial.spicy;
  assert.notDeepEqual(Object.keys(partial).sort(), [...E.DIETARY_TAGS].sort());
});
