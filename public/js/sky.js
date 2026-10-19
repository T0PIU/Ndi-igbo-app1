import { $, lagos, liveHour, night, pad } from './util.js';

// A simulated Imo sky from the real Owerri clock. Not a weather forecast.
export function startSky(canvas, getHour) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, raf = 0, t0 = 0;
  const stars = Array.from({ length: 50 }, (_, i) => ({ x: (i * 97 % 100) / 100, y: (i * 53 % 60) / 100, r: 0.6 + (i % 3) * 0.5 }));
  const size = () => { const r = canvas.getBoundingClientRect(); const d = Math.min(devicePixelRatio || 1, 2); w = r.width; h = r.height; canvas.width = w * d; canvas.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const day = [[250, 214, 140], [120, 190, 205]], dark = [[26, 20, 64], [14, 18, 44]];
  function draw(ts) {
    const hr = getHour(), n = night(hr), tt = (ts - t0) / 1000;
    const top = mix(day[1], dark[1], n), bot = mix(day[0], dark[0], n);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `rgb(${top})`); g.addColorStop(1, `rgb(${bot})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (n > 0.3) { ctx.fillStyle = `rgba(255,255,240,${(n - 0.3) * 1.2})`; stars.forEach((s) => { ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r * (1 + 0.2 * Math.sin(tt * 2 + s.x * 20)), 0, 7); ctx.fill(); }); }
    const arc = (hh, a, b) => { const p = (hh - a) / (b - a); return p < 0 || p > 1 ? null : { x: w * (0.08 + 0.84 * p), y: h * 0.72 - Math.sin(p * Math.PI) * h * 0.55 }; };
    const sp = arc(hr, 6, 18.5);
    if (sp) { ctx.fillStyle = 'rgba(233,185,73,.35)'; ctx.beginPath(); ctx.arc(sp.x, sp.y, 34, 0, 7); ctx.fill(); ctx.fillStyle = '#E9B949'; ctx.beginPath(); ctx.arc(sp.x, sp.y, 20, 0, 7); ctx.fill(); }
    const mh = hr < 6 ? hr + 24 : hr, mp = arc(mh, 18, 30);
    if (mp) { ctx.fillStyle = '#F4EFE6'; ctx.beginPath(); ctx.arc(mp.x, mp.y, 15, 0, 7); ctx.fill(); ctx.fillStyle = `rgb(${top})`; ctx.beginPath(); ctx.arc(mp.x + 7, mp.y - 4, 13, 0, 7); ctx.fill(); }
    ctx.fillStyle = `rgba(255,255,255,${0.75 - n * 0.55})`;
    [0, 1, 2].forEach((i) => { const x = ((tt * (6 + i * 3) + i * w / 3) % (w + 120)) - 60, y = h * (0.2 + i * 0.12); [[0, 0, 22], [20, 4, 18], [-20, 5, 16], [38, 8, 12]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 7); ctx.fill(); }); });
    ctx.fillStyle = `rgb(${mix([30, 91, 58], [12, 36, 30], n)})`; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.78 - Math.sin(x / w * 5) * 12 - Math.sin(x / w * 13) * 5); ctx.lineTo(w, h); ctx.fill();
    ctx.fillStyle = `rgb(${mix([14, 94, 99], [8, 40, 50], n)})`; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.9 - Math.sin(x / w * 3 + 1) * 8); ctx.lineTo(w, h); ctx.fill();
  }
  const loop = (ts) => { if (!t0) t0 = ts; draw(ts); raf = reduce ? 0 : requestAnimationFrame(loop); };
  size(); const ro = new ResizeObserver(() => { size(); if (reduce) draw(performance.now()); }); ro.observe(canvas);
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

// Simple, honest model: warm afternoons, cooler dawns.
export const simTemp = (h) => Math.round(24 + 6 * Math.sin(((h - 9) / 24) * 2 * Math.PI));
export const simHumidity = (h) => Math.round(75 - 25 * Math.sin(((h - 9) / 24) * 2 * Math.PI));
export const skyLabel = (h) => (h < 5 ? 'Deep night' : h < 7 ? 'Dawn' : h < 12 ? 'Morning' : h < 16 ? 'Afternoon' : h < 19 ? 'Evening' : 'Night');
export const clockText = (h) => { const t = Math.floor(h), m = Math.floor((h - t) * 60); return `${pad(t)}:${pad(m)}`; };
export { lagos, liveHour, $ };
