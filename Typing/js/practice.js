/* ============================================================
   GODXSHADOW — passage practice controller
   js/practice.js
   Same typing mechanics as the main test, but the text comes
   from a whole passage and the run ends when the passage ends.
   ============================================================ */
(function () {
  const Engine = window.GX_Engine;
  const HANDOFF = 'gx.practice.text';
  const CUSTOM_KEY = 'gx.passages.v1';

  const S = {
    passage: null,
    words: [],
    wordEls: [],
    wi: 0,
    ci: 0,
    input: '',
    stats: null,
    running: false,
    ended: false,
    startedAt: 0
  };

  const D = {};
  function cacheDom() {
    D.words = GX.el('#words');
    D.caret = GX.el('#caret');
    D.focusLock = GX.el('#focusLock');
    D.title = GX.el('#passageTitle');
    D.meta = GX.el('#passageMeta');
    D.progress = GX.el('#progressFill');
    D.elapsed = GX.el('#elapsed');
    D.wpmLive = GX.el('#wpmLive');
    D.rawLive = GX.el('#rawLive');
    D.accLive = GX.el('#accLive');
    D.errLive = GX.el('#errLive');
    D.doneWords = GX.el('#doneWords');
    D.testView = GX.el('#testView');
    D.resultView = GX.el('#resultView');
    D.kb = GX.el('#keyboard');
    D.graph = GX.el('#liveGraph');
    D.noPassage = GX.el('#noPassage');
    D.shell = GX.el('#testView');
  }

  /* ---------- where does the text come from? ---------- */
  function resolvePassage() {
    const q = new URLSearchParams(location.search);
    const pid = q.get('id');
    const cid = q.get('custom');

    if (cid) {
      try {
        const list = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
        const found = list.filter(function (p) { return p.id === cid; })[0];
        if (found) return found;
      } catch (e) {}
    }
    if (pid) {
      const p = GX_PASSAGES.byId(pid);
      if (p) return p;
    }
    try {
      const raw = sessionStorage.getItem(HANDOFF);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  /* ---------- build ---------- */
  function build() {
    const text = S.passage.text.replace(/\s+/g, ' ').trim();
    S.words = text.split(' ').filter(Boolean);
    D.words.textContent = '';
    S.wordEls = S.words.map(function (w) {
      const we = GX.make('div', 'word');
      for (let i = 0; i < w.length; i++) {
        const ch = GX.make('span', 'char', w[i]);
        we.appendChild(ch);
      }
      D.words.appendChild(we);
      return we;
    });

    D.title.textContent = S.passage.title || 'Your passage';
    const wc = S.words.length;
    D.meta.textContent = (S.passage.category || 'passage') + '  ·  ' +
      (S.passage.difficulty || 'custom') + '  ·  ' + wc + ' words  ·  ~' +
      Math.max(1, Math.round(wc / 30)) + ' min';
    GX.el('#totalWords').textContent = wc;
  }

  /* ---------- caret ---------- */
  function caretTarget() {
    const we = S.wordEls[S.wi];
    if (!we) return null;
    const kids = we.children;
    if (S.ci < kids.length) return kids[S.ci];
    return kids[kids.length - 1] || null;
  }

  function moveCaret(smooth) {
    const t = caretTarget();
    if (!t || !D.words) return;
    const wr = D.words.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const atEnd = S.ci >= S.wordEls[S.wi].children.length;
    const x = (atEnd ? tr.right : tr.left) - wr.left + D.words.scrollLeft;
    const y = tr.top - wr.top + D.words.scrollTop;
    D.caret.style.transition = smooth ? '' : 'none';
    D.caret.style.transform = 'translate(' + x + 'px,' + (y + 3) + 'px)';
    if (!smooth) { void D.caret.offsetWidth; D.caret.style.transition = ''; }

    const lineH = parseFloat(getComputedStyle(D.words).lineHeight) || 44;
    const wanted = Math.max(0, y - lineH);
    if (Math.abs(D.words.scrollTop - wanted) > 2) D.words.scrollTop = wanted;
  }

  function caretBlink(on) { D.caret.classList.toggle('blink', !!on); }

  function paintWord() {
    const expected = S.words[S.wi] || '';
    const we = S.wordEls[S.wi];
    if (!we) return;
    we.classList.remove('error-word');
    Array.prototype.slice.call(we.querySelectorAll('.extra')).forEach(function (n) { n.remove(); });

    const kids = we.children;
    for (let i = 0; i < kids.length; i++) {
      kids[i].className = 'char';
      kids[i].textContent = expected[i];
    }
    let wrong = false;
    for (let i = 0; i < S.input.length; i++) {
      const typed = S.input[i];
      if (i < kids.length) {
        if (typed === expected[i]) kids[i].className = 'char correct';
        else { kids[i].className = 'char incorrect'; wrong = true; }
      } else {
        we.appendChild(GX.make('span', 'char extra incorrect', typed));
        wrong = true;
      }
    }
    if (wrong) we.classList.add('error-word');
  }

  /* ---------- progress ---------- */
  function refresh(now) {
    const done = S.stats.wordsTyped;
    const total = S.words.length || 1;
    D.doneWords.textContent = done;
    D.progress.style.width = Math.min(100, (done / total) * 100) + '%';
    D.wpmLive.textContent = GX.fmt.int(S.stats.wpm(now));
    D.rawLive.textContent = GX.fmt.int(S.stats.rawWpm(now));
    D.accLive.textContent = GX.fmt.one(S.stats.accuracy());
    D.errLive.textContent = GX.fmt.int(S.stats.incorrectChars + S.stats.extraChars);
    D.elapsed.textContent = Math.round(S.stats.elapsedSec(now)) + 's';
    GX.Chart.drawLive(D.graph, S.stats.samples, Math.max(20, Math.round(total / 2)));
    checkWpmFlash(now);
  }

  /* ---------- live WPM threshold flash (same rule as the main test) ---------- */
  function checkWpmFlash(now) {
    const target = Number(GX.Store.getSettings().wpmFlash) || 0;
    if (!target || !S.running) return;
    // let the run settle first: a half-second-old "WPM" of 300 is just noise
    if (S.stats.elapsedSec(now) < 5 || S.stats.correctChars < 15) return;
    const wpm = S.stats.wpm(now);
    if (wpm >= target) {
      if (S.flashedAt) return;
      S.flashedAt = target;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const el = GX.make('div', 'wpm-flash');
      el.appendChild(GX.make('span', null, target + ' WPM'));
      document.body.appendChild(el);
      setTimeout(function () { el.remove(); }, 1100);
      if (GX.Store.getSettings().sound) GX.Audio.start();
    } else {
      S.flashedAt = 0;
    }
  }

  /* ---------- lifecycle ---------- */
  function reset() {
    S.wi = 0; S.ci = 0; S.input = '';
    S.running = false; S.ended = false; S.startedAt = 0; S.flashedAt = 0;
    Array.prototype.slice.call(document.querySelectorAll('.wpm-flash')).forEach(function (n) { n.remove(); });
    S.stats = new Engine.Stats();
    build();
    D.words.scrollTop = 0;
    paintWord();
    moveCaret(false);
    caretBlink(true);
    D.testView.classList.remove('hidden');
    D.resultView.classList.add('hidden');
    D.progress.style.width = '0%';
    D.doneWords.textContent = '0';
    D.elapsed.textContent = '0s';
    D.wpmLive.textContent = '0';
    D.rawLive.textContent = '0';
    D.accLive.textContent = '100';
    D.errLive.textContent = '0';
    GX.Chart.drawLive(D.graph, [], 60);
    setLock(true);
    highlightKey();
  }

  function setLock(locked) {
    if (D.focusLock) D.focusLock.classList.toggle('hidden', !locked);
  }

  function begin(now) {
    S.running = true;
    S.startedAt = now;
    S.stats.start(now);
    setLock(false);
    if (GX.Store.getSettings().sound) GX.Audio.start();
    startTicker();
  }

  let ticker = null;
  function startTicker() {
    stopTicker();
    ticker = setInterval(function () {
      if (!S.running) return;
      const now = performance.now();
      S.stats.sample(now);
      refresh(now);
    }, 1000);
  }
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

  /* ---------- input ---------- */
  function typeChar(ch, now) {
    if (!S.running) begin(now);
    caretBlink(false);
    const expected = S.words[S.wi] || '';
    S.input += ch;
    S.ci = S.input.length;
    if (S.ci - 1 < expected.length) {
      const ok = ch === expected[S.ci - 1];
      S.stats.record(ok ? 'correct' : 'incorrect', now);
      if (!ok && GX.Store.getSettings().sound) GX.Audio.err();
    } else {
      S.stats.record('extra', now);
    }
    if (GX.Store.getSettings().sound) GX.Audio.key();
    paintWord();
    moveCaret(true);
    refresh(now);
    highlightKey();
  }

  function backspace(now, whole) {
    if (!S.running || !S.input.length) return;
    S.stats.noteBackspace();
    S.input = whole ? '' : S.input.slice(0, -1);
    S.ci = S.input.length;
    S.stats.noteCorrection();
    paintWord();
    moveCaret(true);
    highlightKey();
    refresh(now);
  }

  function commitWord(now) {
    if (!S.input.length) return;
    if (!S.running) begin(now);
    const expected = S.words[S.wi] || '';
    S.stats.pushWord(S.input, expected, now);
    if (S.input.length < expected.length) {
      for (let i = S.input.length; i < expected.length; i++) S.stats.record('missed', now);
    }
    S.wordEls[S.wi].classList.toggle('error-word', S.input !== expected);

    if (S.wi >= S.words.length - 1) {
      S.input = '';   // already counted above — stop finish() counting it twice
      finish();
      return;
    }
    S.wi++;
    S.input = '';
    S.ci = 0;
    paintWord();
    moveCaret(true);
    refresh(now);
    highlightKey();
  }

  function finish() {
    if (S.ended) return;
    S.ended = true;
    S.running = false;
    stopTicker();
    const now = performance.now();
    if (S.input.length) S.stats.pushWord(S.input, S.words[S.wi], now);
    S.stats.finish(now);
    if (GX.Store.getSettings().sound) GX.Audio.finish();
    showResults(S.stats.summary(now));
  }

  function abort() {
    stopTicker();
    reset();
  }

  /* ---------- results ---------- */
  function showResults(r) {
    D.testView.classList.add('hidden');
    D.resultView.classList.remove('hidden');

    GX.el('#resTitle').textContent = S.passage.title || 'Your passage';
    GX.el('#resMeta').textContent = (S.passage.category || 'passage') + ' · ' + S.words.length + ' words';
    GX.el('#resWpm').textContent = GX.fmt.int(r.wpm);
    GX.el('#resRaw').textContent = GX.fmt.int(r.raw);
    GX.el('#resAcc').textContent = GX.fmt.one(r.accuracy) + '%';
    GX.el('#resCons').textContent = GX.fmt.int(r.consistency) + '%';
    GX.el('#resChars').textContent = r.correctChars + '/' + r.keystrokes;
    GX.el('#resErr').textContent = r.incorrectChars + r.extraChars;
    GX.el('#resWords').textContent = r.words + ' / ' + S.words.length;
    GX.el('#resTime').textContent = Math.round(r.seconds) + 's';
    GX.el('#resDate').textContent = GX.fmt.date(Date.now());

    const g = GX.grade(r.wpm, r.accuracy);
    GX.el('#resGradeLabel').textContent = g.label;
    GX.el('#resGradeNote').textContent = g.note;
    GX.el('#resGradeBadge').textContent = 'grade ' + g.label + ' · ' + g.note;
    GX.el('#resGrade').className = 'stat ' + (g.cls || '');
    GX.el('#accBarFill').style.width = Math.max(2, r.accuracy) + '%';
    GX.el('#consBarFill').style.width = Math.max(2, r.consistency) + '%';

    const badges = GX.el('#resBadges');
    badges.textContent = '';
    if (r.accuracy >= 98) badges.appendChild(GX.make('span', 'badge lime', 'clean passage'));
    if (r.consistency >= 85) badges.appendChild(GX.make('span', 'badge', 'metronome'));
    if (r.wpm >= 80) badges.appendChild(GX.make('span', 'badge lime', 'velocity'));
    if (r.accuracy < 90) badges.appendChild(GX.make('span', 'badge pink', 'accuracy drag'));
    if (S.words.length >= 150) badges.appendChild(GX.make('span', 'badge', 'endurance'));
    if (!badges.children.length) badges.appendChild(GX.make('span', 'badge', 'passage complete'));

    GX.Chart.gauge(GX.el('#resGauge'), r.wpm, Math.max(120, Math.ceil(r.wpm / 20) * 20 + 20));
    drawCurve(r);

    // final pace earned the celebration — full-screen green flash on the reveal,
    // naming the actual pace reached
    const flashTarget = Number(GX.Store.getSettings().wpmFlash) || 0;
    if (flashTarget && r.wpm >= flashTarget) {
      if (!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        const flash = GX.make('div', 'pb-flash celebrate');
        flash.appendChild(GX.make('span', null, GX.fmt.int(r.wpm) + ' WPM'));
        document.body.appendChild(flash);
        setTimeout(function () { flash.remove(); }, 1500);
        if (GX.Store.getSettings().sound) GX.Audio.finish();
      }
    }

    GX.Store.addResult({
      ts: Date.now(),
      mode: 'passage',
      list: (S.passage.category || 'custom'),
      wpm: Math.round(r.wpm),
      raw: Math.round(r.raw),
      acc: Math.round(r.accuracy * 10) / 10,
      cons: Math.round(r.consistency),
      chars: r.keystrokes,
      words: r.words,
      seconds: Math.round(r.seconds),
      player: GX.Store.getSettings().playerName || 'SHADOW',
      passage: S.passage.title || 'custom'
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function drawCurve(r) {
    const canvas = GX.el('#resGraph');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 700, h = canvas.clientHeight || 210;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    const samples = r.samples.length > 1
      ? r.samples
      : [{ t: 1, wpm: r.wpm, raw: r.raw, acc: r.accuracy }, { t: 2, wpm: r.wpm, raw: r.raw, acc: r.accuracy }];
    const dur = Math.max(1, samples[samples.length - 1].t);
    const peak = Math.max.apply(null, samples.map(function (s) { return Math.max(s.wpm, s.raw); }));
    const maxW = Math.max(60, Math.ceil(peak / 20) * 20);
    const x0 = 42, y0 = 12, iw = w - 56, ih = h - 36;

    c.strokeStyle = 'rgba(139,92,255,.16)'; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = y0 + ih * i / 4;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + iw, y); c.stroke();
    }
    c.fillStyle = 'rgba(141,134,184,.85)';
    c.font = '10px ui-monospace, monospace'; c.textAlign = 'right';
    for (let i = 0; i <= 4; i++) c.fillText(Math.round(maxW * (1 - i / 4)), x0 - 8, y0 + ih * i / 4 + 3);

    function X(s) { return x0 + iw * (s.t / dur); }
    function Y(v) { return y0 + ih - ih * Math.min(1, v / maxW); }

    const grad = c.createLinearGradient(0, y0, 0, y0 + ih);
    grad.addColorStop(0, 'rgba(0,240,255,.28)');
    grad.addColorStop(1, 'rgba(0,240,255,0)');
    c.beginPath(); c.moveTo(x0, y0 + ih);
    samples.forEach(function (s) { c.lineTo(X(s), Y(s.wpm)); });
    c.lineTo(X(samples[samples.length - 1]), y0 + ih); c.closePath();
    c.fillStyle = grad; c.fill();

    c.save();
    c.strokeStyle = 'rgba(255,43,214,.6)'; c.lineWidth = 1.6;
    c.beginPath();
    samples.forEach(function (s, i) { if (i === 0) c.moveTo(X(s), Y(s.raw)); else c.lineTo(X(s), Y(s.raw)); });
    c.stroke(); c.restore();

    c.save();
    c.strokeStyle = '#00f0ff'; c.lineWidth = 2.6; c.lineJoin = 'round';
    c.shadowColor = 'rgba(0,240,255,.8)'; c.shadowBlur = 16;
    c.beginPath();
    samples.forEach(function (s, i) { if (i === 0) c.moveTo(X(s), Y(s.wpm)); else c.lineTo(X(s), Y(s.wpm)); });
    c.stroke(); c.restore();

    samples.forEach(function (s) {
      if (s.acc < 95) {
        c.fillStyle = 'rgba(255,46,99,.85)';
        c.beginPath(); c.arc(X(s), Y(s.wpm), 3.2, 0, Math.PI * 2); c.fill();
      }
    });

    c.fillStyle = 'rgba(141,134,184,.8)'; c.textAlign = 'center';
    c.fillText('seconds', x0 + iw / 2, h - 6);
  }

  /* ---------- virtual keyboard ---------- */
  const ROWS = [
    ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/']
  ];
  const LEFT = { '`': 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, q: 1, w: 1, e: 1, r: 1, t: 1, a: 1, s: 1, d: 1, f: 1, g: 1, z: 1, x: 1, c: 1, v: 1, b: 1 };
  let keyMap = {};

  function buildKeyboard() {
    if (!D.kb) return;
    D.kb.textContent = '';
    keyMap = {};
    ROWS.forEach(function (row, ri) {
      const r = GX.make('div', 'kb-row indent-' + ri);
      row.forEach(function (k) {
        const el = GX.make('div', 'key ' + (LEFT[k] ? 'f-l' : 'f-r'), k);
        keyMap[k] = el;
        r.appendChild(el);
      });
      D.kb.appendChild(r);
    });
    const last = GX.make('div', 'kb-row');
    const space = GX.make('div', 'key space f-r', 'space');
    keyMap[' '] = space;
    last.appendChild(space);
    D.kb.appendChild(last);
  }

  function highlightKey() {
    if (!D.kb || D.kb.classList.contains('hidden')) return;
    Object.keys(keyMap).forEach(function (k) { keyMap[k].classList.remove('next'); });
    const ch = (S.words[S.wi] || '')[S.ci];
    if (ch === undefined) return;
    const t = keyMap[ch.toLowerCase()] || keyMap[ch];
    if (t) t.classList.add('next');
  }

  function flashKey(ch, wrong) {
    if (!D.kb || D.kb.classList.contains('hidden')) return;
    const el = keyMap[ch === ' ' ? ' ' : String(ch).toLowerCase()];
    if (!el) return;
    el.classList.add(wrong ? 'wrong' : 'down');
    setTimeout(function () { el.classList.remove('down', 'wrong'); }, 130);
  }

  /* ---------- keys ---------- */
  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (D.testView.classList.contains('hidden')) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) GX.go('passages.html'); else reset();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); abort(); return; }

      const now = performance.now();
      if (e.key === 'Backspace') { e.preventDefault(); backspace(now, e.ctrlKey || e.metaKey); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (GX.Store.getSettings().sound) GX.Audio.space();
        commitWord(now);
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        const expected = (S.words[S.wi] || '')[S.ci];
        flashKey(e.key, S.running && expected !== undefined && expected !== e.key);
        typeChar(e.key, now);
      }
    });

    if (D.focusLock) D.focusLock.addEventListener('click', function () { setLock(false); D.words.focus(); });
    D.words.addEventListener('mousedown', function (e) { e.preventDefault(); setLock(false); });
    window.addEventListener('resize', function () { moveCaret(false); });
  }

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    cacheDom();
    buildKeyboard();
    bindKeys();
    D.words.setAttribute('tabindex', '0');

    S.passage = resolvePassage();
    if (!S.passage || !String(S.passage.text || '').trim()) {
      D.noPassage.classList.remove('hidden');
      D.shell.classList.add('hidden');
      return;
    }
    D.noPassage.classList.add('hidden');

    GX.el('#btnRestart').addEventListener('click', function () { reset(); setLock(false); D.words.focus(); });
    GX.el('#btnAgain').addEventListener('click', function () { reset(); setLock(false); D.words.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    GX.el('#btnPick').addEventListener('click', function () { GX.go('passages.html'); });
    GX.el('#btnBack').addEventListener('click', function () { GX.go('passages.html'); });
    const kbToggle = GX.el('#btnKb');
    if (kbToggle) kbToggle.addEventListener('click', function () {
      D.kb.classList.toggle('hidden');
      kbToggle.classList.toggle('on', !D.kb.classList.contains('hidden'));
      highlightKey();
    });

    // sound on/off + key click volume
    const st = GX.Store.getSettings();
    const snd = GX.el('#btnSound');
    const volWrap = GX.el('#volWrap');
    const volRange = GX.el('#volRange');
    GX.Audio.setVolume(st.sound ? (st.volume || 0.6) : 0);
    if (snd) {
      snd.classList.toggle('on', !!st.sound);
      snd.addEventListener('click', function () {
        const next = GX.Store.setSettings({ sound: !GX.Store.getSettings().sound });
        snd.classList.toggle('on', !!next.sound);
        GX.Audio.setVolume(next.sound ? (next.volume || 0.6) : 0);
        if (volWrap) volWrap.classList.toggle('hidden', !next.sound);
        if (next.sound) GX.Audio.test();
      });
    }
    if (volWrap) {
      volWrap.classList.toggle('hidden', !st.sound);
      if (volRange) {
        volRange.value = Math.round((st.volume || 0.6) * 100);
        volRange.addEventListener('input', function () {
          const v = Number(volRange.value) / 100;
          const next = GX.Store.setSettings({ volume: v });
          GX.Audio.setVolume(next.sound ? v : 0);
        });
        volRange.addEventListener('change', function () {
          if (GX.Store.getSettings().sound) GX.Audio.test();
        });
        volRange.addEventListener('keydown', function (e) { e.stopPropagation(); });
      }
    }

    reset();
  });
})();
