// @ts-check
// /api/admin/* — staff API. Every route is behind requireStaff; modules are
// additionally gated with requireFeature (spec §7.3). Phase 0: /me only.
import express from 'express';
import { requireStaff } from '../middleware/auth.js';
import { HttpError } from '../lib/errors.js';

export function apiAdminRouter() {
  const r = express.Router();
  r.use(requireStaff());
  r.get('/me', (req, res) => {
    const q = /** @type {any} */ (req);
    res.set('Cache-Control', 'no-store').json({
      user: q.user,
      tenant: { slug: q.tenant.slug, name: q.tenant.name },
      role: q.staff.role,
      features: q.tenant.features,
    });
  });
  r.use(() => { throw new HttpError(404, 'NOT_FOUND'); });
  return r;
}
