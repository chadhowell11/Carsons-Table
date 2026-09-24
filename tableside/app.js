// @ts-check
// The Express app. Middleware order is load-bearing (spec §3.4):
//   1 resolveTenant  2 body parsing  3 attachUser  4 tokens.css + /sites static
//   5 admin pages + /api/admin  6 /api/public  7 public renderer  8 error handler
import express from 'express';
import { resolveTenant } from './middleware/tenant.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { healthz, assetsRouter, siteRouter } from './routes/public.js';
import { adminPagesRouter } from './routes/admin-pages.js';
import { apiAdminRouter } from './routes/api-admin.js';
import { apiPublicRouter } from './routes/api-public.js';

/** @param {{ healthDeps?: Parameters<typeof healthz>[0] }} [opts] */
export function createApp(opts = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(resolveTenant);                                  // 1
  app.use(express.json({ limit: '256kb' }));               // 2
  app.use(attachUser);                                     // 3
  app.get('/healthz', healthz(opts.healthDeps));
  app.use(assetsRouter());                                 // 4
  app.use(adminPagesRouter());                             // 5
  app.use('/api/admin', apiAdminRouter());
  app.use('/api/public', apiPublicRouter());               // 6
  app.use(siteRouter());                                   // 7
  app.use(errorHandler);                                   // 8
  return app;
}
