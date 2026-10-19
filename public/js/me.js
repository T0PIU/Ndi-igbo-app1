import { html, put, $, $$, toast, icon, rel } from './util.js';
import { get, post, put as putApi, del } from './api.js';
import { band, modal } from './views.js';
import { PURPOSES, GROUPS, GENRES, ORG_TYPES } from './constants.js';
import { profileEditor } from './auth.js';

const lab = (arr, k) => (k === 'not_shared' ? 'Prefer not to say' : arr.find((x) => x.id === k)?.label || k);
const bars = (rows, name) => { const max = Math.max(1, ...rows.map((r) => r.n)); return rows.length ? html`<div class="stack" style="gap:8px">${rows.map((r) => html`<div class="bar-row"><span>${name(r.k)}</span><div class="track"><div class="fill" style="width:${(r.n / max) * 100}%"></div></div><b>${r.n}</b></div>`)}</div>` : html`<p class="meta">No answers yet.</p>`; };

export function meView(root, me, { onChange, onLogout }) {
  put(root, html`<div class="stack" data-view="me">${band('Profile', me.user.name, me.user.email)}
    <div class="card"><h3>Your answers</h3><p class="meta">${PURPOSES.find((p) => p.id === me.profile.purpose)?.label || ''} · ${me.profile.homeState || ''} · ${me.profile.group ? lab(GROUPS, me.profile.group) : 'Group not shared'}</p>
      <p class="meta">Music: ${me.profile.genres.map((g) => GENRES.find((x) => x.id === g)?.label).join(', ')}</p><div class="row"><button class="btn sm" id="edit">Change my answers</button></div></div>
    <div id="ed"></div>
    <div class="card" id="vcard"><h3>Verified badge</h3><p class="meta">Schools, churches, businesses and groups can ask for a badge. An admin checks first. You cannot give it to yourself.</p><div id="vst"></div></div>
    <div class="card"><h3>Blocked people</h3><div id="bl"></div></div>
    <div class="card"><h3>Your data</h3><p class="meta">You can download everything we hold about you, or delete your account and posts.</p>
      <div class="row"><a class="btn ghost sm" href="/api/me/export" download>Download my data</a><button class="btn ghost sm" id="lo">Sign out</button><button class="btn ghost sm" id="loa">Sign out everywhere</button><button class="btn danger sm" id="dl">Delete my account</button></div>
      <p class="hint"><a href="/privacy.html" target="_blank" rel="noopener">Privacy Notice</a> · <a href="/terms.html" target="_blank" rel="noopener">Terms</a></p></div></div>`);
  $('#edit', root).onclick = () => { const ed = $('#ed', root); put(ed, ''); ed.appendChild(profileEditor(me, (m) => { toast('Saved.'); onChange(m); })); ed.scrollIntoView({ behavior: 'smooth' }); };
  const vs = async () => {
    const r = (await get('/me/verification')).requests, pend = r.find((x) => x.status === 'pending');
    put($('#vst', root), html`${me.user.verifiedLabel ? html`<span class="vb">${icon('shield')} ${me.user.verifiedLabel}</span>` : ''}${r.slice(0, 2).map((x) => html`<p class="meta">${x.orgName}: ${x.status}</p>`)}${pend || me.user.verifiedLabel ? '' : html`<button class="btn sm" id="vreq">Request verification</button>`}`);
    const b = $('#vreq', root); if (b) b.onclick = () => modal('Request verification', html`<div class="fld"><label for="vo">Organisation name</label><input id="vo" name="orgName" maxlength="80"></div><div class="fld"><label for="vt">Type</label><select id="vt" name="orgType">${ORG_TYPES.map((x) => html`<option>${x}</option>`)}</select></div><div class="fld"><label for="vd">How can we confirm this? (your role, website, phone, registration)</label><textarea id="vd" name="details" maxlength="500"></textarea></div>`, 'Send request', async (f) => { await post('/me/verification', { orgName: f.get('orgName'), orgType: f.get('orgType'), details: f.get('details') }); toast('Request sent. An admin will review it.'); vs(); });
  };
  vs().catch(() => {});
  const bl = async () => {
    const r = (await get('/me/blocks')).blocks;
    put($('#bl', root), r.length ? html`${r.map((x) => html`<div class="row"><span>${x.name}</span><button class="btn ghost sm" data-ub="${x.id}">Unblock</button></div>`)}` : html`<p class="meta">You have not blocked anyone.</p>`);
    $$('[data-ub]', root).forEach((b) => { b.onclick = async () => { await del('/me/blocks/' + b.dataset.ub); bl(); }; });
  };
  bl().catch(() => {});
  $('#lo', root).onclick = async () => { await post('/auth/logout').catch(() => {}); onLogout(); };
  $('#loa', root).onclick = async () => { await post('/auth/logout-all').catch(() => {}); onLogout(); };
  $('#dl', root).onclick = () => modal('Delete your account?', html`<p>This removes your account, answers and posts for good. Enter your password to confirm.</p><div class="fld"><label for="dp">Password</label><input id="dp" name="password" type="password" autocomplete="current-password"></div>`, 'Delete everything', async (f) => { await del('/me', { password: f.get('password') }); onLogout(); }, true);
}

export function adminView(root) {
  put(root, html`<div class="stack" data-view="admin">${band('Admin', 'Control room', 'Counts only. No names, emails or answers are shown here.')}
    <div class="chips" id="tabs">${['Insights', 'Review', 'Verify', 'Accounts', 'Music', 'Activity', 'Examples'].map((t, i) => html`<button class="chip" data-t="${t}" aria-pressed="${i === 0}">${t}</button>`)}</div><div id="panel"></div></div>`);
  const panel = $('#panel', root);
  const T = {
    async Insights() {
      const d = await get('/admin/insights');
      put(panel, html`<div class="grid"><div class="card"><span class="hint">Online now</span><div class="big">${d.online}</div></div><div class="card"><span class="hint">Accounts</span><div class="big">${d.totals.users}</div><span class="meta">${d.totals.onboarded} finished the questions</span></div>
        <div class="card"><h3>Why people are here</h3>${bars(d.byPurpose, (k) => lab(PURPOSES, k))}</div><div class="card"><h3>Igbo, Yoruba, Hausa, other</h3>${bars(d.byGroup, (k) => lab(GROUPS, k))}</div>
        <div class="card"><h3>States</h3>${bars(d.byState, (k) => k)}</div><div class="card"><h3>Visitors by state</h3>${bars(d.visitorsByState, (k) => k)}</div>
        <div class="card"><h3>Visitors by group</h3>${bars(d.visitorsByGroup, (k) => lab(GROUPS, k))}</div><div class="card"><h3>Favourite music</h3>${bars(d.genres, (k) => lab(GENRES, k))}</div>
        <div class="card" style="grid-column:1/-1"><h3>Purpose by group</h3><div class="scroll-x"><table><thead><tr><th>Why</th><th>Group</th><th>People</th></tr></thead><tbody>${d.purposeByGroup.map((r) => html`<tr><td>${lab(PURPOSES, r.purpose)}</td><td>${lab(GROUPS, r.grp)}</td><td>${r.n}</td></tr>`)}</tbody></table></div></div>
        <div class="card" style="grid-column:1/-1"><h3>Sign-ups, last 30 days</h3>${bars(d.signups.filter((x) => x.n).map((x) => ({ k: x.day, n: x.n })), (k) => k)}</div></div>`);
    },
    async Review() {
      const d = await get('/admin/review');
      const act = (id, s) => html`<button class="btn sm" data-st="${id}|published">${s === 'p' ? 'Approve' : 'Keep (dismiss reports)'}</button><button class="btn danger sm" data-st="${id}|removed">Remove</button>`;
      put(panel, html`<h2 class="h2">Waiting for approval</h2><div class="grid">${d.pending.length ? d.pending.map((p) => html`<article class="card"><span class="tag">${p.kind}</span><h3>${p.title}</h3><p class="meta">${p.data.org} · ${p.author.name}</p><p class="txt">${p.data.body || ''}</p><div class="row">${act(p.id, 'p')}</div></article>`) : html`<div class="empty"><b>All clear</b>Nothing is waiting.</div>`}</div>
        <h2 class="h2">Reported posts</h2><div class="grid">${d.reports.length ? d.reports.map((r) => html`<article class="card"><span class="tag">${r.post.kind} · ${r.post.status}</span><h3>${r.post.title}</h3><p class="meta">${r.count} report(s): ${r.items.map((i) => i.reason).join(', ')}</p><div class="row">${act(r.post.id, 'r')}</div></article>`) : html`<div class="empty"><b>No reports</b>Good news.</div>`}</div>`);
    },
    async Verify() {
      const d = (await get('/admin/verifications')).requests;
      put(panel, html`<div class="grid">${d.length ? d.map((x) => html`<article class="card"><span class="tag">${x.orgType}</span><h3>${x.orgName}</h3><p class="meta">${x.name} · ${x.email} · ${rel(x.createdAt)}</p><p class="txt">${x.details}</p><div class="row"><button class="btn sm" data-ok="${x.id}|${x.orgName}">Approve</button><button class="btn danger sm" data-no="${x.id}">Reject</button></div></article>`) : html`<div class="empty"><b>No requests</b>Nothing is waiting.</div>`}</div>`);
      panel.onclick = async (e) => { const b = e.target.closest('button'); if (!b) return; try { if (b.dataset.ok) { const [id, n] = b.dataset.ok.split('|'); await post(`/admin/verifications/${id}/decide`, { approve: true, label: n.slice(0, 40) }); } else if (b.dataset.no) await post(`/admin/verifications/${b.dataset.no}/decide`, { approve: false }); toast('Done.'); T.Verify(); } catch (x) { toast(x.message); } };
    },
    async Activity() {
      const d = (await get('/admin/audit')).entries;
      put(panel, html`<div class="card"><h3>Recent admin actions</h3><div class="scroll-x"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>${d.map((x) => html`<tr><td>${rel(x.createdAt)}</td><td>${x.actor || ''}</td><td>${x.action}</td><td>${x.detail || ''}</td></tr>`)}</tbody></table></div></div>`);
    },
    async Accounts() {
      put(panel, html`<form class="card" id="us"><div class="fld"><label for="uq">Find an account by name or email</label><input id="uq" maxlength="80"></div><button class="btn sm">Search</button></form><div class="grid" id="ur" style="margin-top:14px"></div>`);
      const find = async (q) => { const r = (await get('/admin/users?q=' + encodeURIComponent(q))).users; put($('#ur', panel), r.length ? html`${r.map((u) => html`<article class="card"><h3>${u.name}</h3><p class="meta">${u.email} · ${u.role}</p>${u.verifiedLabel ? html`<span class="vb">${icon('shield')} ${u.verifiedLabel}</span>` : ''}<div class="row">${u.suspended ? html`<span class="uv">Suspended</span>` : ''}<button class="btn sm" data-vf="${u.id}">Verify as…</button>${u.role !== 'admin' ? html`<button class="btn ${u.suspended ? 'ghost' : 'danger'} sm" data-sp="${u.id}|${u.suspended ? 0 : 1}">${u.suspended ? 'Restore' : 'Suspend'}</button>` : ''}${u.verifiedLabel ? html`<button class="btn ghost sm" data-uv="${u.id}">Remove badge</button>` : ''}</div></article>`)}` : html`<div class="empty"><b>No matches</b></div>`); };
      $('#us', panel).onsubmit = (e) => { e.preventDefault(); find($('#uq', panel).value).catch((x) => toast(x.message)); };
      panel.onclick = async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.vf) modal('Verify this account', html`<div class="fld"><label for="vl">Label, e.g. “IMSU Registry”</label><input id="vl" name="label" maxlength="40"></div>`, 'Verify', async (f) => { await post(`/admin/users/${b.dataset.vf}/verify`, { label: f.get('label') }); toast('Verified.'); find($('#uq', panel).value); });
        if (b.dataset.sp) { const [id, on] = b.dataset.sp.split('|'); await post(`/admin/users/${id}/suspend`, { suspended: on === '1' }); toast('Done.'); find($('#uq', panel).value); }
        if (b.dataset.uv) { await post(`/admin/users/${b.dataset.uv}/verify`, { label: '' }); find($('#uq', panel).value); }
        if (b.dataset.st) { const [id, s] = b.dataset.st.split('|'); await post(`/admin/posts/${id}/status`, { status: s }); toast('Done.'); T.Review(); }
      };
    },
    async Music() {
      const d = await get('/admin/music');
      put(panel, html`<p class="meta">Paste a Spotify playlist, album, artist or track link for each genre. People who pick that genre hear it in the Spotify player.${d.searchConfigured ? ' Search is on: genres without a link are filled from a Spotify search.' : ''}</p>
        <div class="grid">${d.genres.map((g) => html`<form class="card" data-mg="${g.id}"><h3>${g.label}</h3><p class="meta">${g.curated ? 'Set: ' + (g.curated.title || g.curated.uri) : 'Not set'}</p><div class="fld"><label for="m-${g.id}">Spotify link</label><input id="m-${g.id}" name="url" type="url" placeholder="https://open.spotify.com/playlist/…"></div><div class="fld"><label for="t-${g.id}">Title (optional)</label><input id="t-${g.id}" name="title" maxlength="80"></div><p class="err"></p><div class="row"><button class="btn sm">Save</button>${g.curated ? html`<button type="button" class="btn ghost sm" data-clr="${g.id}">Clear</button>` : ''}</div></form>`)}</div>`);
      panel.onsubmit = async (e) => { const f = e.target.closest('[data-mg]'); if (!f) return; e.preventDefault(); const fd = new FormData(f); try { await putApi('/admin/music/' + f.dataset.mg, { url: fd.get('url'), title: fd.get('title') }); toast('Saved.'); T.Music(); } catch (x) { $('.err', f).textContent = x.message; } };
      panel.onclick = async (e) => { const b = e.target.closest('[data-clr]'); if (b) { await del('/admin/music/' + b.dataset.clr); T.Music(); } };
    },
    async Examples() {
      put(panel, html`<div class="card"><h3>Example posts</h3><p class="meta">Add clearly marked example events, rooms, businesses and a notice so people can see how the app works. Remove them any time.</p><div class="row"><button class="btn sm" id="ex-a">Add examples</button><button class="btn ghost sm" id="ex-r">Remove examples</button></div></div>`);
      $('#ex-a', panel).onclick = async () => { try { const r = await post('/admin/examples'); toast(`Added ${r.added}.`); } catch (x) { toast(x.message); } };
      $('#ex-r', panel).onclick = async () => { const r = await del('/admin/examples'); toast(`Removed ${r.removed}.`); };
    },
  };
  const go = async (t) => { $$('#tabs .chip', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t))); panel.onclick = panel.onsubmit = null; put(panel, html`<div class="empty">Loading…</div>`); try { await T[t](); } catch (x) { put(panel, html`<div class="empty"><b>Could not load</b>${x.message}</div>`); } };
  $$('#tabs .chip', root).forEach((b) => { b.onclick = () => go(b.dataset.t); });
  go('Insights');
}
