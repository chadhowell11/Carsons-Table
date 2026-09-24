# Decisions (append-only, numbered)

Corrections are made in place with a visible **Corrected YYYY-MM-DD** marker. New decisions get the next number.

## D1–D9 — confirmed in discovery (RESTAURANT-PLATFORM-DISCOVERY.md §6)

**D1 Pooled isolation.** One Supabase project; `tenant_id` + RLS + guard trigger on every tenant table. The client factory keeps Tatami's interface (`forToken`, `adminClient`, `publicConfig`) so a tenant can later move to its own project without a handler change. *Why:* many small tenants, onboarding as a sales motion; a project per restaurant costs a paid floor each and free tiers pause, which is unacceptable for a storefront. Tatami's warning is about `tenant_id` enforced by app `WHERE` clauses; here the database enforces it, and a static test fails the build if a table lacks it.

**D2 Registry in the DB.** `platform.tenants` + `platform.tenant_domains`, cached in memory behind `getByHost()`. *Why:* onboarding a restaurant can't require a deploy.

**D3 Renderer + presets + tokens + `sites/<slug>/` overrides.** *Why:* a restaurant's site is its menu, specials and events, which staff edit daily; a static folder per tenant can't read them. The override folder keeps Tatami's escape hatch for bespoke pieces.

**D4 No build step.** Server-rendered public HTML, vanilla ES modules in admin, hand-written CSS custom properties. *Why:* matches the prototype and both sibling apps; SEO for the public site.

**D5 Orders (Phase 2).** Capture + staff queue; Square Checkout link after per-tenant OAuth; pay-at-pickup fallback. No card handling in-platform.

**D6 Reservations are requests (Phase 2).** Staff confirm. Real-time table inventory is not a Phase 1 promise.

**D7 Hosting.** A Node host with wildcard custom domains and automatic TLS (Render / Fly / Railway class). Per-tenant custom domains are a hard requirement; pick the host by that.

**D8 Platform name PROVISIONAL `tableside`.** Used only as package name, landing-page title and `TS_` env prefix; kept in `lib/platform.js`.

**D9 One preset at launch: `coastal`.** Carson's Table's dark-dominant look is tokens on this preset. A second preset is required before tenant #2.

## Decisions made during Phase 0

**D10 The platform lives in `tableside/` inside the Carsons-Table repo.** The implementing session could push only to `chadhowell11/carsons-table`. The prototype at the repo root is untouched and still deploys to Pages from `main`; its "no package manager" rule applies to the prototype, not to this directory. The Phase 1 import runs with `--src ..`. Moving `tableside/` to its own repo later is a `git subtree split`. **Before merging to `main`**: Pages serves the whole repo, so `tableside/` source would become browsable at the Pages URL (no secrets, `robots.txt` still disallows crawling). Prefer splitting it out first.

**D11 A silo tenant's missing keys are an error.** With `envPrefix` set, `lib/db.js` requires `${prefix}_SUPABASE_URL` etc. and does not fall back to the pooled `TS_` keys. The spec says it resolves the prefixed keys "first"; a silent fallback would point a silo tenant at the pooled database, which is exactly the failure the silo exists to prevent.

**D12 Claims are read through `platform.jwt_claims()`.** The spec's `current_setting('request.jwt.claims', true)::jsonb` raises on the empty string a pooled connection holds after a transaction-local `set_config`. `jwt_claims()` applies `nullif(…, '')` before the cast.

**D13 Security-definer functions pin `search_path = ''`** and qualify every name.

**D14 The `platform` schema is exposed to the API with explicit grants.** Staff read their own membership through RLS (`requireStaff`), so PostgREST must see the schema. Everything is revoked from `anon`/`authenticated` except `select` on staff_memberships, platform_admins and audit_log (each behind RLS). `tenants`, `tenant_domains`, `heartbeat`, `schema_migrations` also get RLS with no policy, so only the service role reads them even if a grant slips.

**D15 `platform_admins` has a read-own policy** so `requirePlatformAdmin` can use the RLS-bound client instead of the admin client.

**D16 The audit trigger never fails the write it records.** A failed `audit_log` insert is caught and raised as a `WARNING` (which reaches the Postgres log); the write proceeds. Spec §7.3: bookkeeping never fails the operation.

**D17 Additions to the §4.3 DDL.** `currency` columns check `^[A-Z]{3}$`; `modifiers` gets a `currency` column (price deltas are money; the schema guard requires a currency next to every `_cents`); focal points are checked to [0,1]; `events.ends_at >= starts_at`; `specials.schedule` must be an object with `type` in weekly/range/always; `hours_exceptions` needs opens/closes when not closed; `menu_items.dietary_tags <@ DIETARY_TAGS`; `menus.slug` format. For tables without a `status` column (0003), the macro's `<visibility>` makes reads staff-only: an anon tenant token sees no orders or reservations.

**D18 Storage policies use `platform.path_tenant(name)`.** Returns null for a first path segment that isn't a UUID, so a malformed object name is refused by policy rather than by a cast error.

**D19 Email transport is PROVISIONAL.** The OHF module's provider wasn't available to this session. `lib/email.js` keeps the OHF shape (`send`, templates, suppression list, structured logs) and posts to an HTTP API in Resend's request format (`TS_EMAIL_API_URL` overrides the endpoint). Swapping providers changes one function. Auth emails (invites, magic links, resets) are sent by Supabase Auth itself via its SMTP settings; `lib/email.js` covers the platform's own mail.

**D20 Local dev/CI stack instead of `supabase start`.** Container registries were rate-limited in the build environment, so `scripts/dev-stack/start.sh` runs pinned, checksum-verified PostgREST and GoTrue release binaries against a local Postgres, plus `gateway.js` (Kong's role: `/rest/v1`, `/auth/v1`) and a small **storage shim** for `/storage/v1`. The shim writes object rows through `storage.objects` under the caller's JWT role, so migration 0004's policies decide; bytes go to local disk. It implements upload, remove and public GET only. It is not Supabase Storage, and nothing about signed URLs, transforms or resumable uploads is tested by it. `bootstrap.sql` recreates the Supabase roles, default grants and a minimal `storage` schema; it must never run against a hosted project.

**D21 `publicClient()` is async.** Minting the tenant token with `jose` is async. Callers `await req.tenant.publicClient()`. Minted clients are reused until a minute before expiry.

**D22 `renderer/tokens.js` and `/t/:slug/tokens.css` were pulled forward from Phase 1.** The §7.1 brand head (Phase 0 login page) links tokens.css. Admin neutrals (`--a-*`) are emitted into tokens.css from constants in `tokens.js`, so `admin/**` carries no color literals at all (static guard 3).

**D23 DB tests fail, never skip, when the stack is missing**, and `scripts/run-tests.js` treats any skipped or todo test as a failure. A skipped isolation test reads as green.

**D24 What the isolation suite taught.** (a) Opening only an insert policy still leaves cross-tenant inserts refused by the guard trigger; the breach that remains is anon writing into its own tenant. Both layers are mutation-tested separately. (b) `INSERT … RETURNING` is also checked against the SELECT policy, which hides write-policy holes. The checker's refusal probes insert without `RETURNING`, the way PostgREST does with `Prefer: return=minimal`.

**D25 Only verified domains resolve.** `tenant_domains.verified_at is null` means "awaiting DNS", its own state; such hosts aren't in the in-memory map. `create-tenant.js` marks `*.localhost` verified and leaves real domains awaiting DNS.

**D26 Paused tenants' public sites return 503** with `Retry-After` and a static page; admin stays fully readable.

**D27 Carson's Table brand files were copied into `sites/carsons-table/` in Phase 0,** not left for the Phase 1 import. `brand.json` (spec §6.5) references `wordmark.webp`, `favicon.png` and `exterior.webp` there. The Phase 0 login probe caught the missing files as 404s on every admin page. Copied from the prototype's `assets/img/`, byte for byte: wordmark, mono, favicon, icon-180, exterior. This also settles the §6.5/§10 mismatch over `ogImage`. `test/unit/brand-assets.test.js` now fails if a brand path is missing. The import (§10 step 3) should keep copying them idempotently.

## Content notes carried from the prototype (spec §10)
- Menu typos corrected vs. the restaurant's PDFs: Cervaro ("Cevaro"), Tempus Fugit ("Tempes Fugit"), Cosmopolitan ("COSMPOLITAN"), plus EMPORER, "Sicily, Itlay", Terre Nere spelled two ways. Their two PDFs also disagree on two wines. Confirm with the client.
- Two photos with unconfirmed dish attribution: the tall iced cocktail tagged **Berry Blush** (may be the Spring Soda mocktail); the po-boy tagged **Fried Catfish Po-boy** (inferred from a single fillet).
- Hours and hero copy from the prototype are **PROVISIONAL** until the owner edits them.

## Open questions for Phase 1
- ~~§6.5 `ogImage` points at `sites/carsons-table/exterior.webp`, which §10 step 3 doesn't copy.~~ **Closed 2026-09-24 by D27.**
- Staff-only "draft" banner on the public site (§3.2) needs the public renderer to know a staff session exists; the Phase 0 shell omits it. Phase 1 renderer decision.
