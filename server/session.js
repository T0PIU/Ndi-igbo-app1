import { COOKIE, parseCookies, sha256, newToken, setSessionCookie } from './security.js';
import { ApiError } from './validate.js';

const SLIDE_AFTER_MS = 6 * 3600 * 1000;

export async function createSession(db, userId, cfg) {
  const token = newToken();
  const now = Date.now();
  await db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
    [sha256(token), userId, now, now + cfg.sessionDays * 86400000, now]);
  // Keep the 10 newest sessions per person.
  await db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10)', [userId, userId]);
  return token;
}

export function sessionLoader({ cfg, db }) {
  return async (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token && token.length < 100) {
      const hash = sha256(token);
      const now = Date.now();
      const row = await db.get(
        `SELECT u.id, u.email, u.name, u.role, u.verified_label, u.created_at, u.suspended_at, s.last_seen_at
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > ?`, [hash, now]);
      if (row && row.suspended_at) { req.suspended = true; }
      else if (row) {
        req.user = { id: row.id, email: row.email, name: row.name, role: row.role, verifiedLabel: row.verified_label, createdAt: row.created_at };
        req.sessionHash = hash;
        if (now - row.last_seen_at > SLIDE_AFTER_MS) {
          await db.run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?', [now, now + cfg.sessionDays * 86400000, hash]);
          setSessionCookie(res, token, cfg);
        }
      }
    }
    next();
  };
}

export const requireAuth = (req, res, next) => {
  if (req.suspended) throw new ApiError(403, 'suspended', 'This account is suspended. Contact the site owner.');
  if (!req.user) throw new ApiError(401, 'auth_required', 'Please sign in to continue.');
  next();
};
export const requireAdmin = (req, res, next) => {
  if (!req.user) throw new ApiError(401, 'auth_required', 'Please sign in to continue.');
  if (req.user.role !== 'admin') throw new ApiError(403, 'forbidden', 'Only admins can do this.');
  next();
};

export function rateGuard(limiter, key) {
  const r = limiter.hit(key);
  if (!r.ok) { const e = new ApiError(429, 'rate_limited', 'Too many tries. Please wait a little and try again.'); e.retryAfter = r.retryAfter; throw e; }
}

export const isUniqueViolation = (e) => e?.code === '23505' || /UNIQUE constraint failed/i.test(e?.message || '');

export async function audit(db, actor, action, target = null, detail = null) {
  const { newId } = await import('./security.js');
  await db.run('INSERT INTO audit_log (id, actor_id, actor_name, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [newId(), actor?.id ?? null, actor?.name ?? null, action, target, detail, Date.now()]);
}
