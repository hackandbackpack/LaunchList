import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initializeDatabase } from './db/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generalRateLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/auth.js';
import ordersRoutes from './routes/orders.js';
import staffRoutes from './routes/staff.js';
import notificationsRoutes from './routes/notifications.js';
import proxyRoutes from './routes/proxy.js';
import { generateCsrfToken } from './middleware/csrf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

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

// Security headers
app.use((_req, res, next) => {
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

// Middleware
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Apply general rate limiting to all API routes
app.use('/api', generalRateLimiter);

// Initialize database
initializeDatabase();

// CSRF token endpoint
app.get('/api/csrf-token', generateCsrfToken);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/proxy', proxyRoutes);

// Health check (no rate limiting)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend files in production
// In Docker: /app/public, in dev: ../../dist
const clientDistPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '../public')
  : path.join(__dirname, '../../dist');
app.use(express.static(clientDistPath, {
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handler
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
