/* ============================================================
   GODXSHADOW · neon glass sarkari-result interface  v2
   Live data  ->  /api/*  ->  sarkariresult.com.cm
   ============================================================ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SEEN_KEY = 'gsx_seen_v1';
const SEEN_MAX = 4000;

/* per-section accent colour + icon */
const ACCENTS = ['#00e5ff', '#ff2bd6', '#5cff9d', '#ffc043', '#8b5cff', '#ff7a9c', '#4dd0ff', '#b388ff', '#7cffcb'];
const ICONS = [
  [/result/i, '🏆'], [/admit/i, '🎫'], [/latest job/i, '💼'], [/answer/i, '🔑'],
  [/document/i, '📄'], [/admission/i, '🎓'], [/10th|iti/i, '🔧'], [/outsourc/i, '🏢'],
  [/syllabus/i, '📚'], [/job/i, '💼'], [/home/i, '⌂'],
];
const iconFor = (t) => (ICONS.find(([re]) => re.test(t)) || [, '◈'])[1];
const accentFor = (i) => ACCENTS[i % ACCENTS.length];

/* home page ke top 3 columns */
const PRIMARY = ['results', 'admit-cards', 'latest-jobs'];

/* hover-flip tile ke 4 columns */
const FLIP_IDS = [
  { id: 'results',     name: 'Results',     acc: '#00e5ff' },
  { id: 'admit-cards', name: 'Admit Cards', acc: '#ff2bd6' },
  { id: 'answer-key',  name: 'Answer Key',  acc: '#ffc043' },
  { id: 'latest-jobs', name: 'Latest Jobs', acc: '#5cff9d' },
];

const state = {
  data: null,
  latest: null,
  entry: { type: 'home' },      // home | category | search
  cat: null, catPage: 1,
  query: '',
  lastDate: null,               // RED ZONE: last-date buckets
  loading: false,
  seen: new Set(),
  firstLoad: true,
  countdown: 60,
  lastOk: null,
  errCount: 0,
  navCount: 0,
};

/* ---------------------------------------------------------- helpers */
async function jget(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const j = await r.json().catch(() => ({ ok: false, error: 'bad json' }));
  if (!r.ok || j.ok === false) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}

/* ---------------------------------------------------------- data source
   LOCAL / NODE HOST  ->  api/* (relative, subfolder me bhi chalega)
   STATIC HOST (GitHub Pages, file://)  ->  /api nahi milta,
   tab browser CORS proxy + shared parser se seedha source site se laata hai
------------------------------------------------------------------------- */
const DS = {
  mode: 'server',     // 'server' | 'snapshot' | 'proxy'
  _index: null,

  async local(file) {
    const r = await fetch(file, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' (' + file + ')');
    const j = await r.json();
    return { ok: true, ...j };
  },

  /** kaun sa data source available hai — server -> snapshot -> proxy */
  async init() {
    try {
      const r = await fetch('api/home', { headers: { Accept: 'application/json' } });
      const j = await r.json();
      if (r.ok && j && j.ok && j.sections && j.sections.length) { this.mode = 'server'; return this.mode; }
    } catch (_) { /* koi backend nahi (GitHub Pages / file://) */ }
    try {
      const j = await this.local('data/home.json');
      if (j.sections && j.sections.length) { this.mode = 'snapshot'; return this.mode; }
    } catch (_) { /* snapshot bhi nahi mila */ }
    this.mode = 'proxy';
    return this.mode;
  },

  home(force) {
    if (this.mode === 'server') return jget('api/home' + (force ? '?force=1' : ''));
    if (this.mode === 'snapshot') return this.local('data/home.json');
    return window.GSProxy.home();
  },
  latest(n) {
    if (this.mode === 'server') return jget(`api/latest?per_page=${n}`);
    if (this.mode === 'snapshot') return this.local('data/latest.json');
    return window.GSProxy.latest(n);
  },
  async category(slug, url, page, perPage) {
    if (this.mode === 'server') {
      return jget(`api/category?slug=${encodeURIComponent(slug)}&url=${encodeURIComponent(url)}&page=${page}&per_page=${perPage}`);
    }
    if (this.mode === 'snapshot') {
      let key = String(slug || '');
      if (/^https?:\/\//i.test(key)) { try { key = new URL(key).pathname.replace(/^\/|\/$/g, ''); } catch (_) {} }
      try { return await this.local(`data/cat-${key}.json`); } catch (_) { /* proxy fallback */ }
    }
    return window.GSProxy.category(slug, url, page, perPage);
  },
  async search(q, perPage) {
    if (this.mode === 'server') return jget(`api/search?q=${encodeURIComponent(q)}&per_page=${perPage}`);
    if (this.mode === 'snapshot') {
      if (!this._index) { try { this._index = await this.local('data/index.json'); } catch (_) { this._index = { items: [] }; } }
      const needle = String(q).toLowerCase();
      const items = (this._index.items || [])
        .filter((i) => (i.title || '').toLowerCase().indexOf(needle) > -1)
        .slice(0, perPage);
      return { query: q, items, fetchedAt: this._index.fetchedAt };
    }
    return window.GSProxy.search(q, perPage);
  },
  /** RED ZONE — last-date buckets (aaj khatam / jald khatam / abhi chal rahe) */
  async lastdate() {
    if (this.mode === 'server') {
      return jget('api/lastdate').catch(() => this.local('data/lastdate.json'));
    }
    return this.local('data/lastdate.json');
  },
  /** index.json se sirf title/date/modified — jab post ka detail local me na ho */
  async metaFor(url) {
    try {
      if (!this._index) this._index = await this.local('data/index.json');
      const key = String(url).replace(/\/+$/, '');
      const it = (this._index.items || []).find((i) => String(i.url).replace(/\/+$/, '') === key);
      return it || null;
    } catch (_) { return null; }
  },
  /**
   * Post detail — kabhi "sabhi proxies failed" jaisa error na aaye isliye 4 step:
   *   1) node server (agar chal raha ho)
   *   2) local snapshot file  -> data/post/<slug>.json (GitHub Pages par yahi)
   *   3) index.json se bana "partial" post (title + date + original link)
   *   4) aakhiri koshish: CORS proxy
   */
  async post(url) {
    const slug = String(url).replace(/\/+$/, '').split('/').pop();
    if (this.mode === 'server') {
      try { return await jget('api/post?url=' + encodeURIComponent(url)); }
      catch (e) { console.warn('api/post failed -> local try:', e.message); }
    }
    try { return await this.local('data/post/' + slug + '.json'); } catch (_) { /* aage badho */ }
    const meta = await this.metaFor(url);
    if (meta) {
      return { title: meta.title, date: meta.date, url: meta.url || url, html: '', links: [], partial: true, fetchedAt: meta.modified };
    }
    try { return await window.GSProxy.post(url); }
    catch (e) {
      // proxy bhi fail -> phir bhi khaali error nahi: original link wala panel
      console.warn('proxy failed:', e.message);
      return { url, html: '', links: [], partial: true };
    }
  },
  clear() { if (window.GSProxy) window.GSProxy.clear(); },
};

function loadSeen() {
  try { state.seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch (_) { state.seen = new Set(); }
}
function saveSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(state.seen).slice(-SEEN_MAX))); }
  catch (_) { /* ignore */ }
}

function ago(d) {
  if (!d) return '';
  const t = new Date(d).getTime();
  if (!t || Number.isNaN(t)) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
const istTime = () => new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
const isFresh = (d) => d && Date.now() - new Date(d).getTime() < 864e5;

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .4s, transform .4s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    setTimeout(() => el.remove(), 420);
  }, 5200);
}

const sections = () => (state.data && state.data.sections) || [];
const findSection = (id) => sections().find((s) => s.id === id) || null;

/* ---------------------------------------------------------- routing */
function hashFor(e) {
  if (e.type === 'category') return '#/c/' + encodeURIComponent(e.slug);
  if (e.type === 'search') return '#/s/' + encodeURIComponent(e.q);
  return '#/';
}
function parseHash() {
  const h = (location.hash || '').replace(/^#/, '');
  if (h.startsWith('/c/')) {
    const slug = decodeURIComponent(h.slice(3));
    const s = findSection(slug);
    return { type: 'category', slug, url: s ? s.moreUrl : '', name: s ? s.title : slug, page: 1 };
  }
  if (h.startsWith('/s/')) return { type: 'search', q: decodeURIComponent(h.slice(3)) };
  return { type: 'home' };
}
function go(entry) {
  const h = hashFor(entry);
  if (location.hash === h) { applyEntry(entry); return; }
  state.navCount++;
  location.hash = h;               // -> hashchange -> applyEntry
}
function goBack() {
  if (state.navCount > 0) { state.navCount--; history.back(); }
  else { window.scrollTo({ top: 0, behavior: 'smooth' }); go({ type: 'home' }); }
}
function goTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

function applyEntry(e) {
  state.entry = e;
  if (e.type === 'category') { renderNav(); renderQuick(); loadCategoryFor(e); return; }
  if (e.type === 'search') {
    const box = $('#search');
    // typing ke waqt value dobara set karne se cursor kood jata hai — tab chhod do
    if (box && document.activeElement !== box) box.value = e.q || '';
    renderNav(); renderQuick(); runSearch(e.q, true); return;
  }
  state.cat = null;
  $('#search').value = '';
  renderNav(); renderQuick(); renderHome();
}

/* ---------------------------------------------------------- data */
async function loadHome(force = false, silent = false) {
  if (state.loading) return;
  state.loading = true;
  if (!silent) setBusy(true);
  try {
    const d = await DS.home(force);
    const isFirst = state.firstLoad;
    const fresh = [];
    d.sections.forEach((s) => s.items.forEach((i) => {
      if (!state.seen.has(i.url)) { fresh.push(i); if (!isFirst) i.isNew = true; }
    }));
    state.data = d;
    state.lastOk = Date.now();
    state.errCount = 0;
    if (isFirst) state.firstLoad = false;
    state.seen = new Set([...state.seen, ...d.sections.flatMap((s) => s.items.map((i) => i.url))]);
    saveSeen();

    renderTicker();
    renderNav();
    renderQuick();
    renderStats();
    $('#intro').textContent = d.intro || 'Live feed from sarkariresult.com.cm';
    if (state.entry.type === 'home') renderHome();

    if (!isFirst && fresh.length) toast(`<b>${fresh.length}</b> नया update — ${esc(fresh[0].title.slice(0, 46))}…`);
    renderRedZone();
    loadLatest();
    loadPrimaryColumns();
    loadRedZone();
  } catch (e) {
    state.errCount++;
    console.error(e);
    if (state.errCount === 1) toast('<b>Sync failed</b> — ' + esc(e.message), 'bad');
    if (!state.data) $('#view').innerHTML =
      `<div class="empty"><b>NO SIGNAL</b>Live feed connect nahi ho paaya: ${esc(e.message)}</div>`;
  } finally {
    state.loading = false;
    setBusy(false);
    state.countdown = 60;
  }
}

/* ---------------------------------------------- HERO BACK = 🔴 RED ZONE
   Jin forms ki LAST DATE aaj hai, ya jo abhi baaki chal rahe hain (future).
   Data: parser.extractLastDate() har post ke "Important Dates" table se date
   nikalta hai, phir bucketForms() usey TODAY / SOON / OPEN me baant deta hai.
------------------------------------------------------------------------- */
async function loadRedZone() {
  // server mode: /api/lastdate ko 10-15s lag sakte hain (200 post scan),
  // isliye pehle snapshot wali file se turant dikha do, phir live se refresh.
  if (DS.mode === 'server' && !state.lastDate) {
    try {
      const s = await DS.local('data/lastdate.json');
      if (s && s.running) { state.lastDate = s; renderRedZone(); }
    } catch (_) { /* file nahi to live ka wait karenge */ }
  }
  try {
    const d = await DS.lastdate();
    if (d && (d.running || d.today || d.soon)) state.lastDate = d;
  } catch (e) {
    console.warn('red zone load failed:', e.message);
  }
  renderRedZone();
}

/** red zone me important shabdon ko highlight karo (neon glow ke saath) */
function hlTitle(s) {
  return esc(s).replace(
    /(last\s+date(?:\s+(?:today|tomorrow|extended|over))?|online\s+form|last\s+chance|form\s+extend)/gi,
    '<b class="hl">$1</b>'
  );
}

function renderRedZone() {
  const box = $('#flipGrid');
  if (!box) return;
  const d = state.lastDate;
  const note = $('#rzNote');

  if (!d) {
    box.className = 'fb-grid rz-grid';
    box.innerHTML = '<div class="rz-wait">🔴 Last-date data load ho raha hai…</div>';
    if (note) note.textContent = 'checking dates…';
    return;
  }

  const soonDays = d.soonDays || 7;
  const all = (d.running || [...(d.today || []), ...(d.soon || []), ...(d.open || [])]).slice(0, 30);
  if (note) {
    note.innerHTML =
      `aaj <b>${(d.today || []).length}</b> · ${soonDays} din me <b>${(d.soon || []).length}</b> · ` +
      `chal rahe <b>${(d.open || []).length}</b>`;
  }

  if (!all.length) {
    box.className = 'fb-grid rz-grid';
    box.innerHTML = '<div class="rz-wait">Abhi koi running form nahi mila — thodi der baad refresh karo.</div>';
    return;
  }

  box.className = 'fb-grid rz-grid';
  box.innerHTML = all.map((it) => {
    const days = it.daysLeft;
    const cls = days === 0 ? 'rz-today' : days <= 3 ? 'rz-danger' : days <= soonDays ? 'rz-soon' : 'rz-open';
    const badge = days === 0 ? '🔴 AAJ' : days === 1 ? '⏳ KAL' : `⏳ ${days}d`;
    const when = new Date(it.lastDate + 'T00:00:00')
      .toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    return `<a class="rz-item ${cls}" data-post="${esc(it.url)}" data-title="${esc(it.title)}">
      <span class="rz-badge">${badge}</span>
      <span class="rz-t">${hlTitle(it.title)}</span>
      <span class="rz-d">${esc(when)}</span>
    </a>`;
  }).join('');
}

/** 3 primary columns ko aur lamba karo — unki category se ~40 items laakar */
async function loadPrimaryColumns() {
  const prim = PRIMARY.map((id) => findSection(id)).filter(Boolean);
  for (const s of prim) {
    try {
      const d = await DS.category(s.id, s.moreUrl, 1, 40);
      const have = new Set(s.items.map((i) => i.url));
      const extra = (d.items || []).filter((i) => !have.has(i.url));
      if (extra.length) {
        s.items = s.items.concat(extra.slice(0, 40 - s.items.length));
        s.count = s.items.length;
      }
    } catch (_) { /* column chhota rehne do */ }
  }
  renderQuick();
  renderStats();
  if (state.entry.type === 'home') renderHome();
}

async function loadLatest() {
  try {
    const d = await DS.latest(40);
    state.latest = d;
    state.seen = new Set([...state.seen, ...d.items.map((i) => i.url)]);
    renderStats();
    if (state.entry.type === 'home') renderHome();
  } catch (_) { /* non-critical */ }
}

function setBusy(on) {
  const chip = $('#liveChip');
  chip.classList.toggle('busy', !!on);
  chip.classList.toggle('err', !on && state.errCount > 0);
  chip.querySelector('.dot').style.animationDuration = on ? '.6s' : '1.6s';
  $('#refreshBtn').classList.toggle('spin', !!on);
}

/* ---------------------------------------------------------- render: chrome */
function renderTicker() {
  const items = (state.data && state.data.marquee) || [];
  const box = $('#ticker');
  if (!items.length) { box.hidden = true; return; }
  box.hidden = false;
  const html = items.map((i) => `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>`).join('');
  $('#tickerTrack').innerHTML = html + html;
}

function renderNav() {
  const cur = state.entry;
  $('#navPills').innerHTML =
    `<button class="pill ${cur.type === 'home' ? 'on' : ''}" data-nav="home">Home</button>` +
    sections().map((s) =>
      `<button class="pill ${cur.type === 'category' && cur.slug === s.id ? 'on' : ''}"
        data-cat="${esc(s.id)}" data-url="${esc(s.moreUrl)}" data-name="${esc(s.title)}">${esc(s.title)}</button>`
    ).join('');
}

/** sabhi sections ke bade glass buttons — har page par dikhte hain */
function renderQuick() {
  const cur = state.entry;
  const secs = sections();
  const home = `<button class="qb home ${cur.type === 'home' ? 'on' : ''}" data-nav="home" style="--acc:#ffffff">
      <span class="dotc"></span> Home</button>`;
  const wire = `<button class="qb" data-wire="1" style="--acc:#5cff9d">
      <span class="dotc"></span> ⚡ Live Wire</button>`;
  const find = `<button class="qb" data-focus="1" style="--acc:#ffc043">
      <span class="dotc"></span> ⌕ Search</button>`;
  const list = secs.map((s, i) => `
    <button class="qb ${cur.type === 'category' && cur.slug === s.id ? 'on' : ''}"
      data-cat="${esc(s.id)}" data-url="${esc(s.moreUrl)}" data-name="${esc(s.title)}"
      style="--acc:${accentFor(i)}">
      <span class="dotc"></span> ${iconFor(s.title)} ${esc(s.title)}
      <span class="cntn">${s.count}</span>
    </button>`).join('');
  $('#quickBar').innerHTML = home + wire + list + find;
}

function renderStats() {
  const d = state.data;
  if (!d) return;
  const total = d.sections.reduce((n, s) => n + s.count, 0);
  const live = (state.latest && state.latest.items) || [];
  $('#stats').innerHTML = `
    <div class="stat"><b>${total}</b><span>live entries</span></div>
    <div class="stat m"><b>${d.sections.length}</b><span>sections</span></div>
    <div class="stat g"><b>${live.length ? ago(live[0].date) : '—'}</b><span>last post</span></div>
    <div class="stat v"><b>${new Date(d.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</b><span>last sync</span></div>`;
  $('#footStatus').textContent =
    `last sync ${new Date(state.lastOk || Date.now()).toLocaleString('en-IN')} · ${total} entries · source sarkariresult.com.cm`;
}

/* ---------------------------------------------------------- render: home */
function renderHome() {
  const secs = sections();
  if (!secs.length) return;

  // top 3 columns: Result | Admit Card | Latest Job
  const prim = PRIMARY.map((id) => secs.find((s) => s.id === id)).filter(Boolean);
  while (prim.length < 3) {
    const next = secs.find((s) => !prim.includes(s));
    if (!next) break;
    prim.push(next);
  }
  const rest = secs.filter((s) => !prim.includes(s));

  const idx = (s) => Math.max(0, secs.indexOf(s));

  $('#view').innerHTML =
    `<div class="grid3">${prim.map((s) => cardHtml(s, idx(s))).join('')}</div>` +
    liveWireCard() +
    (rest.length ? `<div class="grid">${rest.map((s) => cardHtml(s, idx(s))).join('')}</div>` : '');
}

function liveWireCard() {
  const items = (state.latest && state.latest.items) || [];
  if (!items.length) return '';
  const rows = items.slice(0, 14).map((i, n) => `
    <li>
      <a class="item ${n < 3 ? 'fresh' : ''}" data-post="${esc(i.url)}" data-title="${esc(i.title)}">
        <span class="n">${n + 1}</span>
        <span class="t">${esc(i.title)}</span>
        <span class="rd ${isFresh(i.date) ? 'hot' : ''}">${esc(ago(i.date))}</span>
        <span class="go">›</span>
      </a>
    </li>`).join('');
  return `
  <section class="card" style="--acc:#5cff9d;grid-column:1/-1;margin-bottom:18px" id="liveWire"><span class="glassfx" aria-hidden="true"></span>
    <div class="card-head">
      <span class="ic">⚡</span>
      <h2>Live Wire</h2>
      <span class="cnt">${items.length}</span>
      <span class="more" style="margin-left:auto">newest posts · auto-sync 60s</span>
    </div>
    <ul class="list">${rows}</ul>
  </section>`;
}

function cardHtml(s, i) {
  const acc = accentFor(i);
  const rows = s.items.map((it, n) => `
    <li>
      <a class="item ${it.isNew ? 'isnew' : ''}" data-post="${esc(it.url)}" data-title="${esc(it.title)}">
        <span class="n">${n + 1}</span>
        <span class="t">${esc(it.title)}</span>
        <span class="go">›</span>
      </a>
    </li>`).join('');
  return `
  <section class="card" style="--acc:${acc}"><span class="glassfx" aria-hidden="true"></span>
    <div class="card-head">
      <span class="ic">${iconFor(s.title)}</span>
      <h2>${esc(s.title)}</h2>
      <span class="cnt">${s.count}</span>
      <span class="more" data-cat="${esc(s.id)}" data-url="${esc(s.moreUrl)}" data-name="${esc(s.title)}">View More →</span>
    </div>
    <ul class="list">${rows}</ul>
    <div class="card-foot">
      <button class="all" data-cat="${esc(s.id)}" data-url="${esc(s.moreUrl)}" data-name="${esc(s.title)}">
        ${iconFor(s.title)} View All ${esc(s.title)} →
      </button>
    </div>
  </section>`;
}

/* ---------------------------------------------------------- category */
async function loadCategoryFor(e) {
  state.catPage = e.page || 1;
  if (state.catPage === 1) {
    $('#view').innerHTML = `<div class="grid">${Array.from({ length: 3 }).map(skeleton).join('')}</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  try {
    const d = await DS.category(e.slug, e.url, state.catPage, 60);
    if (state.catPage > 1 && state.cat && state.cat.slug === d.slug) {
      state.cat.items = state.cat.items.concat(d.items);
      state.cat.total = d.total;
    } else {
      state.cat = d;
    }
    renderCategory();
  } catch (err) {
    $('#view').innerHTML = `<div class="empty"><b>LOAD FAILED</b>${esc(err.message)}</div>`;
  }
}

function renderCategory() {
  const c = state.cat;
  const rows = c.items.map((i, n) => `
    <div class="row" data-post="${esc(i.url)}" data-title="${esc(i.title)}">
      <span class="rn">${String(n + 1).padStart(2, '0')}</span>
      <span class="rt">${esc(i.title)}</span>
      <span class="rd ${isFresh(i.date) ? 'hot' : ''}">${esc(ago(i.date))}</span>
    </div>`).join('');
  const canMore = c.total > c.items.length;
  $('#view').innerHTML = `
    <div class="head-row">
      <button class="btn-glass" data-nav="home"><span class="ico">←</span> Home</button>
      <button class="btn-glass" data-back="1"><span class="ico">↩</span> Back</button>
      <h2>${esc(c.name || state.entry.name || '')}</h2>
      <span class="meta">${c.items.length} / ${c.total} posts · live from source</span>
    </div>
    <div class="rows">${rows}</div>
    ${canMore ? `<button class="loadmore" id="moreBtn">Load more ↓</button>` : ''}`;
}

function skeleton() {
  return `<div class="skel"><div class="sh"></div>${Array.from({ length: 7 }).map(() => '<div class="sl"></div>').join('')}</div>`;
}

/* ---------------------------------------------------------- search */
let sTimer = null;
function onSearchInput(q) {
  clearTimeout(sTimer);
  const v = (q || '').trim();
  // khaali box -> wapas home
  if (!v) { sTimer = setTimeout(() => go({ type: 'home' }), 250); return; }
  // 1 akshar par kuch mat karo — pehle ye go(home) chala kar INPUT CLEAR kar deta tha
  if (v.length < 2) return;
  sTimer = setTimeout(() => go({ type: 'search', q: v }), 380);
}

async function runSearch(q, fromHash = false) {
  state.query = (q || '').trim();
  // 2 akshar se kam -> ghar/blank, par search box ko CLEAR nahi karenge
  if (state.query.length < 2) {
    if (state.entry.type === 'home') { renderHome(); return; }
    $('#view').innerHTML =
      '<div class="empty"><b>SEARCH</b>Search karne ke liye kam se kam <b>2 akshar</b> likho…</div>';
    return;
  }
  $('#view').innerHTML = `<div class="grid">${Array.from({ length: 2 }).map(skeleton).join('')}</div>`;
  if (!fromHash) window.scrollTo({ top: 0, behavior: 'smooth' });
  try {
    const d = await DS.search(state.query, 40);
    if (!d.items.length) {
      $('#view').innerHTML = `
        <div class="head-row">
          <button class="btn-glass" data-nav="home"><span class="ico">←</span> Home</button>
          <button class="btn-glass" data-back="1"><span class="ico">↩</span> Back</button>
          <h2>Search</h2>
        </div>
        <div class="empty"><b>NO MATCH</b>“${esc(state.query)}” ke liye kuch nahi mila.
          Try: RRB, SSC, UPPSC, Bihar, Admit Card…</div>`;
      return;
    }
    const rows = d.items.map((i, n) => `
      <div class="row" data-post="${esc(i.url)}" data-title="${esc(i.title)}">
        <span class="rn">${String(n + 1).padStart(2, '0')}</span>
        <span class="rt">${esc(i.title)}</span>
        <span class="rd ${isFresh(i.date) ? 'hot' : ''}">${esc(ago(i.date))}</span>
      </div>`).join('');
    $('#view').innerHTML = `
      <div class="head-row">
        <button class="btn-glass" data-nav="home"><span class="ico">←</span> Home</button>
        <button class="btn-glass" data-back="1"><span class="ico">↩</span> Back</button>
        <h2>Search · ${esc(state.query)}</h2>
        <span class="meta">${d.items.length} results</span>
      </div>
      <div class="rows">${rows}</div>`;
  } catch (e) {
    $('#view').innerHTML = `<div class="empty"><b>SEARCH FAILED</b>${esc(e.message)}</div>`;
  }
}

/* ---------------------------------------------------------- post drawer */
let drawerUrl = '';

/** drawer ke andar post render karta hai (success + retry dono yahi use karenge) */
function paintPost(p) {
  $('#drawerTitle').textContent = p.title;
  const links = p.links && p.links.length
    ? `<div class="links-grid">${p.links.map((l) =>
        `<a href="${esc(l.url)}" target="_blank" rel="noopener nofollow"><span>${esc(l.label)}</span>↗</a>`).join('')}</div>`
    : '';
  const html = (p.html || '')
    .replace(/<main[^>]*>/i, '').replace(/<\/main>/i, '')
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '');
  $('#drawerBody').innerHTML =
    `<div class="pmeta">
       ${p.date ? `<span class="chip">📅 ${esc(new Date(p.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</span>` : ''}
       <span class="chip m">⚡ ${esc(DS.mode === 'snapshot' ? 'snapshot' : 'live')} · ${esc(new Date(p.fetchedAt || Date.now()).toLocaleTimeString('en-IN'))}</span>
     </div>
     ${links}
     <div class="post">${html}</div>`;
}

/** "⟳ Live fetch" button — fail hone par bhi seedha original link dikhao */
function wireTryLive(url) {
  const btn = document.querySelector('#tryLive');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Trying…';
    try {
      if (!window.GSProxy) throw new Error('proxy unavailable');
      paintPost(await window.GSProxy.post(url));
    } catch (e2) {
      btn.disabled = false; btn.textContent = '⟳ Live fetch try karo';
      toast('<b>Live fetch abhi possible nahi</b> — upar <b>↗ Original site par kholo</b> se padho', 'bad');
      console.warn('live fetch failed:', e2.message);
    }
  });
}

/**
 * Post ka detail snapshot me nahi mila (bilkul naya post) —
 * tab bhi khaali error nahi: title + date + seedha original link.
 */
function paintPartial(p) {
  const when = p.date
    ? new Date(p.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  $('#drawerTitle').textContent = p.title || 'Post';
  $('#drawerBody').innerHTML = `
    <div class="post">
      <div class="empty">
        <b>🆕 YE POST ABHI SNAPSHOT ME NAHI AAYA</b>
        Ye bilkul naya post hai. Site <b>har 30 minute me auto-update</b> hoti hai —
        thodi der baad yahin poori detail khul jayegi.
        ${when ? `<div class="pmeta">Published: ${esc(when)}</div>` : ''}
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px">
          <a class="btn-glass" href="${esc(p.url)}" target="_blank" rel="noopener">↗ Original site par kholo</a>
          <button class="btn-glass" id="tryLive">⟳ Live fetch try karo</button>
        </div>
      </div>
    </div>`;
  wireTryLive(p.url);
}

/** koi aur wajah se load fail ho to bhi hamesha original link do */
function paintPostFallback(url, err) {
  console.warn('post load failed:', err && err.message);
  $('#drawerBody').innerHTML = `
    <div class="empty">
      <b>📄 DETAIL LOAD NAHI HO PAAYA</b>
      Network ya snapshot issue aa gaya. Post seedha original site par padh sakte ho.
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px">
        <a class="btn-glass" href="${esc(url)}" target="_blank" rel="noopener">↗ Original site par kholo</a>
        <button class="btn-glass" id="tryLive">⟳ Dobara try karo</button>
        <button class="btn-glass" id="reloadBtn">⟳ Page refresh</button>
      </div>
    </div>`;
  const rl = document.querySelector('#reloadBtn');
  if (rl) rl.addEventListener('click', () => location.reload());
  wireTryLive(url);
}

async function openPost(url, title) {
  drawerUrl = url;
  $('#drawer').hidden = false;
  $('#scrim').hidden = false;
  $('#drawerTitle').textContent = title || 'Loading…';
  $('#drawerOpen').href = url;
  $('#drawerBody').innerHTML =
    '<div class="post">' + Array.from({ length: 8 }).map(() =>
      '<div class="sl" style="height:14px;margin:16px 0;border-radius:7px;background-size:200% 100%;animation:shim 1.4s infinite"></div>').join('') + '</div>';
  document.body.style.overflow = 'hidden';
  try {
    const p = await DS.post(url);
    if (drawerUrl !== url) return;
    if (!p || !p.title) throw new Error('empty post');
    if (p.partial) { paintPartial(p); return; }
    paintPost(p);
  } catch (e) {
    if (drawerUrl !== url) return;
    paintPostFallback(url, e);
  }
}
function closeDrawer() {
  $('#drawer').hidden = true;
  $('#scrim').hidden = true;
  drawerUrl = '';
  document.body.style.overflow = '';
}

/* ---------------------------------------------------------- events */
function wire() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) { goBack(); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav) { go({ type: 'home' }); return; }
    const cat = e.target.closest('[data-cat]');
    if (cat) { go({ type: 'category', slug: cat.dataset.cat, url: cat.dataset.url, name: cat.dataset.name, page: 1 }); return; }
    const post = e.target.closest('[data-post]');
    if (post) { openPost(post.dataset.post, post.dataset.title); return; }
    if (e.target.closest('#moreBtn')) {
      state.catPage++;
      const b = $('#moreBtn');
      if (b) { b.disabled = true; b.textContent = 'Loading…'; }
      loadCategoryFor({ slug: state.cat.slug, url: state.entry.url, page: state.catPage });
      return;
    }
    if (e.target.closest('[data-wire]')) {
      const el = document.querySelector('#liveWire');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else { go({ type: 'home' }); setTimeout(() => document.querySelector('#liveWire')?.scrollIntoView({ behavior: 'smooth' }), 400); }
      return;
    }
    if (e.target.closest('[data-focus]')) { $('#search').focus(); return; }
    // hero ab click se flip nahi hota — sirf upar wala ⇄ switch (hover bhi band)
  });

  $('#brandHome').addEventListener('click', (e) => { e.preventDefault(); goTop(); go({ type: 'home' }); });
  $('#backBtnTop').addEventListener('click', goBack);
  $('#topBtn').addEventListener('click', goTop);
  $('#dockTop').addEventListener('click', goTop);
  $('#dockBack').addEventListener('click', goBack);

  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);

  $('#refreshBtn').addEventListener('click', () => {
    DS.clear();     // static mode me proxy cache bhi saaf
    toast('<b>Syncing…</b> source se fresh data laa rahe hain');
    loadHome(true);
  });
  /* ⇄ FLIP SWITCH — tap: LAST DATE ZONE, dobara tap: SARKARI RESULT wala front */
  const flipBtn = $('#flipSwitch');
  const heroEl = $('#heroFlip');
  function setFlip(on) {
    if (!heroEl) return;
    heroEl.classList.toggle('flipped', on);
    if (flipBtn) {
      flipBtn.classList.toggle('on', on);
      flipBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const lbl = flipBtn.querySelector('.fs-lbl');
      if (lbl) lbl.textContent = on ? 'Sarkari Result' : 'Last Date Zone';
      flipBtn.title = on ? 'Tap karo: SARKARI RESULT wala front' : 'Tap karo: LAST DATE ZONE';
    }
  }
  if (flipBtn) flipBtn.addEventListener('click', () => setFlip(!heroEl.classList.contains('flipped')));

  /* ⛶ FULL VIEW — poori chaudai (wide) view + browser fullscreen ki koshish */
  const fvBtn = $('#fullViewBtn');
  function setFull(on) {
    document.body.classList.toggle('fullview', on);
    if (!fvBtn) return;
    const lbl = fvBtn.querySelector('.lbl');
    if (lbl) lbl.textContent = on ? 'Exit Full View' : 'Full View';
    fvBtn.title = on ? 'Normal view par wapas jao' : 'Poori screen (wide) view';
  }
  if (fvBtn) fvBtn.addEventListener('click', async () => {
    const on = !document.body.classList.contains('fullview');
    setFull(on);
    try {
      if (on && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else if (!on && document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch (_) { /* browser fullscreen allow nahi to sirf wide view hi chalega */ }
  });
  // ESC se fullscreen band hone par label bhi wapas
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('fullview')) setFull(false);
  });

  $('#search').addEventListener('input', (e) => onSearchInput(e.target.value));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#drawer').hidden) closeDrawer();
      else if (state.entry.type !== 'home') go({ type: 'home' });
      else { $('#search').value = ''; goTop(); }
    }
    if (e.key === '/' && document.activeElement !== $('#search')) { e.preventDefault(); $('#search').focus(); }
  });

  window.addEventListener('hashchange', () => applyEntry(parseHash()));

  window.addEventListener('scroll', () => {
    $('#dock').classList.toggle('hide', window.scrollY < 420);
  }, { passive: true });

  setInterval(() => {
    $('#clock').textContent = istTime();
    state.countdown--;
    $('#countdown').textContent = Math.max(0, state.countdown);
    if (state.countdown <= 0 && !state.loading) loadHome(false, true);
  }, 1000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - (state.lastOk || 0) > 90000) loadHome(false, true);
  });
}

/* ---------------------------------------------------------- boot */
function showMode(mode) {
  const el = $('#modeChip');
  if (!el) return;
  if (mode === 'proxy') {
    el.textContent = '☁ static · proxy';
    el.title = 'Koi backend/snapshot nahi mila — CORS proxy se live fetch ho raha hai';
    el.style.color = '#ffc043';
  } else if (mode === 'snapshot') {
    el.textContent = '☁ static · snapshot';
    el.title = 'GitHub Pages: data/*.json snapshot (GitHub Actions har 30 min me refresh karta hai)';
    el.style.color = '#5cff9d';
  } else {
    el.textContent = '⚙ node server';
    el.title = 'Local Node server (server.js) — fastest + full pagination';
    el.style.color = '#00e5ff';
  }
}

async function boot() {
  loadSeen();
  wire();
  $('#clock').textContent = istTime();
  $('#dock').classList.add('hide');
  renderRedZone();                                // turant red-zone panel dikhe
  showMode(await DS.init());                      // server hai ya static?
  loadHome().then(() => applyEntry(parseHash()));
}
boot();
