import { Router } from 'express';
import { requireAuth } from '../session.js';

export default function streamRoutes({ bus }) {
  const r = Router();
  r.get('/', requireAuth, (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const off = bus.add(req.user.id, res);
    req.on('close', off);
  });
  return r;
}
