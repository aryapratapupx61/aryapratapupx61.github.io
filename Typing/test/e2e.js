/* ============================================================
   GODXSHADOW — integration test
   Loads the real index.html + app.js in jsdom, simulates typing,
   asserts on WPM math, DOM state, storage and results rendering.
   Run: node test/e2e.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let passes = 0;

function ok(label, cond, extra) {
  if (cond) { passes++; console.log('  ✓ ' + label); }
  else { failures++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}
function eq(label, got, want) {
  const pass = String(got) === String(want);
  if (pass) { passes++; console.log('  ✓ ' + label + ' = ' + got); }
  else { failures++; console.log('  ✗ ' + label + ': got ' + got + ', want ' + want); }
}

/* ---- fake canvas 2D context (jsdom has no canvas backend) ---- */
function fakeCtx() {
  const noop = function () {};
  return {
    canvas: null,
    save: noop, restore: noop, setTransform: noop, clearRect: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, stroke: noop,
    fill: noop, closePath: noop, fillText: noop, setLineDash: noop,
    createLinearGradient: function () { return { addColorStop: noop }; },
    measureText: function () { return { width: 10 }; }
  };
}

async function run() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const vc = new VirtualConsole();
  const jsErrors = [];
  vc.on('jsdomError', function (e) { jsErrors.push(e.message); });

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost:4173/index.html',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;

  window.HTMLCanvasElement.prototype.getContext = function () {
    const c = fakeCtx(); c.canvas = this; return c;
  };
  // jsdom does not implement scrolling; the app only uses it for cosmetics
  window.scrollTo = function () {};

  /* controlled clock so WPM math is deterministic */
  let NOW = 1000;
  window.performance.now = function () { return NOW; };
  let tickFn = null;
  window.setInterval = function (fn, ms) { tickFn = fn; return 1; };
  window.clearInterval = function () { tickFn = null; };

  function load(rel) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    window.eval(code);
  }

  console.log('\n[1] boot');
  ['js/words.js', 'js/engine.js', 'js/store.js', 'js/app.js'].forEach(load);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  // store.js also listens for DOMContentLoaded (footer year)
  eq('footer year filled', window.document.querySelector('#year').textContent, String(new Date().getFullYear()));
  eq('no jsdom errors on boot', jsErrors.length, 0);
  ok('word list rendered', window.document.querySelectorAll('#words .word').length > 0,
    'words=' + window.document.querySelectorAll('#words .word').length);
  ok('virtual keyboard built', window.document.querySelectorAll('#keyboard .key').length >= 47,
    'keys=' + window.document.querySelectorAll('#keyboard .key').length);
  eq('timer dropdown shows the default', window.document.querySelector('#timeDdLabel').textContent, '1 min');
  eq('dropdown has 7 presets + custom', window.document.querySelectorAll('#timeDdMenu li').length, 8);
  eq('words pills active count', window.document.querySelectorAll('[data-setting="mode"] .pill.on').length, 0);
  ok('focus lock visible before start', !window.document.querySelector('#focusLock').classList.contains('hidden'));

  const wordsEl = window.document.querySelector('#words');
  const expected = Array.prototype.map.call(wordsEl.children, function (w) { return w.textContent; });

  /* ---- simulate typing 3 words perfectly, one per second ---- */
  console.log('\n[2] simulated run (3 words, 1 per second)');
  function key(k) {
    const ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    window.document.dispatchEvent(ev);
    return ev.defaultPrevented;
  }
  function key2(k, mods) {
    const ev = new window.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}));
    window.document.dispatchEvent(ev);
    return ev.defaultPrevented;
  }
  function typeWord(w) {
    for (const ch of w) key(ch);
    key(' ');
  }

  // Tab restarts cleanly without injecting a character, so the expected
  // text below is exactly what gets typed.
  const tab0 = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  ok('tab is intercepted', window.document.dispatchEvent(tab0) === false || tab0.defaultPrevented);
  const expectedAfterTab = Array.prototype.map.call(
    window.document.querySelectorAll('#words .word'), function (x) { return x.textContent; });
  eq('tab kept the same text', expectedAfterTab[0], expected[0]);

  // Backspace on an empty word is swallowed by the app but still starts the
  // clock, so we can prove the handler runs without injecting a character.
  NOW = 1000;
  // Backspace on an empty word is swallowed by the app but still starts the
  // clock, so we can prove the handler runs without injecting a character.
  const prevented = key2('Backspace');
  ok('app intercepts backspace', prevented);

  typeWord(expected[0]);
  NOW += 1000; if (tickFn) tickFn();
  typeWord(expected[1]);
  NOW += 1000; if (tickFn) tickFn();
  typeWord(expected[2]);
  NOW += 1000; if (tickFn) tickFn();

  const chars = expected.slice(0, 3).join('').length;
  const wantWpm = Math.round((chars / 5) / (3 / 60));

  const hudWpm = window.document.querySelector('#wpmLive').textContent;
  const hudAcc = window.document.querySelector('#accLive').textContent;
  const hudRaw = window.document.querySelector('#rawLive').textContent;
  const hudErr = window.document.querySelector('#errLive').textContent;
  eq('HUD wpm matches hand-computed', hudWpm, String(wantWpm));
  eq('HUD accuracy 100 on clean run', hudAcc, '100.0');
  eq('HUD raw equals net on clean run', hudRaw, hudWpm);
  eq('HUD errors zero', hudErr, '0');
  eq('timer counted down', window.document.querySelector('#timeLeft').textContent, '57');
  eq('no premature WPM flash while the run settles', window.document.querySelectorAll('.wpm-flash').length, 0);
  const barW = window.document.querySelector('#timebarFill').style.width;
  ok('timebar width shrank to 95%', barW === '95%', barW);
  ok('timebar not flagged low yet', !window.document.querySelector('#timebar').classList.contains('low'));

  /* ---- finish by pressing the run out (fast-forward the clock) ---- */
  console.log('\n[3] finish + results');
  // 57 more ticks at 1s each drains the 60s test
  for (let i = 0; i < 57; i++) { NOW += 1000; if (tickFn) tickFn(); }

  ok('result view shown', !window.document.querySelector('#resultView').classList.contains('hidden'));
  ok('test view hidden', window.document.querySelector('#testView').classList.contains('hidden'));

  const resWpm = Number(window.document.querySelector('#resWpm').textContent);
  const resAcc = window.document.querySelector('#resAcc').textContent;
  const resWords = Number(window.document.querySelector('#resWords').textContent);
  const resChars = window.document.querySelector('#resChars').textContent;
  const resGrade = window.document.querySelector('#resGradeLabel').textContent;

  // 60s elapsed, only 3 words typed → low WPM expected
  eq('result wpm ~ 3 words over 60s', resWpm, Math.round((chars / 5) / (60 / 60)));
  eq('result words = 3', resWords, 3);
  eq('result chars correct/typed', resChars, chars + '/' + chars);
  eq('result accuracy', resAcc, '100.0%');
  ok('grade label assigned', /^[A-D][+]?$/.test(resGrade), resGrade);
  ok('grade note assigned', window.document.querySelector('#resGradeNote').textContent.length > 5,
    window.document.querySelector('#resGradeNote').textContent);
  ok('badges rendered', window.document.querySelector('#resBadges').children.length > 0);
  ok('PB line rendered', window.document.querySelector('#pbWrap').textContent.length > 0,
    window.document.querySelector('#pbWrap').textContent);

  /* ---- storage ---- */
  console.log('\n[4] persistence');
  const stored = JSON.parse(window.localStorage.getItem('gx.results.v1') || '[]');
  eq('one result saved', stored.length, 1);
  eq('saved mode', stored[0] && stored[0].mode, 'time60');
  eq('saved wpm matches DOM', stored[0] && stored[0].wpm, resWpm);
  const profile = JSON.parse(window.localStorage.getItem('gx.profile.v1') || '{}');
  ok('personal best recorded', profile.pb && profile.pb['time60|top200'] === resWpm,
    JSON.stringify(profile.pb));

  /* ---- restart via tab, then a wrong keystroke ---- */
  console.log('\n[5] restart, errors, backspace, new text');
  const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  window.document.dispatchEvent(tab);
  ok('tab restarts test', !window.document.querySelector('#testView').classList.contains('hidden'));
  eq('HUD reset after restart', window.document.querySelector('#wpmLive').textContent, '0');
  eq('error counter reset', window.document.querySelector('#errLive').textContent, '0');

  const firstWord = window.document.querySelector('#words .word');
  const wordText = firstWord.textContent;
  const right = wordText[0];
  // pick a key that appears nowhere in this word, so it is wrong at any index
  const wrong = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(function (c) {
    return wordText.indexOf(c) < 0;
  })[0];
  NOW = 5000;
  key(wrong);
  eq('wrong char marked incorrect', firstWord.children[0].className, 'char incorrect');
  eq('error HUD = 1', window.document.querySelector('#errLive').textContent, '1');
  ok('word flagged as error word', firstWord.classList.contains('error-word'));

  key2('Backspace');
  eq('after backspace char is neutral again', firstWord.children[0].className, 'char');
  // errors are a cumulative "mistakes made" counter — fixing a word does not
  // erase the fact that you made one (same rule the WPM penalty uses)
  eq('error counter keeps the mistake', window.document.querySelector('#errLive').textContent, '1');

  key(right);
  eq('correct char marked correct', firstWord.children[0].className, 'char correct');
  ok('error word flag cleared', !firstWord.classList.contains('error-word'));

  // ctrl+backspace clears the whole word
  key(wrong);
  ok('second char is now incorrect', firstWord.children[1].className.indexOf('incorrect') > -1,
    firstWord.children[1].className);
  key2('Backspace', { ctrlKey: true });
  eq('ctrl+backspace empties word (char 1 neutral)', firstWord.children[0].className, 'char');
  eq('ctrl+backspace empties word (char 2 neutral)', firstWord.children[1].className, 'char');

  // new text button
  const before = window.document.querySelector('#words').textContent;
  window.document.querySelector('#btnNewText').click();
  const after = window.document.querySelector('#words').textContent;
  ok('new text generated on demand', before !== after);
  ok('word count matches the mode (60s → 160 seeds)', window.document.querySelectorAll('#words .word').length >= 100,
    String(window.document.querySelectorAll('#words .word').length));

  /* ---- settings ---- */
  console.log('\n[6] settings — timer dropdown');
  const dd = window.document.querySelector('#timeDd');
  const ddBtn = window.document.querySelector('#timeDdBtn');
  ok('dropdown starts closed', !dd.classList.contains('open'));
  ddBtn.click();
  ok('dropdown opens on click', dd.classList.contains('open'));
  eq('aria-expanded true when open', ddBtn.getAttribute('aria-expanded'), 'true');
  ddBtn.click();
  ok('dropdown closes on second click', !dd.classList.contains('open'));

  // 5 minutes preset
  ddBtn.click();
  window.document.querySelector('#timeDdMenu li[data-value="time300"]').click();
  eq('dropdown closed after choosing', dd.classList.contains('open'), false);
  eq('label shows 5 min', window.document.querySelector('#timeDdLabel').textContent, '5 min');
  eq('timer counts down in mm:ss', window.document.querySelector('#timeLeft').textContent, '5:00');
  eq('5 min = 300s stored', JSON.parse(window.localStorage.getItem('gx.settings.v1') || '{}').mode, 'time300');
  eq('5 min preset row is marked selected',
    window.document.querySelector('#timeDdMenu li[data-value="time300"]').classList.contains('sel'), true);

  // 1 hour preset
  ddBtn.click();
  window.document.querySelector('#timeDdMenu li[data-value="time3600"]').click();
  eq('label shows 1 hour', window.document.querySelector('#timeDdLabel').textContent, '1 hour');
  eq('1 hour timer reads 60:00', window.document.querySelector('#timeLeft').textContent, '60:00');

  // custom duration
  console.log('\n[6b] settings — custom duration');
  ddBtn.click();
  window.document.querySelector('#timeDdMenu li[data-value="custom"]').click();
  ok('custom box revealed', window.document.querySelector('#customTimeBox').classList.contains('on'));
  eq('mode stored as custom', JSON.parse(window.localStorage.getItem('gx.settings.v1') || '{}').mode, 'custom');
  ok('custom label carries the edit mark', /✎/.test(window.document.querySelector('#timeDdLabel').textContent),
    window.document.querySelector('#timeDdLabel').textContent);

  const cval = window.document.querySelector('#customTimeVal');
  const cunit = window.document.querySelector('#customTimeUnit');
  cunit.value = '60';
  cval.value = '7';
  window.document.querySelector('#customTimeSet').click();
  eq('7 min applied to the clock', window.document.querySelector('#timeLeft').textContent, '7:00');
  eq('custom duration stored in seconds',
    JSON.parse(window.localStorage.getItem('gx.settings.v1') || '{}').customDuration, 420);

  cunit.value = '1';
  cval.value = '45';
  cval.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  eq('45 seconds applied', window.document.querySelector('#timeLeft').textContent, '45');
  eq('45s stored', JSON.parse(window.localStorage.getItem('gx.settings.v1') || '{}').customDuration, 45);

  // clamping
  cunit.value = '60';
  cval.value = '999';
  window.document.querySelector('#customTimeSet').click();
  eq('absurd durations clamp to 2 hours',
    JSON.parse(window.localStorage.getItem('gx.settings.v1') || '{}').customDuration, 7200);
  cunit.value = '1';
  cval.value = '1';
  window.document.querySelector('#customTimeSet').click();
  eq('tiny durations clamp to 5s',
    JSON.parse(window.localStorage.getItem('gx.settings.v1') || '{}').customDuration, 5);

  // typing digits in the box must not reach the typing area
  const wordsBefore = window.document.querySelector('#words').textContent;
  cval.value = '60';
  cval.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
  eq('digits typed in the box stay in the box', window.document.querySelector('#words').textContent, wordsBefore);

  // back to a preset so the remaining checks run on a normal test
  ddBtn.click();
  window.document.querySelector('#timeDdMenu li[data-value="time60"]').click();
  eq('back to 1 min', window.document.querySelector('#timeLeft').textContent, '1:00');
  ok('custom box hidden again', !window.document.querySelector('#customTimeBox').classList.contains('on'));
  const settings = JSON.parse(window.localStorage.getItem('gx.settings.v1') || '{}');
  eq('settings persisted', settings.mode, 'time60');

  /* ---- sound + volume ---- */
  console.log('\n[6c] settings — sound');
  const snd = window.document.querySelector('[data-toggle="sound"]');
  ok('sound is on by default', snd.classList.contains('on'));
  ok('volume slider visible by default', !window.document.querySelector('#volWrap').classList.contains('hidden'));
  eq('default volume is 0.55', window.GX.Audio.getVolume(), 0.55);

  snd.click();
  eq('sound toggle turns off', snd.classList.contains('on'), false);
  ok('volume slider hides when off', window.document.querySelector('#volWrap').classList.contains('hidden'));
  eq('audio muted when off', window.GX.Audio.getVolume(), 0);
  eq('sound=false persisted', JSON.parse(window.localStorage.getItem('gx.settings.v1') || '{}').sound, false);

  snd.click();
  eq('sound toggle turns back on', snd.classList.contains('on'), true);
  eq('sound=true persisted', JSON.parse(window.localStorage.getItem('gx.settings.v1') || '{}').sound, true);
  ok('audio unmuted again', window.GX.Audio.getVolume() > 0, String(window.GX.Audio.getVolume()));

  const vol = window.document.querySelector('#volRange');
  vol.value = '25';
  vol.dispatchEvent(new window.Event('input', { bubbles: true }));
  eq('volume persisted as 0.25', JSON.parse(window.localStorage.getItem('gx.settings.v1') || '{}').volume, 0.25);
  eq('audio engine volume follows', window.GX.Audio.getVolume(), 0.25);

  // digits in the volume slider must not reach the typing area
  const wordsPre = window.document.querySelector('#words').textContent;
  vol.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true }));
  eq('slider keys stay in the slider', window.document.querySelector('#words').textContent, wordsPre);

  const punct = window.document.querySelector('[data-toggle="punctuation"]');
  punct.click();
  ok('punct pill turned on', punct.classList.contains('on'));
  const punctText = window.document.querySelector('#words').textContent;
  ok('punctuation appears in generated text', /[,;]/.test(punctText), punctText.slice(0, 60));

  const kbToggle = window.document.querySelector('[data-toggle="keyboard"]');
  kbToggle.click();
  ok('keyboard hidden when toggled off', window.document.querySelector('#keyboard').classList.contains('hidden'));
  kbToggle.click();
  ok('keyboard shown again', !window.document.querySelector('#keyboard').classList.contains('hidden'));

  /* ---- engine unit checks ---- */
  console.log('\n[7] engine math');
  const S = new window.GX_Engine.Stats();
  S.start(0);
  for (let i = 0; i < 300; i++) S.record('correct', 0);   // 300 chars = 60 words
  for (let i = 0; i < 30; i++) S.record('incorrect', 0);
  S.finish(60000);                                        // 1 minute
  eq('wpm = 60 over 1 min', Math.round(S.wpm(60000)), 60);
  eq('raw wpm counts errors too', Math.round(S.rawWpm(60000)), 66);
  eq('accuracy 300/330', Math.round(S.accuracy() * 10) / 10, 90.9);
  eq('consistency 100 with one sample', Math.round(S.consistency()), 100);

  const flat = new window.GX_Engine.Stats();
  flat.start(0);
  for (let s = 1; s <= 5; s++) { for (let i = 0; i < 50; i++) flat.record('correct', 0); flat.sample(s * 1000); }
  eq('flat pace → 5 samples', flat.samples.length, 5);
  eq('flat pace → steady instant wpm', Math.round(flat.samples[2].wpm), 600);
  ok('flat pace → consistency 100', Math.round(flat.consistency()) === 100, flat.consistency().toFixed(1));

  const spiky = new window.GX_Engine.Stats();
  spiky.start(0);
  [100, 5, 100, 5, 100].forEach(function (n, i) {
    for (let j = 0; j < n; j++) spiky.record('correct', 0);
    spiky.sample((i + 1) * 1000);
  });
  ok('spiky pace → much lower consistency', spiky.consistency() < 60,
    spiky.consistency().toFixed(1) + ' vs flat ' + flat.consistency().toFixed(1));
  eq('cumulative wpm still reported per sample', Math.round(spiky.samples[4].cumWpm), Math.round(spiky.wpm(5000)));

  /* ---- word generator ---- */
  console.log('\n[8] text generator');
  const G = window.GX_WORDS;
  const t10 = G.generate('words10', 42, { list: 'top200' });
  eq('words10 → 10 tokens', t10.split(' ').length, 10);
  const t25 = G.generate('words25', 42, { list: 'top200' });
  eq('words25 → 25 tokens', t25.split(' ').length, 25);
  const same = G.generate('words25', 42, { list: 'top200' });
  eq('same seed → same text (replayable)', t25, same);
  const diff = G.generate('words25', 99, { list: 'top200' });
  ok('different seed → different text', t25 !== diff);
  eq('numbers bank is all digits', G.generate('words25', 7, { list: 'numbers' }).split(' ').every(function (w) { return /^\d+$/.test(w); }), true);
  ok('code bank draws only from the code vocabulary',
    G.generate('words50', 7, { list: 'code' }).split(' ').every(function (w) { return G.code.indexOf(w) >= 0; }));
  ok('code bank contains known keywords', ['const', 'function', 'async'].every(function (k) { return G.code.indexOf(k) >= 0; }));
  ok('quotes bank draws only from the quote set',
    G.generate('words25', 7, { list: 'quotes' }).split(' ').every(function (w) { return G.quotes.join(' ').indexOf(w) >= 0; }));
  ok('hard difficulty injects rare words', G.generate('words50', 7, { list: 'top200', difficulty: 'hard' }).length > 100);
  ok('caps option capitalises the first word', /^[A-Z]/.test(G.generate('words10', 7, { list: 'top200', caps: true })));

  console.log('\n[9] errors during run');
  eq('total jsdom errors', jsErrors.length, 0);
  if (jsErrors.length) jsErrors.forEach(function (m) { console.log('   ! ' + m); });

  console.log('\n────────────────────────────────');
  console.log('passed: ' + passes + '   failed: ' + failures);
  console.log('────────────────────────────────\n');
  process.exit(failures ? 1 : 0);
}

run().catch(function (e) { console.error(e); process.exit(2); });
