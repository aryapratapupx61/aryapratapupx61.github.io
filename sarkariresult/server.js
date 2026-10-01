/**
 *  GODXSHADOW  //  Sarkari Result LIVE
 *  ------------------------------------------------------------
 *  Neon clone of https://sarkariresult.com.cm
 *  - Scrapes the live homepage (sections exactly like the original)
 *  - Uses the site's WordPress REST API for dates / category browse / search
 *  - Proxies & sanitises post pages for the in-app detail view
 *  - In-memory + disk cache with stale-while-revalidate
 *
 *  Zero dependencies. Run:  node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const BASE = 'https://sarkariresult.com.cm';
const PUBLIC = path.join(__dirname, 'public');
const CACHE_FILE = path.join(__dirname, 'data', 'cache.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* ------------------------------------------------------------------ *
 *  shared parsers (same file the browser uses -> public/parser.js)
 * ------------------------------------------------------------------ */
const P = require('./public/parser.js');
P.setBase(BASE);
const { decode, text, abs, slugify } = P;

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

/* ------------------------------------------------------------------ *
 *  http fetch with timeout + retry
 * ------------------------------------------------------------------ */
async function grab(url, { json = false, tries = 2, timeout = 15000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': UA,
          Accept: json ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'en-IN,en-GB;q=0.9,en;q=0.8,hi;q=0.7',
          'Accept-Encoding': 'gzip, deflate',
          Referer: BASE + '/',
          'Cache-Control': 'no-cache',
        },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (json) {
        const headers = {};
        for (const k of ['x-wp-total', 'x-wp-totalpages']) {
          const v = res.headers.get(k);
          if (v) headers[k] = v;
        }
        return { data: await res.json(), headers };
      }
      return { data: await res.text(), headers: {} };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ *
 *  cache: ttl + in-flight dedupe + disk persistence
 * ------------------------------------------------------------------ */
const store = new Map();      // key -> { value, at }
const inflight = new Map();   // key -> Promise

try {
  const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  for (const [k, v] of Object.entries(raw)) store.set(k, v);
  log('cache restored:', store.size, 'keys');
} catch (_) { /* no cache yet */ }

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const obj = {};
      for (const [k, v] of store) obj[k] = v;
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
    } catch (e) { log('cache write failed', e.message); }
  }, 1500);
}

function cached(key, ttl, producer) {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttl * 1000) return Promise.resolve(hit.value);

  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const value = await producer();
      store.set(key, { value, at: Date.now() });
      persist();
      return value;
    } catch (e) {
      if (hit) return hit.value;              // stale fallback
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

/* ------------------------------------------------------------------ *
 *  parsers


/* ------------------------------------------------------------------ *
 *  data sources
 * ------------------------------------------------------------------ */
async function getHome(force = false) {
  if (force) store.delete('home');
  return cached('home', 240, async () => {
    const { data: html } = await grab(BASE + '/');
    const home = P.parseHome(html);
    home.fetchedAt = new Date().toISOString();
    if (!home.sections.length) throw new Error('homepage parse returned 0 sections');
    log('home parsed ->', home.sections.map((s) => `${s.title}:${s.count}`).join(', '));
    return home;
  });
}

async function getCategories() {
  return cached('cats', 3600, async () => {
    const { data } = await grab(`${BASE}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,count`, { json: true });
    const list = (Array.isArray(data) ? data : [])
      .filter((c) => c.count > 0)
      .map((c) => ({ id: c.id, name: P.decode(c.name), slug: c.slug, count: c.count }));
    log('categories ->', list.length);
    return list;
  });
}

async function resolveCategory(slug) {
  const cats = await getCategories();
  return P.resolveCategory(cats, slug);
}

async function getCategory(slug, page = 1, perPage = 60) {
  const key = `cat:${slug}:${page}:${perPage}`;
  return cached(key, 300, async () => {
    // slug may arrive as a full URL (the "View More" link) -> reduce to its path slug
    let slugKey = String(slug);
    if (/^https?:\/\//i.test(slugKey)) {
      try { slugKey = new URL(slugKey).pathname.replace(/^\/|\/$/g, ''); } catch (_) { /* keep */ }
    }
    const cat = await resolveCategory(slugKey);
    let items = [];
    let total = 0;
    if (cat) {
      const { data, headers } = await grab(
        `${BASE}/wp-json/wp/v2/posts?categories=${cat.id}&per_page=${perPage}&page=${page}&orderby=date&order=desc&_fields=id,date,modified,link,title`,
        { json: true }
      );
      total = Number(headers['x-wp-total'] || (Array.isArray(data) ? data.length : 0));
      items = (Array.isArray(data) ? data : []).map((p) => ({
        id: p.id,
        title: P.decode(p.title.rendered),
        url: p.link,
        date: p.date,
        modified: p.modified,
      }));
    }
    if (!items.length) {
      // fallback: scrape the real category page
      const { data: html } = await grab(P.abs(slug.includes('/') ? slug : `/${slug}/`));
      items = P.parseListing(html);
      total = items.length;
    }
    log('category', slug, '->', items.length, 'items (total', total, ')');
    return { slug, name: cat ? cat.name : slug, catId: cat ? cat.id : null, page, total, items, fetchedAt: new Date().toISOString() };
  });
}

async function getLatest(perPage = 40) {
  return cached('latest:' + perPage, 90, async () => {
    const { data } = await grab(
      `${BASE}/wp-json/wp/v2/posts?per_page=${perPage}&orderby=date&order=desc&_fields=id,date,modified,link,title`,
      { json: true }
    );
    const items = (Array.isArray(data) ? data : []).map((p) => ({
      id: p.id,
      title: P.decode(p.title.rendered),
      url: p.link,
      date: p.date,
      modified: p.modified,
    }));
    return { items, fetchedAt: new Date().toISOString() };
  });
}

async function getSearch(q, perPage = 30) {
  const key = `search:${q.toLowerCase()}:${perPage}`;
  return cached(key, 300, async () => {
    const { data } = await grab(
      `${BASE}/wp-json/wp/v2/posts?search=${encodeURIComponent(q)}&per_page=${perPage}&orderby=date&_fields=id,date,link,title`,
      { json: true }
    );
    let items = (Array.isArray(data) ? data : []).map((p) => ({
      id: p.id,
      title: P.decode(p.title.rendered),
      url: p.link,
      date: p.date,
    }));
    if (!items.length) {
      const s = await grab(`${BASE}/wp-json/wp/v2/search?search=${encodeURIComponent(q)}&per_page=${perPage}`, { json: true });
      items = (Array.isArray(s.data) ? s.data : []).map((p) => ({
        id: p.id, title: P.decode(p.title), url: p.url, date: null,
      }));
    }
    return { query: q, items, fetchedAt: new Date().toISOString() };
  });
}

async function getPost(url) {
  if (!/^https?:\/\/sarkariresult\.com\.cm\//i.test(url)) throw new Error('domain not allowed');
  const key = 'post:' + url;
  return cached(key, 900, async () => {
    const { data: html } = await grab(url);
    const post = P.parsePost(html, url);
    post.fetchedAt = new Date().toISOString();
    if (!post.title) throw new Error('post parse failed');
    log('post ->', post.title.slice(0, 60));
    return post;
  });
}

/** RED ZONE — jin forms ki last date aaj hai ya abhi baaki chal rahi hai */
async function getLastDate() {
  return cached('lastdate', 900, async () => {
    // 2 page (WP REST per_page max 100) -> 200 posts scan, taaki red zone me
    // wahi forms aayein jo static snapshot (309 posts) dikhata hai
    const p1 = await grab(
      `${BASE}/wp-json/wp/v2/posts?per_page=100&page=1&orderby=date&order=desc&_fields=id,date,link,title`,
      { json: true }
    );
    const p2 = await grab(
      `${BASE}/wp-json/wp/v2/posts?per_page=100&page=2&orderby=date&order=desc&_fields=id,date,link,title`,
      { json: true }
    ).catch(() => ({ data: [] }));
    const posts = P.mapPosts((p1.data || []).concat(p2.data || []));
    const queue = posts.slice();
    const found = [];
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift();
        if (!it) return;
        try {
          const { data: html } = await grab(it.url);
          const ld = P.extractLastDate(html);
          if (ld) found.push({ title: it.title, url: it.url, date: it.date, lastDate: ld });
        } catch (_) { /* skip */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker(), worker(), worker()]);
    const out = P.bucketForms(found, 7);
    log('lastdate -> today', out.today.length, '/ soon', out.soon.length, '/ open', out.open.length);
    return out;
  });
}

/* ------------------------------------------------------------------ *
 *  http server
 * ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(code, {
    'Content-Type': type,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...extra,
  });
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let u;
  try {
    u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch {
    return send(res, 400, 'bad url', 'text/plain');
  }
  const p = u.pathname;
  const q = u.searchParams;

  const finish = (label) =>
    log(`${req.method} ${p}${u.search ? u.search.slice(0, 60) : ''} -> ${res.statusCode} ${Date.now() - started}ms ${label || ''}`);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'method not allowed', 'text/plain');
    return finish();
  }

  try {
    /* ---------------- API ---------------- */
    if (p === '/api/home') {
      const data = await getHome(q.get('force') === '1');
      send(res, 200, JSON.stringify({ ok: true, ...data }));
      return finish();
    }
    if (p === '/api/latest') {
      const data = await getLatest(Math.min(Number(q.get('per_page')) || 40, 100));
      send(res, 200, JSON.stringify({ ok: true, ...data }));
      return finish();
    }
    if (p === '/api/categories') {
      const data = await getCategories();
      send(res, 200, JSON.stringify({ ok: true, categories: data }));
      return finish();
    }
    if (p === '/api/category') {
      const slug = q.get('slug') || '';
      if (!slug) return send(res, 400, JSON.stringify({ ok: false, error: 'slug required' })), finish();
      const pathOrUrl = q.get('url') || '';
      const data = await getCategory(
        pathOrUrl || slug,
        Math.max(1, Number(q.get('page')) || 1),
        Math.min(Number(q.get('per_page')) || 60, 100)
      );
      send(res, 200, JSON.stringify({ ok: true, ...data }));
      return finish();
    }
    if (p === '/api/search') {
      const term = (q.get('q') || '').trim();
      if (term.length < 2) {
        send(res, 200, JSON.stringify({ ok: true, query: term, items: [] }));
        return finish();
      }
      const data = await getSearch(term, Math.min(Number(q.get('per_page')) || 30, 100));
      send(res, 200, JSON.stringify({ ok: true, ...data }));
      return finish();
    }
    if (p === '/api/post') {
      const url = q.get('url') || '';
      if (!url) return send(res, 400, JSON.stringify({ ok: false, error: 'url required' })), finish();
      const data = await getPost(url);
      send(res, 200, JSON.stringify({ ok: true, ...data }));
      return finish();
    }
    if (p === '/api/lastdate') {
      const data = await getLastDate();
      send(res, 200, JSON.stringify({ ok: true, ...data }));
      return finish();
    }
    if (p === '/api/status') {
      const now = Date.now();
      const keys = {};
      for (const [k, v] of store) keys[k] = Math.round((now - v.at) / 1000) + 's ago';
      send(res, 200, JSON.stringify({ ok: true, uptime: Math.round(process.uptime()), keys }));
      return finish();
    }
    if (p === '/api/refresh') {
      store.clear();
      const home = await getHome(true);
      send(res, 200, JSON.stringify({ ok: true, ...home }));
      return finish('(forced)');
    }

    /* ---------------- static ---------------- */
    let file = p === '/' ? '/index.html' : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUBLIC, file);
    if (!full.startsWith(PUBLIC)) return send(res, 403, 'forbidden', 'text/plain'), finish();

    fs.stat(full, (err, st) => {
      if (err || !st.isFile()) {
        // SPA fallback
        fs.readFile(path.join(PUBLIC, 'index.html'), (e2, buf) => {
          if (e2) return send(res, 404, 'not found', 'text/plain'), finish();
          send(res, 200, buf, MIME['.html']);
          finish('(spa)');
        });
        return;
      }
      const ext = path.extname(full).toLowerCase();
      const etag = `W/"${st.size}-${st.mtimeMs}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag });
        return res.end(), finish('(304)');
      }
      fs.readFile(full, (e3, buf) => {
        if (e3) return send(res, 500, 'read error', 'text/plain'), finish();
        send(res, 200, buf, MIME[ext] || 'application/octet-stream', { ETag: etag });
        finish();
      });
    });
  } catch (e) {
    log('ERROR', p, e.message);
    send(res, 502, JSON.stringify({ ok: false, error: e.message || 'upstream error' }));
    finish();
  }
});

server.listen(PORT, HOST, () => {
  log(`GODXSHADOW live server  ->  http://${HOST}:${PORT}`);
  log(`upstream source        ->  ${BASE}`);
  // warm up
  getHome().catch((e) => log('warmup home failed:', e.message));
  getLatest().catch((e) => log('warmup latest failed:', e.message));
  getCategories().catch(() => {});
  // background refresh
  setInterval(() => getLatest().catch(() => {}), 90 * 1000);
  setInterval(() => getHome(true).catch(() => {}), 240 * 1000);
});
