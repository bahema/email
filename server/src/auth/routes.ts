import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { SessionResponse } from '@affiliate/shared';
import { HttpError, validate } from '../http.js';
import { hashPassword, verifyPassword } from '../security/crypto.js';
import type { Sessions } from '../security/sessions.js';

export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(128);
export function authRoutes(db: DatabaseSync, sessions: Sessions, loginLimit = 5) {
  const router = Router();
  const dummyHash = hashPassword('dummy-credential-that-is-never-valid');
  const loginLimiter = rateLimit({ windowMs: 15 * 60000, limit: loginLimit, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true,
    handler: (_req, _res, next) => next(new HttpError(429, 'LOGIN_RATE_LIMITED', 'Too many login attempts. Try again in 15 minutes.')),
  });
  const globalLimiter = rateLimit({ windowMs: 15 * 60000, limit: 30, keyGenerator: () => 'single-admin', skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'LOGIN_RATE_LIMITED', 'Too many login attempts. Try again in 15 minutes.')),
  });
  const bootstrapLimiter = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.')),
  });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/session', bootstrapLimiter, (req, res) => {
    const admin = db.prepare('SELECT email FROM admin WHERE id = 1').get();
    const session = sessions.read(req) ?? sessions.create(res, null);
    res.json({ authenticated: !!session.admin_id, setupRequired: !admin, csrfToken: session.csrf_token,
      expiresAt: new Date(session.expires_at).toISOString(), admin: session.admin_id && admin ? { email: String(admin.email) } : null } satisfies SessionResponse);
  });
  router.post('/login', loginLimiter, globalLimiter, sessions.csrf, validate(z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }).strict()), async (req, res) => {
    const admin = db.prepare('SELECT email,password_hash FROM admin WHERE id = 1').get();
    const valid = await verifyPassword(req.body.password, admin ? String(admin.password_hash) : await dummyHash);
    if (!admin || !valid || String(admin.email).toLowerCase() !== req.body.email.toLowerCase()) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    sessions.destroy(req, res);
    const session = sessions.create(res, 1);
    db.prepare('INSERT INTO events (type) VALUES (?)').run('admin_logged_in');
    res.json({ authenticated: true, setupRequired: false, csrfToken: session.csrf_token, expiresAt: new Date(session.expires_at).toISOString(), admin: { email: String(admin.email) } } satisfies SessionResponse);
  });
  router.post('/logout', sessions.requireAdmin, sessions.csrf, (req, res) => {
    sessions.destroy(req, res);
    db.prepare('INSERT INTO events (type) VALUES (?)').run('admin_logged_out');
    res.json({ message: 'Logged out' });
  });
  router.post('/password', sessions.requireAdmin, loginLimiter, sessions.csrf, validate(z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).strict()), async (req, res) => {
    const admin = db.prepare('SELECT email,password_hash FROM admin WHERE id = 1').get();
    if (!admin || !await verifyPassword(req.body.currentPassword, String(admin.password_hash))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    if (req.body.currentPassword === req.body.newPassword) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a different new password');
    const passwordHash = await hashPassword(req.body.newPassword);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE admin SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 1").run(passwordHash);
      db.exec('DELETE FROM admin_sessions');
      db.prepare('INSERT INTO events (type) VALUES (?)').run('admin_password_changed');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    const session = sessions.create(res, 1);
    res.json({ authenticated: true, setupRequired: false, csrfToken: session.csrf_token, expiresAt: new Date(session.expires_at).toISOString(), admin: { email: String(admin.email) } } satisfies SessionResponse);
  });
  return router;
}
