// Dev/CI only: stands in for Supabase's API gateway (Kong) in front of a local
// PostgREST and GoTrue, plus a small storage shim. Hosted Supabase provides all
// of this; the platform code talks to either one through the same supabase-js
// clients built in lib/db.js.
//
//   /rest/v1/*     -> PostgREST
//   /auth/v1/*     -> GoTrue
//   /storage/v1/*  -> shim below: object rows go through storage.objects under the
//                     caller's JWT role, so the RLS policies in migrations/0004 are
//                     what allows or refuses an upload. Bytes land on local disk.
import http from 'node:http';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jwtVerify } from 'jose';
import { pgPool } from '../../lib/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STORE = join(root, '.dev-stack', 'storage');
const PORT = Number(process.env.DEV_GATEWAY_PORT || 54321);
const REST = Number(process.env.DEV_POSTGREST_PORT || 3001);
const AUTH = Number(process.env.DEV_GOTRUE_PORT || 9999);
const SECRET = new TextEncoder().encode(process.env.DEV_JWT_SECRET || '');
if (!process.env.DEV_JWT_SECRET) { console.error('DEV_JWT_SECRET is required'); process.exit(1); }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-upsert, prefer, range, accept-profile, content-profile, x-supabase-api-version',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'access-control-expose-headers': 'content-range, x-total-count',
};

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', ...CORS, ...headers, 'content-length': buf.length });
  res.end(buf);
}

function proxy(req, res, port, path) {
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  const up = http.request({ host: '127.0.0.1', port, method: req.method, path, headers }, (r) => {
    const h = { ...r.headers };
    for (const [k, v] of Object.entries(CORS)) h[k] = v;
    res.writeHead(r.statusCode || 502, h);
    r.pipe(res);
  });
  up.on('error', (e) => send(res, 502, { message: `upstream ${port} unavailable: ${e.message}` }));
  req.pipe(up);
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function claimsFrom(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.headers.apikey || '');
  const { payload } = await jwtVerify(String(token), SECRET);
  return payload;
}

/** Run fn inside a transaction as the JWT's role, the way PostgREST does. */
async function asRole(claims, fn) {
  const role = ['anon', 'authenticated', 'service_role'].includes(String(claims.role)) ? String(claims.role) : 'anon';
  const c = await pgPool().connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify(claims), String(claims.sub || '')]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function safePath(bucket, name) {
  const p = normalize(join(STORE, bucket, name));
  if (!p.startsWith(join(STORE, bucket) + '/')) throw Object.assign(new Error('bad path'), { status: 400 });
  return p;
}

async function storage(req, res, path) {
  const url = new URL(path, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); // ['object', ...]
  if (parts[0] !== 'object') return send(res, 404, { message: 'shim supports /object only' });

  if (req.method === 'GET' && parts[1] === 'public') {
    const [bucket, ...rest] = parts.slice(2);
    const b = await pgPool().query('select public from storage.buckets where id = $1', [bucket]);
    if (!b.rows[0] || !b.rows[0].public) return send(res, 404, { message: 'Bucket not found' });
    try {
      const buf = await readFile(safePath(bucket, rest.join('/')));
      return send(res, 200, buf, { 'content-type': rest.join('/').endsWith('.webp') ? 'image/webp' : 'application/octet-stream', 'cache-control': 'public, max-age=300' });
    } catch { return send(res, 404, { message: 'Object not found' }); }
  }

  let claims;
  try { claims = await claimsFrom(req); } catch { return send(res, 401, { statusCode: '401', error: 'Unauthorized', message: 'invalid JWT' }); }

  if ((req.method === 'POST' || req.method === 'PUT') && parts.length >= 3) {
    const [bucket, ...rest] = parts.slice(1);
    const name = rest.join('/');
    const upsert = req.method === 'PUT' || req.headers['x-upsert'] === 'true';
    const data = await body(req);
    try {
      const row = await asRole(claims, async (c) => {
        const sql = upsert
          ? `insert into storage.objects (bucket_id, name, owner, metadata) values ($1,$2,$3,$4)
             on conflict (bucket_id, name) do update set updated_at = now(), metadata = excluded.metadata returning id`
          : `insert into storage.objects (bucket_id, name, owner, metadata) values ($1,$2,$3,$4) returning id`;
        const r = await c.query(sql, [bucket, name, claims.sub || null, { size: data.length, mimetype: req.headers['content-type'] || null }]);
        return r.rows[0];
      });
      const p = safePath(bucket, name);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, data);
      return send(res, 200, { Key: `${bucket}/${name}`, Id: row.id });
    } catch (e) {
      if (e.code === '42501') return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      if (e.code === '23505') return send(res, 409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      if (e.code === '23503') return send(res, 404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
      return send(res, 500, { statusCode: '500', error: 'internal', message: e.message });
    }
  }

  if (req.method === 'DELETE' && parts.length === 2) {
    const bucket = parts[1];
    let prefixes;
    try { prefixes = JSON.parse(String(await body(req))).prefixes || []; } catch { return send(res, 400, { message: 'bad body' }); }
    try {
      const rows = await asRole(claims, async (c) =>
        (await c.query('delete from storage.objects where bucket_id = $1 and name = any($2) returning name, id, bucket_id', [bucket, prefixes])).rows);
      for (const r of rows) await unlink(safePath(bucket, r.name)).catch(() => {});
      return send(res, 200, rows);
    } catch (e) {
      return send(res, 500, { statusCode: '500', error: 'internal', message: e.message });
    }
  }
  return send(res, 404, { message: `shim does not implement ${req.method} ${url.pathname}` });
}

http.createServer((req, res) => {
  const u = req.url || '/';
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (u === '/__health') return send(res, 200, { ok: true });
  if (u.startsWith('/rest/v1')) return proxy(req, res, REST, u.slice('/rest/v1'.length) || '/');
  if (u.startsWith('/auth/v1')) return proxy(req, res, AUTH, u.slice('/auth/v1'.length) || '/');
  if (u.startsWith('/storage/v1')) return storage(req, res, u.slice('/storage/v1'.length) || '/').catch((e) => send(res, 500, { message: e.message }));
  send(res, 404, { message: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log(`dev gateway on :${PORT}`));
