// The isolation contract, as a function returning violations (empty = holds).
// test/db/isolation.test.js asserts it is empty on the real schema, and that it
// is NOT empty after each deliberate mutation of the schema (mutation test).
import { BUILDERS, PUBLIC_CONTENT, tenantTables, anon, staff, service, as, insert, parentIds } from './fixtures.js';

const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const tenantOf = (fx, id) => (id === fx.A.id ? 'A' : id === fx.B.id ? 'B' : id);

export async function isolationViolations(c, fx) {
  const v = [];
  const U = fx.users;
  for (const table of tenantTables()) {
    const R = fx.rows[table];
    const pub = PUBLIC_CONTENT.has(table);
    // ---- reads ----------------------------------------------------------
    const expectRead = async (label, who, want) => {
      const r = await as(c, who, async () => (await c.query(`select id, tenant_id from ${table}`)).rows);
      if (!r.ok) { v.push(`${table}: ${label} select failed: ${r.error.message}`); return; }
      const foreign = r.value.filter((row) => !want.includes(row.id));
      for (const row of foreign) v.push(`${table}: ${label} can read a row it must not (tenant ${tenantOf(fx, row.tenant_id)})`);
      if (!foreign.length && !sameSet(r.value.map((x) => x.id), want)) v.push(`${table}: ${label} sees ${r.value.length} rows, expected ${want.length}`);
    };
    await expectRead('anon(A)', anon(fx.A), pub ? R.A.published : []);
    await expectRead('anon(B)', anon(fx.B), pub ? R.B.published : []);
    await expectRead('staff(A)', staff(U.staffA), R.A.all);
    await expectRead('staff(B)', staff(U.staffB), R.B.all);
    await expectRead('authenticated non-member', staff(U.nobody), []);

    // ---- inserts --------------------------------------------------------
    const rowFor = (t, x) => ({ tenant_id: t.id, ...BUILDERS[table](t, parentIds(fx.rows, t), x)[0] });
    const expectDenied = async (label, who, row) => {
      const r = await as(c, who, () => insert(c, table, row, { returning: false }));
      if (r.ok) v.push(`${table}: ${label} insert succeeded; must be refused`);
      else if (!['42501', '23502'].includes(r.error.code)) v.push(`${table}: ${label} insert failed for the wrong reason (${r.error.code} ${r.error.message})`);
    };
    await expectDenied('anon(A) with tenant_id=B', anon(fx.A), rowFor(fx.B, '-x1'));
    await expectDenied('anon(A) into its own tenant', anon(fx.A), rowFor(fx.A, '-x2'));
    await expectDenied('staff(A) with tenant_id=B', staff(U.staffA), rowFor(fx.B, '-x3'));
    await expectDenied('non-member into A', staff(U.nobody), rowFor(fx.A, '-x4'));
    if (table !== 'site_content') { // one row per tenant: a second insert is a unique violation, not a policy question
      const ok = await as(c, staff(U.staffA), () => insert(c, table, rowFor(fx.A, '-x5')));
      if (!ok.ok) v.push(`${table}: staff(A) cannot insert into its own tenant (${ok.error.code} ${ok.error.message})`);
    }
    const noTenant = { ...rowFor(fx.A, '-x6') }; delete noTenant.tenant_id;
    const svc = await as(c, service(), () => insert(c, table, noTenant, { returning: false }));
    if (svc.ok) v.push(`${table}: service role insert without tenant_id succeeded; the guard must require it`);
    else if (svc.error.code !== '23502' && !(table === 'site_content' && svc.error.code === '23505')) v.push(`${table}: service insert without tenant_id failed for the wrong reason (${svc.error.code})`);

    // ---- updates --------------------------------------------------------
    const aRow = R.A.published[0]; const bRow = R.B.published[0];
    const count = async (who, sql, params) => as(c, who, async () => (await c.query(sql, params)).rowCount);
    const move = await count(staff(U.staffA), `update ${table} set tenant_id = $1 where id = $2`, [fx.B.id, aRow]);
    if (move.ok && move.value > 0) v.push(`${table}: staff(A) moved a row to tenant B`);
    const dualMove = await count(staff(U.dual), `update ${table} set tenant_id = $1 where id = $2`, [fx.B.id, aRow]);
    if (dualMove.ok && dualMove.value > 0) v.push(`${table}: a member of both tenants moved a row A→B (tenant_id must be immutable)`);
    const cross = await count(staff(U.staffA), `update ${table} set updated_at = now() where id = $1`, [bRow]);
    if (!cross.ok || cross.value !== 0) v.push(`${table}: staff(A) update of B's row ${cross.ok ? `touched ${cross.value}` : `errored ${cross.error.code}`}; expected 0 rows`);
    const own = await count(staff(U.staffA), `update ${table} set updated_at = now() where id = $1`, [aRow]);
    if (!own.ok || own.value !== 1) v.push(`${table}: staff(A) cannot update its own row (${own.ok ? own.value : own.error.message})`);
    const anonUp = await count(anon(fx.A), `update ${table} set updated_at = now() where id = $1`, [aRow]);
    if (anonUp.ok && anonUp.value > 0) v.push(`${table}: anon(A) updated a row`);

    // ---- deletes --------------------------------------------------------
    const del = (who, id) => count(who, `delete from ${table} where id = $1`, [id]);
    const sDel = await del(staff(U.staffA), aRow);
    if (sDel.ok && sDel.value > 0) v.push(`${table}: role 'staff' deleted a row (delete is owner/manager only)`);
    const aDel = await del(anon(fx.A), aRow);
    if (aDel.ok && aDel.value > 0) v.push(`${table}: anon(A) deleted a row`);
    const mDelB = await del(staff(U.managerA), bRow);
    if (mDelB.ok && mDelB.value > 0) v.push(`${table}: manager(A) deleted B's row`);
    const mDel = await del(staff(U.managerA), aRow);
    if (!mDel.ok || mDel.value !== 1) v.push(`${table}: manager(A) cannot delete its own row (${mDel.ok ? mDel.value : mDel.error.message})`);
  }
  return v;
}

/** Control-plane tables and the audit log. */
export async function platformViolations(c, fx) {
  const v = [];
  for (const t of ['tenants', 'tenant_domains', 'tenant_secrets', 'heartbeat', 'schema_migrations']) {
    for (const [label, who] of [['anon(A)', anon(fx.A)], ['staff(A)', staff(fx.users.staffA)]]) {
      const r = await as(c, who, async () => (await c.query(`select * from platform.${t}`)).rows);
      if (r.ok && r.value.length) v.push(`platform.${t}: ${label} can read ${r.value.length} rows`);
    }
  }
  const mem = await as(c, staff(fx.users.dual), async () => (await c.query('select user_id from platform.staff_memberships')).rows);
  if (!mem.ok || mem.value.length !== 2 || mem.value.some((r) => r.user_id !== fx.users.dual)) v.push('platform.staff_memberships: a user must read exactly their own rows');
  const anonMem = await as(c, anon(fx.A), async () => (await c.query('select 1 from platform.staff_memberships')).rows);
  if (anonMem.ok && anonMem.value.length) v.push('platform.staff_memberships: anon can read memberships');

  // Audit: a staff write is recorded with who and which tenant, and only that tenant's staff can read it.
  const audit = await as(c, staff(fx.users.staffA), async () => {
    const id = (await c.query(`insert into menus (tenant_id, slug, name, kind) values ($1, 'audit-probe', 'Audit', 'food') returning id`, [fx.A.id])).rows[0].id;
    return (await c.query(`select user_id, tenant_id, action from platform.audit_log where row_id = $1`, [id])).rows;
  });
  if (!audit.ok) v.push(`audit: staff insert failed: ${audit.error.message}`);
  else if (audit.value.length !== 1 || audit.value[0].user_id !== fx.users.staffA || audit.value[0].tenant_id !== fx.A.id || audit.value[0].action !== 'insert') v.push(`audit: expected one insert row by staff(A) for tenant A, got ${JSON.stringify(audit.value)}`);
  const leak = await as(c, staff(fx.users.staffB), async () => (await c.query('select 1 from platform.audit_log where tenant_id = $1', [fx.A.id])).rows);
  if (!leak.ok || leak.value.length) v.push('audit: staff(B) can read tenant A audit rows');
  return v;
}
