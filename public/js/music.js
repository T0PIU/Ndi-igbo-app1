import { html, put, $, $$, icon, toast } from './util.js';
import { get } from './api.js';
import { lsGet, lsSet } from './util.js';
let master = null, vol = Math.min(1, Math.max(0, parseFloat(lsGet('ndi.vol', '0.7')) || 0.7));

// Plays the person's music in Spotify's own embedded player (it must stay visible).
// If Spotify cannot load, or nothing is set up for a genre, a built-in kalimba tune is the fallback.
let ctrl = null, apiP = null, genres = [], cur = '', loadedUri = '', ac = null, tune = null, builtin = false, els = null, failTimer = 0;

function loadApi() {
  if (apiP) return apiP;
  apiP = new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout')), 9000);
    window.onSpotifyIframeApiReady = (A) => { clearTimeout(to); res(A); };
    const s = document.createElement('script'); s.src = 'https://open.spotify.com/embed/iframe-api/v1'; s.async = true;
    s.onerror = () => { clearTimeout(to); rej(new Error('blocked')); };
    document.head.appendChild(s);
  });
  apiP.catch(() => { apiP = null; });
  return apiP;
}

// ---- built-in tune: gentle kalimba on a pentatonic scale ----
function startTune() {
  if (tune) return;
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  if (!master) { master = ac.createGain(); master.connect(ac.destination); }
  master.gain.value = vol;
  ac.resume?.();
  const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
  const pat = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 2, 0];
  let i = 0;
  const note = () => {
    const f = scale[pat[i++ % pat.length]], t = ac.currentTime;
    [[f, 0.16], [f * 2, 0.05]].forEach(([fr, v]) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = fr;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(master); o.start(t); o.stop(t + 1.5);
    });
  };
  note(); tune = setInterval(note, 560);
}
const stopTune = () => { clearInterval(tune); tune = null; };

function setBuiltin(on, why) {
  builtin = on;
  if (on) { try { ctrl?.pause(); } catch { /* not ready */ } startTune(); } else stopTune();
  if (why && els) $('#mu-msg').textContent = why;
  paint();
}

function paint() {
  if (!els) return;
  $$('#mu-chips [data-g]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === cur && !builtin)));
  $('#mu-bi').setAttribute('aria-pressed', String(builtin));
  $('#mu-eq').classList.toggle('on', builtin);
}

async function pick(id) {
  const g = genres.find((x) => x.id === id); if (!g) return;
  cur = id; lsSet('ndi.genre', id); stopTune(); builtin = false; paint();
  const frame = $('#mu-wrap'), msg = $('#mu-msg');
  if (!g.uri) { frame.hidden = true; msg.textContent = `No ${g.label} playlist is set up yet. Try another genre, or play the built-in tune.`; return; }
  frame.hidden = false; msg.textContent = g.title ? `${g.label}: ${g.title}` : g.label;
  try {
    const A = await loadApi();
    if (!ctrl) {
      clearTimeout(failTimer);
      failTimer = setTimeout(() => { if (!ctrl) { frame.hidden = true; setBuiltin(true, 'Spotify did not load, so the built-in tune is ready.'); } }, 10000);
      frame.innerHTML = '<div id="mu-ph"></div>'; A.createController($('#mu-ph'), { uri: g.uri, width: '100%', height: 80 }, (c) => { ctrl = c; clearTimeout(failTimer); loadedUri = g.uri; });
    } else if (loadedUri !== g.uri) { ctrl.loadUri(g.uri); loadedUri = g.uri; }
  } catch {
    frame.hidden = true; setBuiltin(true, 'Spotify could not load here (maybe blocked or offline). The built-in tune is ready.');
  }
}

export async function startMusic(host, me) {
  document.body.classList.add('has-dock');
  try { genres = (await get('/music/for-me')).genres; } catch { genres = []; }
  put(host, html`<div class="dock" role="region" aria-label="Music player">
    <div class="hd"><span class="eq" id="mu-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><b>Your music</b>
      <button class="ibtn" id="mu-bi" aria-pressed="false" aria-label="Play or stop the built-in tune">${icon('music')}<span class="hide-s">Built-in</span></button>
      <label class="sr" for="mu-vol">Volume for the built-in tune</label><input id="mu-vol" type="range" min="0" max="1" step="0.05" value="${vol}" style="width:90px;min-height:32px" title="Volume (built-in tune only)"><button class="ibtn" id="mu-x" aria-label="Close the player">${icon('close')}</button></div>
    <div class="chips" id="mu-chips">${genres.map((g) => html`<button class="chip" data-g="${g.id}" aria-pressed="false" style="--sec:var(--camwood);--sec-fg:#fff">${g.label}</button>`)}</div>
    <p class="hint" id="mu-msg">${genres.length ? 'Tap a genre to start. Press play in the player. Use Spotify’s own volume for Spotify songs.' : 'Add music choices in Profile.'}</p>
    <div id="mu-wrap" hidden></div></div>`);
  els = host;
  $$('#mu-chips [data-g]').forEach((b) => { b.onclick = () => pick(b.dataset.g); });
  $('#mu-bi').onclick = () => (builtin ? setBuiltin(false) : setBuiltin(true, 'Playing the built-in kalimba tune.'));
  $('#mu-vol').oninput = (e) => { vol = +e.target.value; lsSet('ndi.vol', String(vol)); if (master) master.gain.value = vol; };
  $('#mu-x').onclick = () => stopMusic(host);
  const saved = lsGet('ndi.genre', ''), first = genres.find((g) => g.id === saved) || genres.find((g) => g.uri) || genres[0];
  if (first) pick(first.id);
  else toast('Pick music in Profile to start the player.');
}

export function stopMusic(host) {
  stopTune(); try { ctrl?.destroy?.(); } catch { /* ignore */ }
  ctrl = null; loadedUri = ''; builtin = false; els = null; clearTimeout(failTimer);
  if (host) put(host, ''); document.body.classList.remove('has-dock');
}
export const musicOpen = () => !!els;
