// Static guards (spec §11.2). Each is a pure function over a directory tree that
// returns a list of violations; the *.test.js files run them against the repo
// (expecting none) and against a violating fixture (expecting the violation) —
// the positive control that proves the guard can fail.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.dev-stack', '.git', 'test-results']);
const FIXTURES = join('test', 'static', 'fixtures');

/** All files under root with one of the extensions, repo-relative with '/' separators. */
export function listFiles(root, exts, { includeFixtures = false } = {}) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const p = join(dir, name);
      const rel = relative(root, p);
      if (!includeFixtures && rel.startsWith(FIXTURES)) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (exts.some((e) => name.endsWith(e))) out.push(rel.split(sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
/** Strip // and /* *\/ comments so a comment mentioning a name is not a reference. Strings are kept. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
}

// ---------------------------------------------------------------------------
// Guard 1 — client construction boundary
// ---------------------------------------------------------------------------
const JS = ['.js', '.mjs', '.cjs'];
const IMPORTS_CLIENT = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:@supabase\/supabase-js|pg)(?:\/[^'"]*)?['"]/;
const DB_SECRET_NAME = /TS_(?:SUPABASE_|DB_URL|JWT_SECRET)/;
const EMAIL_SECRET_NAME = /TS_EMAIL_/;
const PROCESS_ENV = /process\.env\b/;
/** Where process.env may appear at all, and why. */
export const PROCESS_ENV_ALLOWED = Object.freeze({
  'lib/db.js': 'DB/auth/storage secrets',
  'lib/email.js': 'email secrets',
  'lib/platform.js': 'non-secret constants',
  'server.js': 'PORT',
  'scripts/run-tests.js': 'clears TS_* before tests',
  'scripts/dev-stack/gateway.js': 'DEV_* ports and secret (dev only)',
  'scripts/dev-stack/keys.js': 'DEV_* ports (dev only)',
});

/** This file spells the patterns it looks for. */
const SELF = 'test/static/guards.js';

export function boundaryViolations(root) {
  const v = [];
  for (const f of listFiles(root, JS)) {
    if (f === SELF) continue;
    const src = stripComments(read(root, f));
    const isTest = f.startsWith('test/');
    if (f !== 'lib/db.js' && IMPORTS_CLIENT.test(src)) v.push(`${f}: imports @supabase/supabase-js or pg (only lib/db.js may)`);
    if (f !== 'lib/db.js' && DB_SECRET_NAME.test(src)) v.push(`${f}: names a DB secret (only lib/db.js may; import ENV_KEYS instead)`);
    if (f !== 'lib/email.js' && EMAIL_SECRET_NAME.test(src)) v.push(`${f}: names an email secret (only lib/email.js may)`);
    if (!isTest && !(f in PROCESS_ENV_ALLOWED) && PROCESS_ENV.test(src)) v.push(`${f}: reads process.env (allowed only in ${Object.keys(PROCESS_ENV_ALLOWED).join(', ')})`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Guard 2 — adminClient / adminSystemClient call sites match docs/ARCHITECTURE.md
// ---------------------------------------------------------------------------
const MARK = 'authorize-then-write';
export function callSites(root) {
  /** @type {Record<string, {adminClient:number, adminSystemClient:number, unmarked:string[]}>} */
  const sites = {};
  for (const f of listFiles(root, JS)) {
    if (f === 'lib/db.js' || f.startsWith('test/')) continue;
    const lines = read(root, f).split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      const n1 = (code.match(/\.adminClient\b/g) || []).length;
      const n2 = (code.match(/\badminSystemClient\s*\(/g) || []).length;
      if (!n1 && !n2) return;
      const s = (sites[f] ||= { adminClient: 0, adminSystemClient: 0, unmarked: [] });
      s.adminClient += n1; s.adminSystemClient += n2;
      if (n1 && !(line.includes(MARK) || (lines[i - 1] || '').includes(MARK))) s.unmarked.push(`${f}:${i + 1}`);
    });
  }
  return sites;
}

/** Parses the table between <!-- privileged-call-sites:start/end --> in docs/ARCHITECTURE.md. */
export function documentedCallSites(root) {
  const doc = read(root, 'docs/ARCHITECTURE.md');
  const m = /<!-- privileged-call-sites:start -->([\s\S]*?)<!-- privileged-call-sites:end -->/.exec(doc);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3 || !cells[0].startsWith('`')) continue;
    out[cells[0].replace(/`/g, '')] = { adminClient: Number(cells[1]), adminSystemClient: Number(cells[2]) };
  }
  return out;
}

export function callSiteViolations(root) {
  const v = [];
  const actual = callSites(root);
  const documented = documentedCallSites(root);
  if (!documented) return ['docs/ARCHITECTURE.md: missing <!-- privileged-call-sites:start --> table'];
  for (const [f, s] of Object.entries(actual)) {
    for (const u of s.unmarked) v.push(`${u}: adminClient use without a // ${MARK} comment on this or the previous line`);
    const d = documented[f];
    if (!d) { v.push(`${f}: privileged client used but not listed in docs/ARCHITECTURE.md`); continue; }
    if (d.adminClient !== s.adminClient) v.push(`${f}: adminClient used ${s.adminClient}×, documented ${d.adminClient}×`);
    if (d.adminSystemClient !== s.adminSystemClient) v.push(`${f}: adminSystemClient used ${s.adminSystemClient}×, documented ${d.adminSystemClient}×`);
  }
  for (const f of Object.keys(documented)) if (!actual[f]) v.push(`${f}: documented in docs/ARCHITECTURE.md but has no privileged call sites`);
  return v;
}

// ---------------------------------------------------------------------------
// Guard 5 — schema coverage
// ---------------------------------------------------------------------------
/** Text from `open` (index of '(') to its matching ')', exclusive. Ignores parens in quotes. */
function balanced(sql, open) {
  let depth = 0, q = null;
  for (let i = open; i < sql.length; i++) {
    const c = sql[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return sql.slice(open + 1, i);
  }
  throw new Error(`unbalanced parentheses at ${open}`);
}

/** Split on top-level commas. */
function topLevel(body) {
  const parts = []; let depth = 0, q = null, cur = '';
  for (const c of body) {
    if (q) { if (c === q) q = null; cur += c; continue; }
    if (c === "'" || c === '"') q = c;
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const stripSqlComments = (s) => s.replace(/--[^\n]*/g, '');

/** @returns {{ sql: string, tables: Map<string, {file:string, columns: Map<string,string>, constraints: string[]}> }} */
export function parseMigrations(dir) {
  const files = readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const tables = new Map();
  let all = '';
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(dir, file), 'utf8')).toLowerCase();
    all += `\n${sql}`;
    const re = /create\s+table\s+if\s+not\s+exists\s+([a-z_][a-z0-9_.]*)\s*\(/g;
    let m;
    while ((m = re.exec(sql))) {
      const body = balanced(sql, m.index + m[0].length - 1);
      const columns = new Map(); const constraints = [];
      for (const part of topLevel(body)) {
        const name = part.split(/\s+/)[0];
        if (['unique', 'primary', 'check', 'constraint', 'foreign', 'exclude'].includes(name)) constraints.push(part);
        else columns.set(name, part);
      }
      tables.set(m[1], { file, columns, constraints });
    }
    const add = /alter\s+table\s+([a-z_][a-z0-9_.]*)\s+add\s+column\s+if\s+not\s+exists\s+([^;]+);/g;
    while ((m = add.exec(sql))) {
      const t = tables.get(m[1]);
      if (t) t.columns.set(m[2].trim().split(/\s+/)[0], m[2].trim());
    }
  }
  return { sql: all, tables };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function schemaViolations(dir) {
  const v = [];
  const { sql, tables } = parseMigrations(dir);
  for (const [name, t] of tables) {
    if (name.startsWith('platform.')) continue;
    const n = esc(name);
    const need = (ok, what) => { if (!ok) v.push(`${name} (${t.file}): ${what}`); };
    const tenant = t.columns.get('tenant_id') || '';
    need(/uuid\s+not\s+null\s+(unique\s+)?references\s+platform\.tenants\s*\(\s*id\s*\)/.test(tenant), 'tenant_id uuid not null references platform.tenants(id)');
    need(/^id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/.test(t.columns.get('id') || ''), 'id uuid primary key default gen_random_uuid()');
    need(/timestamptz\s+not\s+null/.test(t.columns.get('created_at') || ''), 'created_at timestamptz not null');
    need(/timestamptz\s+not\s+null/.test(t.columns.get('updated_at') || ''), 'updated_at timestamptz not null');
    need(new RegExp(`alter\\s+table\\s+${n}\\s+enable\\s+row\\s+level\\s+security`).test(sql), 'enable row level security');
    for (const [p, op] of [['read', 'select'], ['insert', 'insert'], ['update', 'update'], ['delete', 'delete']]) {
      need(new RegExp(`create\\s+policy\\s+${n}_${p}\\s+on\\s+${n}\\s+for\\s+${op}\\b`).test(sql), `policy ${name}_${p} for ${op}`);
    }
    need(new RegExp(`create\\s+trigger\\s+${n}_guard\\s+before\\s+insert\\s+or\\s+update\\s+on\\s+${n}\\s+for\\s+each\\s+row\\s+execute\\s+function\\s+platform\\.tenant_guard\\(\\)`).test(sql), `trigger ${name}_guard → platform.tenant_guard()`);
    need(new RegExp(`create\\s+trigger\\s+${n}_audit\\s+after\\s+insert\\s+or\\s+update\\s+or\\s+delete\\s+on\\s+${n}\\s+for\\s+each\\s+row\\s+execute\\s+function\\s+platform\\.audit\\(\\)`).test(sql), `trigger ${name}_audit → platform.audit()`);
    const idx = new RegExp(`create\\s+(unique\\s+)?index\\s+if\\s+not\\s+exists\\s+\\w+\\s+on\\s+${n}\\s*\\(\\s*tenant_id\\b`).test(sql)
      || t.constraints.some((c) => /^unique\s*\(\s*tenant_id\b/.test(c)) || /\bunique\b/.test(tenant);
    need(idx, 'an index leading with tenant_id');
    // Money: *_cents integer + a currency column; never numeric/float.
    for (const [col, def] of t.columns) {
      if (/\b(numeric|decimal|real|double precision|float)/.test(def) && /(price|cents|amount|total|tax|cost)/.test(col)) need(false, `${col} is a float/numeric money column`);
      if (col.endsWith('_cents')) {
        need(/^\S+\s+integer\b/.test(def), `${col} must be integer`);
        need(t.columns.has('currency'), `${col} needs a currency column on the table`);
      }
      if (/\btimestamp\b(?!tz)/.test(def) && !/timestamptz/.test(def)) need(false, `${col} is a naive timestamp`);
    }
  }
  return v;
}

/** Values in a check constraint on `col`: in ('a','b') | <@ array['a'] | between x and y. */
export function checkValues(def, col) {
  const c = esc(col);
  let m = new RegExp(`check\\s*\\(\\s*${c}\\s+in\\s*\\(([^)]*)\\)\\s*\\)`).exec(def);
  if (m) return { kind: 'set', values: [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) };
  m = new RegExp(`check\\s*\\(\\s*${c}\\s*<@\\s*array\\s*\\[([^\\]]*)\\]`).exec(def);
  if (m) return { kind: 'set', values: [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) };
  m = new RegExp(`check\\s*\\(\\s*${c}\\s+between\\s+(\\d+)\\s+and\\s+(\\d+)\\s*\\)`).exec(def);
  if (m) return { kind: 'range', min: Number(m[1]), max: Number(m[2]) };
  return null;
}

/** Every array export of lib/enums.js is mapped in ENUM_COLUMNS and matches its SQL check exactly. */
export function enumViolations(enums, dir) {
  const v = [];
  const { tables } = parseMigrations(dir);
  // *_LABELS arrays are derived display maps, tested in test/unit/enums.test.js.
  const lists = Object.entries(enums).filter(([k, val]) => Array.isArray(val) && k === k.toUpperCase() && !k.endsWith('_LABELS'));
  for (const [name, values] of lists) {
    const cols = enums.ENUM_COLUMNS[name];
    if (!cols) { v.push(`enums.${name}: not listed in ENUM_COLUMNS`); continue; }
    for (const ref of cols) {
      const parts = ref.split('.');
      const col = parts.pop(); const table = parts.join('.');
      const t = tables.get(table);
      if (!t) { v.push(`enums.${name}: table ${table} not found in migrations`); continue; }
      const def = [t.columns.get(col) || '', ...t.constraints].join(' ');
      const got = checkValues(def, col);
      if (!got) { v.push(`enums.${name}: ${ref} has no check constraint`); continue; }
      if (got.kind === 'range') {
        const nums = values.map(Number);
        const ok = got.min === Math.min(...nums) && got.max === Math.max(...nums) && nums.length === got.max - got.min + 1;
        if (!ok) v.push(`enums.${name}: ${ref} is between ${got.min} and ${got.max}, enum is [${values}]`);
        continue;
      }
      const a = [...values].map(String).sort().join(','); const b = [...got.values].sort().join(',');
      if (a !== b) v.push(`enums.${name}: ${ref} allows [${b}], enum is [${a}]`);
    }
  }
  for (const k of Object.keys(enums.ENUM_COLUMNS)) if (!lists.some(([n]) => n === k)) v.push(`ENUM_COLUMNS.${k}: no such enum`);
  return v;
}

export const exists = existsSync;
