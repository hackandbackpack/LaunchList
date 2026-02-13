import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

// In-memory token store with expiration (single server)
const csrfTokens = new Map<string, number>();

// Cleanup expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, expires] of csrfTokens) {
    if (expires < now) csrfTokens.delete(token);
  }
}, 10 * 60 * 1000);

export function generateCsrfToken(_req: Request, res: Response) {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(token, Date.now() + 60 * 60 * 1000); // 1 hour expiry
  res.json({ token });
}

export function validateCsrf(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-csrf-token'] as string;
  if (!token || !csrfTokens.has(token)) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  // Token is single-use
  csrfTokens.delete(token);
  next();
}
