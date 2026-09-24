// @ts-check
// Last middleware. Maps anything thrown to an honest status (lib/errors.js).
// /api/* gets JSON; pages get a small HTML page with the same message.
import { toResponse } from '../lib/errors.js';
import { escapeHtml } from '../renderer/html.js';

/** @type {import('express').ErrorRequestHandler} */
export function errorHandler(err, req, res, _next) {
  const { status, body } = toResponse(err);
  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  if (res.headersSent) return res.end();
  if (req.path.startsWith('/api/')) return res.status(status).json(body);
  res.status(status).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${status}</title></head><body style="font-family:system-ui,sans-serif;margin:3rem auto;max-width:36rem;padding:0 16px"><h1 style="font-weight:500">${escapeHtml(String(body.message))}</h1></body></html>`);
}
