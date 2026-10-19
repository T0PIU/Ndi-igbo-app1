import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
// OWASP-recommended scrypt setting (N=2^15, r=8, p=3). Parameters are stored with each hash so they can be raised later.
const N = 32768, R = 8, P = 3, KEYLEN = 64, MAXMEM = 128 * 1024 * 1024;

export const newId = () => crypto.randomUUID();
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  try {
    const [alg, n, r, p, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p, maxmem: MAXMEM });
    return crypto.timingSafeEqual(key, expected);
  } catch { return false; }
}

let dummy;
// Used when the email is unknown, so a wrong email takes as long as a wrong password.
export async function burnTime(password) {
  dummy ??= await hashPassword('not-a-real-password');
  await verifyPassword(password, dummy);
}

const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', 'iloveyou', '11111111',
  'abc12345', 'abcd1234', 'welcome1', 'letmein123', 'admin123', 'passw0rd', 'football', 'monkey123', 'dragon123', 'nigeria123', 'naija123', 'igbo1234', 'owerri123', '00000000']);
export function passwordProblem(password, email = '', name = '') {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 128) return 'Use at most 128 characters.';
  const low = password.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(password)) return 'That password is too easy to guess. Try a longer phrase.';
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return 'Do not use your email in your password.';
  if (name.length >= 4 && low.includes(name.toLowerCase().replace(/\s+/g, ''))) return 'Do not use your name in your password.';
  return null;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) { try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore bad cookie */ } }
  }
  return out;
}

export const COOKIE = 'ndi_sid';
export function setSessionCookie(res, token, cfg) {
  const maxAge = cfg.sessionDays * 86400;
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.cookieSecure ? '; Secure' : ''}`);
}
export function clearSessionCookie(res, cfg) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cfg.cookieSecure ? '; Secure' : ''}`);
}

// Fixed-window limiter kept in memory (one server process). Use a shared store if you run several instances.
export function createLimiter({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.reset <= t) hits.delete(k); }, Math.min(windowMs, 60000));
  timer.unref?.();
  return {
    hit(key) {
      const t = Date.now();
      let v = hits.get(key);
      if (!v || v.reset <= t) { v = { count: 0, reset: t + windowMs }; hits.set(key, v); }
      v.count++;
      return { ok: v.count <= max, retryAfter: Math.max(1, Math.ceil((v.reset - t) / 1000)) };
    },
    reset(key) { key == null ? hits.clear() : hits.delete(key); },
    stop() { clearInterval(timer); },
  };
}
