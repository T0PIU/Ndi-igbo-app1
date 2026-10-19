import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db/index.js';
import { createApp } from '../server/app.js';

let server, base, db, stop, spotifyMock, spotifyBase;
const mockCalls = { token: 0, search: 0 };

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body, headers = {}) {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie: this.cookie, ...headers }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.getSetCookie?.() ?? [];
    for (const c of sc) { const [kv] = c.split(';'); this.cookie = kv.endsWith('=') ? '' : kv; }
    let json = null; try { json = await r.json(); } catch { /* none */ }
    return { status: r.status, json, headers: r.headers, setCookie: sc };
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b ?? {}); }
}

before(async () => {
  spotifyMock = http.createServer((req, res) => {
    if (req.url === '/api/token') { mockCalls.token++; res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ access_token: 't', expires_in: 3600 })); }
    if (req.url.startsWith('/v1/search')) { mockCalls.search++; res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ playlists: { items: [null, { id: 'a'.repeat(22), name: 'Afro Hits', owner: { display_name: 'Someone' }, images: [{ url: 'https://i.scdn.co/x.jpg' }] }] } })); }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => spotifyMock.listen(0, r));
  spotifyBase = `http://127.0.0.1:${spotifyMock.address().port}`;
  const cfg = loadConfig({ quiet: true, signupLimitPerHour: 1000, databaseUrl: process.env.TEST_DATABASE_URL || '', sqlitePath: ':memory:', spotify: { clientId: 'id', clientSecret: 'secret', apiBase: spotifyBase + '/v1', accountsBase: spotifyBase } });
  db = await openDb(cfg);
  if (process.env.TEST_DATABASE_URL) for (const t of ['reports', 'reactions', 'posts', 'profile_genres', 'profiles', 'sessions', 'music_playlists', 'kv_cache', 'users']) await db.run(`DELETE FROM ${t}`);
  const a = await createApp(cfg, db);
  stop = a.stop;
  server = a.app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { stop(); server.close(); spotifyMock.close(); await db.close(); });

const PW = 'Correct-Horse-9';
async function signup(name, email, extra = {}) {
  const c = new Client();
  const r = await c.post('/api/auth/signup', { name, email, password: PW, acceptTerms: true, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return c;
}
const onboard = (c, o = {}) => c.req('PATCH', '/api/me/profile', { purpose: 'visitor', homeState: 'Lagos', group: 'yoruba', groupConsent: true, genres: ['afrobeats', 'highlife'], ...o });

test('everything needs sign-in', async () => {
  const c = new Client();
  for (const p of ['/api/me', '/api/posts?kind=event', '/api/music/for-me', '/api/admin/insights', '/api/stream']) assert.equal((await c.get(p)).status, 401, p);
  assert.equal((await c.get('/api/auth/config')).status, 200);
});

test('sign up: validation, cookie flags, duplicates', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/auth/signup', { name: 'A', email: 'x', password: 'short' })).status, 400);
  assert.equal((await c.post('/api/auth/signup', { name: 'Ada Obi', email: 'ada@example.com', password: 'password', acceptTerms: true })).json.error.field, 'password');
  assert.equal((await c.post('/api/auth/signup', { name: 'Ada Obi', email: 'ada@example.com', password: PW })).json.error.field, 'acceptTerms');
  const ok = await c.post('/api/auth/signup', { name: 'Ada Obi', email: 'Ada@Example.com', password: PW, acceptTerms: true });
  assert.equal(ok.status, 201);
  assert.match(ok.setCookie[0], /HttpOnly/); assert.match(ok.setCookie[0], /SameSite=Lax/);
  assert.equal(ok.json.profile.onboarded, false);
  assert.equal((await c.get('/api/me')).json.user.email, 'ada@example.com');
  assert.equal((await new Client().post('/api/auth/signup', { name: 'Ada Two', email: 'ada@example.com', password: PW, acceptTerms: true })).status, 409);
  assert.equal(JSON.stringify(ok.json).includes('pass'), false);
});

test('login, wrong password, logout, rate limit', async () => {
  await signup('Bayo Ade', 'bayo@example.com');
  const c = new Client();
  assert.equal((await c.post('/api/auth/login', { email: 'bayo@example.com', password: 'wrong-pass-1' })).json.error.message, 'Email or password is incorrect.');
  assert.equal((await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-pass-1' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'bayo@example.com', password: PW })).status, 200);
  assert.equal((await c.get('/api/me')).status, 200);
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/me')).status, 401);
  const d = new Client(); let last;
  for (let i = 0; i < 10; i++) last = await d.post('/api/auth/login', { email: 'lock@example.com', password: 'wrong-pass-1' });
  assert.equal(last.status, 429); assert.ok(last.headers.get('retry-after'));
});

test('cross-site writes are refused', async () => {
  const c = await signup('Cee Cee', 'cee@example.com');
  const r = await c.req('POST', '/api/auth/logout', {}, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('onboarding: group needs consent, genres validated, insights are aggregate', async () => {
  const c = await signup('Dee Visitor', 'dee@example.com');
  assert.equal((await onboard(c, { groupConsent: false })).json.error.field, 'groupConsent');
  assert.equal((await onboard(c, { genres: [] })).json.error.field, 'genres');
  assert.equal((await onboard(c, { genres: ['nope'] })).status, 400);
  assert.equal((await onboard(c, { homeState: 'Atlantis' })).status, 400);
  const ok = await onboard(c);
  assert.equal(ok.status, 200); assert.equal(ok.json.profile.onboarded, true); assert.equal(ok.json.profile.group, 'yoruba');
  const priv = await onboard(c, { group: null, groupConsent: false, purpose: 'student', school: 'FUTO' });
  assert.equal(priv.json.profile.group, null); assert.equal(priv.json.profile.groupConsent, false);
  await onboard(c);
  assert.equal((await c.get('/api/admin/insights')).status, 403);
  await db.run("UPDATE users SET role = 'admin' WHERE email = 'dee@example.com'");
  const ins = (await c.get('/api/admin/insights')).json;
  assert.ok(ins.byGroup.find((x) => x.k === 'yoruba').n >= 1);
  assert.ok(ins.visitorsByState.find((x) => x.k === 'Lagos'));
  assert.ok(ins.genres.find((x) => x.k === 'afrobeats'));
  assert.equal(JSON.stringify(ins).includes('dee@example.com'), false);
});

test('posts: validation, privacy of roommate contact, reactions, delete rules', async () => {
  const a = await signup('Eze Poster', 'eze@example.com'), b = await signup('Femi Viewer', 'femi@example.com');
  assert.equal((await a.post('/api/posts', { kind: 'event', title: 'x' })).status, 400);
  const ev = await a.post('/api/posts', { kind: 'event', title: 'Sunday Service', type: 'church', org: 'Grace Chapel', date: new Date(Date.now() + 864e5).toISOString().slice(0, 10), time: '08:00', weekly: true, contact: '08031234567', evil: 'x' });
  assert.equal(ev.status, 201); assert.equal(ev.json.post.data.evil, undefined);
  const rm = await a.post('/api/posts', { kind: 'roommate', nick: 'Eze', school: 'IMSU', level: '200L', gender: 'Male', wants: 'Any roommate', budget: 120000, habits: ['Quiet'], contact: '08099999999' });
  assert.equal(rm.status, 201);
  const list = (await b.get('/api/posts?kind=roommate')).json.posts;
  assert.equal(JSON.stringify(list).includes('08099999999'), false);
  assert.equal(list[0].author.name, null);
  assert.equal((await b.post(`/api/posts/${rm.json.post.id}/contact`)).json.contact, '08099999999');
  assert.equal((await b.post(`/api/posts/${ev.json.post.id}/react`)).json.count, 1);
  assert.equal((await b.post(`/api/posts/${ev.json.post.id}/react`)).json.reacted, false);
  assert.equal((await b.req('DELETE', `/api/posts/${ev.json.post.id}`)).status, 403);
  assert.equal((await a.req('DELETE', `/api/posts/${ev.json.post.id}`)).status, 200);
  await a.post('/api/posts', { kind: 'roommate', nick: 'Eze2', school: 'IMSU', level: '200L', gender: 'Male', wants: 'Any roommate', budget: 1 });
  assert.equal((await a.post('/api/posts', { kind: 'roommate', nick: 'Eze3', school: 'IMSU', level: '200L', gender: 'Male', wants: 'Any roommate', budget: 1 })).status, 409);
});

test('newsletters wait for review unless the sender is verified; reports hide posts', async () => {
  const u = await signup('Gina Office', 'gina@example.com'), adm = await signup('Admin Ade', 'admin@example.com');
  await db.run("UPDATE users SET role = 'admin' WHERE email = 'admin@example.com'");
  const nl = { kind: 'newsletter', title: 'Resumption notice', org: 'Registry', orgType: 'School office', body: 'Lectures resume on Monday. See the registry.', link: 'javascript:alert(1)' };
  assert.equal((await u.post('/api/posts', nl)).status, 400);
  const made = await u.post('/api/posts', { ...nl, link: 'https://school.example/notice.pdf' });
  assert.equal(made.json.post.status, 'pending');
  assert.equal((await adm.get('/api/posts?kind=newsletter')).json.posts.some((p) => p.id === made.json.post.id), false);
  const review = (await adm.get('/api/admin/review')).json;
  assert.ok(review.pending.some((p) => p.id === made.json.post.id));
  await adm.post(`/api/admin/posts/${made.json.post.id}/status`, { status: 'published' });
  assert.equal((await adm.get('/api/posts?kind=newsletter')).json.posts.some((p) => p.id === made.json.post.id), true);
  const me = (await adm.get('/api/admin/users?q=gina')).json.users[0];
  await adm.post(`/api/admin/users/${me.id}/verify`, { label: 'School office' });
  assert.equal((await u.post('/api/posts', { ...nl, link: '', title: 'Second notice here' })).json.post.status, 'published');
  const biz = (await u.post('/api/posts', { kind: 'business', name: 'Mama Put', cat: 'Food', offer: 'Rice and stew daily near campus', area: 'Ihiagwa', contact: '08011111111' })).json.post;
  for (const e of ['r1@example.com', 'r2@example.com', 'r3@example.com']) await (await signup('Rep ' + e[1], e)).post(`/api/posts/${biz.id}/report`, { reason: 'Scam or fake' });
  assert.equal((await adm.get('/api/posts?kind=business')).json.posts.some((p) => p.id === biz.id), false);
  const mineList = (await u.get('/api/posts?kind=business')).json.posts;
  assert.equal(mineList.find((p) => p.id === biz.id)?.status, 'hidden', JSON.stringify(mineList.map((p) => [p.id === biz.id, p.status])));
});

test('music: admin curates a playlist, bad links refused, search is cached and soft-fails', async () => {
  const u = await signup('Hal Music', 'hal@example.com');
  await onboard(u, { genres: ['afrobeats', 'highlife'] });
  assert.equal((await u.req('PUT', '/api/admin/music/afrobeats', { url: 'x' })).status, 403);
  await db.run("UPDATE users SET role = 'admin' WHERE email = 'hal@example.com'");
  assert.equal((await u.req('PUT', '/api/admin/music/afrobeats', { url: 'https://evil.example/playlist/' + 'a'.repeat(22) })).status, 400);
  const good = await u.req('PUT', '/api/admin/music/afrobeats', { url: 'https://open.spotify.com/playlist/37i9dQZF1DWYkaDif7Ztbp?si=abc', title: 'Naija Hits' });
  assert.equal(good.json.uri, 'spotify:playlist:37i9dQZF1DWYkaDif7Ztbp');
  const mine = (await u.get('/api/music/for-me')).json.genres;
  assert.equal(mine.find((g) => g.id === 'afrobeats').source, 'curated');
  const hl = mine.find((g) => g.id === 'highlife');
  assert.equal(hl.source, 'spotify-search'); assert.equal(hl.uri, 'spotify:playlist:' + 'a'.repeat(22));
  await u.get('/api/music/for-me'); await u.get('/api/music/for-me');
  assert.equal(mockCalls.search, 1);
});

test('ask is off without a key; live stream announces changes', async () => {
  const u = await signup('Ife Live', 'ife@example.com');
  assert.equal((await u.post('/api/ask', { messages: [{ role: 'user', content: 'hi' }] })).json.error.code, 'ask_disabled');
  const ctl = new AbortController();
  const res = await fetch(base + '/api/stream', { headers: { cookie: u.cookie }, signal: ctl.signal });
  assert.match(res.headers.get('content-type'), /event-stream/);
  const reader = res.body.getReader(); const dec = new TextDecoder(); let seen = '';
  await u.post('/api/posts', { kind: 'business', name: 'Live Shop', cat: 'Food', offer: 'Fresh bread every morning', area: 'Owerri', contact: '08022222222' });
  const t = Date.now();
  while (!seen.includes('event: change') && Date.now() - t < 3000) { const { value } = await reader.read(); seen += dec.decode(value); }
  ctl.abort();
  assert.match(seen, /event: online/); assert.match(seen, /event: change/);
});

test('delete account removes the person and their posts', async () => {
  const u = await signup('Zed Leaver', 'zed@example.com');
  await u.post('/api/posts', { kind: 'business', name: 'Zed Shop', cat: 'Other', offer: 'Phone repair and screens', area: 'Owerri', contact: '08033333333' });
  assert.equal((await u.req('DELETE', '/api/me', { password: 'nope-nope-1' })).status, 401);
  assert.equal((await u.req('GET', '/api/me/export')).json.posts.length, 1);
  assert.equal((await u.req('DELETE', '/api/me', { password: PW })).status, 200);
  assert.equal((await u.get('/api/me')).status, 401);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM posts WHERE title = 'Zed Shop'")).n, 0);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM users WHERE email = 'zed@example.com'")).n, 0);
});

test('trust: verification requests, RSVP, edit, status, suspension, audit log', async () => {
  const u = await signup('Chi Church', 'chi@example.com'), adm = await signup('Admin Two', 'admin2@example.com'), other = await signup('Other Person', 'other@example.com');
  await db.run("UPDATE users SET role = 'admin' WHERE email = 'admin2@example.com'");
  // cannot self-verify
  assert.equal((await u.post('/api/admin/users/x/verify', { label: 'Me' })).status, 403);
  assert.equal((await u.post('/api/me/verification', { orgName: 'Grace Chapel', orgType: 'Church', details: 'Pastor in charge, Owerri branch.' })).status, 201);
  assert.equal((await u.post('/api/me/verification', { orgName: 'Grace Chapel', orgType: 'Church', details: 'Second request again.' })).status, 409);
  assert.equal((await u.get('/api/admin/verifications')).status, 403);
  const reqs = (await adm.get('/api/admin/verifications')).json.requests;
  assert.equal(reqs.length >= 1, true);
  const mine = reqs.find((x) => x.orgName === 'Grace Chapel');
  assert.equal((await adm.post(`/api/admin/verifications/${mine.id}/decide`, { approve: true, label: 'Grace Chapel' })).status, 200);
  assert.equal((await u.get('/api/me')).json.user.verifiedLabel, 'Grace Chapel');
  // events: end time, status, RSVP, edit
  const d = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  const ev = { kind: 'event', title: 'Revival night', type: 'church', org: 'Grace Chapel', date: d, time: '18:00', endTime: '17:00', area: 'Owerri' };
  assert.equal((await u.post('/api/posts', ev)).status, 400);
  const made = (await u.post('/api/posts', { ...ev, endTime: '20:00' })).json.post;
  assert.equal(made.data.endTime, '20:00');
  assert.equal((await other.post(`/api/posts/${made.id}/rsvp`)).json.going, true);
  const listed = (await other.get('/api/posts?kind=event')).json.posts.find((p) => p.id === made.id);
  assert.deepEqual(listed.rsvp, { count: 1, mine: true });
  assert.equal((await other.req('PATCH', `/api/posts/${made.id}`, { ...ev, endTime: '20:00' })).status, 403);
  const ed = await u.req('PATCH', `/api/posts/${made.id}`, { ...ev, endTime: '20:00', status: 'cancelled' });
  assert.equal(ed.json.post.data.evStatus, 'cancelled');
  assert.equal((await other.post(`/api/posts/${made.id}/rsvp`)).json.going, false);
  // suspension
  const o = (await adm.get('/api/admin/users?q=other@')).json.users[0];
  assert.equal((await adm.post(`/api/admin/users/${o.id}/suspend`, { suspended: true })).status, 200);
  assert.equal((await other.get('/api/me')).status, 401);
  const lg = await new Client().post('/api/auth/login', { email: 'other@example.com', password: PW });
  assert.equal(lg.status, 403);
  await adm.post(`/api/admin/users/${o.id}/suspend`, { suspended: false });
  assert.equal((await new Client().post('/api/auth/login', { email: 'other@example.com', password: PW })).status, 200);
  const log = (await adm.get('/api/admin/audit')).json.entries.map((x) => x.action);
  for (const a of ['verification.approve', 'user.suspend', 'user.unsuspend']) assert.ok(log.includes(a), a);
  assert.equal((await u.get('/api/admin/audit')).status, 403);
});

test('PDF notices, reviews and blocking', async () => {
  const pub = await signup('Pub Lisher', 'pub@example.com'), fan = await signup('Fan Reader', 'fan@example.com');
  await db.run("UPDATE users SET verified_label = 'Registry' WHERE email = 'pub@example.com'");
  const pdf = Buffer.from('%PDF-1.4\n' + '1 0 obj<<>>endobj\n'.repeat(10) + '%%EOF');
  const up = (c, body, ct = 'application/pdf') => fetch(base + '/api/files', { method: 'POST', headers: { 'content-type': ct, cookie: c.cookie, 'x-filename': 'Notice 1.pdf' }, body });
  assert.equal((await up(pub, Buffer.from('<html>' + 'x'.repeat(200)), 'text/html')).status, 400);
  assert.equal((await up(pub, Buffer.concat([pdf, Buffer.from('/JavaScript')]))).status, 400);
  const f = await (await up(pub, pdf)).json();
  assert.ok(f.id);
  const nl = (await pub.post('/api/posts', { kind: 'newsletter', title: 'Admissions open', org: 'Registry', orgType: 'School office', body: 'Admission forms are out now.', fileId: f.id })).json.post;
  assert.equal(nl.data.fileName, 'Notice 1.pdf');
  const dl = await fetch(base + '/api/files/' + f.id, { headers: { cookie: fan.cookie } });
  assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'application/pdf');
  assert.equal((await fan.post('/api/posts', { kind: 'newsletter', title: 'Stolen file', org: 'X', orgType: 'Business', body: 'Trying to reuse a file.', fileId: f.id })).status, 400);
  // reviews
  const biz = (await pub.post('/api/posts', { kind: 'business', name: 'Pub Printing', cat: 'Printing', offer: 'Printing and binding all week.', area: 'Egbu', contact: '08022222222' })).json.post;
  assert.equal((await pub.post(`/api/posts/${biz.id}/review`, { rating: 5 })).status, 400);
  assert.equal((await fan.post(`/api/posts/${biz.id}/review`, { rating: 6 })).status, 400);
  assert.equal((await fan.post(`/api/posts/${biz.id}/review`, { rating: 4, body: 'Fast service' })).status, 200);
  await fan.post(`/api/posts/${biz.id}/review`, { rating: 5 });
  const got = (await fan.get('/api/posts?kind=business')).json.posts.find((p) => p.id === biz.id);
  assert.deepEqual(got.rating, { count: 1, avg: 5, mine: 5 });
  // blocking hides roommate posts both ways
  const rm = { kind: 'roommate', nick: 'Pub Student', school: 'IMSU', level: '200L', gender: 'Female', wants: 'Any roommate', budget: 100000, area: 'Egbu', habits: [], about: '', contact: '08033333333' };
  const mp = (await pub.post('/api/posts', rm)).json.post;
  assert.equal((await fan.get('/api/posts?kind=roommate')).json.posts.some((p) => p.id === mp.id), true);
  assert.equal((await fan.post(`/api/posts/${mp.id}/block`)).status, 200);
  assert.equal((await fan.get('/api/posts?kind=roommate')).json.posts.some((p) => p.id === mp.id), false);
  assert.equal((await fan.post(`/api/posts/${mp.id}/contact`)).status, 404);
  const bl = (await fan.get('/api/me/blocks')).json.blocks; assert.equal(bl.length, 1);
  await fan.req('DELETE', '/api/me/blocks/' + bl[0].id);
  assert.equal((await fan.get('/api/posts?kind=roommate')).json.posts.some((p) => p.id === mp.id), true);
});
