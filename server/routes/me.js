import { Router } from 'express';
import { ApiError, bad, oneOf, text } from '../validate.js';
import { ORG_TYPES } from '../../public/js/constants.js';
import { newId } from '../security.js';
import { clearSessionCookie, verifyPassword } from '../security.js';
import { rateGuard, requireAuth } from '../session.js';
import { loadProfile, mePayload, saveProfile, validateProfile } from '../profile.js';

export default function meRoutes(ctx) {
  const { cfg, db, bus, limiters } = ctx;
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => res.json(await mePayload(ctx, req.user)));

  r.patch('/profile', async (req, res) => {
    const v = validateProfile(req.body ?? {});
    await saveProfile(db, req.user.id, v);
    res.json(await mePayload(ctx, req.user));
  });

  // Ask to be verified as a school, church, business or group. An admin decides.
  r.get('/verification', async (req, res) => {
    const rows = await db.all('SELECT id, org_name, org_type, status, created_at FROM verification_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [req.user.id]);
    res.json({ requests: rows.map((x) => ({ id: x.id, orgName: x.org_name, orgType: x.org_type, status: x.status, createdAt: x.created_at })) });
  });
  r.post('/verification', async (req, res) => {
    rateGuard(ctx.limiters.post, 'ver|' + req.user.id);
    const b = req.body ?? {};
    const orgName = text(b.orgName, { field: 'orgName', label: 'Organisation name', min: 2, max: 80 });
    const orgType = oneOf(b.orgType, ORG_TYPES, { field: 'orgType', label: 'an organisation type' });
    const details = text(b.details, { field: 'details', label: 'Details', min: 10, max: 500, multiline: true });
    if (await db.get("SELECT id FROM verification_requests WHERE user_id = ? AND status = 'pending'", [req.user.id])) throw new ApiError(409, 'exists', 'You already have a request waiting for review.');
    await db.run('INSERT INTO verification_requests (id, user_id, org_name, org_type, details, created_at) VALUES (?, ?, ?, ?, ?, ?)', [newId(), req.user.id, orgName, orgType, details, Date.now()]);
    res.status(201).json({ ok: true });
  });

  r.get('/blocks', async (req, res) => {
    const rows = await db.all('SELECT b.blocked_id AS id, u.name FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC', [req.user.id]);
    res.json({ blocks: rows.map((x) => ({ id: x.id, name: String(x.name).split(' ')[0] })) });
  });
  r.delete('/blocks/:id', async (req, res) => {
    await db.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, req.params.id]);
    bus.changed('roommate', 'business', 'event', 'newsletter');
    res.json({ ok: true });
  });

  // Everything we hold about the person, as a file they can keep.
  r.get('/export', async (req, res) => {
    const u = await db.get('SELECT id, email, name, role, verified_label, terms_at, created_at, last_login_at FROM users WHERE id = ?', [req.user.id]);
    const posts = (await db.all('SELECT id, kind, status, title, data, contact, event_date, weekly, created_at FROM posts WHERE author_id = ? ORDER BY created_at', [req.user.id]))
      .map((p) => ({ ...p, data: JSON.parse(p.data) }));
    const reacted = (await db.all('SELECT post_id, created_at FROM reactions WHERE user_id = ?', [req.user.id]));
    const reports = (await db.all('SELECT post_id, reason, note, status, created_at FROM reports WHERE reporter_id = ?', [req.user.id]));
    res.set('Content-Disposition', 'attachment; filename="my-ndi-igbo-data.json"');
    res.json({ exportedAt: new Date().toISOString(), account: u, profile: await loadProfile(db, req.user.id), posts, reacted, reports });
  });

  r.delete('/', async (req, res) => {
    rateGuard(limiters.loginAccount, 'del|' + req.user.id);
    const pw = req.body?.password;
    if (typeof pw !== 'string' || !pw) throw bad('Enter your password to delete your account.', 'password');
    const row = await db.get('SELECT pass_hash FROM users WHERE id = ?', [req.user.id]);
    if (!row || !(await verifyPassword(pw, row.pass_hash))) throw new ApiError(401, 'bad_credentials', 'That password is not correct.', 'password');
    await db.run('DELETE FROM users WHERE id = ?', [req.user.id]); // sessions, profile, posts, reactions follow by cascade
    bus.disconnectUser(req.user.id);
    bus.changed('event', 'roommate', 'business', 'newsletter');
    clearSessionCookie(res, cfg);
    res.json({ ok: true });
  });

  return r;
}
