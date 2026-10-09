/* ============================================================
   GODXSHADOW — leaderboard page (offline: your runs vs house bots)
   js/leaderboard.js
   ============================================================ */
(function () {
  // Reference typists. Fixed offline roster, purely local.
  // WPM drops as runs get longer: a 15s sprint is not a 1 hour endurance run.
  const BOTS = {
    time60: [
      ['NULLBYTE', 124, 134, 96.8, 94], ['hexwitch', 110, 121, 97.9, 95], ['VOLT_R', 106, 118, 95.2, 90],
      ['Kilo_Watt', 87, 96, 94.4, 86], ['paperhand', 74, 83, 93.2, 82], ['drift', 62, 70, 95.0, 88], ['m0th', 50, 57, 91.5, 75]
    ],
    time120: [
      ['NULLBYTE', 121, 131, 96.5, 94], ['hexwitch', 108, 119, 97.8, 95], ['VOLT_R', 103, 115, 95.0, 90],
      ['Kilo_Watt', 85, 94, 94.2, 86], ['paperhand', 72, 81, 93.0, 82], ['drift', 61, 69, 94.8, 87], ['m0th', 49, 56, 91.2, 74]
    ],
    time300: [
      ['hexwitch', 105, 116, 97.9, 96], ['NULLBYTE', 112, 123, 96.0, 93], ['VOLT_R', 96, 108, 94.6, 89],
      ['Kilo_Watt', 81, 90, 94.0, 86], ['paperhand', 69, 78, 92.8, 82], ['drift', 58, 66, 94.5, 86], ['m0th', 47, 54, 90.8, 73]
    ],
    time600: [
      ['hexwitch', 102, 113, 98.0, 96], ['NULLBYTE', 107, 118, 95.6, 93], ['VOLT_R', 91, 103, 94.2, 89],
      ['Kilo_Watt', 78, 87, 93.8, 86], ['paperhand', 66, 75, 92.6, 81], ['drift', 56, 64, 94.2, 85], ['m0th', 45, 52, 90.4, 72]
    ],
    time900: [
      ['hexwitch', 100, 111, 98.1, 96], ['NULLBYTE', 104, 115, 95.4, 93], ['VOLT_R', 88, 100, 94.0, 88],
      ['Kilo_Watt', 76, 85, 93.6, 85], ['paperhand', 64, 73, 92.4, 81], ['drift', 54, 62, 94.0, 85], ['m0th', 44, 51, 90.2, 71]
    ],
    time1800: [
      ['hexwitch', 96, 107, 98.2, 96], ['NULLBYTE', 98, 109, 95.0, 92], ['VOLT_R', 83, 95, 93.6, 88],
      ['Kilo_Watt', 72, 81, 93.2, 85], ['paperhand', 61, 70, 92.0, 80], ['drift', 52, 60, 93.6, 84], ['m0th', 42, 49, 89.8, 70]
    ],
    time3600: [
      ['hexwitch', 91, 102, 98.3, 97], ['NULLBYTE', 92, 103, 94.6, 91], ['VOLT_R', 78, 90, 93.2, 87],
      ['Kilo_Watt', 68, 77, 92.8, 84], ['paperhand', 58, 67, 91.6, 79], ['drift', 49, 57, 93.2, 83], ['m0th', 40, 47, 89.4, 69]
    ]
  };

  // legacy short tests and word counts keep their own boards
  BOTS.time15 = [
    ['NULLBYTE', 132, 141, 97.4, 91], ['VOLT_R', 118, 129, 96.1, 88], ['hexwitch', 104, 116, 98.2, 93],
    ['Kilo_Watt', 92, 101, 94.8, 84], ['paperhand', 78, 88, 93.0, 80], ['drift', 66, 74, 95.5, 86], ['m0th', 54, 61, 92.2, 78]
  ];
  BOTS.time30 = [
    ['NULLBYTE', 128, 138, 97.1, 92], ['VOLT_R', 114, 126, 95.6, 89], ['hexwitch', 101, 112, 98.0, 94],
    ['Kilo_Watt', 89, 99, 94.1, 85], ['paperhand', 76, 85, 93.6, 81], ['drift', 64, 72, 95.1, 87], ['m0th', 52, 59, 91.8, 76]
  ];
  BOTS.words50 = [
    ['NULLBYTE', 126, 137, 97.0, 93], ['VOLT_R', 112, 124, 95.8, 89], ['hexwitch', 108, 119, 98.0, 95],
    ['Kilo_Watt', 85, 95, 93.9, 84], ['paperhand', 72, 81, 93.4, 81], ['drift', 61, 69, 94.8, 85], ['m0th', 49, 56, 91.2, 73]
  ];
  BOTS.words100 = [
    ['hexwitch', 118, 129, 98.2, 96], ['NULLBYTE', 115, 127, 96.5, 92], ['VOLT_R', 100, 112, 95.0, 88],
    ['Kilo_Watt', 84, 93, 94.2, 85], ['paperhand', 71, 80, 93.1, 80], ['drift', 60, 68, 94.6, 84], ['m0th', 48, 55, 90.8, 72]
  ];

  /** custom durations are ranked against the closest standard board */
  const PRESETS = [60, 120, 300, 600, 900, 1800, 3600];
  function boardFor(m) {
    if (BOTS[m]) return BOTS[m];
    if (m === 'custom') return BOTS.time60;
    const n = parseInt(String(m).replace('time', ''), 10);
    if (!isFinite(n)) return BOTS.time60;
    let best = PRESETS[0];
    PRESETS.forEach(function (p) { if (Math.abs(p - n) < Math.abs(best - n)) best = p; });
    return BOTS['time' + best];
  }

  let mode = 'time60';

  /** 'time600' -> '10 min', 'words50' -> '50 words', 'custom' -> 'custom' */
  function modeName(m) {
    if (m === 'custom') return 'custom';
    if (m.indexOf('words') === 0) return m.replace('words', '') + ' words';
    if (m.indexOf('time') === 0) return GX.fmt.dur(parseInt(m.slice(4), 10));
    return m;
  }

  function myBest(m) {
    const list = GX.Store.getResults().filter(function (r) { return r.mode === m; });
    if (!list.length) return null;
    return list.reduce(function (a, b) { return (b.wpm > a.wpm ? b : a); });
  }

  function build(m) {
    const entries = boardFor(m).map(function (b) {
      return { name: b[0], wpm: b[1], raw: b[2], acc: b[3], cons: b[4], ts: null, me: false };
    });
    const mine = myBest(m);
    if (mine) {
      entries.push({
        name: (mine.player || GX.Store.getSettings().playerName || 'SHADOW') + ' (you)',
        wpm: mine.wpm, raw: mine.raw, acc: mine.acc, cons: mine.cons, ts: mine.ts, me: true
      });
    }
    entries.sort(function (a, b) { return b.wpm - a.wpm; });
    return entries;
  }

  function render() {
    const tb = GX.el('#lbRows');
    tb.textContent = '';
    const entries = build(mode);

    entries.forEach(function (e, i) {
      const tr = GX.make('tr');
      if (e.me) { tr.style.background = 'rgba(0,240,255,.09)'; tr.style.boxShadow = 'inset 0 0 0 1px rgba(0,240,255,.35)'; }
      const rank = GX.make('td', 'num ' + (i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'muted'), String(i + 1));
      tr.appendChild(rank);
      const nameTd = GX.make('td', null, e.name);
      if (e.me) { nameTd.style.color = '#00f0ff'; nameTd.style.textShadow = '0 0 12px rgba(0,240,255,.6)'; }
      tr.appendChild(nameTd);
      tr.appendChild(GX.make('td', 'num wpm', String(e.wpm)));
      tr.appendChild(GX.make('td', 'num muted', String(e.raw)));
      tr.appendChild(GX.make('td', 'num', GX.fmt.one(e.acc) + '%'));
      tr.appendChild(GX.make('td', 'num muted', e.cons + '%'));
      tr.appendChild(GX.make('td', 'muted small', e.ts ? GX.fmt.date(e.ts) : 'reference'));
      tb.appendChild(tr);
    });

    const idx = entries.findIndex(function (e) { return e.me; });
    if (idx === -1) {
      GX.el('#yourRank').textContent = '—';
      GX.el('#gapTop').textContent = '—';
      GX.el('#nextTarget').textContent = 'no run yet';
      GX.el('#yourRank').nextElementSibling.textContent = 'run a ' + modeName(mode) + ' test first';
      return;
    }
    GX.el('#yourRank').textContent = '#' + (idx + 1) + ' / ' + entries.length;
    GX.el('#yourRank').nextElementSibling.textContent = 'in ' + modeName(mode);
    GX.el('#gapTop').textContent = '+' + Math.max(0, entries[0].wpm - entries[idx].wpm);
    GX.el('#nextTarget').textContent = idx === 0 ? 'you are #1' : entries[idx - 1].name + ' · ' + entries[idx - 1].wpm;
  }

  document.addEventListener('DOMContentLoaded', function () {
    GX.els('#lbModes .pill').forEach(function (p) {
      p.addEventListener('click', function () {
        GX.els('#lbModes .pill').forEach(function (x) { x.classList.remove('on'); });
        p.classList.add('on');
        mode = p.dataset.value;
        render();
      });
    });
    render();
  });
})();
