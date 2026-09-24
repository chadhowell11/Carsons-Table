import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer } from '../../lib/email.js';
import * as templates from '../../lib/email-templates/index.js';

const K = { key: ['TS', 'EMAIL', 'API', 'KEY'].join('_'), from: ['TS', 'EMAIL', 'FROM'].join('_') };
const data = { restaurant: "Carson's <Table>", role: 'staff', url: 'https://x.test/admin/login' };
const quiet = () => {};

test('sends through the provider and returns its id', async () => {
  let sent;
  const send = createMailer({ env: { [K.key]: 'k', [K.from]: 'noreply@x.test' }, isSuppressed: async () => null, log: quiet,
    fetchImpl: async (url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ id: 'm1' }), { status: 200 }); } });
  assert.deepEqual(await send({ to: 'Owner@Example.com', template: 'staffInvite', data }), { status: 'sent', id: 'm1' });
  assert.deepEqual(sent.to, ['owner@example.com']);
  assert.match(sent.html, /Carson&#39;s &lt;Table&gt;/, 'template values are escaped');
});

test('suppressed addresses are not sent', async () => {
  let called = false;
  const send = createMailer({ env: { [K.key]: 'k', [K.from]: 'f@x.test' }, isSuppressed: async () => 'bounce', log: quiet, fetchImpl: async () => { called = true; return new Response('{}'); } });
  assert.deepEqual(await send({ to: 'a@b.test', template: 'passwordReset', data }), { status: 'suppressed', reason: 'bounce' });
  assert.equal(called, false);
});

test('production without a key throws; it never pretends to have sent', async () => {
  const send = createMailer({ env: {}, isSuppressed: async () => null, log: quiet, production: true });
  await assert.rejects(send({ to: 'a@b.test', template: 'staffInvite', data }), (e) => e.code === 'NOT_CONFIGURED');
});

test('development without a key logs and says so', async () => {
  const logs = [];
  const send = createMailer({ env: {}, isSuppressed: async () => null, log: (e) => logs.push(e), production: false });
  assert.deepEqual(await send({ to: 'a@b.test', template: 'staffInvite', data }), { status: 'logged' });
  assert.equal(logs[0].status, 'logged');
});

test('provider errors are thrown with a code naming the provider', async () => {
  const env = { [K.key]: 'k', [K.from]: 'f@x.test' };
  const s5 = createMailer({ env, isSuppressed: async () => null, log: quiet, fetchImpl: async () => new Response('{}', { status: 502 }) });
  await assert.rejects(s5({ to: 'a@b.test', template: 'staffInvite', data }), (e) => e.code === 'PROVIDER_UNAVAILABLE');
  const s4 = createMailer({ env, isSuppressed: async () => null, log: quiet, fetchImpl: async () => new Response('{"message":"bad from"}', { status: 422 }) });
  await assert.rejects(s4({ to: 'a@b.test', template: 'staffInvite', data }), (e) => e.code === 'PROVIDER_REJECTED' && /bad from/.test(e.message));
  const sn = createMailer({ env, isSuppressed: async () => null, log: quiet, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(sn({ to: 'a@b.test', template: 'staffInvite', data }), (e) => e.code === 'PROVIDER_UNREACHABLE');
});

test('unknown template and bad address are refused, listing the real templates', async () => {
  const send = createMailer({ env: {}, isSuppressed: async () => null, log: quiet });
  await assert.rejects(send({ to: 'a@b.test', template: 'nope' }), new RegExp(`have: ${Object.keys(templates).join(', ')}`));
  await assert.rejects(send({ to: 'not-an-email', template: 'staffInvite', data }), (e) => e.code === 'BAD_ADDRESS');
});
