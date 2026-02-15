import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
const MAX_STORE_SIZE = 10_000;
const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up expired entries every 5 minutes
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
  const entriesToRemove = rateLimitStore.size - MAX_STORE_SIZE + 1000;
  let removed = 0;
  for (const key of rateLimitStore.keys()) {
    if (removed >= entriesToRemove) break;
    rateLimitStore.delete(key);
    removed++;
  }
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later',
    keyGenerator = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || record.resetTime < now) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, record);
      evictIfNeeded();
      return next();
    }

    record.count++;

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return res.status(429).json({
        error: message,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }

    next();
  };
}

// Pre-configured rate limiters
export const generalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
});

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 attempts per 15 minutes
  message: 'Too many login attempts, please try again later',
});

export const orderSubmitRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20, // 20 orders per hour per IP
  message: 'Too many order submissions, please try again later',
});

export const notificationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 notifications per minute
  message: 'Too many notification requests, please wait',
});

export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 3, // 3 reset requests per 15 minutes
  message: 'Too many password reset requests, please try again later',
});

export const proxyRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many card search requests',
});
