/* ============================================================
   GODXSHADOW — store (localStorage) + shared UI helpers
   js/store.js
   ============================================================ */

window.GX = window.GX || {};

/* ---------------- storage ---------------- */
GX.Store = (function () {
  const KEY_RESULTS = 'gx.results.v1';
  const KEY_SETTINGS = 'gx.settings.v1';
  const KEY_PROFILE = 'gx.profile.v1';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota / private mode */ }
  }

  return {
    getResults: function () { return read(KEY_RESULTS, []); },
    addResult: function (r) {
      const all = this.getResults();
      all.push(r);
      write(KEY_RESULTS, all.slice(-300));
      return all;
    },
    clearResults: function () { write(KEY_RESULTS, []); },

    getSettings: function () {
      return Object.assign({
        mode: 'time60',
        list: 'top200',
        difficulty: 'normal',
        punctuation: false,
        caps: false,
        numbers: false,
        sound: true,          // key clicks on by default — the whole point
        volume: 0.55,
        wpmFlash: 35,         // live flash when the pace crosses this WPM
        customDuration: 90,
        keyboard: true,
        caret: 'smooth',
        playerName: 'SHADOW',
        theme: 'neon'
      }, read(KEY_SETTINGS, {}));
    },
    setSettings: function (patch) {
      const s = Object.assign(this.getSettings(), patch);
      write(KEY_SETTINGS, s);
      return s;
    },

    getProfile: function () { return read(KEY_PROFILE, { pb: {}, lessons: {} }); },
    setProfile: function (p) { write(KEY_PROFILE, p); return p; },

    /* personal best keyed by mode+list */
    getPB: function (mode, list) {
      const p = this.getProfile();
      return (p.pb && p.pb[mode + '|' + list]) || null;
    },
    setPB: function (mode, list, value) {
      const p = this.getProfile();
      p.pb = p.pb || {};
      const key = mode + '|' + list;
      const prev = p.pb[key] || 0;
      if (value > prev) { p.pb[key] = value; this.setProfile(p); return { isNew: true, prev: prev }; }
      return { isNew: false, prev: prev };
    },
    bestOverall: function () {
      const p = this.getProfile();
      let best = 0;
      Object.keys(p.pb || {}).forEach(function (k) { if (p.pb[k] > best) best = p.pb[k]; });
      return best;
    }
  };
})();

/* navigate through one helper so tests can intercept it */
GX.go = function (url) { window.location.href = url; };

/* ---------------- dom helpers ---------------- */
GX.el = function (sel, root) { return (root || document).querySelector(sel); };
GX.els = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
GX.make = function (tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
GX.fmt = {
  int: function (n) { return Math.round(n || 0).toString(); },
  one: function (n) { return (Math.round((n || 0) * 10) / 10).toFixed(1); },
  pct: function (n) { return (Math.round((n || 0) * 10) / 10).toFixed(1) + '%'; },
  date: function (ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },
  secs: function (s) {
    s = Math.max(0, Math.round(s));
    return s + 's';
  },
  /** countdown clock: 47 -> "47", 135 -> "2:15", 3600 -> "60:00" */
  clock: function (s) {
    s = Math.max(0, Math.round(s));
    if (s < 60) return String(s);
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  },
  /** human label for a duration: 60 -> "1 min", 3600 -> "1 hour" */
  dur: function (s) {
    if (s < 60) return s + 's';
    const m = s / 60;
    if (m === 1) return '1 min';
    if (m === 60) return '1 hour';
    if (m % 60 === 0) return (m / 60) + ' hours';
    return (Math.round(m * 10) / 10) + ' min';
  }
};

/* ---------------- grade / rank ---------------- */
GX.grade = function (wpm, acc) {
  const a = acc || 0;
  if (a < 85) return { label: 'D', cls: 'bad', note: 'Accuracy drag — slow down and re-aim' };
  if (wpm >= 110 && a >= 97) return { label: 'S+', cls: 'good', note: 'Elite. Shadow-tier output.' };
  if (wpm >= 95 && a >= 96) return { label: 'S', cls: 'good', note: 'Top 1% typing range' };
  if (wpm >= 80 && a >= 94) return { label: 'A', cls: 'good', note: 'Strong and steady' };
  if (wpm >= 65 && a >= 92) return { label: 'B', cls: '', note: 'Above average — push for consistency' };
  if (wpm >= 50) return { label: 'C', cls: 'warn', note: 'Solid everyday speed' };
  return { label: 'D', cls: 'warn', note: 'Keep drilling the home row' };
};

/* ---------------- mechanical keyboard audio ----------------
   A real switch makes three things, so we build all three:
   1. a broadband noise transient  -> the "tak" of the keycap hitting bottom
   2. a short low body thump       -> the plastic/plate resonance
   3. a tiny delayed release click -> the key coming back up
   Every press is slightly randomised so it never sounds like a loop.
   ---------------------------------------------------------- */
GX.Audio = (function () {
  let ctx = null;
  let noiseBuf = null;
  let master = null;
  let volume = 0.6;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** One second of white noise, generated once and reused. */
  function noise(c) {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(c.sampleRate * 1);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
  }

  /** Bandpass-filtered noise burst — the click itself. */
  function click(c, when, freq, q, dur, gain) {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.playbackRate.value = 0.85 + Math.random() * 0.3;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;

    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 420;

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.0016);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(master);
    src.start(when, Math.random() * 0.4, dur + 0.02);
    src.stop(when + dur + 0.03);
  }

  /** Low resonance of the board — the "thock" under the click. */
  function body(c, when, freq, dur, gain) {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, when);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, when + dur);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    o.connect(g); g.connect(master);
    o.start(when); o.stop(when + dur + 0.02);
  }

  function keyPress(kind) {
    const c = ensure(); if (!c || volume <= 0) return;
    const t = c.currentTime;
    // space is a big keycap on a stabiliser: lower, wider, longer
    const space = kind === 'space';
    click(c, t, space ? 1700 + Math.random() * 500 : 2500 + Math.random() * 900,
             space ? 1.1 : 1.7, space ? 0.030 : 0.019, space ? 0.30 : 0.24);
    body(c, t, space ? 92 + Math.random() * 12 : 128 + Math.random() * 26,
            space ? 0.075 : 0.048, space ? 0.20 : 0.13);
    // release tick a few ms later, quieter and brighter
    click(c, t + 0.040 + Math.random() * 0.018, 3900 + Math.random() * 900,
             2.4, 0.011, 0.055);
  }

  function tone(freq, dur, gain, type, delay) {
    const c = ensure(); if (!c || volume <= 0) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    setVolume: setVolume,
    getVolume: function () { return volume; },
    key: function () { keyPress('key'); },
    space: function () { keyPress('space'); },
    err: function () {
      keyPress('key');
      tone(180, 0.07, 0.05, 'sawtooth');
    },
    start: function () { tone(523, 0.09, 0.05); tone(784, 0.12, 0.05, 'sine', 0.09); },
    finish: function () {
      [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.16, 0.05, 'sine', i * 0.11); });
    },
    /** short preview so the volume slider gives instant feedback */
    test: function () { keyPress('key'); }
  };
})();

/* ---------------- chart: live + result graph ---------------- */
GX.Chart = (function () {

  function drawLive(canvas, samples, durationSec) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 180;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    grid(c, w, h, durationSec);
    if (samples.length < 2) { hint(c, w, h); return; }
    const peak = Math.max.apply(null, samples.map(function (s) { return Math.max(s.wpm, s.raw); }));
    const maxW = Math.max(60, Math.ceil(peak / 20) * 20);
    line(c, w, h, samples, durationSec, maxW, 'raw', 'rgba(255,43,214,.55)', false);
    line(c, w, h, samples, durationSec, maxW, 'wpm', '#00f0ff', true);
    accLine(c, w, h, samples, durationSec);
    labels(c, w, h, maxW);
  }

  function grid(c, w, h, durationSec) {
    c.save();
    c.strokeStyle = 'rgba(139,92,255,.16)';
    c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = Math.round(h * i / 4) + .5;
      c.beginPath(); c.moveTo(38, y); c.lineTo(w - 8, y); c.stroke();
    }
    const steps = Math.min(10, Math.max(3, Math.floor(durationSec / 10)));
    for (let i = 0; i <= steps; i++) {
      const x = 38 + (w - 46) * i / steps;
      c.beginPath(); c.moveTo(x + .5, 8); c.lineTo(x + .5, h - 18); c.stroke();
    }
    c.restore();
  }

  function hint(c, w, h) {
    c.save();
    c.fillStyle = 'rgba(141,134,184,.75)';
    c.font = '12px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillText('start typing to plot your curve', w / 2, h / 2);
    c.restore();
  }

  function line(c, w, h, samples, durationSec, maxW, key, color, glow) {
    const x0 = 38, y0 = 8, iw = w - 46, ih = h - 26;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = key === 'wpm' ? 2.4 : 1.6;
    c.lineJoin = 'round';
    if (glow) { c.shadowColor = color; c.shadowBlur = 14; }
    c.beginPath();
    samples.forEach(function (s, i) {
      const x = x0 + iw * Math.min(1, s.t / Math.max(1, durationSec));
      const y = y0 + ih - ih * Math.min(1, (s[key] || 0) / maxW);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.stroke();
    c.restore();
    // dots for wpm
    if (glow) {
      c.save();
      c.fillStyle = '#eaffff';
      samples.forEach(function (s) {
        const x = x0 + iw * Math.min(1, s.t / Math.max(1, durationSec));
        const y = y0 + ih - ih * Math.min(1, (s[key] || 0) / maxW);
        c.beginPath(); c.arc(x, y, 1.9, 0, Math.PI * 2); c.fill();
      });
      c.restore();
    }
  }

  function accLine(c, w, h, samples, durationSec) {
    const x0 = 38, y0 = 8, iw = w - 46, ih = h - 26;
    c.save();
    c.setLineDash([4, 5]);
    c.strokeStyle = 'rgba(166,255,0,.75)';
    c.lineWidth = 1.4;
    c.beginPath();
    samples.forEach(function (s, i) {
      const x = x0 + iw * Math.min(1, s.t / Math.max(1, durationSec));
      const y = y0 + ih - ih * ((s.acc || 0) / 100);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.stroke();
    c.restore();
  }

  function labels(c, w, h, maxW) {
    c.save();
    c.fillStyle = 'rgba(141,134,184,.85)';
    c.font = '10px ui-monospace, monospace';
    c.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = 8 + (h - 26) * i / 4;
      c.fillText(Math.round(maxW * (1 - i / 4)), 32, y + 3);
    }
    c.textAlign = 'center';
    c.fillText('wpm', 20, h - 4);
    c.restore();
  }

  /** Circular WPM gauge for the results screen. */
  /** Circular WPM gauge, built like a car speedometer.
      The arc + needle rev up from bottom-left and settle exactly on the WPM
      value (ease-out sweep, ~1.1s). Ticks light up as the needle passes them,
      the last 15% of the dial is a redline zone, and major ticks carry their
      number like a real dial. With prefers-reduced-motion the dial is drawn
      final-state instantly. */
  function gauge(canvas, value, max) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.clientWidth || 300;
    canvas.width = size * dpr; canvas.height = size * dpr;
    const c = canvas.getContext('2d');
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2, cy = size / 2;
    const r = size / 2 - 30;
    const start = Math.PI * 0.75, sweep = Math.PI * 1.5;
    const target = Math.max(0.001, Math.min(1, value / max));

    // a fresh run cancels any animation still sweeping on this canvas
    if (canvas.__gxStop) { canvas.__gxStop(); canvas.__gxStop = null; }

    function draw(p) {
      c.clearRect(0, 0, size, size);
      c.lineCap = 'round';

      // redline zone on the rim
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(255,46,99,.35)';
      c.beginPath(); c.arc(cx, cy, r + 9, start + sweep * 0.85, start + sweep); c.stroke();

      // dark track
      c.lineWidth = 14;
      c.strokeStyle = 'rgba(139,92,255,.18)';
      c.beginPath(); c.arc(cx, cy, r, start, start + sweep); c.stroke();

      // ticks (light up behind the needle) + major tick numbers
      const TICKS = 24;
      for (let i = 0; i <= TICKS; i++) {
        const f = i / TICKS;
        const a = start + sweep * f;
        const major = i % 6 === 0;
        const lit = f <= p + 1e-9;
        c.lineWidth = major ? 2.4 : 1.4;
        c.strokeStyle = lit ? 'rgba(0,240,255,.9)' : 'rgba(255,255,255,.18)';
        if (lit) { c.shadowColor = 'rgba(0,240,255,.8)'; c.shadowBlur = 8; }
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6));
        c.lineTo(cx + Math.cos(a) * (r + (major ? 14 : 10)), cy + Math.sin(a) * (r + (major ? 14 : 10)));
        c.stroke();
        c.shadowBlur = 0;
        if (major) {
          c.fillStyle = lit ? 'rgba(217,212,255,.95)' : 'rgba(141,134,184,.7)';
          c.font = '600 10px ui-monospace, monospace';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(String(Math.round(max * f)),
            cx + Math.cos(a) * (r + 24), cy + Math.sin(a) * (r + 24));
        }
      }

      // the coloured sweep — stops exactly where the WPM says
      const grad = c.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, '#00f0ff');
      grad.addColorStop(0.55, '#8b5cff');
      grad.addColorStop(1, '#ff2bd6');
      c.lineWidth = 14;
      c.strokeStyle = grad;
      c.shadowColor = 'rgba(0,240,255,.85)';
      c.shadowBlur = 22;
      c.beginPath(); c.arc(cx, cy, r, start, start + sweep * p); c.stroke();
      c.shadowBlur = 0;

      // glowing tip riding the end of the sweep
      const tipA = start + sweep * p;
      c.fillStyle = '#eaffff';
      c.shadowColor = 'rgba(0,240,255,1)';
      c.shadowBlur = 14;
      c.beginPath(); c.arc(cx + Math.cos(tipA) * r, cy + Math.sin(tipA) * r, 4.2, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;

      // needle (the centre number overlays its hub, like a digital cluster)
      const nA = start + sweep * p;
      c.strokeStyle = '#fff';
      c.lineWidth = 2.6;
      c.shadowColor = 'rgba(255,255,255,.7)';
      c.shadowBlur = 10;
      c.beginPath();
      c.moveTo(cx + Math.cos(nA) * r * 0.42, cy + Math.sin(nA) * r * 0.42);
      c.lineTo(cx + Math.cos(nA) * r * 0.72, cy + Math.sin(nA) * r * 0.72);
      c.stroke();
      c.shadowBlur = 0;
    }

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !window.requestAnimationFrame) { draw(target); return; }

    const t0 = (window.performance && window.performance.now) ? window.performance.now() : 0;
    const dur = 1100;
    let rafId = null, stopped = false;

    function frame(now) {
      if (stopped) return;
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);        // ease-out: fast rev, soft stop
      draw(target * e);
      if (t < 1) {
        rafId = window.requestAnimationFrame(frame);
      } else {
        canvas.__gxStop = null;                // settled on the value
      }
    }

    canvas.__gxStop = function () {
      stopped = true;
      if (rafId !== null && window.cancelAnimationFrame) window.cancelAnimationFrame(rafId);
    };
    rafId = window.requestAnimationFrame(frame);
  }

  return { drawLive: drawLive, gauge: gauge };
})();

/* ---------------- nav active state ---------------- */
document.addEventListener('DOMContentLoaded', function () {
  const path = location.pathname.split('/').pop() || 'index.html';
  GX.els('.nav a').forEach(function (a) {
    const href = a.getAttribute('href');
    if (href === path) a.classList.add('active');
  });
  const year = GX.el('#year');
  if (year) year.textContent = new Date().getFullYear();
});
