# ListPull Production Readiness — Design Document

**Date:** 2026-02-13
**Status:** Approved
**Context:** Pre-launch review for Blast Off Gaming. Single-server Docker deployment.
**Priorities:** Security hardening, staff workflow UX, reliability, Discord notifications.

---

## Phase 1: Security Hardening

### 1.1 — CORS & HTTP Security Headers
**Problem:** Production CORS defaults to `*` (all origins). No CSP or HSTS headers.

**Fix:**
- Default `CORS_ORIGIN` to the app's own origin, never wildcard
- Add `Content-Security-Policy` header restricting scripts to self + known CDNs
- Add `Strict-Transport-Security` header for HTTPS enforcement
- Add `Referrer-Policy: strict-origin-when-cross-origin`

**Files:** `server/src/index.ts`

### 1.2 — JWT & Authentication Fixes
**Problem:** Logout is a no-op (tokens stay valid 7 days), no account lockout, timing attack on login enables email enumeration.

**Fix:**
- Add a `token_blacklist` table in SQLite — on logout, blacklist the token; auth middleware checks blacklist before accepting
- Always run `bcrypt.compare()` against a dummy hash when user not found (constant-time response)
- Add account lockout after 5 failed attempts in 15 minutes (stored in DB, auto-expires)
- Validate JWT algorithm explicitly (`HS256` only)

**Files:** `server/src/routes/auth.ts`, `server/src/middleware/auth.ts`, `server/src/db/schema.ts`, `server/src/db/index.ts`

### 1.3 — Email Removed from URLs
**Problem:** Confirmation page passes email as a URL query parameter — visible in browser history, server logs, referer headers.

**Fix:**
- Store email in `sessionStorage` before navigation
- Remove `?email=` from the confirmation redirect URL
- Confirmation page reads from `sessionStorage` only
- If not found, prompt user to re-enter email or redirect to status page

**Files:** `src/pages/SubmitPage.tsx`, `src/pages/ConfirmationPage.tsx`

### 1.4 — CSRF Protection
**Problem:** No CSRF tokens on form submissions.

**Fix:**
- Add a CSRF token endpoint that issues a token tied to the session
- Include token in public form submissions and validate server-side
- Staff dashboard uses Bearer token in Authorization header (not auto-sent by browsers) — already mitigated

**Files:** `server/src/routes/orders.ts`, new CSRF middleware, `src/pages/SubmitPage.tsx`

### 1.5 — Audit Logging
**Problem:** No record of who changed what. Staff actions are untracked.

**Fix:**
- Add an `audit_log` table: `id`, `user_id`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `created_at`
- Log all staff mutations: status changes, price updates, inventory saves, line item edits/deletes
- Log auth events: login success/failure, logout
- Middleware helper that route handlers call with structured data

**Files:** `server/src/db/schema.ts`, `server/src/db/index.ts`, `server/src/routes/staff.ts`, `server/src/routes/auth.ts`, new `server/src/services/auditService.ts`

### 1.6 — SMS Option Disabled
**Problem:** SMS radio button is selectable but the feature doesn't exist. Form submits with `sms` value that backend doesn't handle.

**Fix:**
- Disable the SMS radio button and grey it out with "Coming Soon" label
- Add backend validation to reject `sms` as a notify_method

**Files:** `src/pages/SubmitPage.tsx`, `server/src/routes/orders.ts`

### 1.7 — Make Phone Number Required
**Problem:** Phone is currently optional. Needed for staff to contact customers about stale pickups.

**Fix:**
- Remove `.optional()` from phone in the frontend Zod schema
- Add format validation (US phone formats)
- Update backend order submission schema to require phone and validate format

**Files:** `src/pages/SubmitPage.tsx`, `server/src/routes/orders.ts`

---

## Phase 2: Staff Workflow UX

### 2.1 — Fix DecklistInput Cursor/Autocomplete Bug
**Problem:** Cursor position calculation uses `+ i` offset that maps autocomplete to the wrong line.

**Fix:**
- Rewrite cursor-to-line mapping using `textarea.value.substring(0, selectionStart).split('\n')`
- Ensure autocomplete dropdown positions correctly relative to the active line

**Files:** `src/components/DecklistInput.tsx`

### 2.2 — Fix Price Fetch Race Condition
**Problem:** Line item changes during in-flight Scryfall/Pokemon price fetch cause stale responses to overwrite newer data.

**Fix:**
- Add an abort controller to the price fetch `useEffect`
- On re-trigger, abort previous fetch before starting new one
- Use a ref to track latest request ID and discard stale responses

**Files:** `src/components/staff/DeckCardList.tsx`

### 2.3 — Fix Silent Save Failures
**Problem:** Batch inventory save uses `Promise.all` with `.catch(() => {})` — errors swallowed silently.

**Fix:**
- Use `Promise.allSettled` instead of `Promise.all`
- After all requests complete, check for failures
- Show a toast listing which cards failed to save
- Offer a "Retry Failed" option

**Files:** `src/components/staff/DeckCardList.tsx`

### 2.4 — Add Error Boundaries & Error States
**Problem:** API failures on staff pages crash the entire page with no feedback.

**Fix:**
- Add a React error boundary component wrapping staff pages
- Add explicit error states to dashboard and request detail pages (retry button, error message)
- Handle `useQuery` error states where currently ignored

**Files:** `src/pages/staff/StaffDashboard.tsx`, `src/pages/staff/StaffRequestDetail.tsx`, new `src/components/ErrorBoundary.tsx`

### 2.5 — Loading Guard on Inventory Save
**Problem:** Staff can save inventory while reference prices are still loading from Scryfall.

**Fix:**
- Disable save button while `isLoadingPrices` is true
- Show tooltip: "Waiting for price data..."
- Enable once prices load

**Files:** `src/components/staff/DeckCardList.tsx`

### 2.6 — Condition Breakdown UX Improvements
**Problem:** Quantity validation messaging is confusing. "Clear all" has no confirmation.

**Fix:**
- Show progress indicator: "3 of 5 assigned" with remaining count
- Replace "over limit" with clear messaging: "2 more to assign" or "1 over — remove 1"
- Add confirmation dialog on "Clear all" button

**Files:** `src/components/staff/ConditionBreakdown.tsx`

### 2.7 — Fix Status Toggle Race Condition
**Problem:** Rapidly changing the status dropdown uses stale `previousStatus` to decide whether to send email.

**Fix:**
- Use server response from status update call as source of truth
- Disable status dropdown while update is in flight
- Show brief loading indicator during save

**Files:** `src/pages/staff/StaffRequestDetail.tsx`

### 2.8 — Memoize DeckCardList Rendering
**Problem:** `renderCardItem` creates new instances on every render. Color grouping recalculates every render. Laggy on 200+ card decks.

**Fix:**
- Memoize `groupCardsByColor` with `useMemo` keyed on `localItems` and `priceMap`
- Memoize individual card row rendering

**Files:** `src/components/staff/DeckCardList.tsx`

---

## Phase 3: Reliability & Data Integrity

### 3.1 — Database Transactions for Order Creation
**Problem:** Order and line items inserted separately. Failed line item insert leaves orphaned order.

**Fix:**
- Wrap order creation + line item insertion in a SQLite transaction
- Full rollback on any insert failure
- Clean error returned to customer

**Files:** `server/src/services/orderService.ts`

### 3.2 — Fix Order Number Race Condition
**Problem:** `generateOrderNumber()` uses timestamp + random. Duplicates possible under concurrent requests.

**Fix:**
- Add retry loop: if UNIQUE constraint violation, regenerate and retry (up to 3 attempts)
- Increase random portion from 4 to 6 characters
- Clear error if all retries fail

**Files:** `server/src/services/orderService.ts`

### 3.3 — Email Delivery Reliability
**Problem:** Email sends are fire-and-forget. Failed sends are lost.

**Fix:**
- Add `email_queue` table: `id`, `order_id`, `recipient`, `template`, `status` (pending/sent/failed), `attempts`, `last_error`, `created_at`, `sent_at`
- Enqueue emails instead of sending directly
- Processor runs every 30 seconds, picks up pending, sends, marks sent/failed
- Retry failed emails up to 3 times with backoff
- Staff sees email delivery status on order detail page

**Files:** `server/src/db/schema.ts`, `server/src/db/index.ts`, `server/src/services/emailService.ts`, new `server/src/services/emailQueueService.ts`, `server/src/routes/notifications.ts`, `src/pages/staff/StaffRequestDetail.tsx`

### 3.4 — Fix Pagination Performance
**Problem:** Fetches ALL rows to get total count. Slow with thousands of orders.

**Fix:**
- Separate `SELECT COUNT(*)` query with same filters
- Return count from efficient query, data from paginated query

**Files:** `server/src/services/orderService.ts`

### 3.5 — Bound the Rate Limit Store
**Problem:** In-memory rate limit Map grows unbounded. Memory exhaustion under attack.

**Fix:**
- Max size of 10,000 entries
- Evict oldest entries when full
- Existing 5-minute cleanup stays as secondary safety

**Files:** `server/src/middleware/rateLimiter.ts`

### 3.6 — Automated Database Backups
**Problem:** No backup strategy. Hardware failure loses all data.

**Fix:**
- Backup script using SQLite `.backup` command
- Daily at 2 AM via cron inside Docker container
- Keep last 7 daily backups in mounted volume
- Add `make backup` target, document restore process

**Files:** new `server/src/scripts/backup.sh`, `Dockerfile`, `docker-compose.yml`, `deploy/README.md`

---

## Phase 4: Discord Staff Notifications

### 4.1 — Discord Webhook Integration
**Approach:** Discord webhooks — no bot token, no dependencies, just POST to webhook URL.

**Config in `listpull.env`:**
```env
DISCORD_WEBHOOK_URL=
DISCORD_DAILY_DIGEST_HOUR=10
DISCORD_DAILY_DIGEST_TIMEZONE=America/New_York
DISCORD_STALE_ORDER_HOURS=48
```

Empty webhook URL = feature disabled. No external libraries needed.

**Files:** `server/src/config.ts`, `.env.example`

### 4.2 — Daily Digest Message
**Behavior:** Every day at configured hour, post an embed to Discord:
- Count of orders by status (waiting, in progress, ready)
- Stale orders: submitted over 48 hours ago with customer name, game, and time waiting
- Stale pickups: ready for over `ORDER_HOLD_DAYS` (default 7) with customer contact info (email + phone when available)
- Color-coded: green (all clear), yellow (pending orders), red (stale orders or stale pickups)

**Implementation:** Interval-based scheduler checks every 60 seconds, fires when clock matches configured hour at minute 0.

**Files:** new `server/src/services/discordService.ts`, new `server/src/services/schedulerService.ts`

### 4.3 — Stale Order Alert (Real-Time)
**Behavior:** Every 30 minutes, check for orders crossing the 48-hour threshold. Fire a one-time alert per order with customer info and staff portal link.

**Deduplication:** `stale_alert_sent` boolean on `deck_requests`. Resets when order moves to `in_progress`.

**Files:** `server/src/services/discordService.ts`, `server/src/services/schedulerService.ts`, `server/src/db/schema.ts`

### 4.4 — Stale Pickup Alert
**Behavior:** Daily digest and 30-minute check also flag orders in `ready` status for more than `ORDER_HOLD_DAYS`.

**Deduplication:** `pickup_alert_sent` boolean on `deck_requests`. Resets when order moves to `picked_up`.

**Discord message includes customer contact info** (email always, phone when provided) so staff can reach out directly.

**Files:** `server/src/services/discordService.ts`, `server/src/db/schema.ts`

### 4.5 — Architecture
```
schedulerService.ts
  ├── runs every 60 seconds
  ├── checks if it's time for daily digest → discordService.sendDailyDigest()
  └── checks for newly stale orders/pickups → discordService.sendStaleAlert()

discordService.ts
  ├── sendDailyDigest() — queries order counts, formats embed, POST to webhook
  ├── sendStaleOrderAlert(order) — formats stale order alert
  ├── sendStalePickupAlert(order) — formats stale pickup alert with contact info
  └── sendWebhook(embed) — fetch() with retry (2 attempts)
```

No external dependencies. No cron library. `setInterval` checking the clock.
