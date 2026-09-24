// Test harness. Clears every TS_* variable (tests never inherit real
// credentials; a test that needs one sets it), runs node:test with the TAP
// reporter, and decides pass/fail from the TAP summary — not from the child's
// exit code alone. Any fail, cancel, skip or todo, or zero tests, is a failure.
//
//   node scripts/run-tests.js unit static      (npm test)
//   node scripts/run-tests.js db               (needs the dev stack: npm run stack:start)
//   node scripts/run-tests.js probes           (needs the dev stack + seeded tenants)
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUITES = ['unit', 'static', 'db', 'probes'];
const suites = process.argv.slice(2);
if (!suites.length || suites.some((s) => !SUITES.includes(s))) {
  console.error(`usage: node scripts/run-tests.js <${SUITES.join('|')}>...`);
  process.exit(2);
}

function testFiles(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === 'fixtures') continue;
    if (statSync(p).isDirectory()) out.push(...testFiles(p));
    else if (n.endsWith('.test.js')) out.push(p);
  }
  return out.sort();
}

const env = { ...process.env };
for (const k of Object.keys(env)) if (k.startsWith('TS_')) delete env[k];

const files = suites.flatMap((s) => testFiles(join(ROOT, 'test', s)));
if (!files.length) { console.error('no test files found'); process.exit(1); }
const serial = suites.some((s) => s === 'db' || s === 'probes');
const args = ['--test', '--test-reporter=tap', ...(serial ? ['--test-concurrency=1'] : []), ...files];

const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] });
let tap = '';
child.stdout.on('data', (c) => { tap += c; process.stdout.write(c); });
child.on('close', (code, signal) => {
  const n = (k) => { const m = new RegExp(`^# ${k} (\\d+)$`, 'm').exec(tap); return m ? Number(m[1]) : null; };
  const s = { tests: n('tests'), pass: n('pass'), fail: n('fail'), cancelled: n('cancelled'), skipped: n('skipped'), todo: n('todo') };
  const problems = [];
  if (signal) problems.push(`runner killed by ${signal}`);
  if (s.tests === null) problems.push('no TAP summary (runner crashed?)');
  if (!s.tests) problems.push('zero tests ran');
  if (s.fail) problems.push(`${s.fail} failed`);
  if (s.cancelled) problems.push(`${s.cancelled} cancelled`);
  if (s.skipped) problems.push(`${s.skipped} skipped (skips hide failures; fix or delete the test)`);
  if (s.todo) problems.push(`${s.todo} todo`);
  if (s.pass !== s.tests) problems.push(`pass ${s.pass} != tests ${s.tests}`);
  if (code !== 0 && !problems.length) problems.push(`runner exited ${code}`);
  console.log(`\n[run-tests] ${suites.join('+')} · ${files.length} files · tests ${s.tests} · pass ${s.pass} · fail ${s.fail} · cancelled ${s.cancelled} · skipped ${s.skipped} · exit ${code}`);
  if (problems.length) { console.log(`[run-tests] FAILED: ${problems.join('; ')}`); process.exit(1); }
  console.log(`[run-tests] OK (${relative(process.cwd(), ROOT) || '.'})`);
});
