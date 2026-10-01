#!/usr/bin/env node
/**
 * LinkFetch 🔗 — Link daalo, data pao.
 *
 * Zero-dependency Node.js server:
 *   GET  /            → frontend (public/ folder)
 *   GET  /api/health  → health check
 *   POST /api/fetch   → body: { "url": "https://..." } → link ka saara data JSON me
 *
 * Run it with:  node server.js   (requires Node 18+, no npm install)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const FETCH_TIMEOUT_MS = 15000;          // 15 second timeout
const MAX_BYTES = 10 * 1024 * 1024;      // 10 MB hard limit
const IMAGE_MAX_BYTES = 1.5 * 1024 * 1024; // images up to this size get an inline preview
const RAW_TEXT_LIMIT = 300 * 1024;       // raw text sent to the browser is capped at this

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36 LinkFetch/1.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/* ---------------- helpers ---------------- */

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(buf);
}

function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* SSRF protection: block private/internal addresses */
function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '::1') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.startsWith('fd') || h.startsWith('fe80')) return true; // IPv6 private / link-local
  return false;
}

function decodeEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/g, ' ');
}

function parseAttrs(tag) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

function absolutize(href, base) {
  if (!href) return href;
  if (/^https?:\/\//i.test(href)) return href;
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

/* Extracts title / description / og:* / twitter:* meta from HTML */
function collectMeta(html, baseUrl) {
  const result = {};
  const metaTags = [];
  const linkTags = [];

  const metaRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRe.exec(html))) metaTags.push(parseAttrs(m[0]));
  const linkRe = /<link\b[^>]*>/gi;
  while ((m = linkRe.exec(html))) linkTags.push(parseAttrs(m[0]));

  const byName = (n) => metaTags.find((t) => (t.name || '').toLowerCase() === n);
  const byProp = (p) =>
    metaTags.find((t) => (t.property || '').toLowerCase() === p || (t.itemprop || '').toLowerCase() === p);

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  result.title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : null;
  result.description = byName('description')?.content || byProp('og:description')?.content || null;

  result.ogTitle = byProp('og:title')?.content || null;
  result.ogDescription = byProp('og:description')?.content || null;
  result.ogImage = byProp('og:image')?.content || byName('twitter:image')?.content || null;
  result.ogSiteName = byProp('og:site_name')?.content || null;
  result.ogType = byProp('og:type')?.content || null;
  result.ogUrl = byProp('og:url')?.content || null;

  result.twitterCard = byName('twitter:card')?.content || null;
  result.twitterTitle = byName('twitter:title')?.content || null;
  result.twitterSite = byName('twitter:site')?.content || null;

  const iconTag = linkTags.find((t) => (t.rel || '').toLowerCase().split(/\s+/).includes('icon'));
  result.favicon = iconTag?.href || '/favicon.ico';

  const canonical = linkTags.find((t) => (t.rel || '').toLowerCase() === 'canonical');
  result.canonical = canonical?.href || null;

  const htmlTag = html.match(/<html\b[^>]*>/i);
  if (htmlTag) result.lang = parseAttrs(htmlTag[0]).lang || null;

  try {
    result.ogImage = result.ogImage ? absolutize(result.ogImage, baseUrl) : null;
    result.favicon = result.favicon ? absolutize(result.favicon, baseUrl) : null;
    result.canonical = result.canonical ? absolutize(result.canonical, baseUrl) : null;
    result.ogUrl = result.ogUrl ? absolutize(result.ogUrl, baseUrl) : null;
  } catch {}

  for (const k of Object.keys(result)) {
    if (typeof result[k] === 'string') result[k] = result[k].trim();
    if (result[k] === '') result[k] = null;
  }
  return result;
}

/* Extracts all <a href> links from HTML — to display them in one place */
function extractLinks(html, baseUrl) {
  const items = [];
  const seen = new Set();
  let baseHost = '';
  try { baseHost = new URL(baseUrl).hostname.replace(/^www\./, ''); } catch {}
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && seen.size < 1500) {
    const href = decodeEntities(String(m[1] ?? m[2] ?? m[3] ?? '')).trim();
    if (!href || href.startsWith('#')) continue;
    if (/^(javascript|mailto|tel|sms|data):/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, baseUrl).href; } catch { continue; }
    if (!/^https?:/i.test(abs)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    const text = decodeEntities(String(m[4]).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 120);
    let host = '';
    try { host = new URL(abs).hostname.replace(/^www\./, ''); } catch {}
    items.push({ url: abs, text: text || abs, internal: !!host && host === baseHost });
  }
  const total = items.length;
  return {
    total,
    internalCount: items.filter((i) => i.internal).length,
    externalCount: items.filter((i) => !i.internal).length,
    items: items.slice(0, 1000),
    truncated: total > 1000,
  };
}

function maybeTruncate(text) {
  if (text.length <= RAW_TEXT_LIMIT) return { text, truncated: false };
  return { text: text.slice(0, RAW_TEXT_LIMIT) + '\n\n… (TRUNCATED)', truncated: true };
}

/* ---------------- /api/fetch ---------------- */

async function extractUrlParam(req, res) {
  if (req.method === 'GET') {
    try {
      return (new URL(req.url, 'http://x').searchParams.get('url') || '').trim();
    } catch {
      return '';
    }
  }
  let body;
  try {
    body = JSON.parse((await readBody(req)) || '{}');
  } catch {
    sendJSON(res, 400, { ok: false, error: 'Request body is not valid JSON.' });
    return null;
  }
  return String(body.url || '').trim();
}

async function handleFetchApi(req, res) {
  const rawUrl = await extractUrlParam(req, res);
  if (rawUrl === null) return;
  if (!rawUrl) {
    return sendJSON(res, 400, { ok: false, error: 'URL is required. Example: https://example.com' });
  }

  let urlObj;
  const hasProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawUrl);
  if (hasProto && !/^https?:\/\//i.test(rawUrl)) {
    return sendJSON(res, 400, { ok: false, error: 'Only http:// and https:// links are supported.' });
  }
  try {
    urlObj = new URL(hasProto ? rawUrl : 'https://' + rawUrl);
  } catch {
    return sendJSON(res, 400, { ok: false, error: 'Could not parse the URL — please enter a valid link.' });
  }
  if (isPrivateHost(urlObj.hostname)) {
    return sendJSON(res, 400, {
      ok: false,
      error: 'Private/internal addresses are blocked for security. Only public links are allowed.',
    });
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(urlObj, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
      },
    });

    const headers = {};
    resp.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const contentType = (headers['content-type'] || '').split(';')[0].trim().toLowerCase();

    const out = {
      ok: true,
      requestedUrl: urlObj.href,
      finalUrl: resp.url || urlObj.href,
      redirected: !!resp.redirected,
      status: resp.status,
      statusText: resp.statusText || http.STATUS_CODES[resp.status] || '',
      contentType: contentType || null,
      elapsedMs: Date.now() - started,
      headers,
    };

    const clHeader = headers['content-length'];
    if (clHeader && Number(clHeader) > MAX_BYTES) {
      out.type = 'binary';
      out.tooLarge = true;
      out.size = Number(clHeader);
      out.note = 'Response too large (> 10 MB) — body was not downloaded.';
      return sendJSON(res, 200, out);
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    out.size = buf.length;
    out.elapsedMs = Date.now() - started;

    if (contentType.startsWith('image/')) {
      if (buf.length <= IMAGE_MAX_BYTES) {
        out.type = 'image';
        out.dataUri = 'data:' + (headers['content-type'] || 'image/png') + ';base64,' + buf.toString('base64');
      } else {
        out.type = 'binary';
      }
    } else if (contentType.includes('html') || contentType.includes('xml')) {
      const html = buf.toString('utf8');
      out.type = 'html';
      out.meta = collectMeta(html, out.finalUrl);
      out.links = extractLinks(html, out.finalUrl);
      Object.assign(out, maybeTruncate(html));
    } else if (contentType.includes('json')) {
      const text = buf.toString('utf8');
      out.type = 'json';
      Object.assign(out, maybeTruncate(text));
      try {
        out.json = JSON.parse(text);
      } catch {
        out.jsonParseError = true;
      }
    } else if (/^text\//.test(contentType)) {
      const text = buf.toString('utf8');
      const t = text.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        out.type = 'json';
        Object.assign(out, maybeTruncate(text));
        try {
          out.json = JSON.parse(text);
        } catch {
          out.jsonParseError = true;
        }
      } else {
        out.type = 'text';
        Object.assign(out, maybeTruncate(text));
      }
    } else {
      out.type = 'binary';
    }

    sendJSON(res, 200, out);
  } catch (err) {
    const raw = err && err.name === 'AbortError' ? 'TIMEOUT' : (err && err.cause && err.cause.code) || err.message || 'FETCH_FAILED';
    let friendly = String(raw);
    if (raw === 'TIMEOUT') friendly = `Timeout — no response within ${FETCH_TIMEOUT_MS / 1000}s.`;
    else if (/ENOTFOUND|getaddrinfo/i.test(raw)) friendly = 'Domain not found (DNS error) — please double-check the link.';
    else if (/ECONNREFUSED/i.test(raw)) friendly = 'Connection refused by the target server.';
    else if (/certificate|SSL|TLS/i.test(raw)) friendly = 'SSL/TLS certificate problem.';
    sendJSON(res, 502, { ok: false, error: friendly, elapsedMs: Date.now() - started });
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- /api/scan (JS bundle analyzer) ---------------- */

const NOISE_DOMAINS = new Set([
  'www.w3.org', 'w3.org', 'react.dev', 'nextjs.org', 'radix-ui.com', 'npmjs.com', 'registry.npmjs.org',
  'developer.mozilla.org', 'mozilla.org', 'github.com', 'schema.org', 'purl.org', 'creativecommons.org',
  'www.youtube.com', 'youtube.com', 'www.facebook.com', 'facebook.com', 'www.linkedin.com', 'linkedin.com',
  'x.com', 'twitter.com', 'www.reddit.com', 'reddit.com', 'images.unsplash.com', 'unsplash.com',
  'picsum.photos', 'cdn.jsdelivr.net', 'unpkg.com', 'example.com', 'www.example.com', 'webpack.js.org',
  'nodejs.org', 'tailwindcss.com', 'vitejs.dev', 'vuejs.org', 'angular.io', 'svelte.dev', 'vercel.com',
]);

const INTERESTING_DOMAIN_RE =
  /(api|srv|service|backend|gateway|storage|static|img|media|upload|s3|minio|r2\.|infer|model|-ai\.|\.ai|task|job|worker|queue|data|cdn)/i;

const PROVIDER_PATTERNS = [
  ['🤗 Hugging Face', /\bhuggingface\b|hf\.co|hf-inference|hf-inference-|stability/gi],
  ['🔁 Replicate', /replicate\.(?:com|co)/gi],
  ['🧠 OpenAI', /openai\.com|api\.openai|\bopenai\b/gi],
  ['🪄 Anthropic (Claude)', /anthropic\.(?:com|co)/gi],
  ['✨ Google Gemini', /generativelanguage\.googleapis|aiplatform\.googleapis/gi],
  ['⚡ fal.ai', /fal\.(?:ai|run)/gi],
  ['🎨 Stability AI', /stability\.ai|stablediffusion/gi],
  ['🌊 DeepAI', /deepai\.org/gi],
  ['🦎 Groq', /groq\.(?:com|ai)/gi],
  ['🔀 OpenRouter', /openrouter\.(?:ai|com)/gi],
  ['🤝 Together AI', /together\.ai|api\.together/gi],
  ['📦 ModelScope', /modelscope\.(?:cn|ai)/gi],
  ['🏗️ Baseten', /baseten\.co/gi],
  ['🎬 Runway', /runwayml\.com/gi],
];

const SCAN_MAX_FILES = 40;
const SCAN_MAX_FILE_BYTES = 3 * 1024 * 1024;
const SCAN_FETCH_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function newScanAcc() {
  return {
    domains: new Map(),
    endpoints: new Map(),
    fetchCalls: new Map(),
    providers: new Map(),
    websockets: new Map(),
    storage: new Map(),
    config: new Map(),
    apiUrls: new Map(),
    consts: new Map(),
  };
}

const API_PATH_RE = /\/(?:api|apis|v\d+|graphql|rest|rpc|auth|gql|chain|query|search|feed|srv|service|infer|model)[\/?#]/i;

function addApiUrl(acc, url, context) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  const clean = url.replace(/\{param\}.*$/, '{param}').slice(0, 220);
  const cur = acc.apiUrls.get(clean) || { count: 0, context: context || '' };
  cur.count++;
  if (!cur.context && context) cur.context = context;
  acc.apiUrls.set(clean, cur);
}

function snippet(text, idx, len, radius = 80) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + len + radius);
  return text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 200);
}

function bump(map, key, extra) {
  const cur = map.get(key) || { count: 0, ...extra };
  cur.count++;
  if (extra && extra.sources) cur.sources = new Set([...(cur.sources || []), ...extra.sources]);
  map.set(key, cur);
  return cur;
}

function scanText(code, source, acc) {
  if (!code) return;
  let m;

  // URLs hidden in string constants (const API_URL = "https://...")
  const constRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])(https?:\/\/[^"'`\s]{2,300}|\/(?:api|v\d+|auth|graphql)[^"'`\s]{0,200})\2/g;
  while ((m = constRe.exec(code))) {
    acc.consts.set(m[1], m[2] === '`' ? m[3] : m[3]);
  }

  // absolute URLs
  const urlRe = /https?:\/\/[a-zA-Z0-9._~:-]+(?:\.[a-z]{2,})(?:\/[^\s"'`<>{}\\^]*)?/gi;
  while ((m = urlRe.exec(code))) {
    const url = m[0].replace(/[.,;:)\]}'"]+$/, '');
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    const d = acc.domains.get(host) || { count: 0, samples: [], interesting: false, noise: NOISE_DOMAINS.has(host) };
    d.count++;
    if (!d.interesting && INTERESTING_DOMAIN_RE.test(host)) d.interesting = true;
    if (d.samples.length < 4) d.samples.push(url.length > 130 ? url.slice(0, 130) + '…' : url);
    acc.domains.set(host, d);

    if (/r2\.cloudflarestorage|amazonaws|minio|blob\.core\.windows|storage\.googleapis|\.s3\./i.test(url)) {
      const key = url.slice(0, 160);
      acc.storage.set(key, (acc.storage.get(key) || 0) + 1);
    }
    if (API_PATH_RE.test(url)) addApiUrl(acc, url, snippet(code, m.index, m[0].length, 100));
  }

  // websockets
  const wsRe = /wss?:\/\/[^\s"'`<>{}\\]+/gi;
  while ((m = wsRe.exec(code))) {
    const key = m[0].slice(0, 160);
    acc.websockets.set(key, (acc.websockets.get(key) || 0) + 1);
  }

  // relative API endpoints
  const epRe = /([`"'])(\/(?:api|v\d+|graphql|rest|rpc|auth|gql)\/[^`"']{1,150})\1/g;
  while ((m = epRe.exec(code))) {
    const path = m[2];
    const cur = acc.endpoints.get(path) || { count: 0, sources: new Set(), context: snippet(code, m.index, m[0].length) };
    cur.count++;
    cur.sources.add(source);
    acc.endpoints.set(path, cur);
  }

  // fetch/axios/XHR style calls
  const fcRe = /(?:fetch|axios(?:\.(?:get|post|put|patch|delete))?|\.(?:get|post|put|patch|delete))\(\s*([`"'])([^`'"]{3,200})\1/gi;
  while ((m = fcRe.exec(code))) {
    const val = m[2];
    if (!/^(https?:)?\/\//.test(val) && !val.startsWith('/')) continue;
    if (val.startsWith('//')) continue;
    const cur = acc.fetchCalls.get(val) || { count: 0, sources: new Set(), context: snippet(code, m.index, m[0].length) };
    cur.count++;
    cur.sources.add(source);
    acc.fetchCalls.set(val, cur);
  }

  // fetch(VARIABLE) — resolve the variable from the consts map
  const fcVarRe = /(?:fetch|\.get|\.post|\.put|\.patch|\.delete)\(\s*([A-Za-z_$][\w$]*)\s*(\+|\)|,)/g;
  while ((m = fcVarRe.exec(code))) {
    const val = acc.consts.get(m[1]);
    if (!val || !/^https?:\/\//i.test(val)) continue;
    const url = m[2] === '+' ? val + '{param}' : val;
    const cur = acc.fetchCalls.get(url) || { count: 0, sources: new Set(), context: snippet(code, m.index, m[0].length) };
    cur.count++;
    cur.sources.add(source);
    acc.fetchCalls.set(url, cur);
    if (API_PATH_RE.test(val) || m[2] === '+') addApiUrl(acc, url, snippet(code, m.index, m[0].length, 100));
  }

  // fetch(`${VAR}...`) — template literals
  const fcTplRe = /(?:fetch|\.get|\.post)\(\s*`([^`]{3,250})`/g;
  while ((m = fcTplRe.exec(code))) {
    let tpl = m[1];
    const varRe = /\$\{([^}]+)\}/g;
    let vm;
    let resolved = '';
    let last = 0;
    let hasVar = false;
    while ((vm = varRe.exec(tpl))) {
      resolved += tpl.slice(last, vm.index);
      const name = vm[1].trim().split(/[.+\s(]/)[0];
      const val = acc.consts.get(name);
      if (val) { resolved += val; hasVar = true; } else { resolved += '{param}'; hasVar = true; }
      last = vm.index + vm[0].length;
    }
    resolved += tpl.slice(last);
    if (!/^https?:\/\//i.test(resolved)) continue;
    const url = hasVar ? resolved + (resolved.includes('{param}') ? '' : '{param}') : resolved;
    const cur = acc.fetchCalls.get(url) || { count: 0, sources: new Set(), context: snippet(code, m.index, m[0].length) };
    cur.count++;
    cur.sources.add(source);
    acc.fetchCalls.set(url, cur);
    addApiUrl(acc, url, snippet(code, m.index, m[0].length, 100));
  }

  // VAR + encodeURIComponent(x) — where VAR is a known URL const
  const fcVarCatRe = /\b([A-Za-z_$][\w$]*)\s*\+\s*(?:encodeURIComponent|encodeURI|String)\s*\(/g;
  while ((m = fcVarCatRe.exec(code))) {
    const val = acc.consts.get(m[1]);
    if (!val || !/^https?:\/\//i.test(val)) continue;
    const url = val + '{param}';
    const cur = acc.fetchCalls.get(url) || { count: 0, sources: new Set(), context: snippet(code, m.index, m[0].length) };
    cur.count++;
    cur.sources.add(source);
    acc.fetchCalls.set(url, cur);
    addApiUrl(acc, url, snippet(code, m.index, m[0].length, 100));
  }

  // "https://literal..." + encodeURIComponent(x) — concat detection
  const fcCatRe = /(["'`])(https?:\/\/[^"'`\s]{3,250})\1\s*\+\s*(?:encodeURIComponent\(|String\()?/g;
  while ((m = fcCatRe.exec(code))) {
    const url = m[2] + '{param}';
    const cur = acc.fetchCalls.get(url) || { count: 0, sources: new Set(), context: snippet(code, m.index, m[0].length) };
    cur.count++;
    cur.sources.add(source);
    acc.fetchCalls.set(url, cur);
    addApiUrl(acc, url, snippet(code, m.index, m[0].length, 100));
  }

  // AI provider mentions
  for (const [name, re] of PROVIDER_PATTERNS) {
    re.lastIndex = 0;
    let count = 0;
    let firstCtx = null;
    let mm;
    while ((mm = re.exec(code))) {
      count++;
      if (!firstCtx) firstCtx = snippet(code, mm.index, mm[0].length, 60);
      if (count >= 50) break;
    }
    if (count > 0) {
      const cur = acc.providers.get(name) || { count: 0, context: firstCtx };
      cur.count += count;
      acc.providers.set(name, cur);
    }
  }

  // public env config (NEXT_PUBLIC_* — these are public by design)
  const cfgRe = /(NEXT_PUBLIC_[A-Z0-9_]+)\s*[:=]\s*[`"']([^`"']{0,180})[`"']/g;
  while ((m = cfgRe.exec(code))) {
    if (!acc.config.has(m[1])) acc.config.set(m[1], { value: m[2], source });
  }
}

function collectScripts(html, baseUrl) {
  const srcs = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'>]+))/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1] || m[2] || m[3];
    if (!href) continue;
    const abs = absolutize(href, baseUrl);
    if (/^https?:/i.test(abs)) srcs.push(abs);
  }
  const inline = [];
  const re2 = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = re2.exec(html))) {
    if (m[1].trim().length > 40) inline.push(m[1]);
  }
  return { srcs: [...new Set(srcs)].slice(0, SCAN_MAX_FILES), inline };
}

function shortLabel(url) {
  try {
    const u = new URL(url);
    const base = u.pathname.split('/').pop() || u.hostname;
    return base.split('?')[0].slice(0, 34) || u.hostname;
  } catch {
    return 'file';
  }
}

/* ---------------- /api/subdomains (subdomain finder) ---------------- */

const COMMON_SUB_PREFIXES = [
  'www', 'api', 'app', 'dev', 'staging', 'stage', 'test', 'admin', 'mail', 'portal', 'dashboard',
  'cdn', 'static', 'assets', 'img', 'images', 'media', 'video', 'docs', 'blog', 'shop', 'store',
  'webmail', 'smtp', 'ftp', 'vpn', 'ns1', 'ns2', 'mx', 'git', 'jenkins', 'ci', 'status', 'monitor',
  'logs', 'auth', 'login', 'sso', 'secure', 'pay', 'billing', 'ws', 'socket', 'beta', 'demo',
  'qa', 'internal', 'backup', 'old', 'mobile', 'm', 'support', 'help', 'community', 'download', 'files',
];

/* www. / api. jaise common prefix hatao taaki asli base domain enumerate ho */
function baseDomainForEnum(hostname) {
  const labels = hostname.split('.');
  if (labels.length <= 2) return hostname;
  if (COMMON_SUB_PREFIXES.includes(labels[0])) return labels.slice(1).join('.');
  return hostname;
}

async function handleSubdomainsApi(req, res) {
  const rawUrl = await extractUrlParam(req, res);
  if (rawUrl === null) return;
  if (!rawUrl) return sendJSON(res, 400, { ok: false, error: 'Domain is required. Example: example.com' });

  let host = rawUrl.trim().toLowerCase();
  if (/^https?:\/\//i.test(host)) {
    try { host = new URL(host).hostname; } catch { return sendJSON(res, 400, { ok: false, error: 'Could not parse the URL.' }); }
  }
  host = host.replace(/\.$/, '').replace(/^www\./, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    return sendJSON(res, 400, { ok: false, error: 'Not a valid domain. Example: example.com' });
  }
  if (isPrivateHost(host)) {
    return sendJSON(res, 400, { ok: false, error: 'Private/internal addresses are blocked for security.' });
  }

  const requested = host;
  const domain = baseDomainForEnum(host);
  const started = Date.now();

  const found = new Map(); // host -> { ips:Set, sources:Set }
  const add = (h, ip, src) => {
    h = String(h || '').toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    if (!/^[a-z0-9.-]+$/.test(h)) return;
    if (h !== domain && !h.endsWith('.' + domain)) return;
    const cur = found.get(h) || { ips: new Set(), sources: new Set() };
    if (ip) cur.ips.add(ip);
    cur.sources.add(src);
    found.set(h, cur);
  };
  const fetchWithTimeout = async (url, ms) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, { signal: c.signal, redirect: 'follow', headers: SCAN_FETCH_HEADERS });
      return r;
    } finally { clearTimeout(t); }
  };

  const tasks = [];

  // 1. HackerTarget hostsearch (passive DNS with IPs)
  tasks.push((async () => {
    try {
      const r = await fetchWithTimeout('https://api.hackertarget.com/hostsearch/?q=' + encodeURIComponent(domain), 9000);
      const text = await r.text();
      if (r.ok && text && !/error|exceeded|invalid/i.test(text.slice(0, 100))) {
        text.split(/\r?\n/).forEach((line) => {
          const parts = line.split(',').map((x) => x.trim());
          if (parts[0]) add(parts[0], parts[1], 'HackerTarget');
        });
      }
    } catch {}
  })());

  // 2. RapidDNS
  tasks.push((async () => {
    try {
      const r = await fetchWithTimeout('https://rapiddns.io/subdomain/' + encodeURIComponent(domain) + '?full=1', 9000);
      const html = await r.text();
      const re = new RegExp('<td>([a-zA-Z0-9.-]+\\.' + domain.replace(/\./g, '\\.') + ')</td>', 'g');
      let m;
      while ((m = re.exec(html))) add(m[1], null, 'RapidDNS');
    } catch {}
  })());

  // 3. crt.sh certificate transparency (often slow/down — best effort)
  tasks.push((async () => {
    try {
      const r = await fetchWithTimeout('https://crt.sh/?q=%25.' + encodeURIComponent(domain) + '&output=json', 8000);
      if (r.ok) {
        const arr = await r.json();
        if (Array.isArray(arr)) {
          for (const e of arr) {
            for (const n of String((e && e.name_value) || '').split('\n')) add(n, null, 'crt.sh');
          }
        }
      }
    } catch {}
  })());

  // 4. DNS brute-force of common prefixes (always available, zero dependency)
  tasks.push((async () => {
    const dns = require('dns').promises;
    const DEADLINE = Date.now() + 12000;
    const names = COMMON_SUB_PREFIXES.map((p) => p + '.' + domain);
    const resolveOne = async (h) => {
      if (Date.now() > DEADLINE) return;
      try {
        const ips = await Promise.race([
          dns.resolve4(h),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ]);
        if (ips && ips.length) add(h, ips[0], 'DNS');
      } catch {}
    };
    for (let i = 0; i < names.length; i += 15) {
      await Promise.all(names.slice(i, i + 15).map(resolveOne));
    }
  })());

  await Promise.all(tasks);

  const subs = [...found.entries()]
    .filter(([h]) => h !== domain)
    .map(([h, v]) => ({ host: h, ips: [...v.ips], sources: [...v.sources] }))
    .sort((a, b) => a.host.localeCompare(b.host));

  const bySource = {};
  for (const src of ['HackerTarget', 'RapidDNS', 'crt.sh', 'DNS']) {
    bySource[src] = subs.filter((x) => x.sources.includes(src)).length;
  }

  sendJSON(res, 200, {
    ok: true,
    requested,
    domain,
    count: subs.length,
    sources: bySource,
    subdomains: subs.slice(0, 300),
    truncated: subs.length > 300,
    elapsedMs: Date.now() - started,
  });
}

async function handleScanApi(req, res) {
  const rawUrl = await extractUrlParam(req, res);
  if (rawUrl === null) return;
  if (!rawUrl) return sendJSON(res, 400, { ok: false, error: 'URL is required.' });

  const hasProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawUrl);
  if (hasProto && !/^https?:\/\//i.test(rawUrl)) {
    return sendJSON(res, 400, { ok: false, error: 'Only http:// and https:// links are supported.' });
  }
  let urlObj;
  try {
    urlObj = new URL(hasProto ? rawUrl : 'https://' + rawUrl);
  } catch {
    return sendJSON(res, 400, { ok: false, error: 'Could not parse the URL — please enter a valid link.' });
  }
  if (isPrivateHost(urlObj.hostname)) {
    return sendJSON(res, 400, { ok: false, error: 'Private/internal addresses are blocked for security.' });
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(urlObj, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { ...SCAN_FETCH_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });
    clearTimeout(timer);
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.includes('html') && !ct.includes('xml')) {
      return sendJSON(res, 200, {
        ok: true,
        url: urlObj.href,
        finalUrl: resp.url || urlObj.href,
        status: resp.status,
        elapsedMs: Date.now() - started,
        apiOnly: true,
        contentType: ct,
        scanned: { htmlBytes: 0, inlineScripts: 0, jsFound: 0, jsScanned: 0, totalJsBytes: 0 },
        findings: { providers: [], endpoints: [], apiUrls: [], fetchCalls: [], apiDomains: [], otherDomains: [], otherDomainsTotal: 0, websockets: [], storage: [], config: [] },
        note: 'This URL is not an HTML page — its content-type is <b>' + ct + '</b>. JSON/API endpoints have no JS bundles to scan. Use the 🚀 <b>Fetch</b> button to get its full JSON data.',
      });
    }
    const htmlBuf = Buffer.from(await resp.arrayBuffer());
    if (htmlBuf.length > MAX_BYTES) {
      return sendJSON(res, 400, { ok: false, error: 'Page too large (> 10 MB) — cannot scan.' });
    }
    const html = htmlBuf.toString('utf8');
    const finalUrl = resp.url || urlObj.href;

    const { srcs, inline } = collectScripts(html, finalUrl);
    const acc = newScanAcc();
    scanText(html, 'HTML page', acc);
    inline.forEach((code, i) => scanText(code, 'inline script #' + (i + 1), acc));

    const jsFiles = [];
    const BATCH = 8;
    const SCAN_DEADLINE = started + 25000; // total 25s cap — otherwise the proxy times out
    for (let i = 0; i < srcs.length; i += BATCH) {
      if (Date.now() > SCAN_DEADLINE) break;
      const remaining = Math.max(2000, SCAN_DEADLINE - Date.now());
      const slice = srcs.slice(i, i + BATCH);
      const results = await Promise.all(
        slice.map(async (u) => {
          try {
            const c = new AbortController();
            const t = setTimeout(() => c.abort(), Math.min(10000, remaining));
            const r = await fetch(u, { signal: c.signal, redirect: 'follow', headers: SCAN_FETCH_HEADERS });
            clearTimeout(t);
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.length === 0 || buf.length > SCAN_MAX_FILE_BYTES) return null;
            return { url: u, code: buf.toString('utf8'), size: buf.length };
          } catch {
            return null;
          }
        })
      );
      for (const r of results) if (r) jsFiles.push(r);
    }

    let totalJsBytes = 0;
    for (const f of jsFiles) {
      totalJsBytes += f.size;
      scanText(f.code, shortLabel(f.url), acc);
    }

    const toArr = (map, cap) =>
      [...map.entries()]
        .map(([k, v]) =>
          typeof v === 'object' && v !== null
            ? { key: k, ...v, sources: v.sources ? [...v.sources] : undefined, count: v.count || 1 }
            : { key: k, count: v }
        )
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, cap);

    const allDomains = [...acc.domains.entries()].map(([host, v]) => ({ host, ...v }));
    const apiDomains = allDomains.filter((d) => d.interesting && !d.noise).sort((a, b) => b.count - a.count);
    const otherDomains = allDomains.filter((d) => !d.interesting && !d.noise).sort((a, b) => b.count - a.count);
    const noiseCount = allDomains.filter((d) => d.noise).length;

    sendJSON(res, 200, {
      ok: true,
      url: urlObj.href,
      finalUrl,
      status: resp.status,
      elapsedMs: Date.now() - started,
      scanned: {
        htmlBytes: htmlBuf.length,
        inlineScripts: inline.length,
        jsFound: srcs.length,
        jsScanned: jsFiles.length,
        totalJsBytes,
      },
      findings: {
        providers: toArr(acc.providers, 20).map((p) => ({ name: p.key, count: p.count, context: p.context })),
        endpoints: toArr(acc.endpoints, 150).map((e) => ({ path: e.key, count: e.count, sources: e.sources, context: e.context })),
        apiUrls: toArr(acc.apiUrls, 60).map((u) => ({ url: u.key, count: u.count, context: u.context })),
        fetchCalls: toArr(acc.fetchCalls, 120).map((e) => ({ url: e.key, count: e.count, sources: e.sources, context: e.context })),
        apiDomains: apiDomains.slice(0, 40).map((d) => ({ host: d.host, count: d.count, samples: d.samples })),
        otherDomains: otherDomains.slice(0, 40).map((d) => ({ host: d.host, count: d.count })),
        otherDomainsTotal: otherDomains.length,
        websockets: toArr(acc.websockets, 20).map((w) => ({ url: w.key, count: w.count })),
        storage: toArr(acc.storage, 20).map((s) => ({ url: s.key, count: s.count })),
        config: toArr(acc.config, 60).map((c) => ({ key: c.key, value: c.value, source: c.source })),
      },
    });
  } catch (err) {
    clearTimeout(timer);
    const raw = err && err.name === 'AbortError' ? 'TIMEOUT' : (err && err.cause && err.cause.code) || err.message || 'SCAN_FAILED';
    sendJSON(res, 502, { ok: false, error: 'Scan failed: ' + String(raw).slice(0, 200) });
  }
}

/* ---------------- static files ---------------- */

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    pathname = '/';
  }
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
}

/* ---------------- server ---------------- */

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://x').pathname;
  } catch {}

  if ((req.method === 'POST' || req.method === 'GET') && pathname === '/api/fetch') return handleFetchApi(req, res);
  if ((req.method === 'POST' || req.method === 'GET') && pathname === '/api/scan') return handleScanApi(req, res);
  if ((req.method === 'POST' || req.method === 'GET') && pathname === '/api/subdomains') return handleSubdomainsApi(req, res);
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJSON(res, 200, { ok: true, service: 'linkfetch', time: new Date().toISOString() });
  }
  if (req.method === 'GET') return serveStatic(req, res);

  sendJSON(res, 405, { ok: false, error: 'Method not allowed.' });
});

server.on('error', (e) => {
  console.error('❌ Server error:', e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`✅ LinkFetch is running → http://${HOST}:${PORT}`);
  console.log('   Frontend: GET /        API: POST /api/fetch        JS Scanner: POST /api/scan');
});
