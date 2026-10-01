/* ============================================================
   GODXSHADOW — lessons page
   js/lessons.js
   ============================================================ */
(function () {

  const LESSONS = [
    { id: 'home', name: 'Home row', keys: 'ASDF JKL;', desc: 'The anchor. Every fast typist returns here between words. Drill until your hands find F and J without looking.', mode: 'words25', list: 'easy', target: '95% accuracy' },
    { id: 'top', name: 'Top row', keys: 'QWERTY UIOP', desc: 'Most English letters live up here — T, E, O, I, N are all top-row work. Add them to the home row without lifting your wrists.', mode: 'words50', list: 'top200', target: '40 WPM' },
    { id: 'bottom', name: 'Bottom row', keys: 'ZXCVB NM,.', desc: 'The weakest row for nearly everyone. Short drills beat long ones — five minutes daily is enough.', mode: 'time30', list: 'top200', target: '92% accuracy' },
    { id: 'bigrams', name: 'Bigrams &amp; rhythm', keys: 'TH HE IN ER AN', desc: 'Speed comes from chunks, not letters. Train the two-letter pairs that make up half of English.', mode: 'time60', list: 'top500', target: '55 WPM' },
    { id: 'punct', name: 'Punctuation &amp; caps', keys: ', . ; \' SHIFT', desc: 'Shift and comma cost more time than people expect. Turn punctuation and caps on and keep accuracy above 93%.', mode: 'time60', list: 'quotes', target: '93% accuracy' },
    { id: 'numbers', name: 'Numbers', keys: '1234567890', desc: 'Symbols break flow. Practise them separately so they stop costing you a whole word of rhythm.', mode: 'time30', list: 'numbers', target: '30 WPM' },
    { id: 'code', name: 'Code vocabulary', keys: '{} [] => ::', desc: 'Camel case, brackets and operators. Built for developers who type identifiers more than sentences.', mode: 'words50', list: 'code', target: '50 WPM' },
    { id: 'endurance', name: 'Endurance', keys: '120s', desc: 'Long runs expose drift. Watch the consistency number — a flat curve is worth more than a spiky peak.', mode: 'time120', list: 'top500', target: 'flat pace' },
    { id: 'hard', name: 'Hard mix', keys: 'ZYXWQ JKV', desc: 'Rare letters and long words. Only useful once accuracy is stable above 95% on the common banks.', mode: 'time60', list: 'top500', target: '90% accuracy' }
  ];

  // finger assignment for the map
  const FINGER = {
    '`': 'l', 1: 'l', 2: 'l', 3: 'l', 4: 'l', 5: 'l', 6: 'r', 7: 'r', 8: 'r', 9: 'r', 0: 'r', '-': 'r', '=': 'r',
    q: 'l', w: 'l', e: 'l', r: 'l', t: 'l', y: 'r', u: 'r', i: 'r', o: 'r', p: 'r', '[': 'r', ']': 'r', '\\': 'r',
    a: 'l', s: 'l', d: 'l', f: 'l', g: 'l', h: 'r', j: 'r', k: 'r', l: 'r', ';': 'r', "'": 'r',
    z: 'l', x: 'l', c: 'l', v: 'l', b: 'l', n: 'r', m: 'r', ',': 'r', '.': 'r', '/': 'r', ' ': 'r'
  };
  const ROWS = [
    ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/']
  ];

  function renderLessons() {
    const grid = GX.el('#lessonGrid');
    const profile = GX.Store.getProfile();
    const lessonBest = (profile && profile.lessons) || {};

    LESSONS.forEach(function (L, i) {
      const card = GX.make('div', 'panel lesson-card reveal');
      card.style.animationDelay = (i * 60) + 'ms';

      card.appendChild(GX.make('div', 'tag', 'lesson ' + String(i + 1).padStart(2, '0')));
      const h = GX.make('h3', null, null);
      h.innerHTML = L.name;
      card.appendChild(h);
      card.appendChild(GX.make('div', 'lesson-keys', L.keys));
      const p = GX.make('p', 'muted small', null);
      p.style.margin = '0';
      p.style.lineHeight = '1.7';
      p.textContent = L.desc;
      card.appendChild(p);

      const meta = GX.make('div', 'lesson-meta');
      const m1 = GX.make('span', null, null); m1.innerHTML = 'test <b>' + L.mode.replace('time', '').replace('words', '') + (L.mode.indexOf('time') === 0 ? 's' : 'w') + '</b>';
      const m2 = GX.make('span', null, null); m2.innerHTML = 'target <b>' + L.target + '</b>';
      meta.appendChild(m1); meta.appendChild(m2);
      card.appendChild(meta);

      const best = lessonBest[L.id];
      const bestLine = GX.make('div', 'small muted mono', best ? 'your best here: ' + best + ' wpm' : 'not drilled yet');
      card.appendChild(bestLine);

      const btns = GX.make('div', 'pills');
      const go = GX.make('a', 'btn sm', 'open drill');
      go.setAttribute('href', 'index.html?mode=' + L.mode + '&list=' + L.list + (L.id === 'hard' ? '&diff=hard' : ''));
      btns.appendChild(go);
      card.appendChild(btns);

      grid.appendChild(card);
    });
  }

  function renderFingerMap() {
    const wrap = GX.el('#fingerMap');
    wrap.textContent = '';
    ROWS.forEach(function (row, ri) {
      const r = GX.make('div', 'kb-row indent-' + ri);
      row.forEach(function (k) {
        const el = GX.make('div', 'key ' + (FINGER[k] === 'l' ? 'f-l' : 'f-r'), k);
        r.appendChild(el);
      });
      wrap.appendChild(r);
    });
    const last = GX.make('div', 'kb-row');
    last.appendChild(GX.make('div', 'key space f-r', 'space'));
    wrap.appendChild(last);
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderLessons();
    renderFingerMap();
  });
})();
