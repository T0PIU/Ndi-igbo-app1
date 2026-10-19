import { Router } from 'express';
import { ApiError, bad, email as vEmail, text } from '../validate.js';
import { burnTime, hashPassword, newId, passwordProblem, verifyPassword, clearSessionCookie, setSessionCookie } from '../security.js';
import { createSession, isUniqueViolation, rateGuard, requireAuth } from '../session.js';
import { mePayload } from '../profile.js';

export default function authRoutes(ctx) {
  const { cfg, db, limiters, bus } = ctx;
  const r = Router();

  r.get('/config', (req, res) => res.json({ appName: cfg.appName, signupsOpen: cfg.signupsOpen }));

  r.post('/signup', async (req, res) => {
    if (!cfg.signupsOpen) throw new ApiError(403, 'signups_closed', 'Sign-ups are closed right now.');
    rateGuard(limiters.signupIp, req.ip);
    const b = req.body ?? {};
    const name = text(b.name, { field: 'name', label: 'Your name', min: 2, max: 40 });
    const email = vEmail(b.email);
    const problem = passwordProblem(b.password, email, name);
    if (problem) throw bad(problem, 'password');
    if (b.acceptTerms !== true) throw bad('Please accept the Terms and the Privacy Notice to continue.', 'acceptTerms');
    if (await db.get('SELECT id FROM users WHERE email = ?', [email])) {
      throw new ApiError(409, 'email_taken', 'An account with this email already exists. Try signing in.', 'email');
    }
    const hash = await hashPassword(b.password);
    const id = newId(), now = Date.now();
    try {
      await db.run('INSERT INTO users (id, email, name, pass_hash, role, terms_at, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, email, name, hash, 'user', now, now, now]);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ApiError(409, 'email_taken', 'An account with this email already exists. Try signing in.', 'email');
      throw e;
    }
    setSessionCookie(res, await createSession(db, id, cfg), cfg);
    const user = { id, name, email, role: 'user', verifiedLabel: null, createdAt: now };
    res.status(201).json(await mePayload(ctx, user));
  });

  r.post('/login', async (req, res) => {
    rateGuard(limiters.loginIp, req.ip);
    const b = req.body ?? {};
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!email || !password || password.length > 128 || email.length > 254) throw bad('Enter your email and password.');
    const key = req.ip + '|' + email;
    rateGuard(limiters.loginAccount, key);
    const row = await db.get('SELECT id, name, email, role, verified_label, created_at, pass_hash, suspended_at FROM users WHERE email = ?', [email]);
    let ok = false;
    if (row) ok = await verifyPassword(password, row.pass_hash); else await burnTime(password);
    if (ok && row.suspended_at) throw new ApiError(403, 'suspended', 'This account is suspended. Contact the site owner.');
    if (!ok) throw new ApiError(401, 'bad_credentials', 'Email or password is incorrect.');
    limiters.loginAccount.reset(key);
    await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [Date.now(), row.id]);
    setSessionCookie(res, await createSession(db, row.id, cfg), cfg);
    const user = { id: row.id, name: row.name, email: row.email, role: row.role, verifiedLabel: row.verified_label, createdAt: row.created_at };
    res.json(await mePayload(ctx, user));
  });

  r.post('/logout', async (req, res) => {
    if (req.sessionHash) await db.run('DELETE FROM sessions WHERE token_hash = ?', [req.sessionHash]);
    clearSessionCookie(res, cfg);
    res.json({ ok: true });
  });

  r.post('/logout-all', requireAuth, async (req, res) => {
    await db.run('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);
    bus.disconnectUser(req.user.id);
    clearSessionCookie(res, cfg);
    res.json({ ok: true });
  });

  return r;
}
