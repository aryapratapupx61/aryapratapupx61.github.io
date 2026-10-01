/**
 *  GODXSHADOW · shared parsers  (UMD)
 *  Ek hi file Node server aur browser dono use karte hain.
 *    Node : const P = require('./public/parser.js')
 *    Web  : <script src="parser.js"></script>  ->  window.GSParser
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GSParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  let BASE = 'https://sarkariresult.com.cm';
  const setBase = (b) => { if (b) BASE = String(b).replace(/\/+$/, ''); };

  /* ---------------- entities / text ---------------- */
  const ENT = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    copy: '(c)', reg: '(R)', trade: '(TM)', hellip: '...', ndash: '–', mdash: '—',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', deg: '°',
  };

  function decode(str) {
    return String(str == null ? '' : str).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m;
      }
      const k = e.toLowerCase();
      return k in ENT ? ENT[k] : m;
    });
  }

  function text(html) {
    return decode(
      String(html == null ? '' : html)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    )
      .replace(/[​-‏﻿]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const abs = (u) => {
    u = String(u == null ? '' : u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) {
      // insecure links to the source host -> https (mixed-content se bacho)
      return u.replace(/^http:\/\/(sarkariresult\.com\.cm)/i, 'https://$1');
    }
    if (u.startsWith('//')) return 'https:' + u;
    return BASE + (u.startsWith('/') ? u : '/' + u);
  };

  const slugify = (s) =>
    String(s == null ? '' : s).toLowerCase().replace(/&amp;/g, 'and')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* ---------------- lists ---------------- */
  function parseAnchors(block) {
    const out = [];
    const re = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(block))) {
      const title = text(m[2]);
      if (title.length > 2) out.push({ title, url: abs(m[1]) });
    }
    return out;
  }

  function parsePostList(ulHtml) {
    const out = [];
    const re = /<li[^>]*>\s*<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(ulHtml))) {
      const title = text(m[2]);
      if (!title) continue;
      out.push({ title, url: abs(m[1]) });
    }
    return out;
  }

  /* ---------------- homepage ---------------- */
  function parseHome(html) {
    html = String(html == null ? '' : html);
    const firstList = html.indexOf('<ul class="wp-block-latest-posts__list');
    const heads = [...html.matchAll(/<p class="gb-headline[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)];
    const lists = [...html.matchAll(/<ul class="wp-block-latest-posts__list[\s\S]*?<\/ul>/gi)];

    // 1) hot / marquee links (first list se pehle ke saare anchors)
    const marquee = [];
    const seen = new Set();
    for (const h of heads) {
      if (firstList > -1 && h.index > firstList) break;
      for (const a of parseAnchors(h[1])) {
        if (!/sarkariresult\.com\.cm/i.test(a.url)) continue;
        const key = a.url.replace(/\/+$/, '');
        if (seen.has(key)) continue;
        seen.add(key);
        marquee.push(a);
      }
    }

    // 2) sections
    const sections = [];
    const plain = heads
      .map((h) => ({ index: h.index, raw: h[1], title: text(h[1]) }))
      .filter((h) => h.title && !/<a\s/i.test(h.raw) && h.title.length <= 42);

    plain.forEach((h, i) => {
      const nextIdx = i + 1 < plain.length ? plain[i + 1].index : html.length;
      const ul = lists.find((l) => l.index > h.index && l.index < nextIdx);
      if (!ul) return;
      const items = parsePostList(ul[0]);
      if (!items.length) return;
      const moreMatch = html.slice(h.index, nextIdx)
        .match(/href="([^"]+)"[^>]*>\s*<strong>View\s*More<\/strong>/i);
      sections.push({
        id: slugify(h.title),
        title: h.title,
        count: items.length,
        moreUrl: moreMatch ? abs(moreMatch[1]) : '',
        items: items.map((it, n) => ({ ...it, id: 'h-' + slugify(h.title) + '-' + n })),
      });
    });

    const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '';
    const intro = heads.length ? text(heads[0][1]) : '';
    return {
      source: BASE,
      pageTitle: text(title) || 'Sarkari Result',
      intro: intro.length > 220 ? intro.slice(0, 220) : intro,
      marquee, sections,
      fetchedAt: new Date().toISOString(),
    };
  }

  /* ---------------- generic WP listing page ---------------- */
  function parseListing(html) {
    const items = [];
    const re = /<li[^>]*>\s*<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const seen = new Set();
    let m;
    while ((m = re.exec(html))) {
      const title = text(m[2]);
      const url = abs(m[1]);
      if (!title || title.length < 8) continue;
      if (!/sarkariresult\.com\.cm\/[a-z0-9-]+\/$/i.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      items.push({ title, url, date: null });
    }
    return items;
  }

  /* ---------------- inline style re-skin (dark theme) ---------------- */
  const NAMED = {
    black: '#000000', blue: '#0000ff', red: '#ff0000', green: '#008000', maroon: '#800000',
    navy: '#000080', purple: '#800080', gray: '#808080', grey: '#808080', white: '#ffffff',
    orange: '#ffa500', yellow: '#ffff00', silver: '#c0c0c0', teal: '#008080',
  };
  function toRgb(v) {
    v = String(v).trim().toLowerCase();
    if (NAMED[v]) v = NAMED[v];
    if (/^#[0-9a-f]{3}$/.test(v)) return [1, 2, 3].map((i) => parseInt(v[i] + v[i], 16));
    if (/^#[0-9a-f]{6}$/.test(v)) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    return null;
  }
  const lum = (a) => (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) / 255;

  function recolor(c) {
    const rgb = toRgb(c);
    if (!rgb) return c;
    const [r, g, b] = rgb;
    if (b > r + 40 && b > g + 40) return '#8ce9ff';
    if (r > g + 60 && r > b + 60) return '#ff8fb0';
    if (g > r + 40 && g > b + 40) return '#8dffc0';
    return lum(rgb) < 0.34 ? '#eaf3ff' : c;
  }
  function rebg(c) {
    const rgb = toRgb(c);
    if (!rgb) return c;
    const l = lum(rgb);
    if (l > 0.60) return 'rgba(255,206,84,.16)';
    if (l > 0.35) return 'rgba(255,255,255,.07)';
    return c;
  }
  function reskinStyle(s) {
    let out = s
      .replace(/(?:font-size\s*:\s*[\d.]+pt)/gi, 'font-size:14.6px')
      .replace(/(^|[;\s])color\s*:\s*([^;]+)/gi, (m, p, c) => `${p}color:${recolor(c.trim())}`)
      .replace(/background(?:-color)?\s*:\s*([^;]+)/gi, (m, c) => `background:${rebg(c.trim())}`);
    const bg = s.match(/background(?:-color)?\s*:\s*([^;]+)/i);
    if (bg) {
      const rgb = toRgb(bg[1].trim());
      if (rgb) {
        if (lum(rgb) > 0.6) out = out.replace(/(^|[;\s])color\s*:\s*[^;]+/gi, '') + ';color:#ffd66b';
        else if (lum(rgb) < 0.25) out = out.replace(/(^|[;\s])color\s*:\s*[^;]+/gi, '') + ';color:#eaf3ff';
      }
    }
    return out.replace(/;+/g, ';').replace(/^;+|;+$/g, '');
  }

  /* ---------------- post detail ---------------- */
  function parsePost(html, url) {
    html = String(html == null ? '' : html);
    let start = html.search(/<main[\s>]/i);
    let end = html.indexOf('</main>');
    if (start < 0) start = html.search(/<h1[^>]*>/i);
    if (end < 0) end = html.indexOf('site-footer') > 0 ? html.indexOf('site-footer') : html.length;
    let body = html.slice(start > 0 ? start : 0, end > start ? end : html.length);

    body = body
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<ins[\s\S]*?<\/ins>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<form[\s\S]*?<\/form>/gi, '')
      .replace(/<(div|section|p)[^>]*class="[^"]*(adsbygoogle|ad-popup|social-buttons|whatsapp-btn|apply-button|sharedaddy|jp-relatedposts)[^"]*"[\s\S]*?<\/\1>/gi, '')
      .replace(/<a[^>]*href="[^"]*"[^>]*>\s*Download SarkariResult App Now\s*<\/a>/gi, '')
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/href\s*=\s*"\s*javascript:[^"]*"/gi, 'href="#"')
      .replace(/href="(\/[^"]*)"/g, (m, u) => 'href="' + abs(u) + '"')
      .replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer nofollow" ');

    body = body.replace(/<img([^>]*)>/gi, (m, attrs) => {
      if (/src="data:/i.test(attrs)) return '';
      const src = (attrs.match(/src="([^"]+)"/i) || [])[1];
      if (!src) return '';
      return `<img src="${abs(src)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'"${/alt=/.test(attrs) ? '' : ' alt=""'}>`;
    });

    body = body.replace(/http:\/\/sarkariresult\.com\.cm/gi, 'https://sarkariresult.com.cm');
    body = body.replace(/<p[^>]*>\s*(?:&nbsp;|\s|<br\s*\/?>)*<\/p>/gi, '');
    body = body.replace(/style="([^"]*)"/gi, (m, s) => 'style="' + reskinStyle(s) + '"');

    const title =
      text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '') ||
      text((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').split('|')[0];
    const date =
      (html.match(/<time[^>]*datetime="([^"]+)"/i) || [])[1] ||
      (html.match(/"datePublished"\s*:\s*"([^"]+)"/i) || [])[1] || null;

    // quick action links
    const links = [];
    const lseen = new Set();
    const GENERIC = /^(click here|click|here|link|this|visit|go|open|new)$/i;
    const push = (label, u) => {
      label = (label || '').trim();
      if (!label || label.length > 60) return;
      if (/sarkariresult\.com\.cm/i.test(u)) return;
      if (/youtube|whatsapp|telegram|play\.google|facebook|twitter|instagram|t\.me/i.test(u)) return;
      if (lseen.has(u)) return;
      lseen.add(u);
      links.push({ label, url: u });
    };
    for (const row of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1]));
      const lead = cells.find((c) => c.length > 2 && !GENERIC.test(c)) || '';
      for (const a of row[1].matchAll(/<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const raw = text(a[2]);
        push(GENERIC.test(raw) || !raw ? lead : raw, a[1]);
      }
    }
    for (const m of body.matchAll(/<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const raw = text(m[2]);
      if (!GENERIC.test(raw)) push(raw, m[1]);
    }

    return { title, date, url, html: body, links: links.slice(0, 12), fetchedAt: new Date().toISOString() };
  }

  /* ================= LAST-DATE engine =================
     Post ke "Important Dates" table se LAST DATE nikalta hai,
     phir forms ko bucket karta hai: TODAY / SOON / OPEN.
  ====================================================== */
  const MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const pad = (n) => String(n).padStart(2, '0');

  /** string me se pehli date dhoondh kar 'YYYY-MM-DD' de */
  function firstDate(s) {
    s = String(s || '');
    // 27 September 2026  /  27 Sep 2026  /  27-September-2026
    let m = s.match(/(\d{1,2})[\s\-\/.]+([a-zA-Z]{3,9})[\s\-\/.]*(\d{4})/);
    if (m) {
      const mo = MONTHS[m[2].toLowerCase()];
      if (mo) return `${m[3]}-${pad(mo)}-${pad(+m[1])}`;
    }
    // 27/09/2026  /  27-09-2026  /  27.09.2026   (DD-MM-YYYY)
    m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    // 2026-09-27
    m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    return null;
  }

  /** poore post HTML se application ki LAST DATE nikalta hai */
  function extractLastDate(html) {
    const rows = String(html || '').match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const cands = [];
    for (const row of rows) {
      const t = text(row);
      if (!/last\s*date|closing\s*date|last\s*day|last\s*date\s*for/i.test(t)) continue;
      // correction / fee-payment wali alag last date ko ignore karo
      if (/correction|fee\s*payment|re-?exam|edit/i.test(t)) continue;
      const d = firstDate(t);
      if (d) cands.push(d);
    }
    if (!cands.length) {
      const flat = String(html || '').replace(/<[^>]+>/g, ' ');
      const m = flat.match(/(?:last\s*date|closing\s*date)[^.]{0,80}?(\d{1,2}[\s\/\-.]+\w+[\s\/\-.]+\d{4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i);
      if (m) { const d = firstDate(m[1]); if (d) cands.push(d); }
    }
    return cands.length ? cands[0] : null;
  }

  /** aaj ki date IST me (YYYY-MM-DD) */
  function todayIST() {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    } catch (_) {
      return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    }
  }
  const daysBetween = (iso, from) =>
    Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5);

  /**
   * items = [{title,url,lastDate}]  ->  {today, soon, open, unknown}
   * soonDays: aaj ke baad kitne din tak "soon" (default 7)
   */
  function bucketForms(items, soonDays = 7) {
    const t = todayIST();
    const out = { todayISO: t, soonDays, generatedAt: new Date().toISOString(), today: [], soon: [], open: [], unknown: [] };
    const byDate = (a, b) => (a.lastDate < b.lastDate ? -1 : a.lastDate > b.lastDate ? 1 : 0);
    for (const it of items || []) {
      if (!it || !it.lastDate) { out.unknown.push(it); continue; }
      const diff = daysBetween(it.lastDate, t);      // 0 = aaj, >0 = future, <0 = expired
      const row = { ...it, daysLeft: diff };
      if (diff < 0) continue;                        // expired forms chhod do
      if (diff === 0) out.today.push(row);
      else if (diff <= soonDays) out.soon.push(row);
      else out.open.push(row);
    }
    out.today.sort(byDate); out.soon.sort(byDate); out.open.sort(byDate);
    out.running = [...out.today, ...out.soon, ...out.open];
    return out;
  }

  /* ---------------- REST helpers (browser fallback ke liye bhi) ---------------- */
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

  function resolveCategory(cats, slug) {
    const want = norm(slug);
    return (
      cats.find((c) => norm(c.slug) === want) ||
      cats.find((c) => norm(c.slug).startsWith(want) || want.startsWith(norm(c.slug))) ||
      cats.map((c) => ({ c, p: commonPrefix(norm(c.slug), want) }))
        .sort((a, b) => b.p - a.p).filter((x) => x.p >= 6).map((x) => x.c)[0] ||
      null
    );
  }

  const mapPosts = (arr) => (Array.isArray(arr) ? arr : []).map((p) => ({
    id: p.id,
    title: decode(p.title && (p.title.rendered || p.title)),
    url: p.link || p.url,
    date: p.date || null,
    modified: p.modified || null,
  }));

  return {
    BASE, setBase, decode, text, abs, slugify,
    parseAnchors, parsePostList, parseHome, parseListing, parsePost,
    resolveCategory, mapPosts, norm,
    // last-date engine
    firstDate, extractLastDate, todayIST, daysBetween, bucketForms,
  };
});
