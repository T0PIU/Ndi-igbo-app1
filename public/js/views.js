import { html, put, $, $$, raw, icon, toast, safeUrl, mapsQ, mapsDir, waLink, naira, rel, occ, dayParts, todayStr, addDays, liveHour, esc } from './util.js';
import { get, post, del, uploadPdf, patch as req0 } from './api.js';
const req = (m, p, b) => req0(p, b);
import { EVENT_TYPES, BUSINESS_CATS, SCHOOLS, LEVELS, HABITS, GENDERS, WANTS, ORG_TYPES, REPORT_REASONS } from './constants.js';
import { startSky, simTemp, simHumidity, skyLabel, clockText } from './sky.js';

export const band = (eyebrow, title, lead) => html`<header class="band"><div class="in"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${lead ? html`<p class="lead">${lead}</p>` : ''}</div><div class="weave"></div></header>`;
const empty = (t, s) => html`<div class="empty"><b>${t}</b>${s}</div>`;

// ---- modal ----
export function modal(title, fieldsHtml, submitLabel, onSubmit, danger = false) {
  const d = $('#dlg');
  put(d, html`<form method="dialog" id="mf" style="padding:20px;display:flex;flex-direction:column;gap:12px"><h2 class="h2">${title}</h2>${fieldsHtml}<p class="err" id="mf-err" role="alert"></p>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost sm" id="mf-c">Cancel</button><button class="btn sm ${danger ? 'danger' : ''}" id="mf-s" style="--sec:var(--camwood);--sec-fg:#fff">${submitLabel}</button></div></form>`);
  $('#mf-c').onclick = () => d.close();
  $('#mf').onsubmit = async (e) => {
    e.preventDefault(); const b = $('#mf-s'); b.disabled = true;
    try { await onSubmit(new FormData(e.target)); d.close(); } catch (x) { $('#mf-err').textContent = x.message; b.disabled = false; }
  };
  d.showModal();
}

// ---- generic post forms ----
const opt = (arr, sel) => arr.map((x) => { const v = typeof x === 'string' ? x : x.id, l = typeof x === 'string' ? x : x.label; return html`<option value="${v}" ${sel === v ? 'selected' : ''}>${l}</option>`; });
function fld(f) {
  const id = 'f-' + f.k, cls = 'fld' + (f.full ? ' full' : '');
  if (f.t === 'checks') return html`<div class="${cls}"><span class="lb">${f.l}</span><div class="checks">${f.o.map((o) => html`<label><input type="checkbox" name="${f.k}" value="${o}">${o}</label>`)}</div></div>`;
  if (f.t === 'check') return html`<div class="${cls}"><div class="checks"><label><input type="checkbox" name="${f.k}">${f.l}</label></div></div>`;
  if (f.t === 'select') return html`<div class="${cls}"><label for="${id}">${f.l}</label><select id="${id}" name="${f.k}"><option value="">Choose</option>${opt(f.o)}</select></div>`;
  if (f.t === 'textarea') return html`<div class="${cls}"><label for="${id}">${f.l}</label><textarea id="${id}" name="${f.k}" maxlength="${f.max || 500}" placeholder="${f.ph || ''}"></textarea></div>`;
  if (f.t === 'file') return html`<div class="${cls}"><label for="${id}">${f.l}</label><input id="${id}" name="${f.k}" type="file" accept="application/pdf"></div>`;
  return html`<div class="${cls}"><label for="${id}">${f.l}</label><input id="${id}" name="${f.k}" type="${f.t || 'text'}" ${f.t === 'number' ? raw('inputmode="numeric" min="0"') : ''} maxlength="${f.max || 100}" placeholder="${f.ph || ''}" ${f.t === 'time' && !f.blank ? raw('value="09:00"') : ''}></div>`;
}
function collect(form, fields) {
  const f = new FormData(form), o = {};
  for (const x of fields) {
    if (x.t === 'checks') o[x.k] = f.getAll(x.k);
    else if (x.t === 'check') o[x.k] = f.get(x.k) === 'on';
    else if (x.t === 'file') { o[x.k] = f.get(x.k) instanceof File && f.get(x.k).size ? f.get(x.k) : null; }
    else if (x.t === 'number') { const v = f.get(x.k); o[x.k] = v === '' || v == null ? null : Number(v); }
    else o[x.k] = String(f.get(x.k) ?? '').trim();
  }
  return o;
}

const SPECS = {
  event: {
    open: 'Post a program', fields: [
      { k: 'title', l: 'Program name', max: 80 }, { k: 'type', l: 'Type', t: 'select', o: EVENT_TYPES }, { k: 'org', l: 'Organiser (church, bar, school…)', max: 60 },
      { k: 'area', l: 'Address or area', max: 100 }, { k: 'date', l: 'Date', t: 'date' }, { k: 'time', l: 'Starts', t: 'time' }, { k: 'endTime', l: 'Ends (optional)', t: 'time', blank: true },
      { k: 'weekly', l: 'Repeats every week', t: 'check', full: true }, { k: 'details', l: 'Details (optional)', t: 'textarea', full: true }, { k: 'contact', l: 'WhatsApp or phone (optional)', max: 30, full: true }],
  },
  roommate: {
    open: 'I need a roommate', fields: [
      { k: 'nick', l: 'Nickname (not your full name)', max: 30 }, { k: 'school', l: 'School', t: 'select', o: SCHOOLS }, { k: 'level', l: 'Level', t: 'select', o: LEVELS },
      { k: 'gender', l: 'You are', t: 'select', o: GENDERS }, { k: 'wants', l: 'Looking for', t: 'select', o: WANTS }, { k: 'budget', l: 'Yearly budget (₦)', t: 'number', ph: '150000' },
      { k: 'area', l: 'Preferred area', max: 60 }, { k: 'habits', l: 'Habits', t: 'checks', o: HABITS, full: true }, { k: 'about', l: 'About you', t: 'textarea', max: 280, full: true },
      { k: 'contact', l: 'WhatsApp or phone (kept private, shown only when someone taps Show contact)', max: 30, full: true }],
  },
  business: {
    open: 'Advertise my business', fields: [
      { k: 'name', l: 'Business name', max: 60 }, { k: 'cat', l: 'Category', t: 'select', o: BUSINESS_CATS }, { k: 'offer', l: 'What you offer', t: 'textarea', max: 300, full: true },
      { k: 'price', l: 'Price range', max: 40 }, { k: 'area', l: 'Address or area', max: 100 }, { k: 'promo', l: 'Promo (optional)', max: 80 }, { k: 'contact', l: 'WhatsApp or phone', max: 30 }],
  },
  newsletter: {
    open: 'Send a notice', fields: [
      { k: 'title', l: 'Title', max: 100, full: true }, { k: 'org', l: 'Organisation', max: 80 }, { k: 'orgType', l: 'Sender type', t: 'select', o: ORG_TYPES }, { k: 'body', l: 'Message', t: 'textarea', max: 3000, full: true },
      { k: 'link', l: 'Link (optional)', t: 'url', max: 300, full: true }, { k: 'pdf', l: 'PDF file (optional, up to 3 MB)', t: 'file', full: true }],
  },
};

function reportDialog(p) {
  modal('Report this post', html`<div class="fld"><label for="rp-r">Reason</label><select id="rp-r" name="reason">${opt(REPORT_REASONS)}</select></div><div class="fld"><label for="rp-n">Note (optional)</label><textarea id="rp-n" name="note" maxlength="300"></textarea></div>`,
    'Send report', async (f) => { await post(`/posts/${p.id}/report`, { reason: f.get('reason'), note: f.get('note') }); toast('Thank you. We will look at it.'); });
}

function ics(p) {
  const d = p.data, z = (t) => t.replace(':', '') + '00', day = occ(d).replace(/-/g, '');
  const fold = (t) => String(t || '').replace(/[\;,]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\n');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ndi Igbo//EN', 'BEGIN:VEVENT', `UID:${p.id}@ndi-igbo`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`,
    `DTSTART;TZID=Africa/Lagos:${day}T${z(d.time)}`, `DTEND;TZID=Africa/Lagos:${day}T${z(d.endTime || d.time)}`, ...(d.weekly ? ['RRULE:FREQ=WEEKLY'] : []),
    `SUMMARY:${fold(p.title)}`, `LOCATION:${fold(d.area)}`, `DESCRIPTION:${fold((d.org || '') + (d.details ? ' - ' + d.details : ''))}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Starts in 1 hour', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([L.join('\r\n')], { type: 'text/calendar' })); a.download = 'event.ics'; document.body.appendChild(a); a.click(); a.remove();
}
const STAT = { postponed: 'Postponed', cancelled: 'Cancelled' };
function prefill(form, fields, p) {
  const v = { ...p.data, title: p.title, nick: p.title, name: p.title, status: p.data.evStatus || 'upcoming' };
  for (const f of fields) {
    const el = form.elements[f.k]; if (!el || v[f.k] == null) continue;
    if (f.t === 'checks') (v[f.k] || []).forEach((x) => { const c = [...form.querySelectorAll(`[name="${f.k}"]`)].find((i) => i.value === x); if (c) c.checked = true; });
    else if (f.t === 'check') el.checked = !!v[f.k]; else el.value = v[f.k];
  }
}
function editDialog(p, kind, done) {
  const spec = SPECS[kind], base = spec.fields.filter((x) => x.t !== 'file'), fields = kind === 'event' ? [...base, { k: 'status', l: 'Status', t: 'select', o: [{ id: 'upcoming', label: 'Upcoming' }, { id: 'postponed', label: 'Postponed' }, { id: 'cancelled', label: 'Cancelled' }], full: true }] : base;
  modal('Edit your post', html`<div class="stack" style="gap:10px;max-height:60vh;overflow:auto">${fields.map(fld)}</div>`, 'Save changes', async (f) => { await req('PATCH', '/posts/' + p.id, { kind, ...collect($('#mf'), fields) }); toast('Saved.'); await done(); });
  prefill($('#mf'), fields, p);
  if (kind === 'roommate') toast('Leave contact empty to keep the one you saved.');
}
const author = (p) => html`${p.author.verifiedLabel ? html`<span class="vb">${icon('shield')} ${p.author.verifiedLabel}</span>` : ''}${p.example ? html`<span class="ex">Example</span>` : ''}${p.status === 'pending' ? html`<span class="uv">Waiting for review</span>` : ''}${p.status === 'hidden' ? html`<span class="uv">Hidden after reports</span>` : ''}`;
const actions = (p, kind) => html`<div class="row">${kind !== 'newsletter' && p.status === 'published' ? html`<button class="btn ghost sm" data-react="${p.id}" aria-pressed="${p.reactions.mine}">${p.reactions.mine ? '★' : '☆'} ${kind === 'roommate' ? 'I’m interested' : 'Save'} · ${p.reactions.count}</button>` : ''}
  ${kind === 'roommate' && p.hasContact && !p.mine ? html`<button class="btn ghost sm" data-contact="${p.id}">Show contact</button>` : ''}
  ${kind === 'roommate' && !p.mine ? html`<button class="btn ghost sm" data-block="${p.id}">Block</button>` : ''}
  ${kind === 'event' && p.status === 'published' ? html`<button class="btn sm" data-rsvp="${p.id}" aria-pressed="${p.rsvp.mine}">${p.rsvp.mine ? '✓ Going' : 'I’m going'} · ${p.rsvp.count}</button>` : ''}
  ${p.mine ? html`<button class="btn ghost sm" data-edit="${p.id}">Edit</button><button class="btn ghost sm" data-del="${p.id}">${icon('trash')} Delete</button>` : html`<button class="btn ghost sm" data-rep="${p.id}" aria-label="Report this post">${icon('flag')} Report</button>`}</div>`;

const CARDS = {
  event(p) {
    const d = p.data, o = occ(d), dp = dayParts(o);
    return html`<article class="card ev"><div class="date"><span>${dp.wd}</span><b>${dp.n}</b><span>${dp.mo}</span></div><div class="body">
      <div class="tags">${STAT[d.evStatus] ? html`<span class="tag" style="background:var(--bad);color:#fff">${STAT[d.evStatus]}</span>` : ''}<span class="tag ${d.type}">${EVENT_TYPES.find((x) => x.id === d.type)?.label}</span>${d.weekly ? html`<span class="tag">Every week</span>` : ''}${author(p)}</div>
      <h3>${p.title}</h3><p class="meta">${d.org} · ${d.time}${d.endTime ? '–' + d.endTime : ''}${d.area ? ' · ' + d.area : ''}</p>${d.details ? html`<p class="txt">${d.details}</p>` : ''}
      <div class="row">${d.area ? html`<a class="btn ghost sm" href="${mapsDir(d.area + ' Imo State Nigeria')}" target="_blank" rel="noopener">${icon('pin')} Directions</a>` : ''}${waLink(d.contact) ? html`<a class="btn ghost sm" href="${waLink(d.contact)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<button class="btn ghost sm" data-ics="${p.id}">${icon('cal')} Remind me</button></div>${actions(p, 'event')}</div></article>`;
  },
  roommate(p) {
    const d = p.data;
    return html`<article class="card"><div class="tags"><span class="tag school">${d.school} · ${d.level}</span>${author(p)}</div><h3>${p.title}</h3>
      <p class="meta">${d.gender} · wants: ${d.wants} · ${naira(d.budget)} per year${d.area ? ' · ' + d.area : ''}</p><div class="tags">${d.habits.map((h) => html`<span class="tag">${h}</span>`)}</div>${d.about ? html`<p class="txt">${d.about}</p>` : ''}<p class="hint" data-cbox="${p.id}"></p>${actions(p, 'roommate')}</article>`;
  },
  business(p) {
    const d = p.data;
    return html`<article class="card"><div class="tags"><span class="tag other">${d.cat}</span>${author(p)}</div><h3>${p.title}</h3>${d.promo ? html`<p><span class="ex">${d.promo}</span></p>` : ''}<p class="txt">${d.offer}</p>
      <p class="meta">${d.price ? d.price + ' · ' : ''}${d.area}</p><p class="meta" aria-label="Rating">${p.rating?.count ? '★'.repeat(Math.round(p.rating.avg)) + '☆'.repeat(5 - Math.round(p.rating.avg)) + ' ' + p.rating.avg + ' (' + p.rating.count + ')' : 'No reviews yet'} <button class="btn ghost sm" data-revs="${p.id}">Reviews</button>${!p.mine ? html` <button class="btn ghost sm" data-rate="${p.id}">${p.rating?.mine ? 'Change my rating' : 'Rate'}</button>` : ''}</p><div class="row">${waLink(d.contact) ? html`<a class="btn sm" href="${waLink(d.contact)}" target="_blank" rel="noopener">WhatsApp</a>` : html`<span class="meta">${d.contact}</span>`}<a class="btn ghost sm" href="${mapsQ(d.area + ' Imo State Nigeria')}" target="_blank" rel="noopener">${icon('pin')} Map</a></div>${actions(p, 'business')}</article>`;
  },
  newsletter(p) {
    const d = p.data, l = safeUrl(d.link);
    return html`<article class="card"><div class="tags"><span class="tag school">${d.orgType}</span>${author(p)}</div><h3>${p.title}</h3><p class="meta">${d.org} · ${rel(p.createdAt)}</p><p class="txt">${d.body}</p>${l ? html`<p><a href="${l}" target="_blank" rel="noopener noreferrer">${icon('link')} Open link</a></p>` : ''}${d.fileId ? html`<p><a class="btn ghost sm" href="/api/files/${d.fileId}" download>${icon('news')} ${d.fileName} (${Math.max(1, Math.round(d.fileSize / 1024))} KB)</a></p>` : ''}${actions(p, 'newsletter')}</article>`;
  },
};

const META = {
  events: { kind: 'event', eyebrow: 'Programs', title: 'What is happening', lead: 'Churches, bars, schools and cultural groups share their upcoming programs.', filter: (p, f) => !f || p.data.type === f, chips: EVENT_TYPES, sort: (a, b) => (occ(a.data) + a.data.time).localeCompare(occ(b.data) + b.data.time), none: ['No programs yet', 'Be the first to post one for your church, lounge or school.'] },
  rooms: { kind: 'roommate', eyebrow: 'Roommates', title: 'Find someone to share with', lead: 'Students looking for roommates. Phone numbers stay hidden until you ask.', filter: (p, f) => !f || p.data.school === f, chips: SCHOOLS.map((s) => ({ id: s, label: s })), none: ['No roommate posts yet', 'Tell others what you are looking for.'] },
  market: { kind: 'business', eyebrow: 'Market', title: 'Local businesses', lead: 'Neighbours advertising what they sell and do.', filter: (p, f) => !f || p.data.cat === f, chips: BUSINESS_CATS.map((s) => ({ id: s, label: s })), none: ['No businesses yet', 'Advertise yours for free.'] },
  news: { kind: 'newsletter', eyebrow: 'Notices', title: 'Newsletters and notices', lead: 'From school offices, student unions, businesses and community groups. Verified senders go live at once; others are reviewed first.', filter: () => true, chips: [], none: ['No notices yet', 'Verified senders can post here.'] },
};

export function postsView(root, view) {
  const m = META[view], spec = SPECS[m.kind]; let filter = '', posts = [], q = '', dr = '';
  put(root, html`<div class="stack" data-view="${view}">${band(m.eyebrow, m.title, m.lead)}
    <details class="post"><summary>${icon('plus')} ${spec.open}</summary><form class="f" id="pf" novalidate>${spec.fields.map(fld)}<div class="fld full"><p class="err" id="pf-err" role="alert"></p><button class="btn" type="submit">Post</button></div></form></details>
    <div class="row"><div class="fld" style="flex:1;min-width:200px"><label class="sr" for="q">Search</label><input id="q" type="search" placeholder="Search" maxlength="60"></div>${m.kind === 'event' ? html`<div class="fld"><label class="sr" for="dr">Date</label><select id="dr"><option value="">Any date</option><option value="today">Today</option><option value="week">Next 7 days</option></select></div>` : ''}</div>
    ${m.chips.length ? html`<div class="chips" id="flt"><button class="chip" data-f="" aria-pressed="true">All</button>${m.chips.map((c) => html`<button class="chip" data-f="${c.id}" aria-pressed="false">${c.label}</button>`)}</div>` : ''}
    <div class="grid" id="list" aria-live="polite"><div class="empty">Loading…</div></div></div>`);
  const list = $('#list', root);
  const draw = () => {
    const rows = posts.filter((p) => m.filter(p, filter) && (!q || (p.title + JSON.stringify(p.data)).toLowerCase().includes(q)) && (!dr || (() => { const o = occ(p.data), t = todayStr(); return dr === 'today' ? o === t : o >= t && o <= addDays(t, 7); })())); if (m.sort) rows.sort(m.sort);
    put(list, rows.length ? html`${rows.map(CARDS[m.kind])}` : empty(...m.none));
  };
  async function load() { try { posts = (await get('/posts?kind=' + m.kind)).posts; draw(); } catch (e) { put(list, empty('Could not load', e.message)); } }
  $('#q', root).oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  if ($('#dr', root)) $('#dr', root).onchange = (e) => { dr = e.target.value; draw(); };
  $$('#flt .chip', root).forEach((b) => { b.onclick = () => { filter = b.dataset.f; $$('#flt .chip', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }; });
  $('#pf', root).onsubmit = async (e) => {
    e.preventDefault(); const btn = $('button[type=submit]', e.target); btn.disabled = true; $('#pf-err', root).textContent = '';
    try {
      const body = collect(e.target, spec.fields);
      if (body.pdf) { if (body.pdf.size > 3 * 1024 * 1024) throw new Error('That PDF is too big. The limit is 3 MB.'); body.fileId = (await uploadPdf(body.pdf)).id; }
      delete body.pdf;
      const r = await post('/posts', { kind: m.kind, ...body });
      toast(r.message || 'Posted.'); e.target.reset(); $('details.post', root).open = false; await load();
    } catch (x) { $('#pf-err', root).textContent = x.message; } finally { btn.disabled = false; }
  };
  list.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const find = (id) => posts.find((p) => p.id === id);
    try {
      if (b.dataset.react) { await post(`/posts/${b.dataset.react}/react`); await load(); }
      else if (b.dataset.contact) { const r = await post(`/posts/${b.dataset.contact}/contact`); const c = $(`[data-cbox="${b.dataset.contact}"]`, list); const w = waLink(r.contact); put(c, w ? html`Contact: <a href="${w}" target="_blank" rel="noopener">${r.contact}</a>` : html`Contact: ${r.contact}`); b.hidden = true; }
      else if (b.dataset.block) modal('Block this person?', html`<p>You will no longer see each other's posts. You can unblock in Profile.</p>`, 'Block', async () => { await post(`/posts/${b.dataset.block}/block`); toast('Blocked.'); await load(); }, true);
      else if (b.dataset.rate) { const p0 = find(b.dataset.rate); modal('Rate this business', html`<div class="fld"><label for="rt">Stars</label><select id="rt" name="rating">${[5, 4, 3, 2, 1].map((n) => html`<option value="${n}" ${p0.rating?.mine === n ? 'selected' : ''}>${n} ${'★'.repeat(n)}</option>`)}</select></div><div class="fld"><label for="rb">Short review (optional)</label><textarea id="rb" name="body" maxlength="300"></textarea></div><p class="hint">Be honest and kind. One review per person.</p>`, 'Save', async (f) => { await post(`/posts/${p0.id}/review`, { rating: Number(f.get('rating')), body: f.get('body') }); toast('Thank you.'); await load(); }); }
      else if (b.dataset.revs) { const rs = (await get(`/posts/${b.dataset.revs}/reviews`)).reviews; modal('Reviews', rs.length ? html`<div class="stack" style="max-height:50vh;overflow:auto;gap:10px">${rs.map((x) => html`<div><b>${x.name}</b> ${'★'.repeat(x.rating)}<p class="txt">${x.body || ''}</p><span class="hint">${rel(x.createdAt)}</span></div>`)}</div>` : html`<p>No reviews yet.</p>`, 'Close', async () => {}); }
      else if (b.dataset.ics) { ics(find(b.dataset.ics)); toast('Open the file to add it to your calendar with a 1 hour reminder.'); }
      else if (b.dataset.rsvp) { await post(`/posts/${b.dataset.rsvp}/rsvp`); await load(); }
      else if (b.dataset.edit) editDialog(find(b.dataset.edit), m.kind, load);
      else if (b.dataset.del) { modal('Delete this post?', html`<p>This cannot be undone.</p>`, 'Delete', async () => { await del('/posts/' + b.dataset.del); toast('Deleted.'); await load(); }, true); }
      else if (b.dataset.rep) reportDialog(find(b.dataset.rep));
    } catch (x) { toast(x.message); }
  };
  load();
  return { refresh: (kinds) => { if (kinds.includes(m.kind)) load(); } };
}

// ---- home ----
const WORDS = [['Nnọọ', 'Welcome'], ['Kedu', 'How are you?'], ['Daalụ', 'Thank you'], ['Biko', 'Please'], ['Ndewo', 'Greetings'], ['Ututu ọma', 'Good morning'], ['Mgbede ọma', 'Good evening'], ['Ka chi fo', 'Good night (until dawn)'], ['Nwanne m', 'My sibling'], ['Igwe bụ ike', 'Unity is strength']];
const TILES = [['events', 'cal', 'Events', 'Programs near you', 'camwood', '#fff'], ['rooms', 'users', 'Rooms', 'Find a roommate', 'indigo', '#fff'], ['market', 'bag', 'Market', 'Local businesses', 'orange', '#1B1620'], ['news', 'news', 'Notices', 'School and groups', 'green', '#fff'], ['map', 'map', 'Map', 'Owerri and around', 'teal', '#fff'], ['ask', 'chat', 'Ask', 'Chat with Ndi Igbo', 'moon', '#F4EFE6']];

export function homeView(root, me) {
  let preview = null; const hr = () => (preview ?? liveHour());
  const w = WORDS[Math.floor(Date.now() / 864e5) % WORDS.length];
  put(root, html`<div class="stack" data-view="home">${band('Imo State · Owerri', `Welcome, ${me.user.name.split(' ')[0]}`, 'One Igbo day, from dawn to night. Pick where you want to go.')}
    <div class="scene"><canvas id="sky" role="img" aria-label="Animated sky for Owerri, matching the current time"></canvas><div class="weave"></div></div>
    <div class="live"><div class="card"><span class="hint">Owerri time · simulated sky</span><div class="big" id="clk"></div><div class="stat"><div><b id="tp"></b><span>Temperature</span></div><div><b id="hm"></b><span>Humidity</span></div><div><b id="ph"></b><span>Part of day</span></div></div>
      <div class="fld"><label for="pv">Preview the day</label><input id="pv" type="range" min="0" max="23.9" step="0.1" value="${liveHour()}"></div><button class="btn ghost sm" id="nowb" hidden>Back to now</button>
      <p class="hint">The sky follows the real clock. Temperature and humidity are a simple simulation, not a forecast.</p></div>
      <div class="card"><span class="hint">Word of the day</span><div class="big">${w[0]}</div><p class="meta">${w[1]}</p><p class="hint">Spellings and customs vary by town. Ask elders from your own place.</p></div></div>
    <div class="tiles">${TILES.map(([id, ic, t, s, c, fg]) => html`<button class="tile" data-go="${id}" style="background:var(--${c});color:${fg}">${icon(ic)}<span>${t}<small>${s}</small></span></button>`)}</div>
    <h2 class="h2">Coming up</h2><div class="grid" id="soon"></div></div>`);
  const stop = startSky($('#sky', root), hr);
  const tick = () => { const h = hr(); if (!$('#clk', root)) return; $('#clk', root).textContent = clockText(h); $('#tp', root).textContent = simTemp(h) + '°C'; $('#hm', root).textContent = simHumidity(h) + '%'; $('#ph', root).textContent = skyLabel(h); };
  tick(); const iv = setInterval(tick, 1000);
  $('#pv', root).oninput = (e) => { preview = +e.target.value; $('#nowb', root).hidden = false; tick(); };
  $('#nowb', root).onclick = (e) => { preview = null; e.target.hidden = true; $('#pv', root).value = liveHour(); tick(); };
  $$('[data-go]', root).forEach((b) => { b.onclick = () => { location.hash = '#/' + b.dataset.go; }; });
  const soon = async () => {
    try { const ps = (await get('/posts?kind=event')).posts.sort((a, b) => (occ(a.data) + a.data.time).localeCompare(occ(b.data) + b.data.time)).slice(0, 3); put($('#soon', root), ps.length ? html`${ps.map(CARDS.event)}` : empty('Nothing posted yet', 'Churches, bars and schools can add programs in Events.')); } catch { /* offline */ }
  };
  soon();
  return { stop: () => { stop(); clearInterval(iv); }, refresh: (k) => { if (k.includes('event') && $('#soon', root)) soon(); } };
}

// ---- map ----
const PLACES = [
  { n: 'Owerri city centre', t: 'Centre', lat: 5.4850, lng: 7.0350, x: 50, y: 50, q: 'Owerri Imo State' },
  { n: 'Imo State University (IMSU)', t: 'School', lat: 5.4900, lng: 7.0300, x: 38, y: 40, q: 'Imo State University Owerri' },
  { n: 'Federal University of Technology (FUTO)', t: 'School', lat: 5.3836, lng: 6.9985, x: 22, y: 78, q: 'Federal University of Technology Owerri' },
  { n: 'Ekeukwu Owerri market', t: 'Market', lat: 5.4850, lng: 7.0390, x: 60, y: 46, q: 'Ekeukwu Owerri Market' },
  { n: 'Sam Mbakwe Airport', t: 'Transport', lat: 5.4271, lng: 7.2060, x: 88, y: 66, q: 'Sam Mbakwe Airport Owerri' },
  { n: 'Egbu', t: 'Area', lat: 5.5170, lng: 7.0170, x: 30, y: 22, q: 'Egbu Owerri' },
  { n: 'Ihiagwa', t: 'Area', lat: 5.3750, lng: 6.9900, x: 12, y: 88, q: 'Ihiagwa Owerri' },
];
const ROADS = [[[5, 50], [50, 50], [95, 50]], [[50, 5], [50, 50], [50, 95]], [[22, 78], [38, 62], [50, 50]], [[50, 50], [70, 58], [88, 66]], [[38, 40], [30, 22]], [[50, 50], [38, 40]]];

function schematic(h) {
  const rush = (x) => Math.exp(-((h - x) ** 2) / 1.6), load = Math.min(1, rush(8) + rush(17.5) * 1.1 + 0.15);
  const col = (i) => { const v = (load + (i % 3) * 0.12) % 1.05; return v > 0.75 ? '#C73B2A' : v > 0.4 ? '#E8A33D' : '#2E9B5E'; };
  return html`<svg viewBox="0 0 100 100" role="img" aria-label="Simulated map of Owerri and nearby places" preserveAspectRatio="xMidYMid meet"><rect width="100" height="100" fill="var(--map-land)"/><path d="M0 92 Q30 84 55 92 T100 86 V100 H0Z" fill="var(--map-water)"/>
    ${ROADS.map((r, i) => html`<polyline points="${r.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--map-road)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${r.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${col(i)}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`)}
    ${PLACES.map((p, i) => html`<g class="pin" tabindex="0" role="link" data-q="${p.q}" aria-label="${p.n}, open in Google Maps"><circle class="pc" cx="${p.x}" cy="${p.y}" r="3.2" fill="var(--camwood)" stroke="#fff" stroke-width="1"/><text x="${p.x}" y="${p.y + (p.y > 85 ? -5 : 7)}" text-anchor="${p.x > 80 ? 'end' : p.x < 20 ? 'start' : 'middle'}" font-size="3.6" font-weight="700" fill="var(--fg)" stroke="var(--map-land)" stroke-width=".9" paint-order="stroke">${p.n.replace(/ \(.*/, '')}</text></g>`)}</svg>`;
}

let gmLoad = null;
function loadGoogle(key) {
  if (gmLoad) return gmLoad;
  gmLoad = new Promise((res, rej) => {
    window.__gm = () => res(window.google); window.gm_authFailure = () => rej(new Error('auth'));
    const s = document.createElement('script'); s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&libraries=marker&callback=__gm&v=weekly`;
    s.async = true; s.onerror = () => rej(new Error('blocked')); document.head.appendChild(s); setTimeout(() => rej(new Error('timeout')), 12000);
  });
  gmLoad.catch(() => { gmLoad = null; });
  return gmLoad;
}

export function mapView(root, me) {
  const key = me.config.mapsKey;
  put(root, html`<div class="stack" data-view="map">${band('Map', 'Owerri and around', key ? 'Live Google Map with the traffic layer.' : 'A simple map with simulated traffic. Tap a place to open it in Google Maps.')}
    ${key ? '' : html`<p class="banner">Simulated traffic, based on usual rush hours. The site owner can switch on live Google traffic by adding a Google Maps key.</p>`}
    <div class="mapbox"><div id="mapin">${key ? html`<div id="gmap" aria-label="Google Map"></div>` : schematic(liveHour())}</div>
      <div class="legend" id="lg">${key ? html`<span>Traffic: green is fast, red is slow.</span>` : html`<span><i style="background:#2E9B5E"></i>Moving</span><span><i style="background:#E8A33D"></i>Busy</span><span><i style="background:#C73B2A"></i>Slow</span>`}</div></div>
    <div class="row"><div class="fld" style="flex:1;min-width:200px"><label class="sr" for="ps">Search places</label><input id="ps" type="search" placeholder="Search a place or area" maxlength="80"></div><button class="btn sm" id="loc">${icon('pin')} Use my location</button><a class="btn ghost sm" id="gs2" href="${mapsQ('Owerri')}" target="_blank" rel="noopener">Search all of Google Maps</a></div><p class="hint" id="locmsg">Your location is used only on this screen, only after you tap the button, and is never sent to us.</p>
    <div class="grid" id="pl">${PLACES.map((p) => html`<a class="card" href="${mapsDir(p.q)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><span class="tag">${p.t}</span><h3>${p.n}</h3><span class="meta">Get directions</span></a>`)}</div>
    <p class="hint">Pins are approximate. Google Maps opens the exact place.</p></div>`);
  let here = null, gmap = null, gmark = null, term = '';
  const km = (a, b) => { const r = (x) => x * Math.PI / 180, h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  const plist = () => {
    let rows = PLACES.filter((p) => !term || (p.n + ' ' + p.t).toLowerCase().includes(term));
    if (here) rows = rows.map((p) => ({ ...p, d: km(here, p) })).sort((a, b) => a.d - b.d);
    put($('#pl', root), rows.length ? html`${rows.map((p) => html`<a class="card" href="${mapsDir(p.q)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><span class="tag">${p.t}</span><h3>${p.n}</h3><span class="meta">${p.d != null ? p.d.toFixed(1) + ' km away · ' : ''}Get directions</span></a>`)}` : html`<div class="empty"><b>No match here</b>Try “Search all of Google Maps”.</div>`);
  };
  $('#ps', root).oninput = (e) => { term = e.target.value.trim().toLowerCase(); $('#gs2', root).href = mapsQ(e.target.value + ' Imo State Nigeria'); plist(); };
  $('#loc', root).onclick = () => {
    const m = $('#locmsg', root);
    if (!navigator.geolocation) { m.textContent = 'This browser cannot share location.'; return; }
    m.textContent = 'Asking for your location…';
    navigator.geolocation.getCurrentPosition((pos) => {
      here = { lat: pos.coords.latitude, lng: pos.coords.longitude }; m.textContent = 'Showing places nearest to you.'; plist();
      if (gmap && window.google) { gmap.setCenter(here); gmap.setZoom(14); gmark?.setMap?.(null); gmark = new google.maps.Marker({ map: gmap, position: here, title: 'You are here' }); }
    }, (err) => { m.textContent = err.code === 1 ? 'Location is off for this site. You can still search places above, or allow location in your browser settings.' : 'Could not get your location. Try again outdoors or use search.'; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  };
  const open = (q) => window.open(mapsQ(q), '_blank', 'noopener');
  const bind = () => $$('.pin', root).forEach((g) => { g.onclick = () => open(g.dataset.q); g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(g.dataset.q); } }; });
  bind();
  let iv = 0;
  const fallback = (why) => { put($('#mapin', root), schematic(liveHour())); put($('#lg', root), html`<span>${why}</span><span><i style="background:#2E9B5E"></i>Moving</span><span><i style="background:#E8A33D"></i>Busy</span><span><i style="background:#C73B2A"></i>Slow</span>`); bind(); };
  if (key) {
    loadGoogle(key).then(async (g) => {
      const { AdvancedMarkerElement } = await g.maps.importLibrary('marker'); const { Map: GMap, TrafficLayer } = await g.maps.importLibrary('maps');
      const map = new GMap($('#gmap', root), { center: { lat: 5.485, lng: 7.035 }, zoom: 12, mapId: me.config.mapId || 'DEMO_MAP_ID', gestureHandling: 'cooperative' });
      new TrafficLayer().setMap(map); gmap = map;
      PLACES.forEach((p) => { const m = new AdvancedMarkerElement({ map, position: { lat: p.lat, lng: p.lng }, title: p.n }); m.addListener('click', () => open(p.q)); });
    }).catch(() => fallback('Google Maps could not load, so this is the simulated map.'));
  } else iv = setInterval(() => { const m = $('#mapin', root); if (m && !$('#gmap', root)) { put(m, schematic(liveHour())); bind(); } }, 60000);
  return { stop: () => clearInterval(iv) };
}

// ---- ask ----
export function askView(root, me) {
  const hist = [];
  put(root, html`<div class="stack" data-view="ask">${band('Ask', 'Ask Ndi Igbo', 'Learn Igbo phrases, customs and what to see. For live facts, use the other tabs.')}
    ${me.config.ask ? '' : html`<p class="banner">Ask is not switched on yet. The site owner needs to add an Anthropic key.</p>`}
    <div class="card"><div class="msgs" id="msgs" aria-live="polite"><div class="bub">Hello! Ask me how to greet someone, what a word means, or what to see in Owerri.</div></div>
    <form class="askform" id="af"><label class="sr" for="aq">Your question</label><input id="aq" maxlength="1000" autocomplete="off" placeholder="How do I say good morning?" ${me.config.ask ? '' : 'disabled'}><button class="btn" ${me.config.ask ? '' : 'disabled'}>Send</button></form>
    <div class="chips">${['How do I greet an elder?', 'Teach me 5 Igbo phrases', 'What is new yam festival?'].map((q) => html`<button class="chip" data-q="${q}" ${me.config.ask ? '' : 'disabled'}>${q}</button>`)}</div></div></div>`);
  const box = $('#msgs', root);
  const add = (t, me2) => { const d = document.createElement('div'); d.className = 'bub' + (me2 ? ' me' : ''); d.textContent = t; box.appendChild(d); d.scrollIntoView({ block: 'nearest' }); return d; };
  const send = async (q) => {
    if (!q) return; add(q, true); hist.push({ role: 'user', content: q }); const wait = add('…');
    try { const r = await post('/ask', { messages: hist }); wait.textContent = r.text; hist.push({ role: 'assistant', content: r.text }); }
    catch (e) { wait.textContent = e.message; hist.pop(); }
  };
  $('#af', root).onsubmit = (e) => { e.preventDefault(); const i = $('#aq', root); const q = i.value.trim(); i.value = ''; send(q); };
  $$('[data-q]', root).forEach((b) => { b.onclick = () => send(b.dataset.q); });
  return {};
}
