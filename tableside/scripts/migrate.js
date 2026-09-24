// @ts-check
// Applies pending migrations in filename order, one transaction each, recording
// them in platform.schema_migrations. Also run at boot by server.js.
//
//   node scripts/migrate.js                 apply pending
//   node scripts/migrate.js --status        list applied / pending
//   node scripts/migrate.js --checksums     add ledger entries for new files
//
// migrations/.checksums is the append-only ledger: every migration file has a
// sha256 there, and an edited file (checksum mismatch) is refused here at run
// time and by test/static/migrations-ledger.test.js at build time.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pgPool, closePool } from '../lib/db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRATIONS_DIR = join(ROOT, 'migrations');
export const LEDGER = join(MIGRATIONS_DIR, '.checksums');
export const MIGRATION_RE = /^\d{4}_[a-z0-9_]+\.sql$/;
const LOCK_KEY = 7_140_001; // pg_advisory_lock key: one migrator at a time across instances

/** @param {string} dir */
export function migrationFiles(dir = MIGRATIONS_DIR) {
  return readdirSync(dir).filter((f) => MIGRATION_RE.test(f)).sort();
}

/** @param {string} path */
export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** @param {string} ledgerPath @returns {Map<string,string>} */
export function readLedger(ledgerPath = LEDGER) {
  const m = new Map();
  if (!existsSync(ledgerPath)) return m;
  for (const line of readFileSync(ledgerPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [sum, file] = t.split(/\s+/);
    m.set(file, sum);
  }
  return m;
}

/**
 * Problems with the ledger: edited files, files missing from the ledger, ledger
 * entries whose file is gone. Empty array = consistent.
 * @param {string} dir @param {string} ledgerPath
 */
export function ledgerProblems(dir = MIGRATIONS_DIR, ledgerPath = LEDGER) {
  const ledger = readLedger(ledgerPath);
  const files = migrationFiles(dir);
  const problems = [];
  for (const f of files) {
    const want = ledger.get(f);
    if (!want) problems.push(`${f}: not in ledger (run: node scripts/migrate.js --checksums)`);
    else if (want !== sha256File(join(dir, f))) problems.push(`${f}: edited after it was recorded — migrations are append-only; add the next number instead`);
  }
  for (const f of ledger.keys()) if (!files.includes(f)) problems.push(`${f}: in ledger but file is missing`);
  return problems;
}

function addChecksums() {
  const ledger = readLedger();
  const lines = existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8').replace(/\n*$/, '\n') : '# sha256  file — append-only; see scripts/migrate.js\n';
  let out = lines;
  for (const f of migrationFiles()) {
    if (!ledger.has(f)) { out += `${sha256File(join(MIGRATIONS_DIR, f))}  ${f}\n`; console.log(`recorded ${f}`); }
  }
  writeFileSync(LEDGER, out);
}

/**
 * @param {{ log?: (msg: string) => void }} [opts]
 * @returns {Promise<string[]>} filenames applied in this run
 */
export async function migrate({ log = console.log } = {}) {
  const problems = ledgerProblems();
  if (problems.length) throw new Error(`migration ledger check failed:\n  ${problems.join('\n  ')}`);
  const client = await pgPool().connect();
  const applied = [];
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('create schema if not exists platform');
    await client.query('create table if not exists platform.schema_migrations (filename text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query('select filename from platform.schema_migrations')).rows.map((r) => r.filename));
    for (const f of migrationFiles()) {
      if (done.has(f)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into platform.schema_migrations(filename) values ($1)', [f]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`migration ${f} failed: ${/** @type {Error} */ (e).message}`);
      }
      applied.push(f);
      log(`applied ${f}`);
    }
    // PostgREST caches the schema; tell it to re-read (no-op if nothing listens).
    await client.query(`notify pgrst, 'reload schema'`);
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return applied;
}

async function status() {
  const done = new Set((await pgPool().query('select filename from platform.schema_migrations').catch(() => ({ rows: [] }))).rows.map((r) => r.filename));
  for (const f of migrationFiles()) console.log(`${done.has(f) ? 'applied' : 'pending'}  ${f}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = process.argv[2];
  try {
    if (arg === '--checksums') addChecksums();
    else if (arg === '--status') await status();
    else { const a = await migrate(); if (!a.length) console.log('migrations: up to date'); }
  } catch (e) {
    console.error(/** @type {Error} */ (e).message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
