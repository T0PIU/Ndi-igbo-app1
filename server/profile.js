import { GENRES, GROUPS, PURPOSES, SCHOOLS, STATES, MAX_GENRES } from '../public/js/constants.js';
import { bad, oneOf, text } from './validate.js';

export async function loadProfile(db, userId) {
  const p = await db.get('SELECT purpose, ethnic_group, group_consent_at, home_state, school, onboarded_at FROM profiles WHERE user_id = ?', [userId]);
  const genres = (await db.all('SELECT genre FROM profile_genres WHERE user_id = ? ORDER BY genre', [userId])).map((r) => r.genre);
  return {
    purpose: p?.purpose ?? null,
    group: p?.ethnic_group ?? null,
    groupConsent: !!p?.group_consent_at,
    homeState: p?.home_state ?? null,
    school: p?.school ?? null,
    genres,
    onboarded: !!p?.onboarded_at,
  };
}

export async function mePayload({ cfg, db, spotify }, user) {
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role, verifiedLabel: user.verifiedLabel ?? null, createdAt: user.createdAt },
    profile: await loadProfile(db, user.id),
    config: {
      appName: cfg.appName,
      mapsKey: cfg.maps.key || null,
      mapId: cfg.maps.mapId,
      spotifySearch: spotify.configured,
      ask: !!cfg.anthropic.key,
    },
  };
}

// Checks the onboarding answers. Nothing about someone's group is stored unless they tick the consent box.
export function validateProfile(b = {}) {
  const purpose = oneOf(b.purpose, PURPOSES.map((x) => x.id), { field: 'purpose', label: 'why you are here' });
  const homeState = oneOf(b.homeState, STATES, { field: 'homeState', label: 'a state' });
  const group = oneOf(b.group || null, GROUPS.map((x) => x.id), { field: 'group', label: 'a group', required: false });
  if (group && b.groupConsent !== true) throw bad('Please tick the box so we may keep this answer, or choose “Prefer not to say”.', 'groupConsent');
  let school = null;
  if (purpose === 'student' && b.school) school = oneOf(b.school, SCHOOLS, { field: 'school', label: 'a school' });
  if (!Array.isArray(b.genres)) throw bad('Pick the music you enjoy.', 'genres');
  const genres = [...new Set(b.genres)];
  const known = GENRES.map((g) => g.id);
  if (genres.length < 1) throw bad('Pick at least one kind of music.', 'genres');
  if (genres.length > MAX_GENRES) throw bad(`Pick up to ${MAX_GENRES} kinds of music.`, 'genres');
  if (genres.some((g) => !known.includes(g))) throw bad('One of the music choices is not valid.', 'genres');
  return { purpose, homeState, group, school, genres };
}

export async function saveProfile(db, userId, v) {
  const now = Date.now();
  await db.tx(async (t) => {
    const prev = await t.get('SELECT ethnic_group, group_consent_at, onboarded_at FROM profiles WHERE user_id = ?', [userId]);
    const consentAt = v.group ? (prev?.ethnic_group === v.group && prev.group_consent_at ? prev.group_consent_at : now) : null;
    await t.run(
      `INSERT INTO profiles (user_id, purpose, ethnic_group, group_consent_at, home_state, school, onboarded_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET purpose = excluded.purpose, ethnic_group = excluded.ethnic_group,
         group_consent_at = excluded.group_consent_at, home_state = excluded.home_state, school = excluded.school,
         onboarded_at = excluded.onboarded_at, updated_at = excluded.updated_at`,
      [userId, v.purpose, v.group, consentAt, v.homeState, v.school, prev?.onboarded_at ?? now, now]);
    await t.run('DELETE FROM profile_genres WHERE user_id = ?', [userId]);
    for (const g of v.genres) await t.run('INSERT INTO profile_genres (user_id, genre) VALUES (?, ?)', [userId, g]);
  });
}

export { text };
