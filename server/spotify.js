import { GENRES } from '../public/js/constants.js';

export class SpotifyError extends Error {
  constructor(status, kind) { super(`Spotify ${kind} ${status}`); this.status = status; this.kind = kind; }
}

// Accepts a Spotify web link or URI for a playlist, album, artist or track and returns an embeddable URI.
export function parseSpotifyLink(input) {
  const m = String(input ?? '').trim().match(/^(?:https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?|spotify:)(playlist|album|artist|track)[/:]([A-Za-z0-9]{22})(?:[?#].*)?$/);
  return m ? { type: m[1], id: m[2], uri: `spotify:${m[1]}:${m[2]}` } : null;
}

const HOUR = 3600 * 1000;

// Spotify's rules for new apps are tight (see README). This module is optional: the app works
// without it using playlists an admin pastes in. Everything here fails soft.
export function createSpotify(cfg, db, fetchImpl = fetch) {
  const s = cfg.spotify;
  const configured = !!(s.clientId && s.clientSecret);
  let token = null, tokenExp = 0, cooldownUntil = 0;

  async function getToken() {
    if (token && Date.now() < tokenExp - 60000) return token;
    const res = await fetchImpl(`${s.accountsBase}/api/token`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${s.clientId}:${s.clientSecret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new SpotifyError(res.status, 'token');
    const j = await res.json();
    token = j.access_token; tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
    return token;
  }

  async function api(pathAndQuery) {
    if (Date.now() < cooldownUntil) throw new SpotifyError(429, 'cooldown');
    const res = await fetchImpl(`${s.apiBase}${pathAndQuery}`, { headers: { Authorization: `Bearer ${await getToken()}` }, signal: AbortSignal.timeout(8000) });
    if (res.status === 401) token = null;
    if (res.status === 429) {
      const wait = Math.min(Math.max(parseInt(res.headers.get('retry-after') || '60', 10) || 60, 30), 3600);
      cooldownUntil = Date.now() + wait * 1000;
    }
    if (!res.ok) throw new SpotifyError(res.status, 'api');
    return res.json();
  }

  async function cached(key, ttlFor, load) {
    const hit = await db.get('SELECT v FROM kv_cache WHERE k = ? AND expires_at > ?', [key, Date.now()]);
    if (hit) return JSON.parse(hit.v);
    const out = await load();
    await db.run('INSERT INTO kv_cache (k, v, expires_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, expires_at = excluded.expires_at',
      [key, JSON.stringify(out), Date.now() + ttlFor(out)]);
    return out;
  }

  // Playlist suggestions for a genre. Results are cached 12 hours; failures for 10 minutes so we never hammer Spotify.
  async function searchPlaylists(genreId) {
    const g = GENRES.find((x) => x.id === genreId);
    if (!g) return { ok: false, reason: 'unknown_genre' };
    if (!configured) return { ok: false, reason: 'not_configured' };
    return cached('spotify:pl:' + genreId, (o) => (o.ok ? (o.items.length ? 12 * HOUR : HOUR) : 10 * 60 * 1000), async () => {
      try {
        const j = await api(`/search?type=playlist&limit=10&q=${encodeURIComponent(g.q)}`);
        const items = (j?.playlists?.items || [])
          .filter((i) => i && typeof i.id === 'string' && /^[A-Za-z0-9]{22}$/.test(i.id))
          .map((i) => ({ id: i.id, uri: `spotify:playlist:${i.id}`, name: String(i.name || '').slice(0, 100), owner: String(i.owner?.display_name || '').slice(0, 60), image: typeof i.images?.[0]?.url === 'string' ? i.images[0].url : null }));
        return { ok: true, items };
      } catch (e) {
        const status = e.status ?? 0;
        return { ok: false, reason: status === 429 ? 'rate_limited' : status === 403 ? 'forbidden' : status === 401 ? 'unauthorized' : 'unavailable', status };
      }
    });
  }

  // What to play for a genre: the admin's chosen playlist first, then the top search result, else nothing.
  async function resolve(genreId) {
    const row = await db.get('SELECT spotify_uri, title FROM music_playlists WHERE genre = ?', [genreId]);
    if (row) return { uri: row.spotify_uri, title: row.title || null, source: 'curated' };
    const found = await searchPlaylists(genreId);
    const first = found.ok ? found.items[0] : null;
    return first ? { uri: first.uri, title: first.name, source: 'spotify-search' } : null;
  }

  return { configured, searchPlaylists, resolve };
}
