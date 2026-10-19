import { Router } from 'express';
import { GENRES } from '../../public/js/constants.js';
import { requireAuth } from '../session.js';

export default function musicRoutes({ db, spotify }) {
  const r = Router();
  r.use(requireAuth);

  // One entry per genre the person picked. uri is null when nothing is set up for that genre yet.
  r.get('/for-me', async (req, res) => {
    const picked = (await db.all('SELECT genre FROM profile_genres WHERE user_id = ?', [req.user.id])).map((x) => x.genre);
    const out = [];
    for (const id of picked) {
      const g = GENRES.find((x) => x.id === id);
      if (!g) continue;
      const found = await spotify.resolve(id);
      out.push({ id, label: g.label, uri: found?.uri ?? null, title: found?.title ?? null, source: found?.source ?? null });
    }
    res.json({ genres: out });
  });

  return r;
}
