import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const validate = (schema: ZodType): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return next(new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues.map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ')));
  req.body = parsed.data;
  next();
};
