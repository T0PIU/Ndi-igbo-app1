export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const pad = (n) => String(n).padStart(2, '0');

// Safe-by-default HTML. Every ${value} is escaped unless it came from html`` or raw().
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(val).join('') : v == null || v === false ? '' : esc(v));
export const html = (st, ...v) => new Safe(st.reduce((o, s, i) => o + s + (i < v.length ? val(v[i]) : ''), ''));
export const put = (el, h) => { el.innerHTML = h instanceof Safe ? h.s : String(h); };

const P = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10', map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 1 0 0-5M17 14c2.8 0 5 2.2 5 5',
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2', news: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5',
  chat: 'M4 5h16v11H9l-5 4z', music: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3M19 16a3 3 0 1 1-3-3', play: 'M7 5l12 7-12 7z', pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5L16 9.5', pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  plus: 'M12 5v14M5 12h14', flag: 'M5 21V4M5 4h11l-2 4 2 4H5', close: 'M6 6l12 12M18 6L6 18', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6',
};
export const icon = (n) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n]}"/></svg>`);

export function toast(m) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = m;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

export const safeUrl = (u) => { try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
export const mapsQ = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
export const mapsDir = (q) => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q);
export const waLink = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length < 10 || d.length > 13) return ''; if (d[0] === '0') d = '234' + d.slice(1); return 'https://wa.me/' + d; };
export const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
export function rel(ts) { const s = Math.max(1, (Date.now() - ts) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago'; }

// Owerri clock (Lagos time)
const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function lagos() { const p = {}; FMT.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; }); return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second }; }
export const todayStr = () => { const t = lagos(); return `${t.y}-${pad(t.mo)}-${pad(t.d)}`; };
const dMs = (s) => Date.parse(s + 'T00:00:00Z');
export const addDays = (s, n) => new Date(dMs(s) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((dMs(b) - dMs(a)) / 864e5);
export function occ(d) { if (!d.weekly) return d.date; const t = todayStr(); if (d.date >= t) return d.date; return addDays(d.date, Math.ceil(daysBetween(d.date, t) / 7) * 7); }
export const dayParts = (s) => { const d = new Date(dMs(s)); return { n: d.getUTCDate(), wd: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), mo: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) }; };
export const liveHour = () => { const t = lagos(); return t.h + t.mi / 60 + t.s / 3600; };
export const night = (h) => (h < 5 || h > 20 ? 1 : h < 7 ? (7 - h) / 2 : h > 18 ? (h - 18) / 2 : 0);

export const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
