import express, { Router } from 'express';
import { ApiError } from '../validate.js';
import { newId } from '../security.js';
import { rateGuard, requireAuth } from '../session.js';

export const MAX_PDF = 3 * 1024 * 1024;

export default function fileRoutes({ db, limiters }) {
  const r = Router();
  r.use(requireAuth);

  // Raw PDF body. We check the bytes, not the name: a real PDF starts with %PDF-.
  r.post('/', express.raw({ type: () => true, limit: MAX_PDF }), async (req, res) => {
    rateGuard(limiters.post, 'file|' + req.user.id);
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 100) throw new ApiError(400, 'invalid', 'Choose a PDF file.');
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ApiError(400, 'invalid', 'That file is not a PDF.');
    if (buf.includes(Buffer.from('/JavaScript')) || buf.includes(Buffer.from('/JS ')) || buf.includes(Buffer.from('/Launch')) || buf.includes(Buffer.from('/EmbeddedFile')))
      throw new ApiError(400, 'unsafe', 'This PDF has active content (scripts or attachments). Export a plain PDF and try again.');
    const name = String(req.get('x-filename') || 'notice.pdf').replace(/[^\w.\- ]/g, '').slice(0, 80) || 'notice.pdf';
    const id = newId();
    await db.run('INSERT INTO files (id, owner_id, name, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, req.user.id, name.endsWith('.pdf') ? name : name + '.pdf', buf.length, buf.toString('base64'), Date.now()]);
    res.status(201).json({ id, name, size: buf.length });
  });

  // Only the owner, admins, or anyone when the file belongs to a published notice.
  r.get('/:id', async (req, res) => {
    const f = await db.get('SELECT id, owner_id, name, data FROM files WHERE id = ?', [req.params.id]);
    if (!f) throw new ApiError(404, 'not_found', 'File not found.');
    if (f.owner_id !== req.user.id && req.user.role !== 'admin') {
      const ok = await db.get("SELECT id FROM posts WHERE kind = 'newsletter' AND status = 'published' AND data LIKE ?", [`%"fileId":"${f.id}"%`]);
      if (!ok) throw new ApiError(404, 'not_found', 'File not found.');
    }
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${f.name}"`, 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff' });
    res.send(Buffer.from(f.data, 'base64'));
  });
  return r;
}
