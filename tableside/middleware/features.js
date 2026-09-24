// @ts-check
// requireFeature(name): an off feature is invisible — 404, not 403 (Tatami §2.9).
import { HttpError } from '../lib/errors.js';
import { FEATURES } from '../lib/enums.js';

/** @param {typeof FEATURES[number]} name @returns {import('express').RequestHandler} */
export function requireFeature(name) {
  if (!(/** @type {readonly string[]} */ (FEATURES)).includes(name)) throw new Error(`requireFeature: unknown feature ${name}`);
  return (req, res, next) => {
    const t = /** @type {any} */ (req).tenant;
    if (!t || !t.features[name]) return next(new HttpError(404, 'NOT_FOUND'));
    next();
  };
}
