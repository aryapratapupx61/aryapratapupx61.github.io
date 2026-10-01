/* ============================================================
   GODXSHADOW — typing test page controller
   js/app.js
   ============================================================ */

(function () {
  const W = window.GX_WORDS, Engine = window.GX_Engine;

  /* ---------- state ---------- */
  const S = {
    settings: GX.Store.getSettings(),
    words: [],            // expected words
    wordEls: [],          // rendered .word elements
    wi: 0,                // word index
    ci: 0,                // char index inside current word
    input: '',            // typed text of current word
    stats: null,
    running: false,
    timerId: null,
    durationSec: 60,
    timeLeft: 60,
    lastSample: 0,
    flashedAt: 0,       // WPM target already celebrated on this crossing
    seed: 1,
    focus: false,
    ended: false
  };

  /* ---------- dom ---------- */
  const D = {};
  function cacheDom() {
    D.words = GX.el('#words');
    D.caret = GX.el('#caret');
    D.focusLock = GX.el('#focusLock');
    D.timeLeft = GX.el('#timeLeft');
    D.wpmLive = GX.el('#wpmLive');
    D.accLive = GX.el('#accLive');
    D.rawLive = GX.el('#rawLive');
    D.errLive = GX.el('#errLive');
    D.barFill = GX.el('#timebarFill');   // the <i> that CSS actually sizes
    D.barWrap = GX.el('#timebar');       // wrapper that carries the .low state
    D.graph = GX.el('#liveGraph');
    D.typingShell = GX.el('#typingShell');
    D.testView = GX.el('#testView');
    D.resultView = GX.el('#resultView');
    D.kb = GX.el('#keyboard');
    D.pbLine = GX.el('#pbLine');
    D.modeHint = GX.el('#modeHint');
  }

  /* ---------- mode parsing ---------- */
  function isTimeMode() {
    return S.settings.mode.indexOf('time') === 0 || S.settings.mode === 'custom';
  }
  function modeDuration() {
    const m = S.settings.mode;
    if (m === 'custom') {
      const d = Number(S.settings.customDuration);
      return clampDuration(d || 60);
    }
    const n = parseInt(String(m).replace('time', ''), 10);
    if (!isFinite(n) || n <= 0) return 0;   // words mode: no clock
    return clampDuration(n);
  }
  function clampDuration(s) {
    return Math.max(5, Math.min(7200, Math.round(s)));   // 5s .. 2 hours
  }
  /** label for the dropdown button */
  function modeLabel() {
    const d = modeDuration();
    if (!d) return '—';
    const known = { 60: '1 min', 120: '2 min', 300: '5 min', 600: '10 min', 900: '15 min', 1800: '30 min', 3600: '1 hour' };
    if (S.settings.mode === 'custom') return GX.fmt.dur(d) + ' ✎';
    return known[d] || GX.fmt.dur(d);
  }

  /* ---------- render text ---------- */
  function buildText() {
    const text = W.generate(S.settings.mode, S.seed, {
      list: S.settings.list,
      difficulty: S.settings.difficulty,
      punctuation: S.settings.punctuation,
      caps: S.settings.caps,
      numbers: S.settings.numbers
    });
    S.words = text.split(' ').filter(Boolean);
    D.words.textContent = '';
    S.wordEls = S.words.map(function (w) {
      const we = GX.make('div', 'word');
      for (let i = 0; i < w.length; i++) {
        const ch = w[i] === ' ' ? GX.make('span', 'char space', '\u00a0') : GX.make('span', 'char', w[i]);
        ch.dataset.i = i;
        we.appendChild(ch);
      }
      D.words.appendChild(we);
      return we;
    });
  }

  /* ---------- caret ---------- */
  function caretEl() {
    const we = S.wordEls[S.wi];
    if (!we) return null;
    const chars = we.children;
    if (S.ci < chars.length) return chars[S.ci];
    return chars[chars.length - 1] || null;
  }

  function moveCaret(smooth) {
    const target = caretEl();
    if (!target || !D.words) return;
    const wr = D.words.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const atEnd = S.ci >= S.wordEls[S.wi].children.length;
    const x = (atEnd ? tr.right : tr.left) - wr.left + D.words.scrollLeft;
    const y = tr.top - wr.top + D.words.scrollTop;
    D.caret.style.transition = smooth ? '' : 'none';
    D.caret.style.transform = 'translate(' + x + 'px, ' + (y + 3) + 'px)';
    if (!smooth) { void D.caret.offsetWidth; D.caret.style.transition = ''; }

    // keep the active line centred
    const lineH = parseFloat(getComputedStyle(D.words).lineHeight) || 44;
    const visible = D.words.clientHeight;
    const wanted = Math.max(0, y - lineH);
    if (Math.abs(D.words.scrollTop - wanted) > 2) D.words.scrollTop = wanted;
    void visible;
  }

  function caretBlink(on) { D.caret.classList.toggle('blink', !!on); }

  /* ---------- render current word state ---------- */
  function paintWord() {
    const expected = S.words[S.wi] || '';
    const we = S.wordEls[S.wi];
    if (!we) return;
    we.classList.remove('error-word');

    // strip any leftover "extra" spans from previous typing
    Array.prototype.slice.call(we.querySelectorAll('.extra')).forEach(function (n) { n.remove(); });

    // rebuild the base characters from the expected word (cheap and always correct)
    const kids = we.children;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      const ch = expected[i];
      const isSpace = ch === ' ';
      c.className = 'char' + (isSpace ? ' space' : '');
      c.textContent = isSpace ? '\u00a0' : ch;
    }

    let wrong = false;
    for (let i = 0; i < S.input.length; i++) {
      const typed = S.input[i];
      if (i < we.children.length) {
        const c = we.children[i];
        if (typed === expected[i]) {
          c.className = 'char correct' + (expected[i] === ' ' ? ' space' : '');
        } else {
          c.className = 'char incorrect' + (expected[i] === ' ' ? ' space' : '');
          wrong = true;
        }
      } else {
        const ex = GX.make('span', 'char extra incorrect', typed);
        we.appendChild(ex);
        wrong = true;
      }
    }
    if (wrong) we.classList.add('error-word');
  }

  /* ---------- run lifecycle ---------- */
  function reset(newText) {
    clearInterval(S.timerId);
    S.timerId = null;
    S.running = false;
    S.ended = false;
    S.wi = 0; S.ci = 0; S.input = '';
    S.stats = new Engine.Stats();
    S.lastSample = 0;
    S.flashedAt = 0;
    Array.prototype.slice.call(document.querySelectorAll('.wpm-flash')).forEach(function (n) { n.remove(); });
    if (newText) { S.seed = (Math.random() * 1e9) | 0; buildText(); }
    D.words.scrollTop = 0;
    paintWord();
    moveCaret(false);
    caretBlink(true);

    S.durationSec = modeDuration();
    S.timeLeft = S.durationSec || 0;
    D.timeLeft.textContent = S.durationSec ? GX.fmt.clock(S.durationSec) : '--';
    D.wpmLive.textContent = '0';
    D.accLive.textContent = '100';
    D.rawLive.textContent = '0';
    D.errLive.textContent = '0';
    D.barFill.style.width = '100%';
    D.barWrap.classList.remove('low');
    GX.Chart.drawLive(D.graph, [], S.durationSec || 60);

    D.testView.classList.remove('hidden');
    D.resultView.classList.add('hidden');
    setLock(true);
    updateHint();
    highlightKey();
  }

  function setLock(locked) {
    S.focus = !locked;
    if (D.focusLock) D.focusLock.classList.toggle('hidden', !locked);
    D.words.classList.toggle('blurred', locked);
  }

  function updateHint() {
    if (!D.modeHint) return;
    const s = S.settings;
    const parts = [];
    if (isTimeMode()) parts.push(GX.fmt.dur(S.durationSec || modeDuration()));
    else parts.push(s.mode.replace('words', '') + ' words');
    parts.push(s.list === 'top200' ? 'common 200' : s.list === 'top500' ? 'common 500' : s.list === 'code' ? 'code words' : s.list === 'quotes' ? 'quotes' : s.list === 'easy' ? 'easy' : s.list === 'numbers' ? 'numbers' : s.list === 'hcm' ? 'HCM mix' : s.list);
    if (s.difficulty === 'hard') parts.push('hard mix');
    if (s.punctuation) parts.push('punctuation');
    if (s.caps) parts.push('caps');
    if (s.numbers) parts.push('numbers');
    D.modeHint.textContent = parts.join('  ·  ');
    const pb = GX.Store.getPB(s.mode, s.list);
    D.pbLine.textContent = pb ? 'PB ' + pb + ' wpm' : 'no personal best yet';
  }

  function begin(now) {
    S.running = true;
    S.stats.start(now);
    if (S.durationSec) {
      S.timeLeft = S.durationSec;
      S.timerId = setInterval(tick, 1000);
      D.barFill.style.width = '100%';
    }
    setLock(false);
    if (S.settings.sound) GX.Audio.start();
  }

  function tick() {
    const now = performance.now();
    if (!S.durationSec) return;
    S.timeLeft = Math.max(0, S.timeLeft - 1);
    D.timeLeft.textContent = GX.fmt.clock(S.timeLeft);
    const pct = (S.timeLeft / S.durationSec) * 100;
    D.barFill.style.width = pct + '%';
    // warn in the last 20% of the run, but never later than the final 30s
    D.barWrap.classList.toggle('low', pct <= 20 || S.timeLeft <= 30);
    S.stats.sample(now);
    refreshHud(now);
    GX.Chart.drawLive(D.graph, S.stats.samples, S.durationSec);
    if (S.timeLeft <= 0) finish();
  }

  function refreshHud(now) {
    D.wpmLive.textContent = GX.fmt.int(S.stats.wpm(now));
    D.rawLive.textContent = GX.fmt.int(S.stats.rawWpm(now));
    D.accLive.textContent = GX.fmt.one(S.stats.accuracy());
    D.errLive.textContent = GX.fmt.int(S.stats.incorrectChars + S.stats.extraChars);
    checkWpmFlash(now);
  }

  /* ---------- live WPM threshold flash ----------
     Fires the moment the pace crosses the target (default 35 WPM), once per
     crossing — not every keystroke. If the pace drops back below the target
     the flag resets, so climbing past it again flashes once more.
     ------------------------------------------------ */
  function checkWpmFlash(now) {
    const target = Number(S.settings.wpmFlash) || 0;
    if (!target || !S.running) return;
    // let the run settle first: a half-second-old "WPM" of 300 is just noise,
    // and flashing on the first keystrokes is not what the celebration means
    if (S.stats.elapsedSec(now) < 5 || S.stats.correctChars < 15) return;
    const wpm = S.stats.wpm(now);
    if (wpm >= target) {
      if (S.flashedAt) return;            // already celebrated this crossing
      S.flashedAt = target;
      showWpmFlash(target, false);
    } else {
      S.flashedAt = 0;
    }
  }

  function showWpmFlash(target) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = GX.make('div', 'wpm-flash');
    el.appendChild(GX.make('span', null, target + ' WPM'));
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1100);
    if (S.settings.sound) GX.Audio.start();
  }

  /** Full-screen celebration flash (the NEW PB style) for the results reveal.
   *  `celebrate` switches it to the green 35+ congratulation look. */
  function flashScreen(text, celebrate) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const flash = GX.make('div', celebrate ? 'pb-flash celebrate' : 'pb-flash');
    flash.appendChild(GX.make('span', null, text));
    document.body.appendChild(flash);
    setTimeout(function () { flash.remove(); }, 1500);
    if (S.settings.sound) GX.Audio.finish();
  }

  /* ---------- input handling ---------- */
  function typeChar(ch, now) {
    if (!S.running) begin(now);
    caretBlink(false);

    const expected = S.words[S.wi];
    S.input += ch;
    S.ci = S.input.length;

    if (S.ci - 1 < expected.length) {
      const ok = ch === expected[S.ci - 1];
      S.stats.record(ok ? 'correct' : 'incorrect', now);
      if (!ok && S.settings.sound) GX.Audio.err();
    } else {
      S.stats.record('extra', now);
    }
    if (S.settings.sound) GX.Audio.key();

    paintWord();
    moveCaret(true);
    refreshHud(now);
    highlightKey();
    maybeExtend(now);
  }

  function backspace(now, whole) {
    if (!S.running) return;          // nothing to undo before the run starts
    if (S.input.length === 0) return;
    S.stats.noteBackspace();
    S.input = whole ? '' : S.input.slice(0, -1);
    S.ci = S.input.length;
    S.stats.noteCorrection();
    paintWord();
    moveCaret(true);
    highlightKey();
    refreshHud(now);                 // keep the live numbers honest after edits
  }

  function commitWord(now) {
    if (!S.running) begin(now);
    const expected = S.words[S.wi];
    if (S.input.length === 0) return;
    S.stats.pushWord(S.input, expected, now);

    // count un-typed trailing characters of the submitted word as missed
    if (S.input.length < expected.length) {
      for (let i = S.input.length; i < expected.length; i++) S.stats.record('missed', now);
    }

    // advance — but if this was the last word, finish() takes over.
    // Clear the buffer first, otherwise finish() counts the word a second time.
    if (S.wi >= S.wordEls.length - 1) {
      S.input = '';
      finish();
      return;
    }
    S.wordEls[S.wi].classList.toggle('error-word', S.input !== expected);
    S.wi++;
    S.input = '';
    S.ci = 0;
    paintWord();
    moveCaret(true);
    refreshHud(now);
    highlightKey();
    if (!isTimeMode() && S.stats.wordsTyped >= wordTarget()) finish();
  }

  function wordTarget() {
    const m = S.settings.mode;
    return parseInt(m.replace('words', ''), 10) || 10;
  }

  /** time mode: keep generating more words so the runner never runs out */
  function maybeExtend(now) {
    if (S.wi > S.wordEls.length - 30) {
      const more = W.generate('time60', (S.seed + S.wi) | 0, {
        list: S.settings.list,
        difficulty: S.settings.difficulty,
        punctuation: S.settings.punctuation,
        caps: S.settings.caps,
        numbers: S.settings.numbers
      }).split(' ').filter(Boolean);
      more.forEach(function (w) {
        S.words.push(w);
        const we = GX.make('div', 'word');
        for (let i = 0; i < w.length; i++) {
          const ch = GX.make('span', 'char', w[i]);
          ch.dataset.i = i;
          we.appendChild(ch);
        }
        D.words.appendChild(we);
        S.wordEls.push(we);
      });
    }
    void now;
  }

  /* ---------- finish + results ---------- */
  function finish() {
    if (S.ended) return;
    S.ended = true;
    S.running = false;
    clearInterval(S.timerId);
    S.timerId = null;
    const now = performance.now();
    // if user quit a word early, still count the current one
    if (S.input.length) S.stats.pushWord(S.input, S.words[S.wi], now);
    S.stats.finish(now);
    if (S.settings.sound) GX.Audio.finish();
    showResults(S.stats.summary(now));
  }

  function abort() {
    if (!S.running && !S.ended) return;
    S.ended = true; S.running = false;
    clearInterval(S.timerId); S.timerId = null;
    reset(false);
  }

  function showResults(r) {
    D.testView.classList.add('hidden');
    D.resultView.classList.remove('hidden');

    GX.el('#resWpm').textContent = GX.fmt.int(r.wpm);
    GX.el('#resRaw').textContent = GX.fmt.int(r.raw);
    GX.el('#resAcc').textContent = GX.fmt.one(r.accuracy) + '%';
    GX.el('#resCons').textContent = GX.fmt.int(r.consistency) + '%';
    GX.el('#resChars').textContent = r.correctChars + '/' + r.keystrokes;
    GX.el('#resErr').textContent = r.incorrectChars + r.extraChars;
    GX.el('#resWords').textContent = r.words;
    GX.el('#resTime').textContent = Math.round(r.seconds) + 's';
    GX.el('#resDate').textContent = GX.fmt.date(Date.now());
    GX.el('#resMode').textContent = S.settings.mode + ' · ' + S.settings.list +
      (S.settings.difficulty === 'hard' ? ' · hard' : '') +
      (S.settings.punctuation ? ' · punct' : '') + (S.settings.caps ? ' · caps' : '');

    const g = GX.grade(r.wpm, r.accuracy);
    GX.el('#resGradeLabel').textContent = g.label;
    GX.el('#resGradeNote').textContent = g.note;
    GX.el('#resGradeBadge').textContent = 'grade ' + g.label + ' · ' + g.note;
    GX.el('#resGrade').className = 'stat ' + (g.cls || '');

    // accuracy bar
    GX.el('#accBarFill').style.width = Math.max(2, r.accuracy) + '%';
    GX.el('#consBarFill').style.width = Math.max(2, r.consistency) + '%';

    // badges
    const badges = GX.el('#resBadges');
    badges.textContent = '';
    if (r.accuracy >= 98) badges.appendChild(GX.make('span', 'badge lime', 'clean run'));
    if (r.accuracy >= 95 && r.accuracy < 98) badges.appendChild(GX.make('span', 'badge', 'sharp'));
    if (r.accuracy < 90) badges.appendChild(GX.make('span', 'badge pink', 'accuracy drag'));
    if (r.consistency >= 85) badges.appendChild(GX.make('span', 'badge', 'metronome'));
    if (r.wpm >= 80) badges.appendChild(GX.make('span', 'badge lime', 'velocity'));
    if (r.backspaces > r.words * 1.2) badges.appendChild(GX.make('span', 'badge pink', 'backspace heavy'));
    if (!badges.children.length) badges.appendChild(GX.make('span', 'badge', 'solid effort'));

    // gauge + chart
    const maxG = Math.max(120, Math.ceil(r.wpm / 20) * 20 + 20);
    GX.Chart.gauge(GX.el('#resGauge'), r.wpm, maxG);
    drawResultChart(r);

    // save
    const rec = {
      ts: Date.now(), mode: S.settings.mode, list: S.settings.list,
      wpm: Math.round(r.wpm), raw: Math.round(r.raw), acc: Math.round(r.accuracy * 10) / 10,
      cons: Math.round(r.consistency), chars: r.keystrokes, words: r.words,
      seconds: Math.round(r.seconds), player: S.settings.playerName || 'SHADOW'
    };
    GX.Store.addResult(rec);
    const pb = GX.Store.setPB(S.settings.mode, S.settings.list, Math.round(r.wpm));

    const pbWrap = GX.el('#pbWrap');
    const flashTarget = Number(S.settings.wpmFlash) || 0;
    const earned = !!flashTarget && r.wpm >= flashTarget;   // finished at 35+
    const newPB = pb.isNew && pb.prev > 0;

    if (newPB) pbWrap.textContent = 'previous best ' + pb.prev + ' wpm — beaten';
    else if (pb.isNew) pbWrap.textContent = 'first recorded run for this mode';
    else pbWrap.textContent = 'personal best ' + pb.prev + ' wpm';

    // the full-screen celebration on the results reveal — it names the actual
    // pace reached, in a green congratulation flash when 35+ was earned
    const wpmText = GX.fmt.int(r.wpm) + ' WPM';
    if (earned || newPB) {
      flashScreen(newPB && earned
        ? 'NEW PB · ' + wpmText
        : newPB ? 'NEW PB' : wpmText,
        earned);
    }

    updateHint();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function drawResultChart(r) {
    const canvas = GX.el('#resGraph');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 700, h = canvas.clientHeight || 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    const samples = r.samples.length > 1 ? r.samples : [{ t: 0, wpm: r.wpm, raw: r.raw, acc: r.accuracy }, { t: 1, wpm: r.wpm, raw: r.raw, acc: r.accuracy }];
    const dur = Math.max(1, samples[samples.length - 1].t);
    const peak = Math.max.apply(null, samples.map(function (s) { return Math.max(s.wpm, s.raw); }));
    const maxW = Math.max(60, Math.ceil(peak / 20) * 20);
    const x0 = 40, y0 = 10, iw = w - 52, ih = h - 34;

    // grid
    c.strokeStyle = 'rgba(139,92,255,.16)';
    c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = y0 + ih * i / 4;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + iw, y); c.stroke();
    }
    c.fillStyle = 'rgba(141,134,184,.85)';
    c.font = '10px ui-monospace, monospace';
    c.textAlign = 'right';
    for (let i = 0; i <= 4; i++) c.fillText(Math.round(maxW * (1 - i / 4)), x0 - 8, y0 + ih * i / 4 + 3);

    function xy(s) {
      return [x0 + iw * (s.t / dur), y0 + ih - ih * Math.min(1, s.wpm / maxW)];
    }
    // fill under wpm
    const grad = c.createLinearGradient(0, y0, 0, y0 + ih);
    grad.addColorStop(0, 'rgba(0,240,255,.30)');
    grad.addColorStop(1, 'rgba(0,240,255,0)');
    c.beginPath();
    c.moveTo(x0, y0 + ih);
    samples.forEach(function (s) { const p = xy(s); c.lineTo(p[0], p[1]); });
    c.lineTo(x0 + iw, y0 + ih);
    c.closePath(); c.fillStyle = grad; c.fill();

    // raw line
    c.save();
    c.strokeStyle = 'rgba(255,43,214,.6)'; c.lineWidth = 1.6;
    c.beginPath();
    samples.forEach(function (s, i) {
      const x = x0 + iw * (s.t / dur);
      const y = y0 + ih - ih * Math.min(1, s.raw / maxW);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.stroke(); c.restore();

    // wpm line
    c.save();
    c.strokeStyle = '#00f0ff'; c.lineWidth = 2.6; c.lineJoin = 'round';
    c.shadowColor = 'rgba(0,240,255,.8)'; c.shadowBlur = 16;
    c.beginPath();
    samples.forEach(function (s, i) { const p = xy(s); if (i === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]); });
    c.stroke(); c.restore();

    // error markers (accuracy dips)
    c.save();
    samples.forEach(function (s) {
      if (s.acc < 95) {
        const p = xy(s);
        c.fillStyle = 'rgba(255,46,99,.85)';
        c.beginPath(); c.arc(p[0], p[1], 3.2, 0, Math.PI * 2); c.fill();
      }
    });
    c.restore();

    // axis label
    c.fillStyle = 'rgba(141,134,184,.8)';
    c.textAlign = 'center';
    c.fillText('seconds', x0 + iw / 2, h - 4);
  }

  /* ---------- virtual keyboard ---------- */
  const ROWS = [
    ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/']
  ];
  const LEFT = { '`': 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, q: 1, w: 1, e: 1, r: 1, t: 1, a: 1, s: 1, d: 1, f: 1, g: 1, z: 1, x: 1, c: 1, v: 1, b: 1, Q: 1, W: 1, E: 1, R: 1, T: 1, A: 1, S: 1, D: 1, F: 1, G: 1, Z: 1, X: 1, C: 1, V: 1, B: 1 };
  let keyMap = {};

  function buildKeyboard() {
    if (!D.kb) return;
    D.kb.textContent = '';
    keyMap = {};
    ROWS.forEach(function (row, ri) {
      const r = GX.make('div', 'kb-row indent-' + ri);
      row.forEach(function (k) {
        const el = GX.make('div', 'key' + (LEFT[k] ? ' f-l' : ' f-r'), k);
        el.dataset.k = k;
        keyMap[k] = el;
        r.appendChild(el);
      });
      D.kb.appendChild(r);
    });
    const last = GX.make('div', 'kb-row');
    const space = GX.make('div', 'key space f-r', 'space');
    space.dataset.k = ' ';
    keyMap[' '] = space;
    last.appendChild(space);
    D.kb.appendChild(last);
  }

  function clearKeys() {
    Object.keys(keyMap).forEach(function (k) { keyMap[k].classList.remove('down', 'wrong'); });
  }

  function highlightKey() {
    if (!D.kb || D.kb.classList.contains('hidden')) return;
    Object.keys(keyMap).forEach(function (k) { keyMap[k].classList.remove('next'); });
    const expected = (S.words[S.wi] || '')[S.ci];
    const ch = expected === undefined ? null : expected;
    if (ch === null) return;
    const lower = ch.toLowerCase();
    const target = keyMap[lower] || keyMap[ch];
    if (target) target.classList.add('next');
    if (ch !== lower && keyMap['shift']) keyMap['shift'].classList.add('next');
    if (ch === ' ' && keyMap[' ']) keyMap[' '].classList.add('next');
  }

  function flashKey(ch, wrong) {
    if (!D.kb || D.kb.classList.contains('hidden')) return;
    const el = keyMap[ch === ' ' ? ' ' : String(ch).toLowerCase()];
    if (!el) return;
    el.classList.add(wrong ? 'wrong' : 'down');
    setTimeout(function () { el.classList.remove('down', 'wrong'); }, 130);
  }

  /* ---------- settings UI ---------- */
  function syncPills() {
    GX.els('[data-setting="mode"] .pill').forEach(function (p) {
      p.classList.toggle('on', p.dataset.value === S.settings.mode);
    });
    GX.els('[data-setting="list"] .pill').forEach(function (p) {
      p.classList.toggle('on', p.dataset.value === S.settings.list);
    });
    GX.els('[data-setting="difficulty"] .pill').forEach(function (p) {
      p.classList.toggle('on', p.dataset.value === S.settings.difficulty);
    });
    ['punctuation', 'caps', 'numbers'].forEach(function (k) {
      GX.els('[data-toggle="' + k + '"]').forEach(function (p) {
        p.classList.toggle('on', !!S.settings[k]);
        p.classList.toggle('pink', !!S.settings[k]);
      });
    });
    const kbToggle = GX.el('[data-toggle="keyboard"]');
    if (kbToggle) {
      kbToggle.classList.toggle('on', !!S.settings.keyboard);
      D.kb.classList.toggle('hidden', !S.settings.keyboard);
    }

    const sndToggle = GX.el('[data-toggle="sound"]');
    if (sndToggle) {
      sndToggle.classList.toggle('on', !!S.settings.sound);
      sndToggle.classList.toggle('pink', !!S.settings.sound);
    }
    const volWrap = GX.el('#volWrap');
    if (volWrap) volWrap.classList.toggle('hidden', !S.settings.sound);
    const volRange = GX.el('#volRange');
    if (volRange) volRange.value = Math.round((S.settings.volume || 0.6) * 100);
    GX.Audio.setVolume(S.settings.sound ? (S.settings.volume || 0.6) : 0);

    // timer dropdown label + selected row
    const label = GX.el('#timeDdLabel');
    if (label) label.textContent = modeLabel();
    GX.els('#timeDdMenu li').forEach(function (li) {
      li.classList.toggle('sel', li.dataset.value === S.settings.mode);
    });
    const box = GX.el('#customTimeBox');
    if (box) box.classList.toggle('on', S.settings.mode === 'custom');
    const cval = GX.el('#customTimeVal');
    if (cval && S.settings.mode === 'custom') {
      const unit = GX.el('#customTimeUnit');
      const d = S.settings.customDuration || 60;
      unit.value = (d % 60 === 0 && d >= 60) ? '60' : '1';
      cval.value = unit.value === '60' ? d / 60 : d;
    }
  }

  function bindPills() {
    GX.els('[data-setting]').forEach(function (group) {
      const key = group.dataset.setting;
      group.addEventListener('click', function (e) {
        const p = e.target.closest('.pill');
        if (!p) return;
        const patch = {};
        patch[key] = p.dataset.value;
        S.settings = GX.Store.setSettings(patch);
        syncPills();
        reset(true);
      });
    });
    GX.els('[data-toggle]').forEach(function (p) {
      p.addEventListener('click', function () {
        const key = p.dataset.toggle;
        const patch = {}; patch[key] = !S.settings[key];
        S.settings = GX.Store.setSettings(patch);
        syncPills();
        if (key === 'keyboard') highlightKey();
        else if (key === 'sound') {
          // give instant feedback on the switch itself
          if (S.settings.sound) GX.Audio.test();
        } else reset(true);
      });
    });

    bindTimerPicker();
    bindVolume();
  }

  /* ---------- timer dropdown ---------- */
  function bindTimerPicker() {
    const dd = GX.el('#timeDd');
    if (!dd) return;
    const btn = GX.el('#timeDdBtn');
    const menu = GX.el('#timeDdMenu');

    function close() { dd.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    function open() { dd.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dd.classList.contains('open')) close(); else open();
    });

    menu.addEventListener('click', function (e) {
      const li = e.target.closest('li');
      if (!li) return;
      const v = li.dataset.value;
      if (v === 'custom') {
        // reveal the input and let the user type a number
        S.settings = GX.Store.setSettings({ mode: 'custom' });
        syncPills();
        close();
        const cval = GX.el('#customTimeVal');
        if (cval) { cval.focus(); cval.select(); }
        return;
      }
      S.settings = GX.Store.setSettings({ mode: v });
      syncPills();
      close();
      reset(true);
    });

    document.addEventListener('click', function (e) {
      if (!dd.contains(e.target)) close();
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); e.stopPropagation(); }
    });

    // custom duration
    const cval = GX.el('#customTimeVal');
    const cunit = GX.el('#customTimeUnit');
    const cset = GX.el('#customTimeSet');

    function applyCustom() {
      const raw = Number(cval.value);
      if (!isFinite(raw) || raw <= 0) { cval.focus(); return; }
      const secs = clampDuration(raw * Number(cunit.value || 60));
      cval.value = cunit.value === '60' ? secs / 60 : secs;
      S.settings = GX.Store.setSettings({ mode: 'custom', customDuration: secs });
      syncPills();
      reset(true);
    }
    if (cset) cset.addEventListener('click', applyCustom);
    if (cval) cval.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); applyCustom(); }
      e.stopPropagation();          // never let digits reach the typing area
    });
    if (cunit) cunit.addEventListener('change', applyCustom);
  }

  /* ---------- key click volume ---------- */
  function bindVolume() {
    const range = GX.el('#volRange');
    if (!range) return;
    range.addEventListener('input', function () {
      const v = Number(range.value) / 100;
      S.settings = GX.Store.setSettings({ volume: v });
      GX.Audio.setVolume(S.settings.sound ? v : 0);
    });
    // let go = play one click so the level is audible
    range.addEventListener('change', function () {
      if (S.settings.sound) GX.Audio.test();
    });
    range.addEventListener('keydown', function (e) { e.stopPropagation(); });
  }

  /* ---------- global keys ---------- */
  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      // ignore when a real input has focus (name field etc.)
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) reset(true); else reset(false);
        if (!D.testView.classList.contains('hidden')) { setLock(false); D.words.focus(); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); abort(); return; }
      if (D.testView.classList.contains('hidden')) return;

      const now = performance.now();

      // Backspace is handled before the modifier guard, otherwise
      // Ctrl/Cmd+Backspace (wipe the whole word) never reaches the handler.
      if (e.key === 'Backspace') { e.preventDefault(); backspace(now, e.ctrlKey || e.metaKey); return; }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === ' ') {
        e.preventDefault();
        if (S.settings.sound) GX.Audio.space();   // space bar sits on a stabiliser
        commitWord(now);
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        const expected = (S.words[S.wi] || '')[S.ci];
        const wrong = S.running && expected !== undefined && expected !== e.key;
        flashKey(e.key, wrong);
        typeChar(e.key, now);
        return;
      }
    });

    // click to focus the typing area
    if (D.focusLock) D.focusLock.addEventListener('click', function () { setLock(false); D.words.focus(); });
    D.words.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (!S.focus) { setLock(false); }
    });
    window.addEventListener('blur', function () { if (S.running || !S.ended) setLock(true); });
    window.addEventListener('resize', function () { moveCaret(false); if (!D.resultView.classList.contains('hidden')) return; });
  }

  /* ---------- buttons ---------- */
  function bindButtons() {
    GX.el('#btnRestart').addEventListener('click', function () { reset(false); setLock(false); D.words.focus(); });
    GX.el('#btnNewText').addEventListener('click', function () { reset(true); setLock(false); D.words.focus(); });
    GX.el('#btnAgain').addEventListener('click', function () { reset(true); setLock(false); D.words.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const share = GX.el('#btnShare');
    if (share) share.addEventListener('click', function () {
      const wpm = GX.el('#resWpm').textContent;
      const acc = GX.el('#resAcc').textContent;
      const txt = 'GODXSHADOW typing test — ' + wpm + ' WPM @ ' + acc + ' accuracy (' + S.settings.mode + ')';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () {
          const old = share.textContent; share.textContent = 'copied!';
          setTimeout(function () { share.textContent = old; }, 1400);
        });
      }
    });
  }

  /** Lessons page links here with ?mode=&list=&diff= — honour them. */
  function readQuery() {
    const q = new URLSearchParams(location.search);
    const patch = {};
    const mode = q.get('mode'), list = q.get('list'), diff = q.get('diff');
    if (mode && /^words(10|25|50|100)$/.test(mode)) patch.mode = mode;
    else if (mode === 'custom') patch.mode = 'custom';
    else if (mode && /^time\d+$/.test(mode)) {
      const secs = clampDuration(parseInt(mode.slice(4), 10));
      if (secs === 60 || secs === 120 || secs === 300 || secs === 600 ||
          secs === 900 || secs === 1800 || secs === 3600) patch.mode = 'time' + secs;
      else { patch.mode = 'custom'; patch.customDuration = secs; }
    }
    const dur = q.get('dur');
    if (dur && /^\d+$/.test(dur)) {
      patch.mode = 'custom';
      patch.customDuration = clampDuration(parseInt(dur, 10));
    }
    if (list && /^(top200|top500|quotes|code|numbers|easy|hcm)$/.test(list)) patch.list = list;
    if (diff === 'hard') patch.difficulty = 'hard';
    if (Object.keys(patch).length) S.settings = GX.Store.setSettings(patch);
  }

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    cacheDom();
    readQuery();
    buildKeyboard();
    bindPills();
    bindKeys();
    bindButtons();
    syncPills();
    reset(true);
    D.words.setAttribute('tabindex', '0');
    // live graph redraw on resize
    window.addEventListener('resize', function () {
      if (!D.testView.classList.contains('hidden')) GX.Chart.drawLive(D.graph, S.stats ? S.stats.samples : [], S.durationSec || 60);
    });
  });
})();
