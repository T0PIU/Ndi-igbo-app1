import express from 'express';
import { createLimiter } from './security.js';
import { ApiError } from './validate.js';
import { createBus } from './bus.js';
import { createSpotify } from './spotify.js';
import { requireAuth, sessionLoader } from './session.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import postRoutes from './routes/posts.js';
import musicRoutes from './routes/music.js';
import askRoutes from './routes/ask.js';
import adminRoutes from './routes/admin.js';
import fileRoutes from './routes/files.js';
import streamRoutes from './routes/stream.js';

function csp(cfg) {
  const maps = !!cfg.maps.key;
  const g = (extra) => (maps ? ' ' + extra : '');
  return [
    "default-src 'self'",
    "script-src 'self' https://open.spotify.com" + g('https://*.googleapis.com https://*.gstatic.com *.google.com https://*.ggpht.com *.googleusercontent.com blob:'),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.scdn.co https://*.spotifycdn.com" + g('https://*.googleapis.com https://*.gstatic.com *.google.com *.googleusercontent.com'),
    "font-src 'self'",
    "connect-src 'self'" + g('https://*.googleapis.com *.google.com https://*.gstatic.com data: blob:'),
    "frame-src https://open.spotify.com",
    maps ? 'worker-src blob:' : "worker-src 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
}

export async function createApp(cfg, db, { fetchImpl = fetch } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (cfg.trustProxy) app.set('trust proxy', /^\d+$/.test(String(cfg.trustProxy)) ? Number(cfg.trustProxy) : cfg.trustProxy);

  const bus = createBus();
  const spotify = createSpotify(cfg, db, fetchImpl);
  const limiters = {
    signupIp: createLimiter({ windowMs: 3600e3, max: cfg.signupLimitPerHour }),
    loginIp: createLimiter({ windowMs: 900e3, max: 40 }),
    loginAccount: createLimiter({ windowMs: 900e3, max: 8 }),
    post: createLimiter({ windowMs: 3600e3, max: 10 }),
    react: createLimiter({ windowMs: 600e3, max: 120 }),
    contact: createLimiter({ windowMs: 3600e3, max: 30 }),
    report: createLimiter({ windowMs: 3600e3, max: 20 }),
    ask: createLimiter({ windowMs: 3600e3, max: 20 }),
  };
  const ctx = { cfg, db, bus, spotify, limiters };
  const policy = csp(cfg);

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': policy,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
      'X-Frame-Options': 'DENY',
    });
    if (cfg.cookieSecure) res.set('Strict-Transport-Security', 'max-age=15552000');
    next();
  });

  if (!cfg.quiet) app.use('/api', (req, res, next) => {
    const t = Date.now();
    res.on('finish', () => { if (req.path !== '/stream' && req.path !== '/health') console.log(`${req.method} /api${req.path} ${res.statusCode} ${Date.now() - t}ms`); });
    next();
  });

  app.get('/api/health', async (req, res) => { await db.get('SELECT 1 AS ok'); res.json({ ok: true }); });

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('sec-fetch-site') === 'cross-site') return next(new ApiError(403, 'forbidden', 'Cross-site request blocked.'));
      const origin = req.get('origin');
      if (origin) {
        let ok = false;
        try { const u = new URL(origin); ok = u.host === req.get('host') || cfg.allowedOrigins.includes(u.origin); } catch { /* bad origin */ }
        if (!ok) return next(new ApiError(403, 'forbidden', 'Cross-site request blocked.'));
      }
    }
    next();
  });
  app.use('/api', express.json({ limit: '32kb' }));
  app.use('/api', sessionLoader(ctx));

  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/me', meRoutes(ctx));
  app.use('/api/posts', postRoutes(ctx));
  app.use('/api/music', musicRoutes(ctx));
  app.use('/api/ask', askRoutes(ctx, fetchImpl));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api/files', fileRoutes(ctx));
  app.use('/api/stream', streamRoutes(ctx));
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } }));

  app.use(express.static(cfg.publicDir, {
    extensions: ['html'],
    setHeaders(res, file) {
      res.set('Cache-Control', /\.woff2$/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof ApiError) {
      if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
      return res.status(err.status).json({ error: { code: err.code, message: err.message, field: err.field } });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'invalid', message: 'That request was not valid.' } });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'too_large', message: 'That is too much text.' } });
    console.error('[error]', req.method, req.path, err);
    res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } });
  });

  const sweep = setInterval(() => {
    const now = Date.now();
    db.run('DELETE FROM sessions WHERE expires_at < ?', [now]).catch(() => {});
    db.run('DELETE FROM kv_cache WHERE expires_at < ?', [now]).catch(() => {});
  }, 3600e3);
  sweep.unref?.();

  return { app, ctx, stop: () => { clearInterval(sweep); bus.stop(); Object.values(limiters).forEach((l) => l.stop()); } };
}
