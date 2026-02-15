import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { getDatabase, getSqlite } from '../db/index.js';
import { users, tokenBlacklist } from '../db/schema.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { authRateLimiter, passwordResetRateLimiter } from '../middleware/rateLimiter.js';
import { logAudit } from '../services/auditService.js';
import { sendPasswordResetEmail } from '../services/staffEmailService.js';

const router = Router();

const BCRYPT_ROUNDS = 13;

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(12).max(128).refine(
    (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw),
    { message: 'Password must contain uppercase, lowercase, and a number' }
  ),
});

const requestResetSchema = z.object({
  email: z.string().email().max(254),
});

const resetPasswordSchema = z.object({
  token: z.string().length(64),
  newPassword: z.string().min(12).max(128).refine(
    (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw),
    { message: 'Password must contain uppercase, lowercase, and a number' }
  ),
});

const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 13);
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
      mustChangePassword: user.mustChangePassword ?? false,
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

// POST /api/auth/change-password - Requires authentication
router.post('/change-password', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const db = getDatabase();

    const user = db.select().from(users).where(eq(users.id, req.user!.id)).get();
    if (!user) {
      return next(createError('User not found', 404));
    }

    const validCurrent = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validCurrent) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Reject if new password is same as current
    const samePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (samePassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    db.update(users)
      .set({ passwordHash: newHash, mustChangePassword: false })
      .where(eq(users.id, req.user!.id))
      .run();

    logAudit(req, { action: 'auth.change_password', entityType: 'user', entityId: req.user!.id });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/request-reset - Rate limited, no auth required
router.post('/request-reset', passwordResetRateLimiter, async (req, res, next) => {
  try {
    const { email } = requestResetSchema.parse(req.body);
    const db = getDatabase();
    const sqliteDb = getSqlite();

    // Always return success to prevent email enumeration
    const successResponse = { message: 'If an account exists with that email, a password reset link has been sent.' };

    const user = db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
    if (!user) {
      // Perform dummy work to keep timing consistent
      await bcrypt.hash('dummy-timing-work', 4);
      return res.json(successResponse);
    }

    // Invalidate previous tokens for this user
    sqliteDb.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`)
      .run(user.id);

    // Generate 32-byte random token (hex = 64 chars)
    const tokenBytes = crypto.randomBytes(32);
    const tokenHex = tokenBytes.toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenHex).digest('hex');

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);

    sqliteDb.prepare(`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(user.id, tokenHash, expiresAt);

    // Build reset URL
    const baseUrl = config.appUrl || `http://localhost:${config.port}`;
    const resetUrl = `${baseUrl}/staff/reset-password?token=${tokenHex}`;

    await sendPasswordResetEmail(user.email, resetUrl);

    logAudit(req, { action: 'auth.password_reset_requested', entityType: 'user', entityId: user.id });

    res.json(successResponse);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password - Rate limited, no auth required
router.post('/reset-password', passwordResetRateLimiter, async (req, res, next) => {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const sqliteDb = getSqlite();
    const db = getDatabase();

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = sqliteDb.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')
    `).get(tokenHash) as { id: number; user_id: string; token_hash: string; expires_at: string; used_at: string | null } | undefined;

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Mark token as used
    sqliteDb.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`)
      .run(resetToken.id);

    // Update user password
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    db.update(users)
      .set({ passwordHash: newHash, mustChangePassword: false })
      .where(eq(users.id, resetToken.user_id))
      .run();

    logAudit(req, { action: 'auth.password_reset_completed', entityType: 'user', entityId: resetToken.user_id });

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
