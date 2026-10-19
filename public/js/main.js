import { html, put, $, $$, icon, toast, lsGet, lsSet } from './util.js';
import { get, setAuthLostHandler } from './api.js';
import { showGate, showOnboarding } from './auth.js';
import { postsView, homeView, mapView, askView } from './views.js';
import { meView, adminView } from './me.js';
import { startMusic, stopMusic, musicOpen } from './music.js';

const root = $('#root');
let me = null, cfg = { appName: 'Ndi Igbo', signupsOpen: true }, es = null, cur = null, online = null, esTimer = 0;

const NAV = [['home', 'home', 'Home', 'ochre', '#1B1620'], ['events', 'cal', 'Events', 'camwood', '#fff'], ['rooms', 'users', 'Rooms', 'indigo', '#fff'], ['market', 'bag', 'Market', 'orange', '#1B1620'], ['news', 'news', 'Notices', 'green', '#fff'], ['map', 'map', 'Map', 'teal', '#fff'], ['ask', 'chat', 'Ask', 'moon', '#F4EFE6']];
const KIND = { events: 'event', rooms: 'roommate', market: 'business', news: 'newsletter' };

function connect() {
  disconnect();
  es = new EventSource('/api/stream');
  es.addEventListener('online', (e) => { online = JSON.parse(e.data).count; const o = $('#online'); if (o) o.textContent = online + ' online'; });
  es.addEventListener('change', (e) => { const k = JSON.parse(e.data).kinds || []; cur?.refresh?.(k); });
  es.onerror = () => { const d = $('#odot'); if (d) d.classList.add('off'); };
  es.onopen = () => { const d = $('#odot'); if (d) d.classList.remove('off'); };
}
function disconnect() { es?.close(); es = null; clearTimeout(esTimer); }

function shell() {
  const isAdmin = me.user.role === 'admin';
  const nav = [...NAV, ...(isAdmin ? [['admin', 'shield', 'Admin', 'teal', '#fff']] : [])];
  put(root, html`<div class="top"><div class="wrap bar"><button class="logo" id="lg" aria-label="Ndi Igbo home"><svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#E8A33D"/><circle cx="16" cy="16" r="10" fill="#E86A33"/><circle cx="16" cy="16" r="4.5" fill="#A8321F"/></svg>Ndi Igbo</button><span class="sp"></span>
    <span class="pill" title="People using Ndi Igbo right now"><span class="dot off" id="odot"></span><span id="online">… online</span></span>
    <button class="ibtn" id="mb" aria-pressed="false" aria-label="Music player">${icon('music')}<span class="hide-s">Music</span></button>
    <button class="ibtn avatar" id="ab" aria-haspopup="true" aria-expanded="false" aria-label="Account menu">${me.user.name.trim()[0].toUpperCase()}</button></div><div class="weave"></div><div class="wrap" style="position:relative"><div class="menu" id="menu" hidden><div class="who">${me.user.name}<br>${me.user.email}</div><button data-go="me">Profile and privacy</button></div></div></div>
    <div class="wrap shell"><nav class="side" aria-label="Main">${nav.map(([id, ic, l, c, fg]) => html`<button class="sn" data-r="${id}" style="--navc:var(--${c});--navfg:${fg}">${icon(ic)}${l}</button>`)}</nav><main id="main" tabindex="-1"></main></div>
    <nav class="bottom" aria-label="Main">${nav.slice(0, 7).map(([id, ic, l, c]) => html`<button class="nb" data-r="${id}" style="--navc:var(--${c})">${icon(ic)}${l}</button>`)}${isAdmin ? html`<button class="nb" data-r="admin" style="--navc:var(--teal)">${icon('shield')}Admin</button>` : ''}</nav><div id="dock"></div>`);
  $$('[data-r]').forEach((b) => { b.onclick = () => { location.hash = '#/' + b.dataset.r; }; });
  $('#lg').onclick = () => { location.hash = '#/home'; };
  const menu = $('#menu'), ab = $('#ab');
  ab.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; ab.setAttribute('aria-expanded', String(!menu.hidden)); };
  document.addEventListener('click', () => { if (menu && !menu.hidden) { menu.hidden = true; ab.setAttribute('aria-expanded', 'false'); } });
  $('[data-go=me]', menu).onclick = () => { location.hash = '#/me'; };
  const mb = $('#mb'); mb.onclick = () => { if (musicOpen()) { stopMusic($('#dock')); mb.setAttribute('aria-pressed', 'false'); } else { startMusic($('#dock'), me); mb.setAttribute('aria-pressed', 'true'); } };
  if (online != null) $('#online').textContent = online + ' online';
}

function route() {
  if (!me || !me.profile.onboarded || !$('#main')) return;
  let r = (location.hash.replace(/^#\/?/, '') || 'home');
  if (r === 'admin' && me.user.role !== 'admin') r = 'home';
  const main = $('#main');
  cur?.stop?.(); cur = null;
  $$('[data-r]').forEach((b) => { if (b.dataset.r === r) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const V = { home: () => homeView(main, me), map: () => mapView(main, me), ask: () => askView(main, me), me: () => meView(main, me, { onChange: (m) => { me = m; route(); }, onLogout: loggedOut }), admin: () => adminView(main) };
  cur = (V[r] ? V[r]() : KIND[r] ? postsView(main, r) : (location.hash = '#/home')) || {};
  main.focus({ preventScroll: true }); scrollTo(0, 0);
  const t = { home: 'Home', events: 'Events', rooms: 'Rooms', market: 'Market', news: 'Notices', map: 'Map', ask: 'Ask', me: 'Profile', admin: 'Admin' }[r];
  document.title = (t ? t + ' · ' : '') + 'Ndi Igbo';
}

function ready(m) {
  me = m;
  if (!me.profile.onboarded) { disconnect(); return showOnboarding(root, me, (m2) => { toast('You are all set. Welcome!'); ready(m2); startAfter(); }); }
  shell(); connect(); route();
}
function startAfter() { if (!musicOpen() && lsGet('ndi.music', '1') === '1') { /* player opens on tap of the Music button; never auto-play */ } }

function loggedOut() {
  disconnect(); cur?.stop?.(); cur = null; stopMusic(); me = null; document.body.classList.remove('has-dock'); location.hash = '';
  showGate(root, cfg, ready);
}

addEventListener('hashchange', route);
setAuthLostHandler(() => { if (me) { toast('You were signed out. Please sign in again.'); loggedOut(); } });

(async function boot() {
  put(root, html`<div class="empty" style="margin:40vh auto 0;max-width:320px;border:0">Loading Ndi Igbo…</div>`);
  try { cfg = { ...cfg, ...(await get('/auth/config')) }; } catch { /* offline: gate still shows */ }
  try { ready(await get('/me')); }
  catch (e) {
    if (e.status === 401 || e.status === 403) showGate(root, cfg, ready);
    else put(root, html`<div class="empty" style="margin:30vh auto 0;max-width:360px"><b>Cannot reach Ndi Igbo</b>${e.message}<p><button class="btn" id="rt" style="margin-top:12px">Try again</button></p></div>`), $('#rt').onclick = () => location.reload();
  }
})();
