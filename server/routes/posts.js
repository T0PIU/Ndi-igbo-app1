import { Router } from 'express';
import { REPORT_REASONS } from '../../public/js/constants.js';
import { ApiError, addDays, bad, int, oneOf, text } from '../validate.js';
import { newId } from '../security.js';
import { rateGuard, requireAuth } from '../session.js';
import { KINDS, POST_SELECT, VALIDATORS, formatPost, initialStatus, insertPost } from '../posts.js';

const HIDE_AFTER_REPORTS = 3;

export default function postRoutes({ db, bus, limiters }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    const kind = req.query.kind;
    if (!KINDS.includes(kind)) throw bad('Choose what to list: event, roommate, business or newsletter.', 'kind');
    const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
    const rows = await db.all(
      `${POST_SELECT}
        WHERE p.kind = ?
          AND p.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
          AND p.author_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
          AND (p.status = 'published' OR (p.author_id = ? AND p.status IN ('pending', 'hidden')))
          AND (p.kind <> 'event' OR p.weekly = 1 OR p.event_date >= ?)
        ORDER BY p.created_at DESC LIMIT 300`,
      [req.user.id, kind, req.user.id, req.user.id, req.user.id, yesterday]);
    const posts = rows.map((x) => formatPost(x, req.user.id));
    if (kind === 'business' && posts.length) {
      const ids = posts.map((x) => x.id), ph = ids.map(() => '?').join(',');
      const agg = Object.fromEntries((await db.all(`SELECT post_id, COUNT(*) AS n, AVG(rating) AS a FROM reviews WHERE post_id IN (${ph}) GROUP BY post_id`, ids)).map((x) => [x.post_id, x]));
      const mine = Object.fromEntries((await db.all(`SELECT post_id, rating FROM reviews WHERE user_id = ? AND post_id IN (${ph})`, [req.user.id, ...ids])).map((x) => [x.post_id, x.rating]));
      for (const x of posts) x.rating = { count: Number(agg[x.id]?.n || 0), avg: agg[x.id] ? Math.round(Number(agg[x.id].a) * 10) / 10 : 0, mine: mine[x.id] || 0 };
    }
    if (kind === 'event' && posts.length) {
      const ids = posts.map((x) => x.id), ph = ids.map(() => '?').join(',');
      const cnt = Object.fromEntries((await db.all(`SELECT post_id, COUNT(*) AS n FROM rsvps WHERE post_id IN (${ph}) GROUP BY post_id`, ids)).map((x) => [x.post_id, Number(x.n)]));
      const mine = new Set((await db.all(`SELECT post_id FROM rsvps WHERE user_id = ? AND post_id IN (${ph})`, [req.user.id, ...ids])).map((x) => x.post_id));
      for (const x of posts) x.rsvp = { count: cnt[x.id] || 0, mine: mine.has(x.id) };
    }
    res.json({ posts });
  });

  async function attachFile(user, kind, v, b) {
    if (kind !== 'newsletter') return;
    if (!b.fileId) return;
    const f = await db.get('SELECT id, name, size FROM files WHERE id = ? AND owner_id = ?', [String(b.fileId), user.id]);
    if (!f) throw bad('That PDF was not found. Upload it again.', 'fileId');
    v.data.fileId = f.id; v.data.fileName = f.name; v.data.fileSize = Number(f.size);
  }

  r.post('/', async (req, res) => {
    rateGuard(limiters.post, req.user.id);
    const b = req.body ?? {};
    const kind = b.kind;
    if (!KINDS.includes(kind)) throw bad('Choose what you want to post.', 'kind');
    const v = VALIDATORS[kind](b);
    await attachFile(req.user, kind, v, b);
    if (kind === 'roommate') {
      const n = (await db.get("SELECT COUNT(*) AS n FROM posts WHERE author_id = ? AND kind = 'roommate' AND status <> 'removed'", [req.user.id])).n;
      if (n >= 2) throw new ApiError(409, 'limit', 'You already have two roommate posts. Delete one before adding another.');
    }
    const { id, status } = await insertPost(db, { kind, user: req.user, v });
    bus.changed(kind);
    const row = await db.get(`${POST_SELECT} WHERE p.id = ?`, [req.user.id, id]);
    res.status(201).json({ post: formatPost(row, req.user.id), message: status === 'pending' ? 'Thank you. An admin will review your newsletter before it goes live. Verified senders skip this step.' : null });
  });

  const load = async (id, viewerId) => {
    const row = await db.get(`${POST_SELECT} WHERE p.id = ?`, [viewerId, id]);
    if (!row) throw new ApiError(404, 'not_found', 'That post is not there any more.');
    return row;
  };

  r.delete('/:id', async (req, res) => {
    const row = await load(req.params.id, req.user.id);
    if (row.author_id !== req.user.id && req.user.role !== 'admin') throw new ApiError(403, 'forbidden', 'You can only delete your own posts.');
    await db.run('DELETE FROM posts WHERE id = ?', [row.id]);
    bus.changed(row.kind);
    res.json({ ok: true });
  });

  r.post('/:id/rsvp', async (req, res) => {
    rateGuard(limiters.react, req.user.id);
    const row = await load(req.params.id, req.user.id);
    if (row.kind !== 'event' || row.status !== 'published') throw new ApiError(400, 'invalid', 'You cannot RSVP to this.');
    const del = await db.run('DELETE FROM rsvps WHERE post_id = ? AND user_id = ?', [row.id, req.user.id]);
    let going = false;
    if (del.changes === 0) { await db.run('INSERT INTO rsvps (post_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [row.id, req.user.id, Date.now()]); going = true; }
    const count = Number((await db.get('SELECT COUNT(*) AS n FROM rsvps WHERE post_id = ?', [row.id])).n);
    bus.changed('event');
    res.json({ going, count });
  });

  // Authors edit their own posts. Unverified newsletter edits go back to review.
  r.patch('/:id', async (req, res) => {
    rateGuard(limiters.post, req.user.id);
    const row = await load(req.params.id, req.user.id);
    if (row.author_id !== req.user.id) throw new ApiError(403, 'forbidden', 'You can only edit your own posts.');
    if (!['published', 'pending', 'hidden'].includes(row.status)) throw new ApiError(400, 'invalid', 'This post cannot be edited.');
    const v = VALIDATORS[row.kind](req.body ?? {});
    await attachFile(req.user, row.kind, v, req.body ?? {});
    if (row.kind === 'newsletter' && !req.body?.fileId) { const old = JSON.parse(row.data); if (old.fileId && req.body?.keepFile !== false) { v.data.fileId = old.fileId; v.data.fileName = old.fileName; v.data.fileSize = old.fileSize; } }
    const status = row.kind === 'newsletter' ? initialStatus('newsletter', req.user) : row.status;
    await db.run('UPDATE posts SET title = ?, data = ?, contact = ?, event_date = ?, weekly = ?, status = ?, updated_at = ? WHERE id = ?',
      [v.title, JSON.stringify(v.data), v.contact || row.contact, v.eventDate || null, v.weekly ? 1 : 0, status, Date.now(), row.id]);
    bus.changed(row.kind);
    res.json({ post: formatPost(await load(row.id, req.user.id), req.user.id) });
  });

  r.post('/:id/review', async (req, res) => {
    rateGuard(limiters.report, 'rev|' + req.user.id);
    const row = await load(req.params.id, req.user.id);
    if (row.kind !== 'business' || row.status !== 'published') throw new ApiError(400, 'invalid', 'You can only review published businesses.');
    if (row.author_id === req.user.id) throw new ApiError(400, 'invalid', 'You cannot review your own business.');
    const rating = int(req.body?.rating, { field: 'rating', label: 'Rating', min: 1, max: 5 });
    const body = text(req.body?.body, { field: 'body', label: 'Review', max: 300, multiline: true });
    await db.run(`INSERT INTO reviews (post_id, user_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (post_id, user_id) DO UPDATE SET rating = excluded.rating, body = excluded.body, created_at = excluded.created_at`, [row.id, req.user.id, rating, body || null, Date.now()]);
    bus.changed('business');
    res.json({ ok: true });
  });
  r.delete('/:id/review', async (req, res) => {
    await db.run('DELETE FROM reviews WHERE post_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    bus.changed('business');
    res.json({ ok: true });
  });
  r.get('/:id/reviews', async (req, res) => {
    const rows = await db.all('SELECT r.rating, r.body, r.created_at, u.name FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.post_id = ? ORDER BY r.created_at DESC LIMIT 20', [req.params.id]);
    res.json({ reviews: rows.map((x) => ({ rating: x.rating, body: x.body, createdAt: x.created_at, name: String(x.name).split(' ')[0] })) });
  });

  // Block the person behind a post. Neither of you sees the other's posts afterwards.
  r.post('/:id/block', async (req, res) => {
    const row = await load(req.params.id, req.user.id);
    if (row.author_id === req.user.id) throw new ApiError(400, 'invalid', 'You cannot block yourself.');
    await db.run('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [req.user.id, row.author_id, Date.now()]);
    bus.changed(row.kind);
    res.json({ ok: true });
  });

  r.post('/:id/react', async (req, res) => {
    rateGuard(limiters.react, req.user.id);
    const row = await load(req.params.id, req.user.id);
    if (row.status !== 'published' || row.kind === 'newsletter') throw new ApiError(400, 'invalid', 'You cannot react to this.');
    const del = await db.run('DELETE FROM reactions WHERE post_id = ? AND user_id = ?', [row.id, req.user.id]);
    let reacted = false;
    if (del.changes === 0) {
      await db.run('INSERT INTO reactions (post_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [row.id, req.user.id, Date.now()]);
      reacted = true;
    }
    const count = (await db.get('SELECT COUNT(*) AS n FROM reactions WHERE post_id = ?', [row.id])).n;
    bus.changed(row.kind);
    res.json({ reacted, count });
  });

  // Roommate phone numbers are never in the list. A signed-in member has to ask for one at a time.
  r.post('/:id/contact', async (req, res) => {
    rateGuard(limiters.contact, req.user.id);
    const row = await load(req.params.id, req.user.id);
    if (row.kind !== 'roommate' || row.status !== 'published') throw new ApiError(400, 'invalid', 'This post has no private contact.');
    if (await db.get('SELECT 1 AS x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', [req.user.id, row.author_id, row.author_id, req.user.id])) throw new ApiError(404, 'not_found', 'That post is not there any more.');
    if (!row.contact) throw new ApiError(404, 'no_contact', 'This student did not leave a contact. Tap “I’m interested” and they can find you.');
    res.json({ contact: row.contact });
  });

  r.post('/:id/report', async (req, res) => {
    rateGuard(limiters.report, req.user.id);
    const row = await load(req.params.id, req.user.id);
    if (row.author_id === req.user.id) throw new ApiError(400, 'invalid', 'You cannot report your own post.');
    const reason = oneOf(req.body?.reason, REPORT_REASONS, { field: 'reason', label: 'a reason' });
    const note = text(req.body?.note, { field: 'note', label: 'Note', max: 300 });
    const ins = await db.run('INSERT INTO reports (id, post_id, reporter_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      [newId(), row.id, req.user.id, reason, note || null, Date.now()]);
    if (ins.changes === 0) throw new ApiError(409, 'already', 'You already reported this post. Thank you.');
    const n = (await db.get("SELECT COUNT(*) AS n FROM reports WHERE post_id = ? AND status = 'open'", [row.id])).n;
    if (n >= HIDE_AFTER_REPORTS && row.status === 'published') {
      await db.run("UPDATE posts SET status = 'hidden', updated_at = ? WHERE id = ?", [Date.now(), row.id]);
      bus.changed(row.kind);
    }
    res.json({ ok: true });
  });

  return r;
}
