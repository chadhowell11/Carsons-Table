# tableside (working name)

Multi-tenant restaurant platform: one deployment, many restaurants, each on its own domain with a
data-driven public site and a shared staff admin. Tenant #1 is Carson's Table, whose prototype is
the repo root above this directory.

Read `CLAUDE.md` (discipline), `docs/ARCHITECTURE.md` (what is where) and `docs/DECISIONS.md` (why).
The implementation spec is `RESTAURANT-PLATFORM-SPEC.md` (kept outside the repo).

```
npm install
npm run stack:start && npm run seed:dev && npm run dev
open http://carsons-table.localhost:3000/  and  http://demo.localhost:3000/
```
Status: **Phase 0**, on branch `claude/restaurant-platform-phase-0-4ly2nu`, unmerged.
