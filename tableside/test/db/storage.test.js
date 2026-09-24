// lib/storage.js against the dev stack (gateway storage shim + storage.objects
// RLS from migrations/0004), plus the storage policies checked directly in SQL
// with a mutation control.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { loadDevStackEnv } from '../helpers/stack.js';
import { signIn } from '../helpers/auth.js';
import { staff, anon, as } from './fixtures.js';

const env = loadDevStackEnv();
const db = await import('../../lib/db.js');
const tenants = await import('../../lib/tenants.js');
const storage = await import('../../lib/storage.js');
const { seedDev, DEV_USERS, DEV_PASSWORD } = await import('../../scripts/dev-fixtures.js');
const K = db.ENV_KEYS;

let A; let B;
before(async () => {
  await seedDev({ log: () => {} });
  await tenants.load();
  A = db.attachClients(tenants.getBySlug('carsons-table'));
  B = db.attachClients(tenants.getBySlug('demo-bistro'));
});
after(() => db.closePool());

const photo = () => sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 35, g: 71, b: 25 } } }).jpeg().toBuffer();

test('putMedia writes the original, three variants and the row; deleteMedia removes them', async () => {
  const row = await storage.putMedia({ tenant: A, buffer: await photo(), mime: 'image/jpeg', kind: 'dish', alt: 'Test plate' });
  try {
    assert.equal(row.tenant_id, A.id);
    assert.equal(row.storage_path, `${A.id}/${row.id}.webp`);
    assert.deepEqual(Object.keys(row.variants).sort(), ['card', 'hero', 'thumb']);
    assert.deepEqual([row.width, row.height], [1200, 800]);
    const thumb = await fetch(storage.mediaUrl(A, row, 'thumb'));
    assert.equal(thumb.status, 200);
    const meta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 220, 220]);
    const card = await sharp(Buffer.from(await (await fetch(storage.mediaUrl(A, row, 'card'))).arrayBuffer())).metadata();
    assert.equal(card.width, 720);
    const hero = await sharp(Buffer.from(await (await fetch(storage.mediaUrl(A, row, 'hero'))).arrayBuffer())).metadata();
    assert.equal(hero.width, 1200, 'hero never upscales past the source');
  } finally {
    await storage.deleteMedia({ tenant: A, media: row });
  }
  assert.equal((await fetch(storage.mediaUrl(A, row))).status, 404);
  const gone = await A.adminClient.from('media').select('id').eq('id', row.id);
  assert.deepEqual(gone.data, []);
});

test('putMedia refuses non-images with a 400 that names the file, not a 503', async () => {
  await assert.rejects(storage.putMedia({ tenant: A, buffer: Buffer.from('not an image'), mime: 'image/jpeg' }), (e) => e.status === 400 && e.code === 'VALIDATION');
  await assert.rejects(storage.putMedia({ tenant: A, buffer: await photo(), mime: 'application/pdf' }), (e) => e.status === 400 && /image\/jpeg/.test(e.message));
});

test('storage RLS: staff write only under their own tenant prefix, through the real client', async () => {
  const demoOwner = await signIn(env[K.url], env[K.anonKey], DEV_USERS.demoOwner, DEV_PASSWORD);
  const carsonsOwner = await signIn(env[K.url], env[K.anonKey], DEV_USERS.carsonsOwner, DEV_PASSWORD);
  const img = await photo();
  const cross = await B.forToken(demoOwner).storage.from('media').upload(`${A.id}/intruder.webp`, img, { contentType: 'image/webp' });
  assert.ok(cross.error, 'demo owner must not write into carsons-table/');
  const anonUp = await (await A.publicClient()).storage.from('media').upload(`${A.id}/anon.webp`, img, { contentType: 'image/webp' });
  assert.ok(anonUp.error, 'anon must not upload');
  const own = await A.forToken(carsonsOwner).storage.from('media').upload(`${A.id}/own-${Date.now()}.webp`, img, { contentType: 'image/webp' });
  assert.equal(own.error, null);
  await A.adminClient.storage.from('media').remove([own.data.path]);
});

test('storage policies in SQL, with a mutation control', async () => {
  const c = db.pgClientFor(env[K.dbUrl]);
  await c.connect();
  await c.query('begin');
  try {
    const user = async (tenant) => (await c.query(`select m.user_id from platform.staff_memberships m where m.tenant_id = $1 limit 1`, [tenant.id])).rows[0].user_id;
    const ownerA = await user(A); const ownerB = await user(B);
    const put = (who, name) => as(c, who, () => c.query(`insert into storage.objects (bucket_id, name) values ('media', $1)`, [name]));
    const check = async () => {
      const v = [];
      if ((await put(staff(ownerB), `${A.id}/x.webp`)).ok) v.push('B staff wrote under A/');
      if ((await put(anon(A), `${A.id}/y.webp`)).ok) v.push('anon wrote');
      if ((await put(staff(ownerA), 'not-a-uuid/z.webp')).ok) v.push('malformed path accepted');
      if (!(await put(staff(ownerA), `${A.id}/ok.webp`)).ok) v.push('A staff cannot write under A/');
      return v;
    };
    assert.deepEqual(await check(), []);
    await c.query('savepoint m');
    await c.query(`drop policy media_objects_insert on storage.objects; create policy media_objects_insert on storage.objects for insert with check (bucket_id = 'media' and auth.uid() is not null)`);
    assert.ok((await check()).includes('B staff wrote under A/'), 'mutation (policy ignores the path prefix) was not caught');
    await c.query('rollback to savepoint m');
  } finally {
    await c.query('rollback'); await c.end();
  }
});
