import { Router } from 'express';
import { GENRES } from '../../public/js/constants.js';
import { ApiError, addDays, bad, oneOf, text } from '../validate.js';
import { parseSpotifyLink } from '../spotify.js';
import { POST_SELECT, formatPost, insertPost } from '../posts.js';
import { audit, requireAdmin } from '../session.js';

const LAGOS_OFFSET = 3600 * 1000; // Lagos is UTC+1 all year

export default function adminRoutes({ db, bus, spotify }) {
  const r = Router();
  r.use(requireAdmin);

  // Only counts. No one's name, email or answers appear here.
  r.get('/insights', async (req, res) => {
    const done = 'WHERE onboarded_at IS NOT NULL';
    const grp = "COALESCE(ethnic_group, 'not_shared')";
    const since = Date.now() - 30 * 86400000;
    const days = {};
    for (const x of await db.all('SELECT created_at FROM users WHERE created_at >= ?', [since])) {
      const d = new Date(x.created_at + LAGOS_OFFSET).toISOString().slice(0, 10);
      days[d] = (days[d] || 0) + 1;
    }
    const signups = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() + LAGOS_OFFSET - i * 86400000).toISOString().slice(0, 10); signups.push({ day: d, n: days[d] || 0 }); }
    res.json({
      online: bus.online(),
      totals: {
        users: (await db.get('SELECT COUNT(*) AS n FROM users')).n,
        onboarded: (await db.get(`SELECT COUNT(*) AS n FROM profiles ${done}`)).n,
      },
      byPurpose: await db.all(`SELECT purpose AS k, COUNT(*) AS n FROM profiles ${done} GROUP BY purpose ORDER BY n DESC`),
      byGroup: await db.all(`SELECT ${grp} AS k, COUNT(*) AS n FROM profiles ${done} GROUP BY ${grp} ORDER BY n DESC`),
      byState: await db.all(`SELECT home_state AS k, COUNT(*) AS n FROM profiles ${done} GROUP BY home_state ORDER BY n DESC, home_state LIMIT 40`),
      purposeByGroup: await db.all(`SELECT purpose, ${grp} AS grp, COUNT(*) AS n FROM profiles ${done} GROUP BY purpose, ${grp} ORDER BY n DESC`),
      visitorsByState: await db.all(`SELECT home_state AS k, COUNT(*) AS n FROM profiles ${done} AND purpose = 'visitor' GROUP BY home_state ORDER BY n DESC, home_state LIMIT 40`),
      visitorsByGroup: await db.all(`SELECT ${grp} AS k, COUNT(*) AS n FROM profiles ${done} AND purpose = 'visitor' GROUP BY ${grp} ORDER BY n DESC`),
      genres: await db.all('SELECT genre AS k, COUNT(*) AS n FROM profile_genres GROUP BY genre ORDER BY n DESC, genre'),
      posts: await db.all("SELECT kind, status, COUNT(*) AS n FROM posts WHERE is_example = 0 GROUP BY kind, status ORDER BY kind, status"),
      signups,
    });
  });

  r.get('/review', async (req, res) => {
    const pending = await db.all(`${POST_SELECT} WHERE p.status = 'pending' ORDER BY p.created_at ASC LIMIT 100`, [req.user.id]);
    const groups = await db.all("SELECT post_id, COUNT(*) AS n FROM reports WHERE status = 'open' GROUP BY post_id ORDER BY n DESC LIMIT 50");
    const reports = [];
    for (const g of groups) {
      const row = await db.get(`${POST_SELECT} WHERE p.id = ?`, [req.user.id, g.post_id]);
      if (!row) continue;
      const items = await db.all("SELECT reason, note, created_at FROM reports WHERE post_id = ? AND status = 'open' ORDER BY created_at", [g.post_id]);
      reports.push({ post: formatPost(row, req.user.id), count: g.n, items: items.map((i) => ({ reason: i.reason, note: i.note, createdAt: i.created_at })) });
    }
    res.json({ pending: pending.map((x) => formatPost(x, req.user.id)), reports });
  });

  r.post('/posts/:id/status', async (req, res) => {
    const status = oneOf(req.body?.status, ['published', 'removed'], { field: 'status', label: 'an action' });
    const row = await db.get('SELECT id, kind FROM posts WHERE id = ?', [req.params.id]);
    if (!row) throw new ApiError(404, 'not_found', 'That post is not there any more.');
    await db.tx(async (t) => {
      await t.run('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?', [status, Date.now(), row.id]);
      await t.run("UPDATE reports SET status = ? WHERE post_id = ? AND status = 'open'", [status === 'published' ? 'dismissed' : 'actioned', row.id]);
    });
    await audit(db, req.user, 'post.' + status, row.id, row.kind);
    bus.changed(row.kind);
    res.json({ ok: true });
  });

  r.get('/users', async (req, res) => {
    const q = text(req.query.q, { field: 'q', max: 80 }).toLowerCase().replace(/[\\%_]/g, '\\$&');
    const like = `%${q}%`;
    const rows = await db.all(
      `SELECT id, email, name, role, verified_label, created_at, suspended_at FROM users
        WHERE LOWER(email) LIKE ? ESCAPE '\\' OR LOWER(name) LIKE ? ESCAPE '\\'
        ORDER BY created_at DESC LIMIT 20`, [like, like]);
    res.json({ users: rows.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, verifiedLabel: u.verified_label, createdAt: u.created_at, suspended: !!u.suspended_at })) });
  });

  r.post('/users/:id/verify', async (req, res) => {
    const label = req.body?.label == null || req.body.label === '' ? null : text(req.body.label, { field: 'label', label: 'Label', min: 2, max: 40 });
    const done = await db.run('UPDATE users SET verified_label = ? WHERE id = ?', [label, req.params.id]);
    if (!done.changes) throw new ApiError(404, 'not_found', 'No such account.');
    await audit(db, req.user, label ? 'user.verify' : 'user.unverify', req.params.id, label);
    bus.changed('event', 'roommate', 'business', 'newsletter');
    res.json({ ok: true, verifiedLabel: label });
  });

  r.post('/users/:id/suspend', async (req, res) => {
    const on = req.body?.suspended === true;
    const u = await db.get('SELECT id, role, email FROM users WHERE id = ?', [req.params.id]);
    if (!u) throw new ApiError(404, 'not_found', 'No such account.');
    if (u.id === req.user.id || u.role === 'admin') throw new ApiError(400, 'invalid', 'You cannot suspend an admin account.');
    await db.run('UPDATE users SET suspended_at = ? WHERE id = ?', [on ? Date.now() : null, u.id]);
    if (on) { await db.run('DELETE FROM sessions WHERE user_id = ?', [u.id]); bus.disconnectUser(u.id); await db.run("UPDATE posts SET status = 'hidden' WHERE author_id = ? AND status = 'published'", [u.id]); bus.changed('event', 'roommate', 'business', 'newsletter'); }
    await audit(db, req.user, on ? 'user.suspend' : 'user.unsuspend', u.id, u.email);
    res.json({ ok: true, suspended: on });
  });

  r.get('/verifications', async (req, res) => {
    const rows = await db.all(`SELECT v.id, v.user_id, v.org_name, v.org_type, v.details, v.created_at, u.name, u.email FROM verification_requests v JOIN users u ON u.id = v.user_id WHERE v.status = 'pending' ORDER BY v.created_at LIMIT 100`);
    res.json({ requests: rows.map((x) => ({ id: x.id, userId: x.user_id, orgName: x.org_name, orgType: x.org_type, details: x.details, createdAt: x.created_at, name: x.name, email: x.email })) });
  });
  r.post('/verifications/:id/decide', async (req, res) => {
    const v = await db.get("SELECT id, user_id, org_name FROM verification_requests WHERE id = ? AND status = 'pending'", [req.params.id]);
    if (!v) throw new ApiError(404, 'not_found', 'That request was already handled.');
    const approve = req.body?.approve === true;
    await db.tx(async (t) => {
      await t.run('UPDATE verification_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?', [approve ? 'approved' : 'rejected', req.user.id, Date.now(), v.id]);
      if (approve) await t.run('UPDATE users SET verified_label = ? WHERE id = ?', [text(req.body?.label || v.org_name, { field: 'label', label: 'Label', min: 2, max: 40 }), v.user_id]);
    });
    await audit(db, req.user, approve ? 'verification.approve' : 'verification.reject', v.user_id, v.org_name);
    bus.changed('event', 'roommate', 'business', 'newsletter');
    res.json({ ok: true });
  });

  r.get('/audit', async (req, res) => {
    const rows = await db.all('SELECT actor_name, action, target, detail, created_at FROM audit_log ORDER BY created_at DESC LIMIT 100');
    res.json({ entries: rows.map((x) => ({ actor: x.actor_name, action: x.action, target: x.target, detail: x.detail, createdAt: x.created_at })) });
  });

  // ---- music: the playlist for each genre ----
  r.get('/music', async (req, res) => {
    const rows = await db.all('SELECT genre, spotify_uri, title, updated_at FROM music_playlists');
    const by = Object.fromEntries(rows.map((x) => [x.genre, x]));
    res.json({
      searchConfigured: spotify.configured,
      genres: GENRES.map((g) => ({ id: g.id, label: g.label, curated: by[g.id] ? { uri: by[g.id].spotify_uri, title: by[g.id].title, updatedAt: by[g.id].updated_at } : null })),
    });
  });

  r.put('/music/:genre', async (req, res) => {
    const genre = oneOf(req.params.genre, GENRES.map((g) => g.id), { field: 'genre', label: 'a genre' });
    const link = parseSpotifyLink(req.body?.url);
    if (!link) throw bad('Paste a Spotify link, like https://open.spotify.com/playlist/… (playlist, album, artist or track).', 'url');
    const title = text(req.body?.title, { field: 'title', label: 'Title', max: 80 }) || null;
    await db.run(
      `INSERT INTO music_playlists (genre, spotify_uri, title, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (genre) DO UPDATE SET spotify_uri = excluded.spotify_uri, title = excluded.title, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [genre, link.uri, title, req.user.id, Date.now()]);
    res.json({ ok: true, uri: link.uri });
  });

  r.delete('/music/:genre', async (req, res) => {
    await db.run('DELETE FROM music_playlists WHERE genre = ?', [req.params.genre]);
    res.json({ ok: true });
  });

  r.get('/music/search', async (req, res) => {
    const genre = oneOf(req.query.genre, GENRES.map((g) => g.id), { field: 'genre', label: 'a genre' });
    res.json(await spotify.searchPlaylists(genre));
  });

  // ---- example posts, to try the app before real ones arrive ----
  r.post('/examples', async (req, res) => {
    if ((await db.get('SELECT COUNT(*) AS n FROM posts WHERE is_example = 1')).n > 0) throw new ApiError(409, 'exists', 'Example posts are already loaded.');
    const t = new Date().toISOString().slice(0, 10);
    const dow = (n) => addDays(t, (n - new Date(t + 'T00:00:00Z').getUTCDay() + 7) % 7);
    const S = (o) => ({ ...o, details: (o.details || '') + ' (Example listing.)' });
    const items = [
      ['event', { title: 'Sunday Worship Service', type: 'church', org: 'Example Chapel', date: dow(0), time: '08:00', area: 'Owerri', weekly: true, details: 'Churches post their real programs here.' }],
      ['event', { title: 'Youth Night of Praise', type: 'church', org: 'Example Fellowship', date: dow(5), time: '18:00', area: 'Owerri', weekly: true, details: 'A weekly youth gathering.' }],
      ['event', { title: 'Live Band Night', type: 'bar', org: 'Example Lounge', date: dow(6), time: '20:00', area: 'Owerri', weekly: true, details: 'Bars and lounges post their nights and offers here.' }],
      ['event', { title: 'Freshers Welcome Orientation', type: 'school', org: 'Example University Student Affairs', date: addDays(t, 3), time: '10:00', area: 'Owerri', details: 'Schools announce orientation and key dates.' }],
      ['event', { title: 'New Yam Cultural Night', type: 'culture', org: 'Example Cultural Group', date: addDays(t, 6), time: '17:00', area: 'Owerri', details: 'Customs differ from town to town.' }],
      ['roommate', { nick: 'Example Student 1', school: 'FUTO', level: '200L', gender: 'Female', wants: 'Female roommate', budget: 150000, area: 'Ihiagwa', habits: ['Quiet', 'Neat', 'Early riser'], about: 'Example post. Engineering student looking for a calm, tidy roommate near campus.' }],
      ['roommate', { nick: 'Example Student 2', school: 'IMSU', level: '300L', gender: 'Male', wants: 'Male roommate', budget: 200000, area: 'Egbu', habits: ['Night reader', 'Cooks'], about: 'Example post. Prefers a two-person room with steady light.' }],
      ['business', { name: 'Example Jollof Corner', cat: 'Food', offer: 'Jollof rice, fried plantain and grilled fish. Open 11am to 9pm. (Example listing.)', price: '₦1,500 to ₦4,000', area: 'Owerri', promo: '10% off with student ID', contact: '08000000000' }],
      ['business', { name: 'Example Print and Copy', cat: 'Printing', offer: 'Printing, binding and project typing. Same-day service. (Example listing.)', price: 'From ₦50 per page', area: 'Owerri', contact: '08000000001' }],
      ['newsletter', { title: 'Resumption and registration notice', org: 'Example University Registry', orgType: 'School office', body: 'This is an example notice. Verified school offices publish real resumption dates, registration steps and deadlines here so students can trust what they read.' }],
    ];
    const { VALIDATORS } = await import('../posts.js');
    for (const [kind, raw] of items) await insertPost(db, { kind, user: req.user, v: VALIDATORS[kind](kind === 'event' ? S(raw) : raw), example: true });
    bus.changed('event', 'roommate', 'business', 'newsletter');
    res.json({ ok: true, added: items.length });
  });

  r.delete('/examples', async (req, res) => {
    const done = await db.run('DELETE FROM posts WHERE is_example = 1');
    bus.changed('event', 'roommate', 'business', 'newsletter');
    res.json({ ok: true, removed: done.changes });
  });

  return r;
}
