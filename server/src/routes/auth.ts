import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { getDatabase, getSqlite } from '../db/index.js';
import { users, tokenBlacklist } from '../db/schema.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { logAudit } from '../services/auditService.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

const DUMMY_HASH = '$2b$10$K4GxSm1D6hZGKeixhFT4duMm5sY3N5Y3N5Y3N5Y3N5Y3N5Y3N5Y3O';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// POST /api/auth/login - Rate limited to prevent brute force
router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const db = getDatabase();
    const sqliteDb = getSqlite();

    // Check account lockout
    const recentFailures = sqliteDb.prepare(`
      SELECT COUNT(*) as count FROM login_attempts
      WHERE email = ? AND success = 0
      AND attempted_at > datetime('now', ?)
    `).get(email.toLowerCase(), `-${LOCKOUT_MINUTES} minutes`) as { count: number };

    if (recentFailures.count >= MAX_ATTEMPTS) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }

    // Find user
    const user = db.select().from(users).where(eq(users.email, email.toLowerCase())).get();

    // Always compare — use dummy hash if user not found (constant-time)
    const hashToCompare = user?.passwordHash || DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!valid || !user) {
      sqliteDb.prepare(`INSERT INTO login_attempts (email, success) VALUES (?, 0)`)
        .run(email.toLowerCase());
      logAudit(req, { action: 'auth.login_failed', details: `email: ${email.toLowerCase()}` });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Log successful attempt and clear old failures
    sqliteDb.prepare(`INSERT INTO login_attempts (email, success) VALUES (?, 1)`)
      .run(email.toLowerCase());
    sqliteDb.prepare(`DELETE FROM login_attempts WHERE email = ? AND success = 0`)
      .run(email.toLowerCase());

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      config.jwtSecret,
      { algorithm: 'HS256', expiresIn: config.jwtExpiry as jwt.SignOptions['expiresIn'] }
    );

    logAudit(req, { action: 'auth.login', entityType: 'user', entityId: user.id });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req: AuthRequest, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const db = getDatabase();
    const decoded = jwt.decode(token) as { exp?: number };
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.insert(tokenBlacklist)
      .values({ token, expiresAt })
      .run();
  }
  logAudit(req, { action: 'auth.logout', entityType: 'user', entityId: req.user!.id });
  res.json({ message: 'Logged out' });
});

// GET /api/auth/session
router.get('/session', requireAuth, (req: AuthRequest, res) => {
  res.json({
    user: req.user,
  });
});

export default router;
