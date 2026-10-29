import {deliveryRoutes} from './mail/delivery-routes.js';
import {visitorRoutes} from './analytics/visitors.js';
import { downloadRoutes } from './downloads.js';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { ApiErrorResponse, HealthResponse } from '@affiliate/shared';
import { config } from './config.js';
import { SettingsStore } from './settings/store.js';
import { contentRoutes } from './content/routes.js';
import { mediaRoutes } from './media/routes.js';
import { ContactStore } from './contacts/store.js';
import { contactRoutes } from './contacts/routes.js';
import { HttpError } from './http.js';
import { Sessions, type SessionOptions } from './security/sessions.js';
import { authRoutes } from './auth/routes.js';
import { adminRoutes, type AdminOptions } from './settings/routes.js';
import { marketingRoutes } from './marketing/routes.js';
import type { MarketingSender } from './settings/email.js';
import { leadRoutes } from './lead-pages/routes.js';
import { analyticsRoutes } from './analytics/routes.js';
import { seoRoutes } from './seo.js';
import {shareImageRoutes} from './product-sharing.js';

export interface AppOptions extends SessionOptions, AdminOptions { loginLimit?: number; trustProxy?: boolean; uploadDir?: string; marketingSender?: MarketingSender; }
export function createApp(db: DatabaseSync, schemaVersion: number, options: AppOptions = {
  secureCookies: config.NODE_ENV === 'production', sessionHours: config.SESSION_HOURS,
  siteUrl: config.SITE_URL, allowLoopbackOrigins: config.NODE_ENV !== 'production',
  encryptionKey: config.SETTINGS_ENCRYPTION_KEY ?? '', timezone: config.TIMEZONE,
  environment: config.NODE_ENV, trustProxy: config.TRUST_PROXY === 'true',
}) {
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy) app.set('trust proxy', 1);
  // Authorize Whop's exact inline pixel and its loader/event origin in the page CSP.
  app.use(helmet({ referrerPolicy: { policy: 'no-referrer' }, contentSecurityPolicy: { directives: { scriptSrc: ["'self'", "https://t.whop.tw", "'sha256-4+/JMArj30cAjAMQw8+cJmGr8zjibGYY4OkAe0U/zsg='"], connectSrc: ["'self'", "https://t.whop.tw"], imgSrc: ["'self'", "data:", "https:", "http:"], mediaSrc: ["'self'", "https:"], frameSrc: ["'self'", "https://www.youtube-nocookie.com", "https://player.vimeo.com"] } } }));
  app.use((_req, res, next) => { res.locals.requestId = randomUUID(); res.setHeader('X-Request-ID', res.locals.requestId); next(); });
  app.use(express.json({ limit: '100kb' }));
  app.use('/api',(_req,res,next)=>{res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Cache-Control','no-store');next();});
  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', service: 'affiliate-engine', database: 'connected', schemaVersion } satisfies HealthResponse);
  });
  const sessions = new Sessions(db, options);
  app.use('/api/auth', authRoutes(db, sessions, options.loginLimit));
  const settings = new SettingsStore(db, options.encryptionKey, options.siteUrl, options.timezone);
  app.use(shareImageRoutes(db,settings,options.uploadDir ?? config.uploadDir));
  const delivery=deliveryRoutes(db,settings,sessions);app.use('/api/admin/email-delivery',delivery.admin);app.use(delivery.publicRouter);
  app.use(seoRoutes(db,settings));
  app.use(visitorRoutes(db,settings,options.encryptionKey));
  app.use(['/admin','/confirm','/unsubscribe','/download','/go','/email'],(_req,res,next)=>{res.setHeader('X-Robots-Tag','noindex, nofollow');next();});
  const content = contentRoutes(db, sessions, settings);
  const media = mediaRoutes(db, sessions, settings, options.uploadDir ?? config.uploadDir);
  const contacts = contactRoutes(db, sessions, new ContactStore(db, settings, content.store, options.encryptionKey));
  const marketing = marketingRoutes(db, sessions, settings, options.marketingSender);
  app.use('/api/admin', analyticsRoutes(db, sessions, settings));
  app.use('/api/admin', marketing.admin);
  const downloadPages=downloadRoutes(db,sessions,settings);app.use('/api/admin',downloadPages.admin);app.use('/downloads',downloadPages.publicRouter);
  app.use('/email', marketing.tracking);
  const leads=leadRoutes(db,sessions,options.uploadDir??config.uploadDir);
  app.use('/api/admin',leads.admin);app.use('/api/public',leads.publicRouter);app.use('/download',leads.downloads);
  app.use('/api/admin/content', content.admin);
  app.use('/api/admin/media', media.admin);
  app.use('/api/admin/contacts', contacts.admin);
  app.use('/api/public', content.publicRouter, contacts.publicRouter);
  app.use('/media', media.publicRouter);
  app.use('/go', content.redirects);
  app.use('/api/admin', adminRoutes(db, schemaVersion, sessions, options));
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found', requestId: res.locals.requestId } } satisfies ApiErrorResponse));
  return app;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error instanceof HttpError ? error.status : error instanceof ZodError ? 400 : error?.type === 'entity.parse.failed' ? 400 : error?.type === 'entity.too.large' ? 413 : 500;
  const code = error instanceof HttpError ? error.code : error instanceof ZodError ? 'VALIDATION_ERROR' : status === 400 ? 'INVALID_JSON' : status === 413 ? 'BODY_TOO_LARGE' : 'INTERNAL_ERROR';
  const message = error instanceof HttpError ? error.message : error instanceof ZodError ? error.issues.map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ') : status === 400 ? 'Request body must be valid JSON' : status === 413 ? 'Request body is too large' : 'An unexpected error occurred';
  if (status === 500) console.error(`Request ${res.locals.requestId} failed`);
  res.status(status).json({ error: { code, message, requestId: res.locals.requestId } } satisfies ApiErrorResponse);
};

