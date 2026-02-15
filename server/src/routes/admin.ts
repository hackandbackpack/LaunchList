import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDatabase, getSqlite } from '../db/index.js';
import { users } from '../db/schema.js';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { sendWelcomeEmail } from '../services/staffEmailService.js';
import { config } from '../config.js';

const router = Router();

const BCRYPT_ROUNDS = 13;

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

const createUserSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128).refine(
    (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw),
    { message: 'Password must contain uppercase, lowercase, and a number' }
  ),
  role: z.enum(['admin', 'staff']).default('staff'),
});

// GET /api/admin/users - List all users
router.get('/users', (req: AuthRequest, res, next) => {
  try {
    const db = getDatabase();
    const allUsers = db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
      createdBy: users.createdBy,
    }).from(users).all();

    res.json({ users: allUsers });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users - Create a new staff user
router.post('/users', async (req: AuthRequest, res, next) => {
  try {
    const { email, password, role } = createUserSchema.parse(req.body);
    const db = getDatabase();

    // Check email uniqueness
    const existing = db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
    if (existing) {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = crypto.randomUUID();

    db.insert(users).values({
      id: userId,
      email: email.toLowerCase(),
      passwordHash,
      role,
      mustChangePassword: true,
      createdBy: req.user!.id,
      createdAt: new Date().toISOString(),
    }).run();

    logAudit(req, {
      action: 'admin.create_user',
      entityType: 'user',
      entityId: userId,
      details: `email: ${email.toLowerCase()}, role: ${role}`,
    });

    // Send welcome email
    const baseUrl = config.appUrl || `http://localhost:${config.port}`;
    const loginUrl = `${baseUrl}/staff/login`;
    await sendWelcomeEmail(email.toLowerCase(), loginUrl).catch((err) => {
      console.error('Failed to send welcome email:', err instanceof Error ? err.message : 'Unknown error');
    });

    res.status(201).json({
      user: {
        id: userId,
        email: email.toLowerCase(),
        role,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id - Delete a user
router.delete('/users/:id', (req: AuthRequest, res, next) => {
  try {
    const userId = req.params.id as string;
    const db = getDatabase();

    // Block self-deletion
    if (userId === req.user!.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.delete(users).where(eq(users.id, userId)).run();

    // Clean up password reset tokens for deleted user
    getSqlite().prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);

    logAudit(req, {
      action: 'admin.delete_user',
      entityType: 'user',
      entityId: userId,
      details: `email: ${user.email}`,
    });

    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
