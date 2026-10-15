import type { DatabaseSync } from 'node:sqlite';
import type { Request, Response, RequestHandler } from 'express';
import { HttpError } from '../http.js';
import { sameToken, token, tokenHash } from './crypto.js';

export interface SessionOptions {
  secureCookies: boolean; sessionHours: number; siteUrl: string; allowLoopbackOrigins: boolean;
}
interface Session { token_hash: string; csrf_token: string; admin_id: number | null; expires_at: number; }
const cookieName = 'affiliate_session';
export class Sessions {
  constructor(private db: DatabaseSync, private options: SessionOptions) {}
  read(req: Request): Session | undefined {
    const raw = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return;
    const session = this.db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash(raw), Date.now()) as unknown as Session | undefined;
    return session;
  }
  create(res: Response, adminId: number | null): Session {
    this.db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(Date.now());
    const raw = token();
    const session: Session = { token_hash: tokenHash(raw), csrf_token: token(), admin_id: adminId, expires_at: Date.now() + (adminId ? this.options.sessionHours * 3600000 : 20 * 60000) };
    this.db.prepare('INSERT INTO admin_sessions (token_hash, csrf_token, admin_id, expires_at) VALUES (?, ?, ?, ?)').run(session.token_hash, session.csrf_token, session.admin_id, session.expires_at);
    res.cookie(cookieName, raw, { httpOnly: true, secure: this.options.secureCookies, sameSite: 'strict', path: '/api', maxAge: session.expires_at - Date.now() });
    return session;
  }
  destroy(req: Request, res: Response) {
    const session = this.read(req);
    if (session) this.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(session.token_hash);
    res.clearCookie(cookieName, { httpOnly: true, secure: this.options.secureCookies, sameSite: 'strict', path: '/api' });
  }
  requireAdmin: RequestHandler = (req, res, next) => {
    const session = this.read(req);
    if (!session?.admin_id) return next(new HttpError(401, 'UNAUTHORIZED', 'Please log in to continue'));
    res.locals.session = session;
    next();
  };
  csrf: RequestHandler = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin) {
      let allowed = origin === new URL(this.options.siteUrl).origin;
      if (this.options.allowLoopbackOrigins) {
        try { const url = new URL(origin); allowed ||= url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && ['5173', '3001'].includes(url.port); } catch { allowed = false; }
      }
      if (!allowed) return next(new HttpError(403, 'CSRF_REJECTED', 'Request origin is not permitted'));
    }
    const session = (res.locals.session as Session | undefined) ?? this.read(req);
    if (!session || !sameToken(req.get('x-csrf-token') ?? '', session.csrf_token)) return next(new HttpError(403, 'CSRF_REJECTED', 'Session expired or security token missing. Reload and try again.'));
    next();
  };
}
