# ListPull Production Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make ListPull production-ready for Blast Off Gaming — security hardening, staff workflow fixes, reliability improvements, and Discord notifications.

**Architecture:** Express + SQLite backend, React + Vite frontend. Single Docker container. No external dependencies added except native `fetch()` for Discord webhooks. All new DB tables use the existing Drizzle ORM + raw SQL pattern from `db/index.ts`.

**Tech Stack:** TypeScript, Express, Drizzle ORM, better-sqlite3, React 18, Vite, shadcn/ui, Tailwind CSS

---

## Phase 1: Security Hardening

### Task 1: CORS & HTTP Security Headers

**Files:**
- Modify: `server/src/index.ts:25-42`
- Modify: `server/src/config.ts:3-26`

**Step 1: Update config to require CORS_ORIGIN in production**

In `server/src/config.ts`, add `CORS_ORIGIN` to the env schema (after line 10):

```typescript
CORS_ORIGIN: z.string().optional(),
```

In the `loadConfig()` return object, add:

```typescript
corsOrigin: result.data.CORS_ORIGIN || null,
```

**Step 2: Fix CORS and add security headers in index.ts**

Replace the CORS block at lines 25-33 of `server/src/index.ts`:

```typescript
// CORS - restrictive by default
const corsOrigin = config.corsOrigin || (
  process.env.NODE_ENV === 'production'
    ? false  // Deny all cross-origin in production unless configured
    : true   // Allow all in development
);
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
```

Replace the security headers block at lines 36-42:

```typescript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://cards.scryfall.io https://assets.tcgdex.net",
      "connect-src 'self' https://api.scryfall.com",
      "font-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '));
  }
  next();
});
```

**Step 3: Update .env.example**

Add after the `PORT=3000` line in `.env.example`:

```env
# CORS origin for production (your domain, e.g., https://listpull.blastoffgaming.com)
# Leave empty in development. Required for production.
CORS_ORIGIN=
```

**Step 4: Test manually**

Run: `cd server && npm run dev`
Verify: No CORS errors on localhost, security headers present in response.

**Step 5: Commit**

```
feat: restrict CORS defaults and add security headers (CSP, HSTS, Referrer-Policy)
```

---

### Task 2: JWT Token Blacklist & Logout Fix

**Files:**
- Modify: `server/src/db/schema.ts:61-67`
- Modify: `server/src/db/index.ts:73-90`
- Modify: `server/src/middleware/auth.ts:25-55`
- Modify: `server/src/routes/auth.ts:61-65`

**Step 1: Add token_blacklist table to schema.ts**

Add after the `users` table definition (after line 70 in `server/src/db/schema.ts`):

```typescript
// Token blacklist for logout
export const tokenBlacklist = sqliteTable('token_blacklist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token: text('token').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

**Step 2: Create table in db/index.ts**

Add after the users table creation (around line 81) in `createTables()`:

```typescript
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS token_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_token_blacklist_token ON token_blacklist(token);
  CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);
`);
```

**Step 3: Add blacklist cleanup to db initialization**

Add a cleanup function in `server/src/db/index.ts` after `createTables()`:

```typescript
// Clean expired tokens from blacklist (run on startup and periodically)
function cleanExpiredTokens() {
  if (!sqlite) return;
  sqlite.exec(`DELETE FROM token_blacklist WHERE expires_at < datetime('now')`);
}
```

Call it at the end of `initializeDatabase()` and set an interval:

```typescript
cleanExpiredTokens();
setInterval(cleanExpiredTokens, 60 * 60 * 1000); // Every hour
```

**Step 4: Update auth middleware to check blacklist**

In `server/src/middleware/auth.ts`, after `jwt.verify()` succeeds (around line 38), add:

```typescript
// Check token blacklist
const tokenBlacklisted = db.select()
  .from(schema.tokenBlacklist)
  .where(eq(schema.tokenBlacklist.token, token))
  .get();

if (tokenBlacklisted) {
  return res.status(401).json({ error: 'Token has been revoked' });
}
```

Add the necessary import at the top:

```typescript
import { eq } from 'drizzle-orm';
```

**Step 5: Fix logout to blacklist the token**

Replace the logout handler in `server/src/routes/auth.ts` (lines 61-65):

```typescript
router.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const db = getDatabase();
    // Decode token to get expiration for cleanup
    const decoded = jwt.decode(token) as { exp?: number };
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.insert(schema.tokenBlacklist)
      .values({ token, expiresAt })
      .run();
  }
  res.json({ message: 'Logged out' });
});
```

Add jwt import at top of auth.ts if not present:

```typescript
import jwt from 'jsonwebtoken';
```

**Step 6: Test manually**

1. Login, get token
2. Make authenticated request — should succeed
3. Logout
4. Make same authenticated request with same token — should get 401

**Step 7: Commit**

```
feat: implement JWT token blacklist for real logout functionality
```

---

### Task 3: Login Timing Attack Fix & Account Lockout

**Files:**
- Modify: `server/src/db/index.ts`
- Modify: `server/src/routes/auth.ts:21-58`

**Step 1: Add login_attempts table**

In `server/src/db/index.ts` `createTables()`, add:

```typescript
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
    success INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
  CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempted_at);
`);
```

**Step 2: Rewrite login handler with constant-time response and lockout**

Replace the login handler in `server/src/routes/auth.ts` (lines 21-58):

```typescript
const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

router.post('/login', authRateLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const db = getDatabase();
  const sqlite = getSqlite();

  // Check account lockout
  const recentFailures = sqlite.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE email = ? AND success = 0
    AND attempted_at > datetime('now', ?)
  `).get(email.toLowerCase(), `-${LOCKOUT_MINUTES} minutes`) as { count: number };

  if (recentFailures.count >= MAX_ATTEMPTS) {
    // Always compare against dummy to maintain constant time
    await bcrypt.compare(password, DUMMY_HASH);
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  }

  // Find user
  const user = db.select().from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .get();

  // Always compare — use dummy hash if user not found (constant-time)
  const hashToCompare = user?.passwordHash || DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!valid || !user) {
    // Log failed attempt
    sqlite.prepare(`INSERT INTO login_attempts (email, success) VALUES (?, 0)`)
      .run(email.toLowerCase());
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Log successful attempt (clears lockout pattern)
  sqlite.prepare(`INSERT INTO login_attempts (email, success) VALUES (?, 1)`)
    .run(email.toLowerCase());

  // Clear old failed attempts on successful login
  sqlite.prepare(`DELETE FROM login_attempts WHERE email = ? AND success = 0`)
    .run(email.toLowerCase());

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: config.jwt.expiry }
  );

  // Get user role
  const userRole = sqlite.prepare(`SELECT role FROM user_roles WHERE user_id = ?`).get(user.id) as { role: string } | undefined;

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: userRole?.role || 'staff' },
  });
});
```

**Step 3: Add cleanup for old login attempts**

In `server/src/db/index.ts`, add to the cleanup interval:

```typescript
sqlite.exec(`DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')`);
```

**Step 4: Test manually**

1. Try wrong password 5 times — should get locked out
2. Wait or clear DB — login should work again
3. Try login with non-existent email — response time should match real user

**Step 5: Commit**

```
feat: add account lockout and fix login timing attack vulnerability
```

---

### Task 4: Remove Email from URLs

**Files:**
- Modify: `src/pages/SubmitPage.tsx:101-140`
- Modify: `src/pages/ConfirmationPage.tsx:53-112`

**Step 1: Update SubmitPage to store email in sessionStorage before navigation**

In `src/pages/SubmitPage.tsx`, find the `onSubmit` function (around line 101). Replace the navigation line (around line 139):

```typescript
// Before:
// navigate(`/confirmation/${result.orderNumber}?email=${encodeURIComponent(data.email)}`);

// After:
sessionStorage.setItem('confirmationEmail', data.email);
navigate(`/confirmation/${result.orderNumber}`);
```

**Step 2: Update ConfirmationPage to read from sessionStorage only**

In `src/pages/ConfirmationPage.tsx`, replace the email retrieval logic (around lines 59-61):

```typescript
// Before:
// const emailParam = searchParams.get('email');
// const email = emailParam || sessionStorage.getItem('confirmationEmail');

// After:
const email = sessionStorage.getItem('confirmationEmail');
```

Remove the `useSearchParams` import and usage if it's only used for email.

Update the redirect condition (around line 93) to handle missing email gracefully — show a message asking the user to check their order via the status page:

```typescript
if (!orderNumber) {
  navigate('/', { replace: true });
  return;
}

if (!email) {
  // Email not in session — user may have navigated directly
  // Show order number but skip fetching full details
  setLoading(false);
  return;
}
```

**Step 3: Test manually**

1. Submit a decklist
2. Verify URL has no `?email=` parameter
3. Verify confirmation page shows order details
4. Open confirmation URL in new tab — should gracefully handle missing email

**Step 4: Commit**

```
fix: remove customer email from URL query parameters
```

---

### Task 5: CSRF Protection on Public Order Submission

**Files:**
- Create: `server/src/middleware/csrf.ts`
- Modify: `server/src/routes/orders.ts:31-44`
- Modify: `server/src/index.ts` (add route)
- Modify: `src/pages/SubmitPage.tsx`
- Modify: `src/integrations/api/client.ts`

**Step 1: Create CSRF middleware**

Create `server/src/middleware/csrf.ts`:

```typescript
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

export function generateCsrfToken(req: Request, res: Response) {
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
```

**Step 2: Add CSRF token endpoint and apply to order submission**

In `server/src/index.ts`, add the route before the order routes:

```typescript
import { generateCsrfToken } from './middleware/csrf.js';
app.get('/api/csrf-token', generateCsrfToken);
```

In `server/src/routes/orders.ts`, add `validateCsrf` to the submit endpoint (line 31):

```typescript
import { validateCsrf } from '../middleware/csrf.js';

router.post('/', orderSubmitRateLimiter, validateCsrf, async (req, res) => {
```

**Step 3: Update frontend to fetch and include CSRF token**

In `src/integrations/api/client.ts`, add a CSRF helper:

```typescript
async function getCsrfToken(): Promise<string> {
  const response = await fetch(`${API_BASE}/csrf-token`);
  const data = await response.json();
  return data.token;
}
```

Export it from the `orders` namespace:

```typescript
orders: {
  async submit(data: any) {
    const csrfToken = await getCsrfToken();
    return apiFetch('/orders', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(data),
    });
  },
  // ... rest unchanged
```

**Step 4: Test manually**

1. Submit a decklist — should succeed (token fetched automatically)
2. Replay the request without token — should get 403

**Step 5: Commit**

```
feat: add CSRF protection on public order submission
```

---

### Task 6: Audit Logging

**Files:**
- Modify: `server/src/db/schema.ts`
- Modify: `server/src/db/index.ts`
- Create: `server/src/services/auditService.ts`
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/routes/staff.ts`

**Step 1: Add audit_log table schema**

In `server/src/db/schema.ts`, add after token_blacklist:

```typescript
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  details: text('details'),
  ipAddress: text('ip_address'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

**Step 2: Create table in db/index.ts**

Add in `createTables()`:

```typescript
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
`);
```

**Step 3: Create audit service**

Create `server/src/services/auditService.ts`:

```typescript
import { getDatabase } from '../db/index.js';
import * as schema from '../db/schema.js';
import { Request } from 'express';
import { AuthRequest } from '../middleware/auth.js';

interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  details?: string;
}

export function logAudit(req: Request, entry: AuditEntry) {
  const db = getDatabase();
  const userId = (req as AuthRequest).user?.id || null;
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

  db.insert(schema.auditLog).values({
    userId,
    action: entry.action,
    entityType: entry.entityType || null,
    entityId: entry.entityId || null,
    details: entry.details || null,
    ipAddress,
  }).run();
}
```

**Step 4: Add audit logging to auth routes**

In `server/src/routes/auth.ts`, after successful login:

```typescript
import { logAudit } from '../services/auditService.js';

// After successful login:
logAudit(req, { action: 'auth.login', entityType: 'user', entityId: String(user.id) });

// After failed login:
logAudit(req, { action: 'auth.login_failed', details: `email: ${email.toLowerCase()}` });

// After logout:
logAudit(req, { action: 'auth.logout', entityType: 'user', entityId: String(req.user!.id) });
```

**Step 5: Add audit logging to staff routes**

In `server/src/routes/staff.ts`, add to each mutation:

```typescript
import { logAudit } from '../services/auditService.js';

// After order status update (PATCH /orders/:id):
logAudit(req, {
  action: 'order.update',
  entityType: 'order',
  entityId: req.params.id,
  details: JSON.stringify(updates),
});

// After line item update (PATCH /orders/:orderId/items/:itemId):
logAudit(req, {
  action: 'lineitem.update',
  entityType: 'lineitem',
  entityId: req.params.itemId,
  details: JSON.stringify(updates),
});

// After line item delete:
logAudit(req, {
  action: 'lineitem.delete',
  entityType: 'lineitem',
  entityId: req.params.itemId,
});
```

**Step 6: Commit**

```
feat: add audit logging for auth events and staff mutations
```

---

### Task 7: Disable SMS Option & Make Phone Required

**Files:**
- Modify: `src/pages/SubmitPage.tsx:22-32` (schema), `~226-230` (radio)
- Modify: `server/src/routes/orders.ts:17-28`

**Step 1: Update frontend validation schema**

In `src/pages/SubmitPage.tsx`, update the schema (lines 22-32):

```typescript
const submitSchema = z.object({
  customerName: z.string().trim().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().trim().email('Invalid email').max(255, 'Email too long'),
  phone: z.string().trim()
    .min(1, 'Phone number is required')
    .max(20, 'Phone too long')
    .regex(/^\d{3}[.\-]?\d{3}[.\-]?\d{4}$/, 'Enter a valid phone number (e.g., 555.867.5309)'),
  notifyMethod: z.literal('email'),
  game: z.enum(['magic', 'onepiece', 'pokemon', 'other']),
  format: z.string().trim().max(100, 'Format too long').optional(),
  pickupWindow: z.string().trim().max(200, 'Pickup window too long').optional(),
  notes: z.string().trim().max(1000, 'Notes too long').optional(),
  rawDecklist: z.string().trim().min(1, 'Decklist is required'),
});
```

**Step 2: Disable SMS radio button in the form**

Find the SMS radio item in `SubmitPage.tsx` (around line 226-230) and replace with:

```tsx
<div className="flex items-center space-x-2 opacity-50">
  <RadioGroupItem value="sms" id="sms" disabled />
  <Label htmlFor="sms" className="text-muted-foreground">
    Text Message (Coming Soon)
  </Label>
</div>
```

Set the default value for `notifyMethod` in the `useForm` call to `'email'`.

**Step 3: Update backend validation**

In `server/src/routes/orders.ts`, update the `submitOrderSchema` (lines 17-28):

```typescript
const submitOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim()
    .min(1, 'Phone is required')
    .max(20)
    .regex(/^\d{3}[.\-]?\d{3}[.\-]?\d{4}$/),
  notifyMethod: z.literal('email'),
  game: z.enum(gameTypes),
  format: z.string().trim().max(100).optional(),
  pickupWindow: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  rawDecklist: z.string().trim().min(1).max(50000),
  lineItems: z.array(lineItemSchema).min(1).max(500),
});
```

**Step 4: Test manually**

1. Try submitting without phone — should show validation error
2. Try submitting with invalid phone format — should show error
3. Submit with valid phone `555.867.5309` — should succeed
4. Verify SMS radio is greyed out and not selectable

**Step 5: Commit**

```
feat: make phone number required, disable SMS notification option
```

---

## Phase 2: Staff Workflow UX

### Task 8: Fix DecklistInput Cursor/Autocomplete Bug

**Files:**
- Modify: `src/components/DecklistInput.tsx:58-78`

**Step 1: Rewrite parseCurrentLine function**

Replace the `parseCurrentLine` function (around line 58) in `DecklistInput.tsx`:

```typescript
const parseCurrentLine = (textarea: HTMLTextAreaElement) => {
  const text = textarea.value;
  const cursorPos = textarea.selectionStart;

  // Split text up to cursor to find current line
  const textBeforeCursor = text.substring(0, cursorPos);
  const linesBefore = textBeforeCursor.split('\n');
  const currentLine = linesBefore.length - 1;
  const fullLines = text.split('\n');

  return {
    lineIndex: currentLine,
    lineText: fullLines[currentLine] || '',
    lineStart: textBeforeCursor.length - (linesBefore[linesBefore.length - 1]?.length || 0),
  };
};
```

**Step 2: Update any code that references the old cursor calculation**

Find and replace any usage of the old `charCount + lines[i].length + i` pattern with the new `parseCurrentLine` return values.

**Step 3: Test manually**

1. Type a multiline decklist (5+ lines)
2. Click into different lines
3. Type a partial card name — autocomplete should appear for the correct line
4. Verify suggestions replace text on the correct line

**Step 4: Commit**

```
fix: correct cursor position calculation for decklist autocomplete
```

---

### Task 9: Fix Price Fetch Race Condition

**Files:**
- Modify: `src/components/staff/DeckCardList.tsx:42-110`

**Step 1: Add abort controller to price fetch useEffect**

Find the price-fetching `useEffect` in `DeckCardList.tsx` (around line 82-110). Wrap it with an abort controller pattern:

```typescript
useEffect(() => {
  if (!hasPricing || localItems.length === 0) return;

  const abortController = new AbortController();
  const requestId = Date.now();
  const latestRequestRef = { current: requestId };

  const fetchPrices = async () => {
    setLoading(true);
    try {
      // ... existing price fetch logic ...
      // Before updating state, check if this is still the latest request
      if (latestRequestRef.current !== requestId || abortController.signal.aborted) return;
      setPriceMap(newPriceMap);
    } catch (err) {
      if (!abortController.signal.aborted) {
        setError('Failed to load prices');
      }
    } finally {
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  };

  fetchPrices();
  return () => { abortController.abort(); };
}, [localItems.length, isMagic, isPokemon, hasPricing]);
```

Key: The dependency array should use `localItems.length` not `localItems` to avoid refetching on every item edit. Only refetch when the card list itself changes (items added/removed).

**Step 2: Test manually**

1. Open an order with 20+ Magic cards
2. Prices should load once
3. Edit a card's quantity — prices should NOT refetch
4. No console errors about state updates on unmounted components

**Step 3: Commit**

```
fix: prevent stale price data from race conditions in DeckCardList
```

---

### Task 10: Fix Silent Save Failures

**Files:**
- Modify: `src/components/staff/DeckCardList.tsx:211-248`

**Step 1: Replace Promise.all with Promise.allSettled**

Find `handleSaveInventory` (around line 211). Replace the save logic:

```typescript
const handleSaveInventory = async () => {
  setSaving(true);
  try {
    const updates = localItems
      .filter(item => {
        const original = lineItems.find(li => li.id === item.id);
        return original && (
          item.quantity_found !== original.quantity_found ||
          item.unit_price !== original.unit_price ||
          JSON.stringify(item.condition_variants) !== JSON.stringify(original.condition_variants)
        );
      })
      .map(item => ({
        id: item.id,
        promise: api.staff.updateLineItem(orderId, item.id, {
          quantityFound: item.quantity_found,
          unitPrice: item.unit_price,
          conditionVariants: item.condition_variants,
        }),
      }));

    if (updates.length === 0) {
      toast.info('No changes to save');
      setSaving(false);
      return;
    }

    const results = await Promise.allSettled(updates.map(u => u.promise));

    const failures = results
      .map((result, i) => ({ result, item: updates[i] }))
      .filter(({ result }) => result.status === 'rejected');

    if (failures.length === 0) {
      toast.success(`Saved ${updates.length} card${updates.length === 1 ? '' : 's'}`);
      onRefresh?.();
    } else if (failures.length === updates.length) {
      toast.error('Failed to save all changes. Check your connection and try again.');
    } else {
      const savedCount = updates.length - failures.length;
      toast.warning(`Saved ${savedCount} cards, but ${failures.length} failed. Try saving again.`);
      onRefresh?.();
    }
  } catch (err) {
    toast.error('Unexpected error saving inventory');
  } finally {
    setSaving(false);
  }
};
```

**Step 2: Test manually**

1. Open an order, edit quantities for multiple cards
2. Save — should show success toast with count
3. Disconnect network, try save — should show error toast

**Step 3: Commit**

```
fix: report individual save failures instead of silently swallowing errors
```

---

### Task 11: Error Boundaries & Error States for Staff Pages

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `src/pages/staff/StaffDashboard.tsx`
- Modify: `src/pages/staff/StaffRequestDetail.tsx`
- Modify: `src/App.tsx`

**Step 1: Create ErrorBoundary component**

Create `src/components/ErrorBoundary.tsx`:

```tsx
import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="text-muted-foreground text-center max-w-md">
            {this.props.fallbackMessage || 'An unexpected error occurred. Please try refreshing the page.'}
          </p>
          <Button onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Step 2: Add error states to StaffDashboard**

In `src/pages/staff/StaffDashboard.tsx`, add an error state variable alongside `loading` (line 47):

```typescript
const [error, setError] = useState<string | null>(null);
```

In `fetchRequests` (line 66), add error handling:

```typescript
const fetchRequests = async () => {
  setLoading(true);
  setError(null);
  try {
    const data = await api.staff.getOrders();
    setRequests(mapApiOrdersToFrontend(data.orders || []));
  } catch (err) {
    setError('Failed to load orders. Please try again.');
  } finally {
    setLoading(false);
  }
};
```

Add error UI in the render, before the table:

```tsx
{error && (
  <div className="flex flex-col items-center gap-4 py-12">
    <AlertCircle className="h-8 w-8 text-destructive" />
    <p className="text-muted-foreground">{error}</p>
    <Button variant="outline" onClick={fetchRequests}>Try Again</Button>
  </div>
)}
```

**Step 3: Add error state to StaffRequestDetail**

Same pattern in `src/pages/staff/StaffRequestDetail.tsx` — add error state, catch in fetchRequest, show retry UI.

**Step 4: Wrap staff routes with ErrorBoundary in App.tsx**

In `src/App.tsx`, wrap staff routes:

```tsx
<Route path="/staff/login" element={<StaffLoginPage />} />
<Route path="/staff/dashboard" element={
  <ErrorBoundary fallbackMessage="The dashboard encountered an error.">
    <StaffDashboard />
  </ErrorBoundary>
} />
<Route path="/staff/request/:id" element={
  <ErrorBoundary fallbackMessage="Failed to load order details.">
    <StaffRequestDetail />
  </ErrorBoundary>
} />
```

**Step 5: Commit**

```
feat: add error boundaries and retry UI for staff pages
```

---

### Task 12: Loading Guard on Inventory Save

**Files:**
- Modify: `src/components/staff/DeckCardList.tsx`

**Step 1: Disable save button while prices are loading**

Find the save button in `DeckCardList.tsx` (search for "Save Inventory" or the save button JSX). Update it:

```tsx
<Button
  onClick={handleSaveInventory}
  disabled={saving || loading}
  title={loading ? 'Waiting for price data...' : undefined}
>
  {saving ? (
    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
  ) : loading ? (
    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading prices...</>
  ) : (
    'Save Inventory'
  )}
</Button>
```

**Step 2: Commit**

```
fix: prevent inventory save while prices are still loading
```

---

### Task 13: Condition Breakdown UX Improvements

**Files:**
- Modify: `src/components/staff/ConditionBreakdown.tsx:36-96`

**Step 1: Improve quantity messaging**

In `ConditionBreakdown.tsx`, replace the validation display (around lines 46-49) with clearer messaging:

```typescript
const remaining = quantityFound - totalQuantity;
const progressText = remaining > 0
  ? `${totalQuantity} of ${quantityFound} assigned — ${remaining} more to assign`
  : remaining < 0
    ? `${Math.abs(remaining)} over — remove ${Math.abs(remaining)} to continue`
    : `All ${quantityFound} assigned`;
const progressColor = remaining === 0 ? 'text-green-600' : remaining < 0 ? 'text-red-600' : 'text-amber-600';
```

Render:

```tsx
<p className={`text-sm font-medium ${progressColor}`}>{progressText}</p>
```

**Step 2: Add confirmation on Clear All**

Wrap the "Clear all" handler with a confirm dialog. Since this project uses shadcn, use `AlertDialog` or a simple `window.confirm()`:

```typescript
const handleClearAll = () => {
  if (variants.length === 0) return;
  if (!window.confirm('Clear all condition variants? This cannot be undone.')) return;
  onChange([]);
};
```

**Step 3: Commit**

```
fix: improve condition breakdown UX with clearer messaging and clear confirmation
```

---

### Task 14: Fix Status Toggle Race Condition

**Files:**
- Modify: `src/pages/staff/StaffRequestDetail.tsx:92-120`

**Step 1: Add saving guard and use server response**

In `StaffRequestDetail.tsx`, update `handleSave` (around line 92):

```typescript
const [statusSaving, setStatusSaving] = useState(false);

const handleSave = async () => {
  if (!request || statusSaving) return;
  setStatusSaving(true);
  try {
    const previousStatus = request.status;
    const result = await api.staff.updateOrder(request.id, { status, staffNotes });

    // Update local state with server response
    setRequest(prev => prev ? { ...prev, status, staffNotes } : null);

    toast.success('Order updated');

    // Send notification based on server-confirmed previous status
    if (status === 'ready' && previousStatus !== 'ready') {
      try {
        await api.notifications.send(request.id);
        toast.success('Customer notification sent');
      } catch {
        toast.error('Order updated but notification failed');
      }
    }
  } catch (err) {
    toast.error('Failed to update order');
  } finally {
    setStatusSaving(false);
  }
};
```

**Step 2: Disable status dropdown while saving**

Find the status `<Select>` component and add `disabled={statusSaving}`.

**Step 3: Commit**

```
fix: prevent status toggle race condition with save-in-flight guard
```

---

### Task 15: Memoize DeckCardList Rendering

**Files:**
- Modify: `src/components/staff/DeckCardList.tsx:251-315`

**Step 1: Memoize color group calculation**

The `colorGroups` and `populatedGroups` useMemo blocks (around lines 251-263) already use `useMemo`. Verify the dependency arrays are correct:

```typescript
const colorGroups = useMemo(
  () => groupCardsByColor(localItems, priceMap),
  [localItems, priceMap]
);

const populatedGroups = useMemo(
  () => colorGroups.filter(group => group.cards.length > 0),
  [colorGroups]
);
```

**Step 2: Memoize renderCardItem**

Wrap `renderCardItem` (around line 294) with `useCallback`:

```typescript
const renderCardItem = useCallback((item: DeckLineItem, index: number) => (
  <EditableCardListItem
    key={item.id}
    item={item}
    index={index}
    cardData={priceMap.get(item.card_name.toLowerCase())}
    onSave={handleSaveCard}
    onQuantityFoundChange={handleQuantityFoundChange}
    onUnitPriceChange={handleUnitPriceChange}
    onConditionVariantsChange={handleConditionVariantsChange}
    game={game}
  />
), [priceMap, handleSaveCard, handleQuantityFoundChange, handleUnitPriceChange, handleConditionVariantsChange, game]);
```

Ensure the handler functions are also wrapped with `useCallback` so the memoization chain works.

**Step 3: Commit**

```
perf: memoize card list rendering for large decklists
```

---

## Phase 3: Reliability & Data Integrity

### Task 16: Database Transactions for Order Creation

**Files:**
- Modify: `server/src/services/orderService.ts:36-81`

**Step 1: Wrap order creation in a transaction**

Replace `createOrder()` in `server/src/services/orderService.ts` (lines 36-81):

```typescript
export async function createOrder(input: CreateOrderInput): Promise<DeckRequest> {
  const db = getDatabase();
  const sqlite = getSqlite();
  const orderNumber = generateOrderNumber();

  // Use a transaction to ensure atomicity
  const result = sqlite.transaction(() => {
    const order = db.insert(schema.deckRequests).values({
      orderNumber,
      customerName: input.customerName,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      notifyMethod: input.notifyMethod,
      game: input.game,
      format: input.format || null,
      pickupWindow: input.pickupWindow || null,
      notes: input.notes || null,
      rawDecklist: input.rawDecklist,
      status: 'submitted',
    }).returning().get();

    if (!order) throw new Error('Failed to create order');

    if (input.lineItems && input.lineItems.length > 0) {
      for (const item of input.lineItems) {
        db.insert(schema.deckLineItems).values({
          requestId: order.id,
          cardName: item.cardName,
          quantity: item.quantity,
          setPreference: item.setPreference || null,
          conditionPreference: item.conditionPreference || null,
          foilPreference: item.foilPreference || null,
        }).run();
      }
    }

    return order;
  })();

  return result;
}
```

**Step 2: Test manually**

Submit an order — should work as before. The transaction ensures either all inserts succeed or none do.

**Step 3: Commit**

```
feat: wrap order creation in database transaction for atomicity
```

---

### Task 17: Fix Order Number Race Condition

**Files:**
- Modify: `server/src/services/orderService.ts:27-34`

**Step 1: Add retry logic to order creation**

Update `generateOrderNumber()` to use 6 random characters, and add retry to `createOrder()`:

```typescript
function generateOrderNumber(): string {
  const prefix = config.orderPrefix;
  const date = new Date();
  const datePart = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars (0/O, 1/I)
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${datePart}-${random}`;
}
```

Wrap the transaction call in `createOrder()` with retry:

```typescript
const MAX_RETRIES = 3;
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    const orderNumber = generateOrderNumber();
    const result = sqlite.transaction(() => {
      // ... existing transaction code using orderNumber ...
    })();
    return result;
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint') && attempt < MAX_RETRIES - 1) {
      continue; // Retry with new order number
    }
    throw err;
  }
}
throw new Error('Failed to generate unique order number');
```

**Step 2: Commit**

```
fix: add retry logic for order number collisions, increase randomness
```

---

### Task 18: Email Queue & Reliable Delivery

**Files:**
- Modify: `server/src/db/schema.ts`
- Modify: `server/src/db/index.ts`
- Create: `server/src/services/emailQueueService.ts`
- Modify: `server/src/routes/notifications.ts`

**Step 1: Add email_queue table**

In `server/src/db/schema.ts`:

```typescript
export const emailQueue = sqliteTable('email_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull(),
  recipient: text('recipient').notNull(),
  template: text('template').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  sentAt: text('sent_at'),
});
```

Create the table in `db/index.ts`:

```typescript
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS email_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    recipient TEXT NOT NULL,
    template TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
`);
```

**Step 2: Create email queue service**

Create `server/src/services/emailQueueService.ts`:

```typescript
import { getSqlite, getDatabase } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sendConfirmationEmail, sendReadyEmail } from './emailService.js';
import { getOrderWithItems } from './orderService.js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS = [30_000, 120_000, 300_000]; // 30s, 2min, 5min

export function enqueueEmail(orderId: number, recipient: string, template: 'confirmation' | 'ready') {
  const db = getDatabase();
  db.insert(schema.emailQueue).values({ orderId, recipient, template }).run();
}

export function processEmailQueue() {
  const db = getDatabase();
  const pending = db.select().from(schema.emailQueue)
    .where(eq(schema.emailQueue.status, 'pending'))
    .all();

  for (const entry of pending) {
    processEmail(entry);
  }
}

async function processEmail(entry: typeof schema.emailQueue.$inferSelect) {
  const db = getDatabase();
  try {
    const order = await getOrderWithItems(entry.orderId);
    if (!order) throw new Error(`Order ${entry.orderId} not found`);

    if (entry.template === 'confirmation') {
      await sendConfirmationEmail(order.order, order.items);
    } else if (entry.template === 'ready') {
      await sendReadyEmail(order.order, order.items);
    }

    db.update(schema.emailQueue)
      .set({ status: 'sent', sentAt: new Date().toISOString() })
      .where(eq(schema.emailQueue.id, entry.id))
      .run();
  } catch (err: any) {
    const attempts = entry.attempts + 1;
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    db.update(schema.emailQueue)
      .set({ attempts, lastError: err.message, status })
      .where(eq(schema.emailQueue.id, entry.id))
      .run();
  }
}

// Start processing loop
export function startEmailProcessor() {
  setInterval(processEmailQueue, 30_000); // Every 30 seconds
}
```

**Step 3: Update notifications route to use queue**

In `server/src/routes/notifications.ts`, replace the fire-and-forget send with:

```typescript
import { enqueueEmail } from '../services/emailQueueService.js';

// Replace the direct email send with:
enqueueEmail(order.id, order.email, 'ready');
res.json({ message: 'Notification queued' });
```

**Step 4: Start processor in index.ts**

In `server/src/index.ts`, add at startup:

```typescript
import { startEmailProcessor } from './services/emailQueueService.js';
startEmailProcessor();
```

**Step 5: Commit**

```
feat: implement email queue with retry for reliable delivery
```

---

### Task 19: Fix Pagination Performance

**Files:**
- Modify: `server/src/services/orderService.ts:124-151`

**Step 1: Add efficient count query**

In `getAllOrders()` (around line 124), replace the `.all().length` pattern:

```typescript
export async function getAllOrders(options: GetOrdersOptions = {}): Promise<PaginatedOrders> {
  const db = getDatabase();
  const sqlite = getSqlite();
  const { page = 1, limit = 50, status, search } = options;

  // Build WHERE conditions
  const conditions: string[] = [];
  const params: any[] = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(order_number LIKE ? OR customer_name LIKE ? OR email LIKE ?)');
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Efficient count
  const countResult = sqlite.prepare(
    `SELECT COUNT(*) as total FROM deck_requests ${whereClause}`
  ).get(...params) as { total: number };

  // Paginated data
  const offset = (page - 1) * limit;
  const orders = sqlite.prepare(
    `SELECT * FROM deck_requests ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return {
    orders: orders as DeckRequest[],
    total: countResult.total,
    page,
    limit,
    totalPages: Math.ceil(countResult.total / limit),
  };
}
```

**Step 2: Commit**

```
perf: use COUNT query instead of fetching all rows for pagination
```

---

### Task 20: Bound the Rate Limit Store

**Files:**
- Modify: `server/src/middleware/rateLimiter.ts:9-19`

**Step 1: Add max size and LRU-style eviction**

Replace the store and cleanup logic (lines 9-19) in `rateLimiter.ts`:

```typescript
const MAX_STORE_SIZE = 10_000;
const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore) {
    if (record.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Evict oldest entries if store exceeds max size
function evictIfNeeded() {
  if (rateLimitStore.size <= MAX_STORE_SIZE) return;
  const entriesToRemove = rateLimitStore.size - MAX_STORE_SIZE + 1000; // Remove 1000 extra for headroom
  let removed = 0;
  for (const key of rateLimitStore.keys()) {
    if (removed >= entriesToRemove) break;
    rateLimitStore.delete(key);
    removed++;
  }
}
```

Call `evictIfNeeded()` inside `createRateLimiter()` after inserting a new entry.

**Step 2: Commit**

```
fix: bound rate limit store to prevent memory exhaustion under attack
```

---

### Task 21: Automated Database Backups

**Files:**
- Create: `scripts/backup.sh`
- Modify: `docker-compose.yml`
- Modify: `Dockerfile`

**Step 1: Create backup script**

Create `scripts/backup.sh`:

```bash
#!/bin/sh
# ListPull Database Backup Script
# Runs daily via cron inside Docker container

BACKUP_DIR="/app/data/backups"
DB_PATH="/app/data/listpull.db"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

# Use SQLite .backup for a consistent copy
BACKUP_FILE="$BACKUP_DIR/listpull-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

if [ $? -eq 0 ]; then
  echo "Backup created: $BACKUP_FILE"
else
  echo "ERROR: Backup failed" >&2
  exit 1
fi

# Remove backups older than retention period
find "$BACKUP_DIR" -name "listpull-*.db" -mtime +$RETENTION_DAYS -delete
echo "Cleaned up backups older than $RETENTION_DAYS days"
```

**Step 2: Add cron to Dockerfile**

In the `Dockerfile`, add to the production stage:

```dockerfile
# Install cron and sqlite3 CLI for backups
RUN apk add --no-cache sqlite

# Copy backup script
COPY scripts/backup.sh /app/scripts/backup.sh
RUN chmod +x /app/scripts/backup.sh
```

Add a backup volume to `docker-compose.yml`:

```yaml
volumes:
  - listpull-data:/app/data
  - listpull-backups:/app/data/backups
```

And add the volume definition:

```yaml
volumes:
  listpull-data:
  listpull-backups:
```

**Step 3: Document the backup and restore process**

Add to `deploy/README.md` under Management Commands:

```markdown
### Backups

# Manual backup
docker exec listpull /app/scripts/backup.sh

# Restore from backup
docker cp ./backup-file.db listpull:/app/data/listpull.db
docker compose --env-file listpull.env restart
```

**Step 4: Commit**

```
feat: add database backup script with 7-day retention
```

---

## Phase 4: Discord Staff Notifications

### Task 22: Discord Configuration

**Files:**
- Modify: `server/src/config.ts`
- Modify: `.env.example`

**Step 1: Add Discord config to env schema**

In `server/src/config.ts`, add to the `envSchema` (around line 3-26):

```typescript
DISCORD_WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
DISCORD_DAILY_DIGEST_HOUR: z.string().optional().default('10'),
DISCORD_DAILY_DIGEST_TIMEZONE: z.string().optional().default('America/New_York'),
DISCORD_STALE_ORDER_HOURS: z.string().optional().default('48'),
```

In `loadConfig()`, add to the return object:

```typescript
discord: {
  webhookUrl: result.data.DISCORD_WEBHOOK_URL || null,
  dailyDigestHour: parseInt(result.data.DISCORD_DAILY_DIGEST_HOUR || '10', 10),
  timezone: result.data.DISCORD_DAILY_DIGEST_TIMEZONE || 'America/New_York',
  staleOrderHours: parseInt(result.data.DISCORD_STALE_ORDER_HOURS || '48', 10),
},
```

**Step 2: Add to .env.example**

Add before the ADVANCED SETTINGS section in `.env.example`:

```env
# ============================================================================
# DISCORD NOTIFICATIONS [OPTIONAL]
# ============================================================================
# Create a webhook in your Discord server:
#   Server Settings > Integrations > Webhooks > New Webhook
# Copy the webhook URL and paste it below.
# Leave empty to disable Discord notifications.

DISCORD_WEBHOOK_URL=

# Hour to send the daily digest (24h format, default: 10)
DISCORD_DAILY_DIGEST_HOUR=10

# Timezone for the daily digest (default: America/New_York)
DISCORD_DAILY_DIGEST_TIMEZONE=America/New_York

# Hours before an unworked order triggers a stale alert (default: 48)
DISCORD_STALE_ORDER_HOURS=48
```

**Step 3: Commit**

```
feat: add Discord webhook configuration
```

---

### Task 23: Discord Alert Deduplication Columns

**Files:**
- Modify: `server/src/db/schema.ts`
- Modify: `server/src/db/index.ts`

**Step 1: Add alert tracking columns to deck_requests**

In `server/src/db/schema.ts`, add to the `deckRequests` table definition (around line 20-38):

```typescript
staleAlertSent: integer('stale_alert_sent', { mode: 'boolean' }).default(false),
pickupAlertSent: integer('pickup_alert_sent', { mode: 'boolean' }).default(false),
```

**Step 2: Add columns in db/index.ts**

Since this is SQLite, add migration-safe column additions in `createTables()`:

```typescript
// Add alert columns if they don't exist (migration-safe)
try {
  sqlite.exec(`ALTER TABLE deck_requests ADD COLUMN stale_alert_sent INTEGER NOT NULL DEFAULT 0`);
} catch { /* Column already exists */ }
try {
  sqlite.exec(`ALTER TABLE deck_requests ADD COLUMN pickup_alert_sent INTEGER NOT NULL DEFAULT 0`);
} catch { /* Column already exists */ }
```

**Step 3: Reset alert flags on status transitions**

In `server/src/services/orderService.ts`, in the `updateOrder()` function (around line 174), add:

```typescript
// Reset alert flags on status transitions
if (input.status === 'in_progress') {
  updateValues.staleAlertSent = false;
}
if (input.status === 'picked_up') {
  updateValues.pickupAlertSent = false;
}
```

**Step 4: Commit**

```
feat: add alert deduplication columns for Discord notifications
```

---

### Task 24: Discord Service

**Files:**
- Create: `server/src/services/discordService.ts`

**Step 1: Create the Discord service**

Create `server/src/services/discordService.ts`:

```typescript
import { config } from '../config.js';
import { getSqlite, getDatabase } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq, and, lt, sql } from 'drizzle-orm';

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
}

const COLORS = {
  green: 0x22c55e,
  yellow: 0xeab308,
  red: 0xef4444,
};

async function sendWebhook(embeds: DiscordEmbed[]) {
  const url = config.discord.webhookUrl;
  if (!url) return;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds }),
      });
      if (res.ok) return;
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
      console.error(`Discord webhook failed: ${res.status} ${res.statusText}`);
      return;
    } catch (err) {
      console.error('Discord webhook error:', err);
      if (attempt === 0) continue;
    }
  }
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function sendDailyDigest() {
  if (!config.discord.webhookUrl) return;

  const sqlite = getSqlite();

  const counts = {
    submitted: (sqlite.prepare(`SELECT COUNT(*) as c FROM deck_requests WHERE status = 'submitted'`).get() as any).c,
    inProgress: (sqlite.prepare(`SELECT COUNT(*) as c FROM deck_requests WHERE status = 'in_progress'`).get() as any).c,
    ready: (sqlite.prepare(`SELECT COUNT(*) as c FROM deck_requests WHERE status = 'ready'`).get() as any).c,
  };

  const staleHours = config.discord.staleOrderHours;
  const staleOrders = sqlite.prepare(`
    SELECT order_number, customer_name, game, created_at
    FROM deck_requests
    WHERE status = 'submitted'
    AND created_at < datetime('now', ?)
    ORDER BY created_at ASC
  `).all(`-${staleHours} hours`) as any[];

  const holdDays = config.orderHoldDays;
  const stalePickups = sqlite.prepare(`
    SELECT order_number, customer_name, game, email, phone, updated_at
    FROM deck_requests
    WHERE status = 'ready'
    AND updated_at < datetime('now', ?)
    ORDER BY updated_at ASC
  `).all(`-${holdDays} days`) as any[];

  const total = counts.submitted + counts.inProgress + counts.ready;
  if (total === 0 && staleOrders.length === 0 && stalePickups.length === 0) {
    await sendWebhook([{
      title: 'ListPull Daily Digest',
      description: 'No pending orders — all caught up!',
      color: COLORS.green,
      timestamp: new Date().toISOString(),
    }]);
    return;
  }

  let color = COLORS.yellow;
  if (staleOrders.length > 0 || stalePickups.length > 0) color = COLORS.red;

  const fields: DiscordEmbed['fields'] = [
    { name: 'Waiting to be worked', value: String(counts.submitted), inline: true },
    { name: 'In progress', value: String(counts.inProgress), inline: true },
    { name: 'Ready for pickup', value: String(counts.ready), inline: true },
  ];

  if (staleOrders.length > 0) {
    const lines = staleOrders.map((o: any) =>
      `• **${o.order_number}** — "${o.customer_name}" — ${o.game} (submitted ${formatTimeAgo(o.created_at)})`
    ).join('\n');
    fields.push({
      name: `⚠️ ${staleOrders.length} order${staleOrders.length === 1 ? '' : 's'} over ${staleHours} hours old`,
      value: lines.substring(0, 1024),
    });
  }

  if (stalePickups.length > 0) {
    const lines = stalePickups.map((o: any) => {
      const contact = o.phone
        ? `${o.email} / ${o.phone}`
        : o.email;
      return `• **${o.order_number}** — "${o.customer_name}" — ${o.game} (ready since ${formatDate(o.updated_at)})\n  Contact: ${contact}`;
    }).join('\n');
    fields.push({
      name: `📦 ${stalePickups.length} order${stalePickups.length === 1 ? '' : 's'} waiting for pickup over ${holdDays} days`,
      value: lines.substring(0, 1024),
    });
  }

  await sendWebhook([{
    title: `ListPull Daily Digest — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    description: `${total} total active order${total === 1 ? '' : 's'}`,
    color,
    fields,
    timestamp: new Date().toISOString(),
  }]);
}

export async function checkStaleOrders() {
  if (!config.discord.webhookUrl) return;

  const sqlite = getSqlite();
  const db = getDatabase();
  const staleHours = config.discord.staleOrderHours;

  // Stale submitted orders (not yet alerted)
  const staleOrders = sqlite.prepare(`
    SELECT id, order_number, customer_name, email, phone, game, created_at
    FROM deck_requests
    WHERE status = 'submitted'
    AND stale_alert_sent = 0
    AND created_at < datetime('now', ?)
  `).all(`-${staleHours} hours`) as any[];

  for (const order of staleOrders) {
    const itemCount = (sqlite.prepare(
      `SELECT COUNT(*) as c FROM deck_line_items WHERE request_id = ?`
    ).get(order.id) as any).c;

    await sendWebhook([{
      title: `🚨 Order ${order.order_number} has been waiting over ${staleHours} hours`,
      description: '',
      color: COLORS.red,
      fields: [
        { name: 'Customer', value: order.customer_name, inline: true },
        { name: 'Game', value: order.game, inline: true },
        { name: 'Cards', value: `${itemCount} items`, inline: true },
        { name: 'Submitted', value: formatTimeAgo(order.created_at) },
        { name: 'Contact', value: order.phone ? `${order.email} / ${order.phone}` : order.email },
      ],
      timestamp: new Date().toISOString(),
    }]);

    // Mark as alerted
    sqlite.prepare(`UPDATE deck_requests SET stale_alert_sent = 1 WHERE id = ?`).run(order.id);
  }

  // Stale pickups (not yet alerted)
  const holdDays = config.orderHoldDays;
  const stalePickups = sqlite.prepare(`
    SELECT id, order_number, customer_name, email, phone, game, updated_at
    FROM deck_requests
    WHERE status = 'ready'
    AND pickup_alert_sent = 0
    AND updated_at < datetime('now', ?)
  `).all(`-${holdDays} days`) as any[];

  for (const order of stalePickups) {
    await sendWebhook([{
      title: `📦 Order ${order.order_number} waiting for pickup over ${holdDays} days`,
      description: '',
      color: COLORS.red,
      fields: [
        { name: 'Customer', value: order.customer_name, inline: true },
        { name: 'Game', value: order.game, inline: true },
        { name: 'Ready since', value: formatDate(order.updated_at), inline: true },
        { name: 'Contact', value: order.phone ? `${order.email} / ${order.phone}` : order.email },
      ],
      timestamp: new Date().toISOString(),
    }]);

    sqlite.prepare(`UPDATE deck_requests SET pickup_alert_sent = 1 WHERE id = ?`).run(order.id);
  }
}
```

**Step 2: Commit**

```
feat: implement Discord notification service with daily digest and stale alerts
```

---

### Task 25: Scheduler Service

**Files:**
- Create: `server/src/services/schedulerService.ts`
- Modify: `server/src/index.ts`

**Step 1: Create scheduler service**

Create `server/src/services/schedulerService.ts`:

```typescript
import { config } from '../config.js';
import { sendDailyDigest, checkStaleOrders } from './discordService.js';

let lastDigestDate = '';
let lastStaleCheck = 0;

function getCurrentHourInTimezone(timezone: string): { hour: number; dateStr: string } {
  const now = new Date();
  const formatted = now.toLocaleString('en-US', { timeZone: timezone, hour12: false });
  const parts = formatted.split(', ');
  const timeParts = parts[1]?.split(':') || [];
  return {
    hour: parseInt(timeParts[0] || '0', 10),
    dateStr: parts[0] || '',
  };
}

async function tick() {
  if (!config.discord.webhookUrl) return;

  try {
    const { hour, dateStr } = getCurrentHourInTimezone(config.discord.timezone);

    // Daily digest: fire once per day at the configured hour
    if (hour === config.discord.dailyDigestHour && lastDigestDate !== dateStr) {
      lastDigestDate = dateStr;
      await sendDailyDigest();
    }

    // Stale order check: every 30 minutes
    const now = Date.now();
    if (now - lastStaleCheck >= 30 * 60 * 1000) {
      lastStaleCheck = now;
      await checkStaleOrders();
    }
  } catch (err) {
    console.error('Scheduler error:', err);
  }
}

export function startScheduler() {
  if (!config.discord.webhookUrl) {
    console.log('Discord webhook not configured — scheduler disabled');
    return;
  }

  console.log(`Scheduler started: daily digest at ${config.discord.dailyDigestHour}:00 ${config.discord.timezone}`);

  // Check every 60 seconds
  setInterval(tick, 60 * 1000);

  // Run stale check immediately on startup
  lastStaleCheck = Date.now();
  checkStaleOrders().catch(err => console.error('Initial stale check failed:', err));
}
```

**Step 2: Start scheduler in index.ts**

In `server/src/index.ts`, add after the server starts listening:

```typescript
import { startScheduler } from './services/schedulerService.js';

// Inside the listen callback:
startScheduler();
```

**Step 3: Add config.orderHoldDays**

Ensure `config.ts` exposes `orderHoldDays` from the env:

```typescript
orderHoldDays: parseInt(result.data.ORDER_HOLD_DAYS || '7', 10),
```

Add to env schema:

```typescript
ORDER_HOLD_DAYS: z.string().optional().default('7'),
```

**Step 4: Test manually**

1. Set `DISCORD_WEBHOOK_URL` to a test webhook
2. Set `DISCORD_DAILY_DIGEST_HOUR` to current hour
3. Start server — should see digest message in Discord within 60 seconds
4. Create a test order, wait or set `DISCORD_STALE_ORDER_HOURS=0` — should see stale alert

**Step 5: Commit**

```
feat: add scheduler for daily Discord digest and stale order monitoring
```

---

## Post-Implementation

### Task 26: Spin Up & End-to-End Test

**Step 1: Install and build**

```bash
cd listpull && npm install
cd server && npm install && cd ..
```

**Step 2: Start development servers**

```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend
npm run dev
```

**Step 3: Run through test scenarios**

1. **Submit a decklist** — verify CSRF token flow, phone required, email not in URL
2. **Check confirmation** — order number shown, email from sessionStorage
3. **Staff login** — verify lockout after 5 bad attempts
4. **Staff dashboard** — verify error state with network disconnected, retry works
5. **Order detail** — edit quantities, save, verify toast feedback
6. **Status toggle** — rapidly click status changes, verify no duplicate emails
7. **Logout** — verify token is blacklisted, can't reuse
8. **Discord** — verify daily digest and stale alerts fire

**Step 4: Docker build test**

```bash
docker compose --env-file listpull.env up -d --build
docker exec listpull /app/scripts/backup.sh
```

**Step 5: Final commit**

```
chore: verify end-to-end production readiness
```
