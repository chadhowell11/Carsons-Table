// @ts-check
// /api/public/* — anonymous API. Phase 1 adds the order and reservation stubs
// (501 NOT_YET_AVAILABLE, spec §6.7); Phase 2 makes them real.
import express from 'express';
import { HttpError } from '../lib/errors.js';

export function apiPublicRouter() {
  const r = express.Router();
  r.use(() => { throw new HttpError(404, 'NOT_FOUND'); });
  return r;
}
