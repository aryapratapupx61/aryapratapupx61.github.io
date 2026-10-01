/* ============================================================
   GODXSHADOW — secondary pages smoke test
   Loads results / leaderboard / lessons / about in jsdom and
   asserts the page scripts actually run and render.
   Run: node test/pages.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let failures = 0, passes = 0;
function ok(label, cond, extra) {
  if (cond) { passes++; console.log('  ✓ ' + label); }
  else { failures++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}
function eq(label, got, want) {
  if (String(got) === String(want)) { passes++; console.log('  ✓ ' + label + ' = ' + got); }
  else { failures++; console.log('  ✗ ' + label + ': got ' + got + ', want ' + want); }
}

const noop = () => {};
function fakeCtx() {
  return {
    save: noop, restore: noop, setTransform: noop, clearRect: noop, beginPath: noop,
    moveTo: noop, lineTo: noop, arc: noop, stroke: noop, fill: noop, closePath: noop,
    fillText: noop, setLineDash: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 })
  };
}

function loadPage(file, seed) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, {
    runScripts: 'outside-only', url: 'http://localhost:4173/' + file,
    pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  w.scrollTo = noop;
  w.HTMLCanvasElement.prototype.getContext = function () { const c = fakeCtx(); c.canvas = this; return c; };
  w.confirm = () => true;
  w.URL.createObjectURL = () => 'blob:stub';
  w.URL.revokeObjectURL = noop;
  if (seed) {
    w.localStorage.setItem('gx.results.v1', JSON.stringify(seed));
    w.localStorage.setItem('gx.profile.v1', JSON.stringify({
      pb: { 'time60|top200': 84 }, lessons: { home: 45 }
    }));
    w.localStorage.setItem('gx.settings.v1', JSON.stringify({ playerName: 'NEON' }));
  }
  const scripts = Array.prototype.map.call(w.document.querySelectorAll('script[src]'), s => s.getAttribute('src'));
  scripts.forEach(src => w.eval(fs.readFileSync(path.join(ROOT, src), 'utf8')));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w, errors };
}

const SEED = [
  { ts: Date.now() - 500000, mode: 'time60', list: 'top200', wpm: 62, raw: 70, acc: 95.2, cons: 81, chars: 300, words: 58, seconds: 60, player: 'NEON' },
  { ts: Date.now() - 400000, mode: 'time60', list: 'top200', wpm: 71, raw: 79, acc: 96.4, cons: 86, chars: 350, words: 66, seconds: 60, player: 'NEON' },
  { ts: Date.now() - 300000, mode: 'time30', list: 'quotes', wpm: 58, raw: 64, acc: 93.1, cons: 74, chars: 150, words: 29, seconds: 30, player: 'NEON' },
  { ts: Date.now() - 200000, mode: 'words50', list: 'code', wpm: 49, raw: 55, acc: 91.0, cons: 70, chars: 240, words: 50, seconds: 55, player: 'NEON' }
];

console.log('\n[results.html]');
{
  const { w, errors } = loadPage('results.html', SEED);
  eq('no script errors', errors.length, 0);
  if (errors.length) errors.forEach(e => console.log('   ! ' + e));
  eq('summary runs', w.document.querySelector('#stRuns').textContent, '4');
  eq('summary best', w.document.querySelector('#stBest').textContent, '71');
  eq('summary avg', w.document.querySelector('#stAvg').textContent, '60');
  eq('rows rendered', w.document.querySelectorAll('#rows tr').length, 4);
  eq('pb cards rendered', w.document.querySelector('#pbGrid').children.length, 1);
  eq('callsign prefilled', w.document.querySelector('#playerName').value, 'NEON');

  // sorting
  const wpmHeader = w.document.querySelector('th[data-sort="wpm"]');
  wpmHeader.dispatchEvent(new w.Event('click', { bubbles: true }));
  const firstRowWpm = w.document.querySelector('#rows tr td:nth-child(4)').textContent;
  eq('sort by wpm desc puts 71 first', firstRowWpm, '71');
  wpmHeader.dispatchEvent(new w.Event('click', { bubbles: true }));
  eq('second click flips to asc', w.document.querySelector('#rows tr td:nth-child(4)').textContent, '49');

  // filtering
  const sel = w.document.querySelector('#filterMode');
  sel.value = 'time30';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  eq('filter to time30 leaves 1 row', w.document.querySelectorAll('#rows tr').length, 1);
  sel.value = '';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  eq('clearing filter restores 4 rows', w.document.querySelectorAll('#rows tr').length, 4);

  // csv export
  let clicked = null;
  const origClick = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function () { clicked = this.download; };
  w.document.querySelector('#btnExport').dispatchEvent(new w.Event('click', { bubbles: true }));
  eq('csv export triggered with filename', clicked, 'godxshadow-history.csv');
  w.HTMLAnchorElement.prototype.click = origClick;
}

console.log('\n[results.html — empty state]');
{
  const { w, errors } = loadPage('results.html', null);
  eq('no script errors', errors.length, 0);
  ok('empty state visible', !w.document.querySelector('#emptyState').classList.contains('hidden'));
  eq('runs counter zero', w.document.querySelector('#stRuns').textContent, '0');
}

console.log('\n[leaderboard.html]');
{
  const { w, errors } = loadPage('leaderboard.html', SEED);
  eq('no script errors', errors.length, 0);
  if (errors.length) errors.forEach(e => console.log('   ! ' + e));
  const rows = w.document.querySelectorAll('#lbRows tr');
  eq('roster + me = 8 rows', rows.length, 8);
  ok('my row is highlighted', Array.prototype.some.call(rows, tr => tr.style.background.indexOf('0,240,255') > -1 || tr.style.background.indexOf('rgba(0, 240, 255') > -1),
    rows[rows.length - 1].getAttribute('style'));
  ok('your rank computed', /^#\d+ \/ \d+$/.test(w.document.querySelector('#yourRank').textContent),
    w.document.querySelector('#yourRank').textContent);
  ok('gap to #1 computed', /^\+\d+$/.test(w.document.querySelector('#gapTop').textContent),
    w.document.querySelector('#gapTop').textContent);
  ok('sorted desc by wpm', Number(rows[0].children[2].textContent) >= Number(rows[1].children[2].textContent));

  // switching mode re-renders
  const before = w.document.querySelector('#lbRows').textContent;
  w.document.querySelector('#lbModes .pill[data-value="time300"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  ok('mode switch re-renders board', w.document.querySelector('#lbRows').textContent !== before);
  // the seed has no 5 min run, so only the 7 reference typists show
  eq('5 min board drops my row (no run in that mode)', w.document.querySelectorAll('#lbRows tr').length, 7);
  eq('rank resets to — when I have no run', w.document.querySelector('#yourRank').textContent, '—');
  ok('hint names the mode in plain words', /5 min/.test(w.document.querySelector('#yourRank').nextElementSibling.textContent),
    w.document.querySelector('#yourRank').nextElementSibling.textContent);
  w.document.querySelector('#lbModes .pill[data-value="time3600"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  eq('1 hour board renders', w.document.querySelectorAll('#lbRows tr').length, 7);
  ok('longer runs are rated slower',
    Number(w.document.querySelectorAll('#lbRows tr')[0].children[2].textContent) < 100,
    w.document.querySelectorAll('#lbRows tr')[0].children[2].textContent);
  w.document.querySelector('#lbModes .pill[data-value="time60"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  eq('switching back restores 8 rows', w.document.querySelectorAll('#lbRows tr').length, 8);
  eq('all 9 boards available', w.document.querySelectorAll('#lbModes .pill').length, 9);
}

console.log('\n[lessons.html]');
{
  const { w, errors } = loadPage('lessons.html', SEED);
  eq('no script errors', errors.length, 0);
  if (errors.length) errors.forEach(e => console.log('   ! ' + e));
  eq('lesson cards rendered', w.document.querySelector('#lessonGrid').children.length, 9);
  ok('finger map built', w.document.querySelectorAll('#fingerMap .key').length >= 47,
    String(w.document.querySelectorAll('#fingerMap .key').length));
  const links = Array.prototype.map.call(w.document.querySelectorAll('#lessonGrid a.btn'), a => a.getAttribute('href'));
  ok('every lesson links to the test with params', links.every(h => /^index\.html\?mode=/.test(h)), links[0]);
  ok('stored lesson best is shown', /45 wpm/.test(w.document.querySelector('#lessonGrid').textContent));
}

console.log('\n[about.html]');
{
  const { w, errors } = loadPage('about.html', null);
  eq('no script errors', errors.length, 0);
  ok('shortcut list rendered', w.document.querySelectorAll('.keycap').length >= 6,
    String(w.document.querySelectorAll('.keycap').length));
  ok('faq list rendered', w.document.querySelectorAll('.list').length >= 2);
}

console.log('\n[history — passage + long-run rows]');
{
  const seed = [
    { ts: Date.now() - 90000, mode: 'time3600', list: 'top500', wpm: 78, raw: 86, acc: 96.1, cons: 91, chars: 23000, words: 4400, seconds: 3600, player: 'NEON' },
    { ts: Date.now() - 60000, mode: 'custom', list: 'top200', wpm: 83, raw: 90, acc: 97.2, cons: 88, chars: 900, words: 170, seconds: 420, player: 'NEON' },
    { ts: Date.now() - 30000, mode: 'passage', list: 'story', wpm: 69, raw: 74, acc: 98.4, cons: 93, chars: 800, words: 150, seconds: 310, player: 'NEON', passage: 'Night Shift' }
  ];
  const { w, errors } = loadPage('results.html', seed);
  eq('no script errors', errors.length, 0);
  eq('three rows rendered', w.document.querySelectorAll('#rows tr').length, 3);
  const filter = w.document.querySelector('#filterMode');
  const opts = Array.prototype.map.call(filter.options, o => o.value);
  ok('filter offers the new time presets', ['time300', 'time900', 'time1800', 'time3600', 'custom'].every(v => opts.indexOf(v) >= 0),
    opts.join(','));
  filter.value = 'time3600';
  filter.dispatchEvent(new w.Event('change', { bubbles: true }));
  eq('filtering to 1 hour leaves one row', w.document.querySelectorAll('#rows tr').length, 1);
  filter.value = 'passage';
  filter.dispatchEvent(new w.Event('change', { bubbles: true }));
  eq('filtering to passage leaves one row', w.document.querySelectorAll('#rows tr').length, 1);
}

console.log('\n[mechanical keyboard audio]');
{
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'http://x/' });
  const w = dom.window;
  // record every Web Audio node the engine builds, so we can assert on the
  // shape of a click without needing a real audio device
  const calls = { bufferSource: 0, oscillator: 0, bandpass: 0, highpass: 0, gains: 0, starts: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  function node(extra) {
    return Object.assign({
      connect() {}, disconnect() {}, start() { calls.starts++; }, stop() {},
      frequency: param(), Q: param(), gain: param(), playbackRate: param()
    }, extra || {});
  }
  w.AudioContext = function () {
    return {
      state: 'running', currentTime: 0, sampleRate: 44100, destination: node(),
      resume() {},
      createGain() { calls.gains++; return node(); },
      createOscillator() { calls.oscillator++; return node({ type: 'sine' }); },
      createBufferSource() { calls.bufferSource++; return node({ buffer: null }); },
      createBiquadFilter() {
        const n = node({ type: '' });
        Object.defineProperty(n, 'type', {
          get() { return n._t; },
          set(v) { n._t = v; if (v === 'bandpass') calls.bandpass++; if (v === 'highpass') calls.highpass++; }
        });
        return n;
      },
      createBuffer(ch, len) {
        const data = new Float32Array(len);
        return { getChannelData: () => data, length: len };
      }
    };
  };
  w.eval(fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8'));

  w.GX.Audio.setVolume(0.8);
  eq('volume is stored', w.GX.Audio.getVolume(), 0.8);
  w.GX.Audio.key();
  ok('a key press builds noise transients', calls.bufferSource >= 2, String(calls.bufferSource));
  ok('click is bandpass filtered', calls.bandpass >= 2, String(calls.bandpass));
  ok('click is highpass filtered to kill mud', calls.highpass >= 2, String(calls.highpass));
  ok('a key press adds a low body thump', calls.oscillator >= 1, String(calls.oscillator));
  // one press = down-click (noise) + body thump (osc) + release tick (noise)
  eq('one press schedules exactly 3 sources', calls.starts, 3);

  const before = calls.bufferSource;
  w.GX.Audio.space();
  ok('space bar plays too', calls.bufferSource > before, String(calls.bufferSource));

  // muted: nothing should be scheduled
  w.GX.Audio.setVolume(0);
  eq('volume 0 mutes', w.GX.Audio.getVolume(), 0);
  const mutedAt = calls.bufferSource;
  w.GX.Audio.key();
  w.GX.Audio.space();
  eq('no nodes built while muted', calls.bufferSource, mutedAt);

  w.GX.Audio.setVolume(2);
  eq('volume clamps to 1', w.GX.Audio.getVolume(), 1);
  w.GX.Audio.setVolume(-3);
  eq('volume clamps to 0', w.GX.Audio.getVolume(), 0);
}

console.log('\n[clock + duration formatting]');
{
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'http://x/' });
  dom.window.eval(fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8'));
  const f = dom.window.GX.fmt;
  eq('clock 47', f.clock(47), '47');
  eq('clock 60', f.clock(60), '1:00');
  eq('clock 135', f.clock(135), '2:15');
  eq('clock 600', f.clock(600), '10:00');
  eq('clock 3600', f.clock(3600), '60:00');
  eq('clock pads single digits', f.clock(305), '5:05');
  eq('clock never goes negative', f.clock(-9), '0');
  eq('dur 30', f.dur(30), '30s');
  eq('dur 60', f.dur(60), '1 min');
  eq('dur 300', f.dur(300), '5 min');
  eq('dur 900', f.dur(900), '15 min');
  eq('dur 1800', f.dur(1800), '30 min');
  eq('dur 3600', f.dur(3600), '1 hour');
  eq('dur 420', f.dur(420), '7 min');
}

console.log('\n[hero auto-typing tagline]');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/navigation/i.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, {
    runScripts: 'outside-only', url: 'http://localhost:4173/index.html',
    pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  w.scrollTo = noop;
  w.matchMedia = () => ({ matches: false, addEventListener: noop });
  w.HTMLCanvasElement.prototype.getContext = function () { const c = fakeCtx(); c.canvas = this; return c; };
  w.setInterval = () => 1; w.clearInterval = noop;
  // the typewriter schedules with setTimeout; capture the callbacks so the
  // test can drive the whole cycle deterministically
  let pending = null;
  w.setTimeout = (fn) => { pending = fn; return 1; };
  w.clearTimeout = () => {};
  const fire = () => { const f = pending; pending = null; if (f) f(); };

  ok('hero.js is actually included in the page',
    Array.prototype.some.call(w.document.querySelectorAll('script[src]'),
      s => s.getAttribute('src') === 'js/hero.js'));

  Array.prototype.map.call(w.document.querySelectorAll('script[src]'), s => s.getAttribute('src'))
    .forEach(src => w.eval(fs.readFileSync(path.join(ROOT, src), 'utf8')));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  eq('no script errors', errors.length, 0);
  if (errors.length) errors.forEach(e => console.log('   ! ' + e));

  const H = w.GX_Hero;
  const el = w.document.querySelector('#heroText');
  ok('typewriter booted', H && typeof H.step === 'function');
  eq('split into 3 parts', H.LINES.length, 3);
  ok('part 1 is the live-metrics line', /^Real-time WPM/.test(H.LINES[0]), H.LINES[0]);
  ok('part 2 is the no-account line', /^No account/.test(H.LINES[1]), H.LINES[1]);
  ok('part 3 is the browser line', /^Everything runs/.test(H.LINES[2]), H.LINES[2]);
  ok('caret element present in the DOM', !!w.document.querySelector('.tw-caret'));

  // drive one full cycle: type 1, erase 1, type 2, erase 2, type 3, erase 3, back to 1
  const seen = [];
  for (let guard = 0; guard < 900; guard++) {
    const s = H.state();
    seen.push(s.line + ':' + s.phase);
    // record the moment each line finishes typing
    if (s.phase === 'hold' && s.chars === H.LINES[s.line].length && !seen.includes('full' + s.line)) {
      seen.push('full' + s.line);
      eq('part ' + (s.line + 1) + ' typed in full into the DOM', el.textContent, H.LINES[s.line]);
    }
    if (s.phase === 'gap' && s.chars === 0 && !seen.includes('empty' + s.line)) {
      seen.push('empty' + s.line);
      eq('part ' + (s.line + 1) + ' erased before the next', el.textContent, '');
    }
    if (seen.includes('empty2') && s.line === 0 && s.phase === 'type') break;   // wrapped around
    fire();
  }

  ok('part 1 typed then erased', seen.includes('full0') && seen.includes('empty0'));
  ok('part 2 typed then erased', seen.includes('full1') && seen.includes('empty1'));
  ok('part 3 typed then erased', seen.includes('full2') && seen.includes('empty2'));
  ok('loops back to part 1 after the last', H.state().line === 0 && H.state().phase === 'type',
    JSON.stringify(H.state()));

  // the four phases must come in order for one line
  const phasesOfLine0 = seen.filter(s => s.indexOf('0:') === 0).map(s => s.split(':')[1]);
  const order = phasesOfLine0.filter((p, i) => phasesOfLine0.indexOf(p) === i).join(' > ');
  eq('phase order for a line', order, 'type > hold > erase > gap');

  // typing is character by character, not instant
  H.stop();
  fire();
  const before = H.state().chars;
  H.step();
  eq('each step adds exactly one character', H.state().chars, before + 1);
  eq('DOM mirrors the state', el.textContent.length, H.state().chars);
  H.stop();
}

console.log('\n[speedometer gauge — rev up and settle]');
{
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'http://x/' });
  const w = dom.window;

  // controllable clock + manual rAF queue so the sweep can be stepped
  let NOW = 0;
  w.performance.now = () => NOW;
  const rafQ = [];
  w.requestAnimationFrame = cb => { rafQ.push(cb); return rafQ.length; };
  w.cancelAnimationFrame = () => {};
  w.matchMedia = () => ({ matches: false });

  // recording 2d context: remembers every arc so we can watch the sweep
  const START = Math.PI * 0.75, SWEEP = Math.PI * 1.5;
  const arcs = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    const R = (this.clientWidth || 300) / 2 - 30;
    return {
      canvas: this, lineCap: '', lineWidth: 0, strokeStyle: '', fillStyle: '',
      shadowColor: '', shadowBlur: 0, font: '', textAlign: '', textBaseline: '',
      setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() {}, fill() {}, fillText() {},
      arc(x, y, rad, a0, a1) { if (Math.abs(rad - R) < 1) arcs.push([a0, a1]); },
      createLinearGradient: () => ({ addColorStop() {} })
    };
  };
  w.eval(fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8'));

  const canvas = w.document.createElement('canvas');
  const progressEnds = [];
  function sweepFrame() {
    arcs.length = 0;
    const cb = rafQ.shift();
    NOW += 110;
    if (cb) cb(NOW);
    // the progress arc = same start angle as the track but a shorter end
    const prog = arcs.filter(a => Math.abs(a[0] - START) < 1e-6 && a[1] < START + SWEEP - 1e-6);
    return prog.length ? prog[prog.length - 1][1] : null;
  }

  w.GX.Chart.gauge(canvas, 80, 120);
  ok('animation scheduled', rafQ.length === 1);

  let frames = 0, prev = -1, monotonic = true;
  while (rafQ.length && frames < 40) {
    const end = sweepFrame();
    frames++;
    if (end !== null) {
      if (end < prev - 1e-9) monotonic = false;
      prev = end;
      progressEnds.push(end);
    }
  }

  const expected = START + SWEEP * (80 / 120);
  ok('sweep ran across several frames', frames >= 5, String(frames));
  ok('sweep climbs from the bottom (monotonic)', monotonic && progressEnds[0] < expected,
    progressEnds.map(x => x.toFixed(2)).join(' '));
  ok('first frame is near the bottom of the dial', progressEnds[0] < START + SWEEP * 0.5,
    String(progressEnds[0] && progressEnds[0].toFixed(2)));
  eq('needle settles exactly on the value', Math.abs(prev - expected) < 1e-6, true);
  eq('no more frames once settled', rafQ.length, 0);

  // second run on the same canvas cancels the first sweep
  w.GX.Chart.gauge(canvas, 40, 120);
  ok('a re-run schedules a fresh sweep', rafQ.length === 1);
  ok('previous sweep was cancelled', canvas.__gxStop === null || typeof canvas.__gxStop === 'function');

  // reduced motion: final dial in one shot, no animation queue
  const dom2 = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'http://x/' });
  const w2 = dom2.window;
  const arcs2 = [];
  w2.matchMedia = () => ({ matches: true });
  let queued2 = 0;
  w2.requestAnimationFrame = cb => { queued2++; return 1; };
  w2.HTMLCanvasElement.prototype.getContext = function () {
    const R = (this.clientWidth || 300) / 2 - 30;
    return {
      canvas: this, setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() {}, fill() {}, fillText() {}, lineCap: '', lineWidth: 0, strokeStyle: '',
      fillStyle: '', shadowColor: '', shadowBlur: 0, font: '', textAlign: '', textBaseline: '',
      arc(x, y, rad, a0, a1) { if (Math.abs(rad - R) < 1) arcs2.push([a0, a1]); },
      createLinearGradient: () => ({ addColorStop() {} })
    };
  };
  w2.eval(fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8'));
  const canvas2 = w2.document.createElement('canvas');
  w2.GX.Chart.gauge(canvas2, 80, 120);
  eq('reduced motion does not queue animation frames', queued2, 0);
  const prog2 = arcs2.filter(a => Math.abs(a[0] - START) < 1e-6 && a[1] < START + SWEEP - 1e-6);
  ok('reduced motion draws the dial already at the value',
    prog2.length && Math.abs(prog2[prog2.length - 1][1] - expected) < 1e-6,
    String(prog2.length && prog2[prog2.length - 1][1].toFixed(3)));
}

console.log('\n[cross-page consistency]');
{
  const files = ['index.html', 'passages.html', 'practice.html', 'results.html', 'leaderboard.html', 'lessons.html', 'about.html'];
  const navSets = files.map(f => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const dom = new JSDOM(html);
    return Array.prototype.map.call(dom.window.document.querySelectorAll('.nav a'), a => a.getAttribute('href')).join(',');
  });
  ok('nav is identical on every page', navSets.every(n => n === navSets[0]), navSets.join(' | '));
  files.forEach(f => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(f + ' has title + meta description',
      /<title>[^<]+<\/title>/.test(html) && /name="description"/.test(html));
    const refs = (html.match(/(?:src|href)="([^"]+\.(?:js|css))"/g) || [])
      .map(s => s.replace(/.*="([^"]+)"/, '$1')).filter(s => !/^https?:/.test(s));
    const missing = refs.filter(r => !fs.existsSync(path.join(ROOT, r)));
    ok(f + ' local asset refs exist (' + refs.length + ')', missing.length === 0, missing.join(','));
  });
}

console.log('\n────────────────────────────────');
console.log('passed: ' + passes + '   failed: ' + failures);
console.log('────────────────────────────────\n');
process.exit(failures ? 1 : 0);
