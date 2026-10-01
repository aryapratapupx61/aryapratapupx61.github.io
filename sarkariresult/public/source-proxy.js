/**
 *  GODXSHADOW · static fallback data source
 *  ------------------------------------------------------------
 *  GitHub Pages / kisi bhi static host par /api/* maujood nahi hota.
 *  Tab browser seedha source site se data lata hai ek public CORS proxy
 *  ke through aur usi shared parser (parser.js) se parse karta hai.
 *
 *  Ye file tab hi kaam karti hai jab app.js ko /api/* nahi milta.
 */
window.GSProxy = (function () {
  const BASE = 'https://sarkariresult.com.cm';

  /* public CORS proxies — ek fail ho to agla try hota hai */
  const PROXIES = [
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    (u) => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u),
    (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    (u) => 'https://thingproxy.freeboard.io/fetch/' + u,
  ];
  let preferred = 0;          // last working proxy
  let lastError = null;

  const cache = new Map();
  const getCache = (k, ttl) => {
    const hit = cache.get(k);
    if (hit && Date.now() - hit.at < ttl * 1000) return hit.v;
    return null;
  };
  const setCache = (k, v) => cache.set(k, { v, at: Date.now() });

  async function raw(url, tries) {
    const order = [preferred, ...PROXIES.keys()].filter((v, i, a) => a.indexOf(v) === i);
    let err;
    for (const idx of order) {
      try {
        const r = await fetch(PROXIES[idx](url), { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const t = await r.text();
        if (!t || t.length < 200) throw new Error('empty response');
        preferred = idx;
        return t;
      } catch (e) {
        err = e;
        if (tries === false) break;
      }
    }
    lastError = err;
    throw new Error('Sabhi proxies fail: ' + (err && err.message));
  }

  async function json(url) {
    const t = await raw(url);
    try { return JSON.parse(t); }
    catch (_) { throw new Error('proxy ne JSON nahi diya (blocked?)'); }
  }

  const P = () => window.GSParser;

  /* ---------------- API (server wale jaisa hi shape) ---------------- */

  async function home() {
    const hit = getCache('home', 240);
    if (hit) return hit;
    const html = await raw(BASE + '/');
    const d = P().parseHome(html);
    if (!d.sections.length) throw new Error('homepage parse khali aaya');
    setCache('home', d);
    return d;
  }

  async function latest(perPage = 40) {
    const key = 'latest' + perPage;
    const hit = getCache(key, 90);
    if (hit) return hit;
    const j = await json(`${BASE}/wp-json/wp/v2/posts?per_page=${perPage}&orderby=date&order=desc&_fields=id,date,modified,link,title`);
    const d = { items: P().mapPosts(j), fetchedAt: new Date().toISOString() };
    setCache(key, d);
    return d;
  }

  async function categories() {
    const hit = getCache('cats', 3600);
    if (hit) return hit;
    const j = await json(`${BASE}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,count`);
    const list = (Array.isArray(j) ? j : []).filter((c) => c.count > 0)
      .map((c) => ({ id: c.id, name: P().decode(c.name), slug: c.slug, count: c.count }));
    setCache('cats', list);
    return list;
  }

  async function category(slug, url, page = 1, perPage = 60) {
    const key = `cat:${slug}:${page}:${perPage}`;
    const hit = getCache(key, 300);
    if (hit) return hit;

    let slugKey = String(slug || '');
    if (/^https?:\/\//i.test(slugKey)) {
      try { slugKey = new URL(slugKey).pathname.replace(/^\/|\/$/g, ''); } catch (_) {}
    }

    let items = [];
    let name = slugKey;
    let total = 0;

    try {
      const cats = await categories();
      const cat = P().resolveCategory(cats, slugKey);
      if (cat) {
        name = cat.name;
        const j = await json(
          `${BASE}/wp-json/wp/v2/posts?categories=${cat.id}&per_page=${perPage}&page=${page}&orderby=date&order=desc&_fields=id,date,modified,link,title`
        );
        items = P().mapPosts(j);
        total = cat.count || items.length;
      }
    } catch (_) { /* neeche scrape fallback */ }

    if (!items.length) {
      const html = await raw(url || `${BASE}/${slugKey}/`);
      items = P().parseListing(html);
      total = items.length;
    }

    const d = { slug: slugKey, name, page, total, items, fetchedAt: new Date().toISOString() };
    setCache(key, d);
    return d;
  }

  async function search(q, perPage = 30) {
    const key = 's:' + String(q).toLowerCase() + ':' + perPage;
    const hit = getCache(key, 300);
    if (hit) return hit;
    let items = [];
    try {
      const j = await json(
        `${BASE}/wp-json/wp/v2/posts?search=${encodeURIComponent(q)}&per_page=${perPage}&orderby=date&_fields=id,date,link,title`
      );
      items = P().mapPosts(j);
    } catch (_) { /* ignore */ }
    if (!items.length) {
      try {
        const j = await json(`${BASE}/wp-json/wp/v2/search?search=${encodeURIComponent(q)}&per_page=${perPage}`);
        items = (Array.isArray(j) ? j : []).map((p) => ({
          id: p.id, title: P().decode(p.title), url: p.url, date: null,
        }));
      } catch (_) { /* ignore */ }
    }
    const d = { query: q, items, fetchedAt: new Date().toISOString() };
    setCache(key, d);
    return d;
  }

  async function post(url) {
    const hit = getCache('p:' + url, 900);
    if (hit) return hit;
    const html = await raw(url);
    const d = P().parsePost(html, url);
    setCache('p:' + url, d);
    return d;
  }

  return {
    BASE, home, latest, category, search, post, categories,
    clear() { cache.clear(); },
    get proxyName() { return ['allorigins', 'codetabs', 'corsproxy.io', 'thingproxy'][preferred] || '?'; },
    get lastError() { return lastError; },
  };
})();
