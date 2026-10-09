/* ============================================================
   GODXSHADOW — history page
   js/history.js
   ============================================================ */
(function () {
  let all = [];
  let sortKey = 'ts', sortDir = -1;
  let filter = '';

  function rows() {
    let list = all.slice();
    if (filter) list = list.filter(function (r) { return r.mode === filter; });
    list.sort(function (a, b) {
      const x = a[sortKey], y = b[sortKey];
      if (typeof x === 'string') return sortDir * x.localeCompare(y);
      return sortDir * ((x || 0) - (y || 0));
    });
    return list;
  }

  function render() {
    const tb = GX.el('#rows');
    const list = rows();
    tb.textContent = '';
    GX.el('#emptyState').classList.toggle('hidden', all.length > 0);

    list.forEach(function (r) {
      const tr = GX.make('tr');
      tr.appendChild(GX.make('td', 'muted small', GX.fmt.date(r.ts)));
      tr.appendChild(GX.make('td', 'mono', r.mode));
      tr.appendChild(GX.make('td', 'muted small', r.list));
      tr.appendChild(GX.make('td', 'num wpm', String(r.wpm)));
      tr.appendChild(GX.make('td', 'num muted', String(r.raw)));
      const accTd = GX.make('td', 'num', GX.fmt.one(r.acc) + '%');
      if (r.acc >= 97) accTd.style.color = '#a6ff00';
      else if (r.acc < 90) accTd.style.color = '#ff2e63';
      tr.appendChild(accTd);
      tr.appendChild(GX.make('td', 'num muted', String(r.cons) + '%'));
      tr.appendChild(GX.make('td', 'num muted', String(r.words)));
      tr.appendChild(GX.make('td', 'num muted', String(r.chars)));
      tr.appendChild(GX.make('td', 'num muted', r.seconds + 's'));
      tb.appendChild(tr);
    });

    // summary
    GX.el('#stRuns').textContent = all.length;
    if (all.length) {
      const best = Math.max.apply(null, all.map(function (r) { return r.wpm; }));
      const avg = all.reduce(function (a, b) { return a + b.wpm; }, 0) / all.length;
      const aAcc = all.reduce(function (a, b) { return a + b.acc; }, 0) / all.length;
      GX.el('#stBest').textContent = GX.fmt.int(best);
      GX.el('#stAvg').textContent = GX.fmt.int(avg);
      GX.el('#stAcc').textContent = GX.fmt.one(aAcc) + '%';
    }

    drawTrend();
    renderPBs();
  }

  function drawTrend() {
    const canvas = GX.el('#trend');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 230;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    const data = all.slice(-40);
    const x0 = 42, y0 = 12, iw = w - 56, ih = h - 38;

    if (!data.length) {
      c.fillStyle = 'rgba(141,134,184,.75)';
      c.font = '12px ui-monospace, monospace';
      c.textAlign = 'center';
      c.fillText('no data yet', w / 2, h / 2);
      return;
    }

    const maxW = Math.max(60, Math.ceil(Math.max.apply(null, data.map(function (d) { return d.wpm; })) / 20) * 20);
    // grid + labels
    c.strokeStyle = 'rgba(139,92,255,.16)'; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = y0 + ih * i / 4;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + iw, y); c.stroke();
      c.fillStyle = 'rgba(141,134,184,.85)';
      c.font = '10px ui-monospace, monospace'; c.textAlign = 'right';
      c.fillText(Math.round(maxW * (1 - i / 4)), x0 - 8, y + 3);
    }

    function X(i) { return data.length === 1 ? x0 + iw / 2 : x0 + iw * i / (data.length - 1); }
    function Y(v) { return y0 + ih - ih * Math.min(1, v / maxW); }

    // average dashed
    const avg = data.reduce(function (a, b) { return a + b.wpm; }, 0) / data.length;
    c.save(); c.setLineDash([5, 6]); c.strokeStyle = 'rgba(255,43,214,.7)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x0, Y(avg)); c.lineTo(x0 + iw, Y(avg)); c.stroke(); c.restore();
    c.fillStyle = 'rgba(255,43,214,.85)'; c.font = '10px ui-monospace, monospace'; c.textAlign = 'left';
    c.fillText('avg ' + Math.round(avg), x0 + 6, Y(avg) - 6);

    // fill
    const grad = c.createLinearGradient(0, y0, 0, y0 + ih);
    grad.addColorStop(0, 'rgba(0,240,255,.28)');
    grad.addColorStop(1, 'rgba(0,240,255,0)');
    c.beginPath(); c.moveTo(x0, y0 + ih);
    data.forEach(function (d, i) { c.lineTo(X(i), Y(d.wpm)); });
    c.lineTo(X(data.length - 1), y0 + ih); c.closePath();
    c.fillStyle = grad; c.fill();

    // line
    c.save();
    c.strokeStyle = '#00f0ff'; c.lineWidth = 2.4; c.lineJoin = 'round';
    c.shadowColor = 'rgba(0,240,255,.8)'; c.shadowBlur = 16;
    c.beginPath();
    data.forEach(function (d, i) { if (i === 0) c.moveTo(X(i), Y(d.wpm)); else c.lineTo(X(i), Y(d.wpm)); });
    c.stroke(); c.restore();

    // points
    data.forEach(function (d, i) {
      c.beginPath();
      c.fillStyle = d.acc >= 95 ? '#eaffff' : '#ff2e63';
      c.arc(X(i), Y(d.wpm), 3.2, 0, Math.PI * 2); c.fill();
    });

    c.fillStyle = 'rgba(141,134,184,.8)'; c.textAlign = 'center'; c.font = '10px ui-monospace, monospace';
    c.fillText('runs →', x0 + iw / 2, h - 6);
  }

  function renderPBs() {
    const p = GX.Store.getProfile();
    const grid = GX.el('#pbGrid');
    grid.textContent = '';
    const keys = Object.keys(p.pb || {});
    if (!keys.length) {
      grid.appendChild(GX.make('p', 'muted small', 'No personal bests recorded yet.'));
      return;
    }
    keys.sort(function (a, b) { return p.pb[b] - p.pb[a]; });
    keys.forEach(function (k) {
      const parts = k.split('|');
      const card = GX.make('div', 'panel flat');
      const mName = parts[0].indexOf('time') === 0
        ? GX.fmt.dur(parseInt(parts[0].slice(4), 10))
        : parts[0] === 'custom' ? 'custom' : parts[0];
      card.appendChild(GX.make('div', 'tag', mName + ' · ' + parts[1]));
      const v = GX.make('div', 'hud-v lime', String(p.pb[k]));
      v.style.marginTop = '6px';
      card.appendChild(v);
      card.appendChild(GX.make('div', 'small muted', 'wpm'));
      grid.appendChild(card);
    });
  }

  function bind() {
    GX.els('th[data-sort]').forEach(function (th) {
      th.style.cursor = 'pointer';
      th.addEventListener('click', function () {
        const k = th.dataset.sort;
        if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = -1; }
        GX.els('th[data-sort]').forEach(function (x) { x.textContent = x.textContent.replace(/ [▲▼]$/, ''); });
        th.textContent = th.textContent + (sortDir === 1 ? ' ▲' : ' ▼');
        render();
      });
    });

    GX.el('#filterMode').addEventListener('change', function (e) { filter = e.target.value; render(); });

    GX.el('#btnClear').addEventListener('click', function () {
      if (!confirm('Delete every stored run on this device?')) return;
      GX.Store.clearResults();
      all = [];
      render();
    });

    GX.el('#btnExport').addEventListener('click', function () {
      const head = ['date', 'mode', 'list', 'wpm', 'raw', 'accuracy', 'consistency', 'words', 'chars', 'seconds', 'player'];
      const lines = [head.join(',')].concat(rows().map(function (r) {
        return [new Date(r.ts).toISOString(), r.mode, r.list, r.wpm, r.raw, r.acc, r.cons, r.words, r.chars, r.seconds, r.player || ''].join(',');
      }));
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'godxshadow-history.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    const nameInput = GX.el('#playerName');
    const s = GX.Store.getSettings();
    nameInput.value = s.playerName || '';
    GX.el('#btnSaveName').addEventListener('click', function () {
      GX.Store.setSettings({ playerName: (nameInput.value || 'SHADOW').trim().slice(0, 16) });
      const b = GX.el('#btnSaveName');
      b.textContent = 'saved ✓';
      setTimeout(function () { b.textContent = 'save callsign'; }, 1400);
    });

    window.addEventListener('resize', drawTrend);
  }

  document.addEventListener('DOMContentLoaded', function () {
    all = GX.Store.getResults();
    bind();
    render();
  });
})();
