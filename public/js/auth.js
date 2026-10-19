import { html, put, $, $$, toast, raw } from './util.js';
import { post, patch } from './api.js';
import { PURPOSES, GROUPS, STATES, SCHOOLS, GENRES, MAX_GENRES } from './constants.js';

const sun = raw(`<svg class="sun" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92" fill="#E9B949"/><circle cx="100" cy="100" r="62" fill="#E86A33"/><circle cx="100" cy="100" r="32" fill="#A8321F"/></svg>`);

function story() {
  return html`<section class="story">${sun}<div class="brand">NDI IGBO</div><h1>Welcome.</h1><p class="proverb" style="margin-top:0">Nnọọ, in Igbo.</p>
    <p>Events, roommates, local businesses, notices, the map and good music, for Igbo people and everyone who wants to know Imo State.</p>
    <p class="proverb">Unity is strength. (Igwe bụ ike.)</p></section>`;
}

export function showGate(root, cfg, onDone) {
  let mode = 'in';
  const draw = (err = {}, vals = {}) => {
    put(root, html`<div class="gate">${story()}<div class="gform"><div class="gcard">
      <div class="tabs" role="tablist"><button role="tab" id="t-in" aria-selected="${mode === 'in'}">Sign in</button><button role="tab" id="t-up" aria-selected="${mode === 'up'}">Create account</button></div>
      ${mode === 'up' && !cfg.signupsOpen ? html`<p class="banner">Sign-ups are closed right now. If you already have an account, sign in.</p>` : ''}
      <form id="gf" novalidate class="stack" style="gap:12px">
        ${mode === 'up' ? html`<div class="fld"><label for="g-name">Your name</label><input id="g-name" name="name" autocomplete="name" maxlength="40" required value="${vals.name || ''}">${err.name ? html`<span class="err">${err.name}</span>` : ''}</div>` : ''}
        <div class="fld"><label for="g-email">Email</label><input id="g-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" required value="${vals.email || ''}">${err.email ? html`<span class="err">${err.email}</span>` : ''}</div>
        <div class="fld"><label for="g-pw">Password</label><div class="pwrow"><input id="g-pw" name="password" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" required minlength="8"><button type="button" id="pwt">Show</button></div>
          ${mode === 'up' ? html`<span class="hint">At least 8 characters. A short phrase works well.</span>` : ''}${err.password ? html`<span class="err">${err.password}</span>` : ''}</div>
        ${mode === 'up' ? html`<label class="checks" style="display:block"><span style="display:flex;gap:10px;align-items:flex-start;font-size:14px;font-weight:600;min-height:44px"><input type="checkbox" name="terms" style="width:22px;height:22px;min-height:22px;flex:none;margin-top:2px"><span>I accept the <a href="/terms.html" target="_blank" rel="noopener">Terms</a> and <a href="/privacy.html" target="_blank" rel="noopener">Privacy Notice</a>.</span></span></label>${err.acceptTerms ? html`<span class="err">${err.acceptTerms}</span>` : ''}` : ''}
        ${err.form ? html`<p class="err" role="alert">${err.form}</p>` : ''}
        <button class="btn" type="submit" id="gs">${mode === 'up' ? 'Create my account' : 'Sign in'}</button>
      </form>
      <p class="hint">Only people with an account can use Ndi Igbo. We never post for you.</p>
    </div></div></div><div class="weave"></div>`);
    $('#t-in').onclick = () => { mode = 'in'; draw(); };
    $('#t-up').onclick = () => { mode = 'up'; draw(); };
    $('#pwt').onclick = () => { const i = $('#g-pw'); const s = i.type === 'password'; i.type = s ? 'text' : 'password'; $('#pwt').textContent = s ? 'Hide' : 'Show'; };
    $('#gf').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target); const v = { name: f.get('name') || '', email: f.get('email') || '' };
      const btn = $('#gs'); btn.disabled = true; btn.textContent = 'One moment…';
      try {
        const me = await post(mode === 'up' ? '/auth/signup' : '/auth/login', mode === 'up'
          ? { name: v.name, email: v.email, password: f.get('password'), acceptTerms: f.get('terms') === 'on' }
          : { email: v.email, password: f.get('password') });
        onDone(me);
      } catch (x) { draw({ [x.field && ['name', 'email', 'password', 'acceptTerms'].includes(x.field) ? x.field : 'form']: x.message }, v); }
    };
    ($('#g-name') || $('#g-email')).focus({ preventScroll: true });
  };
  draw();
}

// Three short steps: why you are here, where you are from (and group, if you want), music.
export function showOnboarding(root, me, onDone) {
  const p = me.profile || {};
  const s = { purpose: p.purpose || '', homeState: p.homeState || '', group: p.group || '', groupConsent: !!p.groupConsent, school: p.school || '', genres: [...(p.genres || [])], noGroup: false };
  let step = 0, err = '';
  const draw = () => {
    const bar = html`<div class="steps" aria-hidden="true">${[0, 1, 2].map((i) => html`<i class="${i <= step ? 'on' : ''}"></i>`)}</div>`;
    let body;
    if (step === 0) {
      body = html`<h1>Hi ${me.user.name.split(' ')[0]}. Why are you here?</h1><p class="hint">This helps us show what is useful to you. Pick one.</p>
        ${PURPOSES.map((x) => html`<button class="opt" data-p="${x.id}" aria-pressed="${s.purpose === x.id}"><b>${x.label}</b><span>${x.hint}</span></button>`)}
        ${s.purpose === 'student' ? html`<div class="fld"><label for="ob-school">Your school (optional)</label><select id="ob-school"><option value="">Choose</option>${SCHOOLS.map((x) => html`<option ${s.school === x ? 'selected' : ''}>${x}</option>`)}</select></div>` : ''}`;
    } else if (step === 1) {
      body = html`<h1>Where are you from?</h1><p class="hint">Your state helps us see who is visiting and who is local.</p>
        <div class="fld"><label for="ob-state">State</label><select id="ob-state"><option value="">Choose a state</option>${STATES.map((x) => html`<option ${s.homeState === x ? 'selected' : ''}>${x}</option>`)}</select></div>
        <div class="fld"><span class="lb">Are you Igbo, Yoruba, Hausa or another group? (optional)</span>
          <div class="chips wrap-chips">${GROUPS.map((x) => html`<button class="chip" data-g="${x.id}" aria-pressed="${s.group === x.id}" style="--sec:var(--camwood);--sec-fg:#fff">${x.label}</button>`)}
          <button class="chip" data-g="" aria-pressed="${!s.group}" style="--sec:var(--camwood);--sec-fg:#fff">Prefer not to say</button></div></div>
        ${s.group ? html`<label class="note" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" id="ob-consent" ${s.groupConsent ? 'checked' : ''} style="width:22px;height:22px;min-height:22px;flex:none"><span>It is fine to keep this answer. It is used only as a total count, with no names, to understand who uses the app. I can change or remove it any time in Profile.</span></label>` : ''}`;
    } else {
      body = html`<h1>What music do you enjoy?</h1><p class="hint">Pick up to ${MAX_GENRES}. We will play it for you when you tap play.</p>
        <div class="chips wrap-chips">${GENRES.map((g) => html`<button class="chip" data-m="${g.id}" aria-pressed="${s.genres.includes(g.id)}" style="--sec:var(--camwood);--sec-fg:#fff">${g.label}</button>`)}</div>
        <p class="hint">${s.genres.length} of ${MAX_GENRES} chosen</p>`;
    }
    put(root, html`<div class="ob"><div class="inner">${bar}${body}${err ? html`<p class="err" role="alert">${err}</p>` : ''}
      <div class="nav">${step > 0 ? html`<button class="btn ghost" id="back">Back</button>` : html`<span></span>`}<button class="btn" id="next">${step === 2 ? 'Finish' : 'Next'}</button></div></div></div>`);
    $$('[data-p]').forEach((b) => { b.onclick = () => { s.purpose = b.dataset.p; err = ''; draw(); }; });
    $$('[data-g]').forEach((b) => { b.onclick = () => { s.group = b.dataset.g; if (!s.group) s.groupConsent = false; err = ''; draw(); }; });
    $$('[data-m]').forEach((b) => { b.onclick = () => { const i = s.genres.indexOf(b.dataset.m); if (i >= 0) s.genres.splice(i, 1); else if (s.genres.length < MAX_GENRES) s.genres.push(b.dataset.m); else toast(`You can pick up to ${MAX_GENRES}.`); err = ''; draw(); }; });
    const sc = $('#ob-school'); if (sc) sc.onchange = () => { s.school = sc.value; };
    const st = $('#ob-state'); if (st) st.onchange = () => { s.homeState = st.value; };
    const co = $('#ob-consent'); if (co) co.onchange = () => { s.groupConsent = co.checked; };
    const back = $('#back'); if (back) back.onclick = () => { step--; err = ''; draw(); };
    $('#next').onclick = async () => {
      err = '';
      if (step === 0 && !s.purpose) { err = 'Please choose one.'; return draw(); }
      if (step === 1) { if (!s.homeState) { err = 'Please choose a state.'; return draw(); } if (s.group && !s.groupConsent) { err = 'Tick the box to keep your answer, or choose “Prefer not to say”.'; return draw(); } }
      if (step < 2) { step++; return draw(); }
      if (!s.genres.length) { err = 'Pick at least one kind of music.'; return draw(); }
      const b = $('#next'); b.disabled = true; b.textContent = 'Saving…';
      try { onDone(await patch('/me/profile', { purpose: s.purpose, homeState: s.homeState, group: s.group || null, groupConsent: !!s.group, school: s.purpose === 'student' ? s.school || null : null, genres: s.genres })); }
      catch (x) { err = x.message; draw(); }
    };
  };
  draw();
}

// Same questions, as an edit form inside Profile.
export function profileEditor(me, onSaved) {
  const wrap = document.createElement('div');
  showOnboarding(wrap, me, onSaved);
  return wrap;
}
