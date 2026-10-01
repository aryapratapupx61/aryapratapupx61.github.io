/* LinkFetch — frontend logic (vanilla JS, no framework) */
const $ = (s) => document.querySelector(s);

const input = $('#urlInput');
const fetchBtn = $('#fetchBtn');
const panels = {
  preview: $('#panel-preview'),
  data: $('#panel-data'),
  raw: $('#panel-raw'),
  headers: $('#panel-headers'),
  scan: $('#panel-scan'),
  links: $('#panel-links'),
  subs: $('#panel-subs'),
};
let current = null;
let scanning = false;
let subsRunning = false;

/* ---------------- helpers ---------------- */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}
function fmtMs(ms) { return ms == null ? '—' : ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(2) + ' s'; }
function plural(n, s) { return n + ' ' + s + (n === 1 ? '' : 's'); }
function safeHost(u) { try { return new URL(u).hostname; } catch { return ''; } }
function shortUrl(u) { const s = u.replace(/^https?:\/\//, ''); return s.length > 38 ? s.slice(0, 36) + '…' : s; }

function highlightJSON(str) {
  str = String(str);
  const re = /("(?:\\.|[^"\\])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(str))) {
    out += esc(str.slice(last, m.index));
    const tok = m[0];
    let cls = 'j-num';
    if (tok[0] === '"') cls = /:\s*$/.test(tok) ? 'j-key' : 'j-str';
    else if (tok === 'true' || tok === 'false') cls = 'j-bool';
    else if (tok === 'null') cls = 'j-null';
    out += '<span class="' + cls + '">' + esc(tok) + '</span>';
    last = m.index + tok.length;
  }
  out += esc(str.slice(last));
  return out;
}

async function copyText(text, btnEl, short) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  if (!btnEl) return;
  logc('ok', 'Copied ' + String(text).length + ' characters');
  const old = btnEl.innerHTML;
  btnEl.innerHTML = short ? '✓' : '✓ Copied';
  setTimeout(() => { btnEl.innerHTML = old; }, 1400);
}

function infoCard(html) { return '<div class="info-card">' + html + '</div>'; }

/* ---------------- live console ---------------- */

const consoleDrawer = $('#consoleDrawer');
const consoleLogEl = $('#consoleLog');
const consoleInputEl = $('#consoleInput');

function logc(level, msg) {
  if (!consoleLogEl) return;
  const t = new Date();
  const ts = [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  const cls = { info: 'c-info', ok: 'c-ok', warn: 'c-warn', err: 'c-err', cmd: 'c-cmd', res: 'c-res' }[level] || 'c-info';
  const div = document.createElement('div');
  div.className = 'c-entry';
  div.innerHTML = '<span class="c-time">' + ts + '</span><span class="' + cls + '"></span>';
  div.lastChild.textContent = String(msg);
  consoleLogEl.appendChild(div);
  while (consoleLogEl.children.length > 300) consoleLogEl.removeChild(consoleLogEl.firstChild);
  consoleLogEl.scrollTop = consoleLogEl.scrollHeight;
}

function consoleToggle(open) {
  if (!consoleDrawer) return;
  const isOpen = consoleDrawer.classList.contains('open');
  const target = open === undefined ? !isOpen : open;
  consoleDrawer.classList.toggle('open', target);
  if (target && consoleInputEl) consoleInputEl.focus();
}

function runCommand(raw) {
  const line = String(raw || '').trim();
  if (!line) return;
  logc('cmd', line);
  const sp = line.indexOf(' ');
  const cmd = (sp === -1 ? line : line.slice(0, sp)).toLowerCase();
  const arg = sp === -1 ? '' : line.slice(sp + 1).trim();

  if (cmd === 'clear') { consoleLogEl.innerHTML = ''; return; }
  if (cmd === 'help') {
    logc('info',
      'Commands:\n' +
      '  fetch <url>     — fetch a link (data + links + auto scan + subdomains)\n' +
      '  scan <url>      — scan a site for hidden APIs\n' +
      '  subs <domain>   — find subdomains\n' +
      '  links           — links from the last fetch\n' +
      '  apis            — API endpoints from the last scan\n' +
      '  json            — JSON from the last fetch\n' +
      '  clear           — clear the console\n' +
      '  help            — this help\n' +
      'Anything else is evaluated as JavaScript, e.g. 6*7 or location.href');
    return;
  }
  if (cmd === 'fetch') {
    if (!arg) return logc('warn', 'Usage: fetch <url>');
    input.value = arg;
    doFetch(arg);
    consoleToggle(false);
    return;
  }
  if (cmd === 'scan') {
    if (!arg) return logc('warn', 'Usage: scan <url>');
    doScan(arg, false);
    consoleToggle(false);
    return;
  }
  if (cmd === 'subs') {
    if (!arg) return logc('warn', 'Usage: subs <domain>');
    doSubdomains(arg, false);
    consoleToggle(false);
    return;
  }
  if (cmd === 'links') {
    const L = current && current.links;
    if (!L || !L.total) return logc('warn', 'No links yet — fetch a website first.');
    logc('res', L.total + ' links (' + L.internalCount + ' internal, ' + L.externalCount + ' external). Full list is in the 🔗 Links tab.');
    (L.items || []).slice(0, 10).forEach((x) => logc('info', '  ' + x.url));
    return;
  }
  if (cmd === 'apis' || cmd === 'endpoints') {
    const eps = window._lastScan && window._lastScan.findings && window._lastScan.findings.endpoints;
    if (!eps || !eps.length) return logc('warn', 'No scan results yet.');
    logc('res', eps.length + ' endpoints. Full details are in the 🔍 API Scan tab.');
    eps.slice(0, 15).forEach((e) => logc('info', '  ' + e.path));
    return;
  }
  if (cmd === 'json') {
    if (!current || (current.json == null && !current.meta)) return logc('warn', 'No data yet — fetch something first.');
    const obj = current.json != null ? current.json : current.meta;
    const str = JSON.stringify(obj, null, 2);
    logc('res', str.length > 2000 ? str.slice(0, 2000) + '\n… (truncated)' : str);
    return;
  }
  /* anything else → JavaScript eval */
  try {
    const result = (0, eval)(line);
    let out;
    if (result instanceof Promise) out = 'Promise';
    else if (typeof result === 'string') out = result;
    else { try { out = JSON.stringify(result); } catch { out = String(result); } }
    logc('res', out === undefined || out === '' ? String(result) : out);
  } catch (e) {
    logc('err', (e && e.message) ? e.message : String(e));
  }
}

/* console listeners */
const consoleToggleBtn = $('#consoleToggle');
if (consoleToggleBtn) consoleToggleBtn.addEventListener('click', () => consoleToggle());
const consoleCloseBtn = $('#consoleClose');
if (consoleCloseBtn) consoleCloseBtn.addEventListener('click', () => consoleToggle(false));
const consoleClearBtn = $('#consoleClear');
if (consoleClearBtn) consoleClearBtn.addEventListener('click', () => { if (consoleLogEl) consoleLogEl.innerHTML = ''; });
if (consoleInputEl) consoleInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { runCommand(consoleInputEl.value); consoleInputEl.value = ''; }
});
window.addEventListener('error', (e) => {
  logc('err', 'JS error: ' + (e.message || 'unknown') + (e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : ''));
});
window.addEventListener('unhandledrejection', (e) => {
  logc('err', 'Unhandled promise rejection: ' + ((e.reason && e.reason.message) || e.reason || 'unknown'));
});
logc('info', 'LinkFetch live console ready — type "help" for commands, press ` to toggle.');

/* ---------------- fetch flow ---------------- */

/* POST (text/plain — no CORS preflight) → GET fallback if a proxy blocks POST.
   Both are "simple" requests, so they work in every environment. */
async function apiCall(path, payload) {
  const qs = Object.entries(payload)
    .map(([k, v]) => k + '=' + encodeURIComponent(v))
    .join('&');
  try {
    const res = await fetch(path + '?t=' + Date.now(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    const ct = res.headers.get('content-type') || '';
    if (res.ok || ct.includes('json')) return res;
  } catch {}
  return fetch(path + '?' + qs + '&t=' + Date.now());
}

const NET_ERR_HINT =
  'Possible reasons: ' +
  '<br>• If you are viewing this page in a <b>file preview</b> (opening index.html from the workspace) — network access is blocked there. ' +
  'Open the <b>live preview</b> of the <b>“LinkFetch website”</b> process in the chat sidebar — that is the real site.' +
  '<br>• If you are already in the live preview, <b>reload</b> the page and try again.';

async function doFetch(url) {
  logc('info', 'Fetch started: ' + url);
  setLoading(true);
  $('#errorArea').innerHTML = '';
  $('#resultArea').hidden = true;
  $('#statusArea').innerHTML =
    '<div class="status-loading"><div class="spinner"></div><span>Fetching: <code>' + esc(url) + '</code> …</span></div>';

  try {
    const res = await apiCall('/api/fetch', { url });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error('Could not read the server response (HTTP ' + res.status + ')');
    }
    $('#statusArea').innerHTML = '';

    if (!data.ok) {
      showError(data.error || 'Something went wrong');
    } else {
      current = data;
      addRecent(url);
      render(data);
      /* fetch button = everything in one click → auto API scan + subdomain discovery */
      logc('ok', 'Fetched ' + safeHost(data.finalUrl) + ' — ' + data.status + ' ' + (data.contentType || '') + ', ' + fmtBytes(data.size));
      if (data.type === 'html') doScan(data.finalUrl, true);
      doSubdomains(safeHost(data.finalUrl), true);
    }
  } catch (e) {
    $('#statusArea').innerHTML = '';
    logc('err', 'Fetch failed: ' + ((e && e.message) || 'network error'));
    showError(
      'Could not connect to the server',
      'Error: <code>' + esc((e && e.message) || 'network error') + '</code><br><br>' + NET_ERR_HINT
    );
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  fetchBtn.disabled = on;
  fetchBtn.innerHTML = on ? '<span class="btn-spinner"></span>Fetching…' : 'Fetch 🚀';
}

function showError(title, detail) {
  $('#resultArea').hidden = true;
  let detailHtml = '';
  if (detail) {
    detailHtml = '<p class="muted small">' + (typeof detail === 'string' ? detail : esc(JSON.stringify(detail))) + '</p>';
  }
  $('#errorArea').innerHTML =
    '<div class="error-card"><div class="error-icon">😕</div><div><h3>' + esc(title) + '</h3>' + detailHtml + '</div></div>';
}

/* ---------------- API scan flow ---------------- */

async function doScan(url, background) {
  if (scanning) return;
  scanning = true;
  logc('info', 'API scan started: ' + url);
  const tab = $('#scanTab');
  const setTab = (label, show) => {
    if (!tab) return;
    tab.innerHTML = label;
    if (show !== undefined) tab.hidden = show;
  };

  if (background) {
    /* background scan: fetch results ko disturb na karo */
    setTab('🔍 API Scan ⏳', false);
    $('#resultArea').hidden = false;
    panels.scan.innerHTML =
      '<div class="status-loading"><div class="spinner"></div><span>Scanning JS bundles for hidden APIs…<br><span class="muted small">this can take 10–30 seconds — you can browse the other tabs meanwhile</span></span></div>';
  } else {
    $('#errorArea').innerHTML = '';
    $('#statusArea').innerHTML =
      '<div class="status-loading"><div class="spinner"></div><span>Downloading & scanning JS bundles: <code>' + esc(url) + '</code> …<br><span class="muted small">this can take 10–30 seconds</span></span></div>';
  }

  try {
    const res = await apiCall('/api/scan', { url });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error('Could not read the server response (HTTP ' + res.status + ')');
    }
    if (!background) $('#statusArea').innerHTML = '';

    if (!data.ok) {
      setTab('🔍 API Scan');
      if (background) {
        panels.scan.innerHTML = infoCard('⚠️ API scan failed: ' + esc(data.error || 'unknown error'));
      } else {
        showError(data.error || 'Scan failed');
      }
    } else {
      window._lastScan = data;
      logc('ok', 'API scan done — ' + ((data.findings || {}).endpoints || []).length + ' endpoints, ' + ((data.findings || {}).apiUrls || []).length + ' API URLs');
      setTab('🔍 API Scan', false);
      if (!background) {
        panels.preview.innerHTML = '';
        panels.data.innerHTML = '';
        panels.raw.innerHTML = '';
        panels.headers.innerHTML = '';
      }
      panels.scan.innerHTML = renderScan(data);
      if (!background) {
        activateTab('scan');
        $('#resultArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  } catch (e) {
    setTab('🔍 API Scan');
    if (background) {
      panels.scan.innerHTML = infoCard('⚠️ API scan failed — could not reach the server.');
    } else {
      $('#statusArea').innerHTML = '';
      showError(
        'Could not connect to the server for the scan',
        'Error: <code>' + esc((e && e.message) || 'network error') + '</code><br><br>' + NET_ERR_HINT
      );
    }
  } finally {
    scanning = false;
  }
}

function epRow(item, mainClass, fetchUrl) {
  const srcs = (item.sources || []).slice(0, 3).map((s) => '<span class="badge">' + esc(s) + '</span>').join(' ');
  const ctx = item.context ? '<div class="ep-ctx" title="' + esc(item.context) + '">' + esc(item.context) + '</div>' : '';
  const label = esc(item.key || item.path || item.url);
  const copyVal = item.key || item.path || item.url || '';
  const main = fetchUrl
    ? '<button class="ep-fetch" data-lf-fetch="' + esc(fetchUrl) + '" title="Click to fetch this URL"><code class="' + mainClass + '">' + label + '</code> <span class="go-pill">Fetch ↗</span></button>'
    : '<code class="' + mainClass + '">' + label + '</code>';
  return (
    '<div class="ep-row">' +
    '<div class="ep-main">' + main +
    '<span class="ep-count">×' + item.count + '</span>' +
    '<button class="row-copy" data-lf-copy="' + esc(copyVal) + '" title="Copy to clipboard">📋</button></div>' +
    '<div class="ep-side">' + srcs + '</div>' +
    ctx +
    '</div>'
  );
}

function section(title, count, inner, extra) {
  if (!count) return '';
  return (
    '<h4 class="section-title">' + title + ' <span class="muted small">(' + plural(count, 'finding') + ')</span></h4>' +
    (extra || '') + inner
  );
}

function renderScan(d) {
  const f = d.findings || {};
  const s = d.scanned || {};

  /* scan on a JSON/API URL → not an error, clear explanation */
  if (d.apiOnly) {
    return (
      '<div class="status-bar" style="margin-top:0">' +
      '<span class="pill ok status-pill">' + d.status + '</span>' +
      '<span class="pill">' + esc(d.contentType || '') + '</span>' +
      '<span class="pill">⏱ ' + fmtMs(d.elapsedMs) + '</span>' +
      '</div>' +
      infoCard(d.note)
    );
  }

  let html =
    '<div class="status-bar" style="margin-top:0">' +
    '<span class="pill ok status-pill">🔍 Scan complete</span>' +
    '<span class="pill">' + plural(s.jsScanned || 0, 'JS file') + ' scanned</span>' +
    (s.jsFound > s.jsScanned ? '<span class="pill warn">' + (s.jsFound - s.jsScanned) + ' skipped (too large/failed)</span>' : '') +
    '<span class="pill">' + fmtBytes(s.totalJsBytes || 0) + ' of JS code</span>' +
    '<span class="pill">⏱ ' + fmtMs(d.elapsedMs) + '</span>' +
    '</div>';

  /* AI providers first */
  const prov = f.providers || [];
  if (prov.length) {
    html +=
      '<h4 class="section-title">🤖 Known AI providers found!</h4>' +
      '<div class="meta-grid">' +
      prov
        .map((p) =>
          '<div class="meta-item provider-hit"><div class="meta-key">' + esc(p.name) + ' ×' + p.count + '</div>' +
          '<div class="meta-val small ep-ctx" title="' + esc(p.context || '') + '">' + esc((p.context || '').slice(0, 150)) + '</div></div>'
        )
        .join('') +
      '</div>';
  } else {
    html += infoCard(
      '🔍 No <b>known AI provider</b> (Hugging Face, OpenAI, Replicate, fal.ai, Stability…) found in the public code.<br>' +
      'This means the site talks to its <b>own backend API</b> — the actual AI processing happens on their servers and is not visible in the browser. ' +
      'See below which backend APIs it uses 👇'
    );
  }

  /* full API URLs — clickable + copyable */
  const urls = f.apiUrls || [];
  if (urls.length) {
    html +=
      '<h4 class="section-title">🎯 Full API URLs — click to fetch, 📋 to copy</h4>' +
      '<div class="api-url-list">' +
      urls.map((u) =>
        '<div class="api-url-row">' +
        '<button class="api-url-btn" data-lf-fetch="' + esc(u.url) + '" title="' + esc(u.context || '') + '">' +
        '<span class="au-url">' + esc(u.url) + '</span>' +
        (String(u.url).indexOf('{param}') !== -1 ? '<span class="au-hint">✏️ Replace {param} with your value, then fetch</span>' : '') +
        '</button>' +
        '<button class="row-copy" data-lf-copy="' + esc(u.url) + '" title="Copy URL">📋</button>' +
        '</div>'
      ).join('') +
      '</div>';
  }

  /* endpoints */
  const eps = f.endpoints || [];
  html += section('🌐 API endpoints', eps.length,
    '<div class="ep-list">' + eps.map((e) => epRow({ ...e, key: e.path }, 'ep-path')).join('') + '</div>',
    '<div class="panel-actions"><button class="ghost-btn" data-copy-scan="endpoints">📋 Copy all endpoints</button></div>');

  /* fetch calls */
  const fcs = f.fetchCalls || [];
  html += section('📞 fetch/axios calls (resolved)', fcs.length,
    '<div class="ep-list">' + fcs
      .map((e) => epRow({ ...e, key: e.url }, 'ep-path', /^https?:\/\//.test(e.url) ? e.url.replace(/\{param\}.*$/, '') : null))
      .join('') + '</div>');

  /* backend domains */
  const apiDom = f.apiDomains || [];
  if (apiDom.length) {
    html +=
      '<h4 class="section-title">🖥️ Backend / service domains <span class="muted small">(' + apiDom.length + ')</span></h4>' +
      '<div class="dom-list">' +
      apiDom
        .map((dm) =>
          '<div class="dom-item"><div class="dom-head"><code>' + esc(dm.host) + '</code><span class="ep-count">×' + dm.count + '</span></div>' +
          (dm.samples || []).map((u) => '<div class="ep-ctx" title="' + esc(u) + '">' + esc(u) + '</div>').join('') +
          '</div>'
        )
        .join('') +
      '</div>';
  }

  /* storage */
  const st = f.storage || [];
  html += section('💾 Cloud storage / buckets', st.length,
    '<div class="ep-list">' + st.map((x) => epRow({ key: x.url, count: x.count }, 'ep-path')).join('') + '</div>');

  /* websockets */
  const ws = f.websockets || [];
  html += section('🔌 WebSockets', ws.length,
    '<div class="ep-list">' + ws.map((x) => epRow({ key: x.url, count: x.count }, 'ep-path')).join('') + '</div>');

  /* config */
  const cfg = f.config || [];
  html += section('⚙️ Public config (NEXT_PUBLIC_*)', cfg.length,
    '<div class="meta-grid">' +
    cfg.map((c) => '<div class="meta-item"><div class="meta-key">' + esc(c.key) + '</div><div class="meta-val small">' + esc(c.value || '(empty)') + '</div></div>').join('') +
    '</div>');

  /* other domains (collapsible) */
  const others = f.otherDomains || [];
  if (others.length) {
    html +=
      '<details class="api-box" style="margin-top:18px"><summary>🌐 Other domains (' + others.length +
      (f.otherDomainsTotal > others.length ? '+' + (f.otherDomainsTotal - others.length) + ' more' : '') + ')</summary>' +
      '<div class="dom-pills" style="margin-top:12px">' +
      others.map((dm) => '<span class="pill" title="×' + dm.count + '">' + esc(dm.host) + ' <span class="muted">×' + dm.count + '</span></span>').join('') +
      '</div></details>';
  }

  if (!eps.length && !fcs.length && !apiDom.length && !st.length) {
    html += infoCard('Hmm — no notable API endpoints were found on this page. It might be a simple static page, or its APIs may be loaded from another subdomain/app.');
  }

  return html;
}

/* ---------------- renderers (fetch) ---------------- */

function statusHTML(d) {
  const cls = d.status < 300 ? 'ok' : d.status < 400 ? 'warn' : 'bad';
  const redirect = d.redirected
    ? '<span class="final-url">↪️ ' + esc(d.requestedUrl) + ' → <b>' + esc(d.finalUrl) + '</b></span>'
    : '<span class="final-url">' + esc(d.finalUrl) + '</span>';
  return (
    '<div class="status-bar">' +
    '<span class="pill ' + cls + ' status-pill">' + d.status + ' ' + esc(d.statusText) + '</span>' +
    '<span class="pill">' + esc(d.contentType || 'unknown type') + '</span>' +
    '<span class="pill">' + fmtBytes(d.size) + '</span>' +
    '<span class="pill">⏱ ' + fmtMs(d.elapsedMs) + '</span>' +
    (d.redirected ? '<span class="pill warn">↪️ Redirected</span>' : '') +
    redirect +
    '</div>'
  );
}

function render(d) {
  current = d;
  $('#statusArea').innerHTML = statusHTML(d);
  $('#resultArea').hidden = false;
  panels.preview.innerHTML = renderPreview(d);
  panels.data.innerHTML = renderData(d);
  panels.raw.innerHTML = renderRaw(d);
  panels.headers.innerHTML = renderHeaders(d);
  panels.links.innerHTML = d.links ? renderLinks(d) : '';
  const linksTabEl = $('#linksTab');
  if (linksTabEl) linksTabEl.hidden = !d.links;
  const stEl = $('#scanTab');
  if (stEl) stEl.hidden = true;
  const subTabReset = $('#subsTab');
  if (subTabReset) { subTabReset.hidden = true; subTabReset.innerHTML = '🌐 Subdomains'; }
  activateTab(d.type === 'json' ? 'data' : 'preview');
  $('#resultArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPreview(d) {
  if (d.type === 'image') {
    return (
      '<div class="image-view">' +
      '<img src="' + esc(d.dataUri) + '" alt="fetched image">' +
      '<p class="muted small">🖼️ Image response — ' + esc(d.contentType || '') + ', ' + fmtBytes(d.size) + '</p>' +
      '</div>'
    );
  }
  if (d.type === 'binary') {
    return infoCard(
      '📦 This is a <b>binary response</b> (' + esc(d.contentType || 'unknown type') + ', ' + fmtBytes(d.size) + ').' +
      (d.note ? '<br>' + esc(d.note) : '') + ' Check the ℹ️ <b>Headers</b> tab for details.'
    );
  }
  if (d.type === 'json') {
    return infoCard('🎉 This is a <b>JSON API</b> response — the full data is in the 🧬 <b>Data / JSON</b> tab with syntax highlighting.');
  }
  if (d.type === 'text') {
    return infoCard('📄 This is a plain-text response — see the content in the 📝 <b>Raw</b> tab.');
  }

  /* html/xml → link preview card + metadata */
  const m = d.meta || {};
  const domain = safeHost(d.finalUrl);
  const img = m.ogImage;
  const favicon = m.favicon
    ? '<img src="' + esc(m.favicon) + '" alt="" onerror="this.style.display=\'none\'">'
    : '🌐';

  return (
    '<div class="link-card">' +
    (img ? '<div class="lc-img" style="background-image:url(\'' + esc(img) + '\')"></div>' : '') +
    '<div class="lc-body">' +
    '<div class="lc-domain">' + favicon + '<span>' + esc(domain) + '</span></div>' +
    '<h3 class="lc-title">' + esc(m.ogTitle || m.title || '(no title found)') + '</h3>' +
    '<p class="lc-desc">' + esc(m.ogDescription || m.description || '— no description found —') + '</p>' +
    '</div></div>' +
    '<h4 class="section-title">All metadata</h4>' +
    metaGridHTML(m) +
    '<div class="panel-actions" style="margin-top:14px;margin-bottom:0">' +
    '<button class="ghost-btn" data-copy-what="meta">📋 Copy meta JSON</button>' +
    '<button class="ghost-btn" data-scan-current>🔍 Scan this site\u2019s APIs</button>' +
    '</div>'
  );
}

function metaGridHTML(meta) {
  const rows = Object.entries(meta || {}).filter(([, v]) => v != null && v !== '');
  if (!rows.length) return '<p class="muted small">No metadata found.</p>';
  return (
    '<div class="meta-grid">' +
    rows
      .map(([k, v]) => {
        let val = esc(v);
        if (k === 'ogImage') val += '<br><img src="' + esc(v) + '" alt="og:image" onerror="this.style.display=\'none\'">';
        return '<div class="meta-item"><div class="meta-key">' + esc(k) + '</div><div class="meta-val">' + val + '</div></div>';
      })
      .join('') +
    '</div>'
  );
}

function renderData(d) {
  if (d.jsonParseError) return infoCard('⚠️ The JSON could not be parsed (invalid JSON) — see the 📝 <b>Raw</b> tab.');

  let obj = null, label = '';
  if (d.json !== undefined && d.json !== null) {
    obj = d.json;
    label = '🧬 API JSON response';
  } else if (d.meta) {
    obj = d.meta;
    label = '📄 Page metadata (as JSON)';
  }
  if (obj == null) {
    return infoCard('This response is not JSON — see the raw content in the 📝 <b>Raw</b> tab.');
  }

  const pretty = JSON.stringify(obj, null, 2);
  let body;
  if (pretty.length > 500000) {
    body = '<pre><code>' + esc(pretty.slice(0, 500000)) + '\n\n/* … TRUNCATED — use the Download button below to get everything … */</code></pre>';
  } else {
    body = '<pre><code>' + highlightJSON(pretty) + '</code></pre>';
  }

  return (
    '<p class="muted small" style="margin-bottom:12px">' + label + ' — ' + fmtBytes(pretty.length) + '</p>' +
    '<div class="panel-actions">' +
    '<button class="ghost-btn" data-copy-what="json">📋 Copy JSON</button>' +
    '<button class="ghost-btn" id="dlJson">⬇️ Download .json</button>' +
    '</div>' + body
  );
}

function renderRaw(d) {
  if (!d.text) {
    return infoCard('This response has no text body (or the content is binary).');
  }
  return (
    '<div class="panel-actions">' +
    '<button class="ghost-btn" data-copy-what="raw">📋 Copy raw</button>' +
    '<span class="pill">' + fmtBytes(d.text.length) + '</span>' +
    '</div>' +
    '<pre><code>' + esc(d.text) + '</code></pre>' +
    (d.truncated ? '<p class="muted small" style="margin-top:10px">⚠️ The content was large — only the first 300 KB is shown.</p>' : '')
  );
}

function renderHeaders(d) {
  const entries = Object.entries(d.headers || {}).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    '<h4 class="section-title">Request info</h4>' +
    '<div class="meta-grid">' +
    '<div class="meta-item"><div class="meta-key">Final URL</div><div class="meta-val">' + esc(d.finalUrl) + '</div></div>' +
    '<div class="meta-item"><div class="meta-key">Method</div><div class="meta-val">GET (server-side)</div></div>' +
    '<div class="meta-item"><div class="meta-key">Redirect</div><div class="meta-val">' + (d.redirected ? 'Yes ↪️' : 'No') + '</div></div>' +
    '<div class="meta-item"><div class="meta-key">Elapsed</div><div class="meta-val">' + fmtMs(d.elapsedMs) + '</div></div>' +
    '</div>' +
    '<h4 class="section-title">Response headers (' + entries.length + ')</h4>' +
    '<div>' +
    entries
      .map(([k, v]) => '<div class="hdr-row"><div class="hdr-key">' + esc(k) + '</div><div class="hdr-val">' + esc(v) + '</div></div>')
      .join('') +
    '</div>'
  );
}

/* ---------------- links tab ---------------- */

function renderLinks(d) {
  const L = d.links || { total: 0, items: [], internalCount: 0, externalCount: 0 };
  const items = L.items || [];
  const row = (x) =>
    '<a class="link-item' + (x.internal ? '' : ' ext') + '" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer" data-search="' + esc((x.text + ' ' + x.url).toLowerCase()) + '">' +
    '<span class="li-text">' + esc(x.text || x.url) + '</span>' +
    '<span class="li-url">' + esc(x.url) + '</span></a>';
  const internal = items.filter((x) => x.internal);
  const external = items.filter((x) => !x.internal);
  return (
    '<div class="status-bar" style="margin-top:0">' +
    '<span class="pill ok status-pill">🔗 ' + plural(L.total, 'link') + ' found</span>' +
    '<span class="pill">🏠 Internal: ' + (L.internalCount || 0) + '</span>' +
    '<span class="pill">🌍 External: ' + (L.externalCount || 0) + '</span>' +
    (L.truncated ? '<span class="pill warn">showing the first 1000</span>' : '') +
    '</div>' +
    '<div class="panel-actions">' +
    '<input id="linkFilter" type="text" placeholder="🔎 Search links…" autocomplete="off">' +
    '<button class="ghost-btn" data-copy-links>📋 Copy all URLs</button>' +
    '</div>' +
    (internal.length ? '<h4 class="section-title">🏠 Links on this site (' + internal.length + ')</h4><div class="link-list">' + internal.map(row).join('') + '</div>' : '') +
    (external.length ? '<h4 class="section-title">🌍 Links to other sites (' + external.length + ')</h4><div class="link-list">' + external.map(row).join('') + '</div>' : '') +
    (!items.length ? infoCard('No hyperlinks were found in this page\u2019s HTML. Apps like this (React/Next.js) render their links in the browser with JavaScript — they don\u2019t even appear in “View Source”. Try it on a content site (Wikipedia, news, blogs)!') : '')
  );
}

/* ---------------- subdomains flow ---------------- */

async function doSubdomains(domain, background) {
  if (!domain || subsRunning) return;
  subsRunning = true;
  const tab = $('#subsTab');
  const setTab = (label) => { if (tab) tab.innerHTML = label; };

  if (background) {
    setTab('🌐 Subdomains ⏳');
    tab.hidden = false;
    $('#resultArea').hidden = false;
    panels.subs.innerHTML =
      '<div class="status-loading"><div class="spinner"></div><span>Discovering subdomains…<br><span class="muted small">checking certificate logs, passive DNS and common prefixes</span></span></div>';
  } else {
    $('#statusArea').innerHTML =
      '<div class="status-loading"><div class="spinner"></div><span>Discovering subdomains for <code>' + esc(domain) + '</code> …</span></div>';
  }
  logc('info', 'Subdomain discovery started: ' + domain);

  try {
    const res = await apiCall('/api/subdomains', { url: domain });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error('Could not read the server response (HTTP ' + res.status + ')');
    }
    if (!background) $('#statusArea').innerHTML = '';

    if (!data.ok) {
      setTab('🌐 Subdomains');
      logc('err', 'Subdomain discovery failed: ' + (data.error || 'unknown error'));
      if (background) panels.subs.innerHTML = infoCard('⚠️ ' + esc(data.error || 'Subdomain discovery failed'));
      else showError(data.error || 'Subdomain discovery failed');
    } else {
      window._lastSubs = data;
      setTab('🌐 Subdomains');
      tab.hidden = false;
      panels.subs.innerHTML = renderSubdomains(data);
      logc('ok', 'Subdomains: ' + data.count + ' found for ' + data.domain + ' (' + fmtMs(data.elapsedMs) + ')');
    }
  } catch (e) {
    setTab('🌐 Subdomains');
    if (!background) $('#statusArea').innerHTML = '';
    logc('err', 'Subdomain discovery error: ' + ((e && e.message) || 'network error'));
    if (background) panels.subs.innerHTML = infoCard('⚠️ Subdomain discovery failed — could not reach the server.');
    else showError('Could not connect to the server', esc((e && e.message) || 'network error'));
  } finally {
    subsRunning = false;
  }
}

function renderSubdomains(d) {
  const subs = d.subdomains || [];
  const row = (x) =>
    '<div class="ep-row">' +
    '<div class="ep-main">' +
    '<button class="ep-fetch" data-lf-fetch="https://' + esc(x.host) + '" title="Click to fetch this subdomain"><code class="ep-path">' + esc(x.host) + '</code> <span class="go-pill">Fetch ↗</span></button>' +
    '<button class="row-copy" data-lf-copy="' + esc(x.host) + '" title="Copy host">📋</button></div>' +
    (x.ips && x.ips.length ? '<div class="sub-ips">IP: ' + x.ips.map((i) => esc(i)).join(' · ') + '</div>' : '') +
    '<div class="ep-side">' + (x.sources || []).map((src) => '<span class="badge">' + esc(src) + '</span>').join(' ') + '</div>' +
    '</div>';
  const srcPills = Object.entries(d.sources || {})
    .filter(([, n]) => n > 0)
    .map(([k, n]) => '<span class="pill">' + esc(k) + ': ' + n + '</span>')
    .join('');
  return (
    '<div class="status-bar" style="margin-top:0">' +
    '<span class="pill ok status-pill">🌐 ' + plural(d.count || subs.length, 'subdomain') + ' found</span>' +
    (d.requested && d.requested !== d.domain ? '<span class="pill">base domain: ' + esc(d.domain) + '</span>' : '') +
    '<span class="pill">⏱ ' + fmtMs(d.elapsedMs) + '</span>' +
    (d.truncated ? '<span class="pill warn">showing the first 300</span>' : '') +
    '</div>' +
    '<div class="panel-actions">' +
    '<input id="subFilter" type="text" placeholder="🔎 Filter subdomains…" autocomplete="off">' +
    '<button class="ghost-btn" data-copy-subs>📋 Copy all hosts</button>' +
    '<button class="ghost-btn" data-subs-current>🔄 Find subdomains for ' + esc(d.domain) + '</button>' +
    '</div>' +
    (srcPills ? '<div class="status-bar">' + srcPills + '</div>' : '') +
    (subs.length ? '<div class="ep-list sub-list">' + subs.map(row).join('') + '</div>' : infoCard('No subdomains were found for <b>' + esc(d.domain) + '</b>.'))
  );
}

/* subdomains live-filter + copy + rerun */
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'subFilter') {
    const q = (e.target.value || '').trim().toLowerCase();
    document.querySelectorAll('#panel-subs .ep-row').forEach((el) => {
      const txt = (el.textContent || '').toLowerCase();
      el.style.display = !q || txt.indexOf(q) !== -1 ? '' : 'none';
    });
  }
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-copy-subs]') && window._lastSubs) {
    copyText((window._lastSubs.subdomains || []).map((x) => x.host).join('\n'), e.target.closest('button'));
  }
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-subs-current]');
  if (b && window._lastSubs) doSubdomains(window._lastSubs.domain, false);
});

/* links live-filter */
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'linkFilter') {
    const q = (e.target.value || '').trim().toLowerCase();
    document.querySelectorAll('#panel-links .link-item').forEach((el) => {
      el.style.display = !q || (el.getAttribute('data-search') || '').indexOf(q) !== -1 ? '' : 'none';
    });
  }
});

/* copy all link URLs */
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-copy-links]') && current && current.links) {
    copyText((current.links.items || []).map((x) => x.url).join('\n'), e.target.closest('button'));
  }
});

/* ---------------- tabs ---------------- */

function activateTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  Object.entries(panels).forEach(([k, p]) => { if (p) p.classList.toggle('active', k === name); });
}

$('#tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (t) activateTab(t.dataset.tab);
});

/* ---------------- events ---------------- */

$('#fetchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) { input.focus(); return; }
  doFetch(url);
});

/* example + recent chips */
document.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip && chip.dataset.url) {
    input.value = chip.dataset.url;
    doFetch(chip.dataset.url);
  }
});

/* scan CTA in the preview tab */
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-scan-current]') && current) doScan(current.finalUrl, true);
});

/* any URL in scan results → fetch it directly */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lf-fetch]');
  if (!b || !b.dataset.lfFetch) return;
  input.value = b.dataset.lfFetch;
  doFetch(b.dataset.lfFetch);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* per-row copy buttons (scan results) */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lf-copy]');
  if (!b || !b.dataset.lfCopy) return;
  e.stopPropagation();
  copyText(b.dataset.lfCopy, b, true);
});

/* copy buttons */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy-what]');
  if (!b) return;
  const what = b.dataset.copyWhat;
  let text = '';
  if (what === 'json') text = current && current.json != null ? JSON.stringify(current.json, null, 2) : JSON.stringify((current && current.meta) || {}, null, 2);
  if (what === 'raw') text = (current && current.text) || '';
  if (what === 'meta') text = JSON.stringify((current && current.meta) || {}, null, 2);
  if (what === 'url') text = (current && current.finalUrl) || '';
  copyText(text, b);
});

/* scan results copy */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy-scan]');
  if (!b) return;
  const type = b.dataset.copyScan;
  if (type === 'endpoints' && window._lastScan) {
    const eps = ((window._lastScan.findings || {}).endpoints || []).map((x) => x.path).join('\n');
    copyText(eps || '(nothing)', b);
  }
});

/* download json */
document.addEventListener('click', (e) => {
  if (!e.target.closest('#dlJson') || !current) return;
  const obj = current.json != null ? current.json : current.meta != null ? current.meta : {};
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (safeHost(current.finalUrl) || 'response').replace(/[^\w.-]/g, '_') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

/* "/" shortcut */
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
  }
});

/* ---------------- recent history (localStorage) ---------------- */

function getRecent() {
  try { return JSON.parse(localStorage.getItem('linkfetch:recent') || '[]'); } catch { return []; }
}
function addRecent(url) {
  let r = getRecent().filter((u) => u !== url);
  r.unshift(url);
  r = r.slice(0, 5);
  try { localStorage.setItem('linkfetch:recent', JSON.stringify(r)); } catch {}
  renderRecent();
}
function renderRecent() {
  const r = getRecent();
  const wrap = $('#recentWrap');
  if (!r.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  $('#recentChips').innerHTML = r
    .map((u) => '<button type="button" class="chip" data-url="' + esc(u) + '">' + esc(shortUrl(u)) + '</button>')
    .join('');
}
renderRecent();

/* ---------------- api example ---------------- */

$('#apiExample').textContent =
  '# 1) Get link data / JSON:  POST /api/fetch\n' +
  'curl -X POST ' + location.origin + '/api/fetch \\\n' +
  '  -H "Content-Type: application/json" \\\n' +
  '  -d \'{"url": "https://api.github.com/users/octocat"}\'\n\n' +
  '# 2) Discover hidden APIs in a site\u2019s JS:  POST /api/scan\n' +
  'curl -X POST ' + location.origin + '/api/scan \\\n' +
  '  -H "Content-Type: application/json" \\\n' +
  '  -d \'{"url": "https://vanceai.com/workspace-new/?tool=image_enlarger"}\'';

/* ---------------- server health check ---------------- */
(async () => {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (r.ok) return;
  } catch {}
  const card = document.querySelector('.input-card');
  if (!card) return;
  const banner = document.createElement('div');
  banner.className = 'error-card';
  banner.style.marginTop = '14px';
  banner.innerHTML =
    '<div class="error-icon">📡</div><div><h3>No connection to the backend</h3>' +
    '<p class="muted small">You may be viewing this page in a <b>file preview</b> (network access is blocked there).</p>' +
    '<p class="muted small">To use the real site, open the <b>live preview</b> of the <b>“LinkFetch website”</b> process in the chat sidebar. 🚀</p></div>';
  card.appendChild(banner);
})();
