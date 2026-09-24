# Architecture (regenerated reference — reasons live in DECISIONS.md)

Phase 0. Working name `tableside` (PROVISIONAL, D8; lives only in `lib/platform.js` and `package.json`).

## Stack
Node 22, Express 5, `@supabase/supabase-js`, `pg`, `jose`, `sharp`; `node:test`; Playwright for probes.
No build step. Hosted Supabase in production; a local stand-in for dev/CI (`scripts/dev-stack/`, D20).

## Request path (`app.js`, order is load-bearing)
1 `resolveTenant` (host → registry descriptor + client factory → `req.tenant`; unknown host → landing; archived → 404)
2 `express.json` 3 `attachUser` (Bearer → `forToken(jwt).auth.getUser`) · `/healthz`
4 `/t/:slug/tokens.css`, `/sites/:slug/*` (slug must equal `req.tenant.slug`)
5 `/admin*` pages (brand-injected) and `/api/admin/*` (`requireStaff`)
6 `/api/public/*` 7 site renderer catch-all (Phase 0: tenant shell) 8 error handler

## Modules
| file | role |
|---|---|
| `lib/platform.js` | platform name, non-secret constants |
| `lib/db.js` | only constructor of clients; `attachClients` → `publicClient()` (async) / `forToken(jwt)` / `adminClient` / `publicConfig()`; `adminSystemClient()`, `pgPool()`; `envPrefix` silo swap-point |
| `lib/jwt.js` | mints `{role:'anon', tenant_id, exp:+5m}` tokens |
| `lib/tenants.js` | DB-backed registry, 60 s TTL + SIGHUP, keeps last good on failure |
| `lib/enums.js` | every shared list + `ENUM_COLUMNS` (which SQL checks mirror it) |
| `lib/errors.js` | `HttpError`, `toResponse`, `fromStoreError` (503 on store failure) |
| `lib/storage.js` | `putMedia` / `deleteMedia` / `mediaUrl`; sharp variants thumb 220² q76, card 720w, hero 1600w q78 |
| `lib/email.js` | `send({to, template, data})`, suppression list, structured log |
| `middleware/` | `tenant.js`, `auth.js` (`attachUser`, `requireStaff`, `requirePlatformAdmin`), `features.js`, `errors.js` |
| `renderer/` | `tokens.js` (brand → tokens.css), `shell.js` (Phase 0 page), `platform-landing.html`, `html.js` |
| `admin/` | brand-agnostic pages: `login.html`, `index.html`; `js/apiFetch.js`, `withBtn.js`, `supabase-client.js` |

## Tables
`platform.*`: tenants, tenant_domains, tenant_secrets, staff_memberships, platform_admins, audit_log, heartbeat, schema_migrations, email_suppressions.
Tenant (0002): locations, hours, hours_exceptions, media, menus, menu_sections, menu_items, item_servings, modifier_groups, modifiers, specials, events, site_content.
Tenant (0003, no UI): reservation_requests, orders, order_items, notifications_outbox.
Storage (0004): bucket `media`, public read; writes only under `<tenant_id>/` by that tenant's staff.

## Routes
| route | notes |
|---|---|
| `GET /` | tenant shell (noindex unless `live`); paused → 503 page; unknown host → platform landing |
| `GET /healthz` | `{ok, db, write, registry}`; performs a heartbeat write |
| `GET /t/:slug/tokens.css` | `Cache-Control: public, max-age=300` |
| `GET /sites/:slug/*` | image/font/css assets only |
| `GET /admin/`, `/admin/login` | shared pages, `<!--BRAND-HEAD-->` → tokens, favicon, `window.__BRAND__` |
| `GET /api/admin/me` | `{user, tenant, role, features}`; 401 / 403 NOT_A_MEMBER / 503 |

## Privileged client call sites (guard 2: `test/static/call-sites.test.js`)
Every `adminClient` use carries `// authorize-then-write`. Counts must match this table.
<!-- privileged-call-sites:start -->
| file | adminClient | adminSystemClient |
|---|---|---|
| `lib/tenants.js` | 0 | 1 |
| `lib/storage.js` | 2 | 0 |
| `lib/email.js` | 0 | 1 |
| `scripts/create-tenant.js` | 0 | 1 |
<!-- privileged-call-sites:end -->

## Tests (`node scripts/run-tests.js <suite>`; pass/fail read from the TAP summary)
| suite | needs | covers |
|---|---|---|
| `unit` | nothing | db config/envPrefix, jwt, registry, middleware status codes, healthz, tokens, enums maps, errors, email |
| `static` | nothing | guards 1 (boundaries), 2 (call sites), 5 (schema + enums), 6 (migration ledger), each with a positive control |
| `db` | dev stack | RLS isolation on every tenant table + 12 mutations; app end to end (hosts, tokens, healthz, login, /me); storage + policy mutation |
| `probes` | dev stack | Playwright 1280 + 390: tenant shells on two hosts, login (control, busy state, wrong password, not-a-member), session redirect; fails on any pageerror/console.error |

## Dev
```
npm install
npm run stack:start     # Postgres :54322, PostgREST, GoTrue, gateway :54321; writes .dev-stack/env
npm run seed:dev        # carsons-table.localhost / carsonstable.localhost (draft), demo.localhost (live)
npm run dev             # http://carsons-table.localhost:3000  ·  /admin/login
npm test && npm run test:db && npm run test:probes
```
