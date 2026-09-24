// DB/probe tests run against the local dev stack (scripts/dev-stack/start.sh).
// The harness has cleared every TS_* variable; this sets them explicitly from
// .dev-stack/env. If the stack isn't there the test FAILS — an unreachable
// database is not a reason to skip.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.js';

export const STACK_ENV = join(ROOT, '.dev-stack', 'env');

export function loadDevStackEnv() {
  if (!existsSync(STACK_ENV)) throw new Error(`dev stack env not found at ${STACK_ENV}; run: npm run stack:start`);
  const vars = {};
  for (const line of readFileSync(STACK_ENV, 'utf8').split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) vars[m[1]] = m[2];
  }
  Object.assign(process.env, vars);
  return vars;
}
