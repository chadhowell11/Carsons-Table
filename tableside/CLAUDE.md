# CLAUDE.md — standing instructions for the restaurant platform code session

Read `RESTAURANT-PLATFORM-SPEC.md` first; it is decided, not a proposal. This file is the
discipline that keeps the implementation honest. Every rule here was earned by a production incident
in one of two sibling codebases (see `docs/DECISIONS.md` for provenance). Do not delete a rule
because it is inconvenient; propose an amendment in `docs/DECISIONS.md` instead.

## Invariants (a static test enforces each — do not work around the test)
1. **`req.tenant` is the only tenant handle.** No global DB client, no module-level singleton, no
   `process.env.TS_*` outside `lib/db.js` / `lib/email.js` / `lib/platform.js`.
2. **`lib/db.js` is the only file that constructs DB, auth or storage clients.** Everything else
   calls `req.tenant.publicClient()`, `req.tenant.forToken(jwt)`, or — after server-side
   authorization and with a `// authorize-then-write` comment — `req.tenant.adminClient`.
3. **Every tenant table has `tenant_id`, RLS, the four policies, the guard trigger, the audit
   trigger.** Add a table without them and the build fails. That is the intended outcome.
4. **Migrations are numbered, idempotent, append-only.** Never edit an applied migration; add the
   next number.
5. **Shared admin pages contain no tenant strings or hex colors.** Brand comes from
   `window.__BRAND__` and `tokens.css`.
6. **No `alert` / `confirm` / `prompt`.** Use `admin/js/dialog.js`.
7. **Money is integer cents + currency. Time is `timestamptz` or `time` + tenant timezone.** No floats
   for money, no naive timestamps, no `Date.now()` inside `lib/logic/*` — `now` and `tz` are inputs.

## Failure is not absence
A read that fails must not look like "there is nothing." Public renderers use strict reads. The
menu block, the hours rail, the specials block each have three states: has content / genuinely
empty / could not read. Render them differently and test that the difference is visible.
"Sold out" is not "hidden"; "awaiting DNS" is not "failed"; "unknown" hours are not "closed".

## Status codes name the right party
A datastore failure on a write is `503` with a body that says nothing was saved. It is never `400`.
A missing membership is `403`, never `401`. An off feature is `404`, not `403`. Error messages
derived from a validator list the validator's values, never a hand-typed copy. The `apiFetch`
wrapper throws the server's body verbatim; it never returns `null` on non-ok. Audit-log failure is
logged and never fails the operation it records.

## Tests that prove something
- Mutation-test every new assertion in `lib/logic`, the isolation tests, and the static guards:
  break the thing, watch it fail, restore. A guard ships with a positive control or it does not ship.
- Any per-key map derived from an enum in `lib/enums.js` is generated from it or has a test that
  enumerates the enum and fails on a missing key.
- Anything a user sees is driven in Playwright at 1280 and 390 wide, with `pageerror` and
  `console.error` captured, and with a control run in the healthy state.
- Read the TAP summary, not a wrapper's exit code. Confirm the process exited.
- The harness clears every `TS_*` env var before tests run.

## Process
- Before claiming something does not exist in the repo, prove you can see the whole repo
  (`git fetch --all; git branch -r | wc -l` vs `git ls-remote --heads origin | wc -l`).
- "Shipped" means merged to `main` **and** deployed. Otherwise say "on branch `<name>`, unmerged."
- Every button that does work shows the click landed before the work starts; release in `finally`.
- A script a committed doc tells someone to run is itself committed (a static guard checks).
- Keep `docs/ARCHITECTURE.md` short and regenerated; put reasons in `docs/DECISIONS.md`
  (append-only, numbered, corrections in place with a visible marker). Close items in the doc when
  you close them in code.

## Carson's Table specifics
- Palette values come from the sampled logo. Use the JSON in spec §6.5 verbatim.
- Keep `noindex` on the public site until `platform.tenants.status = 'live'`. It is a real
  business's real menu.
- Hours and hero copy imported from the prototype are **PROVISIONAL**; the admin banner stays until
  an owner edits them.

## Checklist before any non-trivial change
1. Whole repo visible? 2. Does this copy a shared list by hand? 3. Any new path that conflates
failure with absence? 4. Any message or status naming the wrong party? 5. Mutation-tested?
6. Driven in a browser, with a control? 7. Read the result, not the exit code? 8. Is the handoff
claim "merged and deployed" or "on a branch"?

## Working in this repo (added in Phase 0; rules above are unchanged)
- This directory is the platform; the repo root is the Carson's Table prototype (D10). Don't edit the prototype from here.
- `npm run stack:start` brings up the local stand-in for Supabase (D20); `npm run seed:dev` creates the two fixture tenants.
- `npm test` = unit + static (no services). `npm run test:db` needs the stack and fails if it's absent.
- Tooling that must name a secret's env var imports `ENV_KEYS` from `lib/db.js` rather than spelling it.
