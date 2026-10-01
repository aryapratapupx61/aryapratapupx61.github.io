/* ============================================================
   GODXSHADOW — passages + practice test
   Covers the passage library, the "enter your passage" composer,
   localStorage of custom passages, and a full passage typing run.
   Run: node test/passages.js
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

function boot(file, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost:4173/' + file + (opts.query || ''),
    pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  w.scrollTo = noop;
  w.alert = noop;
  w.confirm = () => true;
  w.HTMLCanvasElement.prototype.getContext = function () { const c = fakeCtx(); c.canvas = this; return c; };
  w.URL.createObjectURL = () => 'blob:stub';
  w.URL.revokeObjectURL = noop;
  if (opts.clock) {
    w.performance.now = () => opts.clock();
    w.setInterval = (fn, ms) => { (opts.intervals || (opts.intervals = [])).push(fn); return opts.intervals.length; };
    w.clearInterval = () => {};
  }
  if (opts.seed) Object.keys(opts.seed).forEach(k => w.localStorage.setItem(k, JSON.stringify(opts.seed[k])));
  if (opts.session) Object.keys(opts.session).forEach(k => w.sessionStorage.setItem(k, JSON.stringify(opts.session[k])));

  Array.prototype.map.call(w.document.querySelectorAll('script[src]'), s => s.getAttribute('src'))
    .forEach(src => w.eval(fs.readFileSync(path.join(ROOT, src), 'utf8')));
  // stub navigation before the page's own boot listener runs
  let navigated = null;
  w.GX.go = function (url) { navigated = url; };
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  // navigation attempts are expected in some flows, so they are not script errors
  const realErrors = errors.filter(m => !/navigation/i.test(m));
  return { w, errors: realErrors, nav: () => navigated };
}

/* ============================================================
   1. passage data integrity
   ============================================================ */
console.log('\n[1] passage library data');
{
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'http://x/' });
  dom.window.eval(fs.readFileSync(path.join(ROOT, 'js/passages.js'), 'utf8'));
  const P = dom.window.GX_PASSAGES;

  ok('has a decent number of passages', P.builtIn.length >= 25, String(P.builtIn.length));
  ok('has several categories', P.categories().length >= 6, P.categories().join(', '));
  ok('every passage has an id', P.builtIn.every(p => p.id && p.id.length > 2));
  const ids = P.builtIn.map(p => p.id);
  ok('ids are unique', new Set(ids).size === ids.length);
  ok('every passage has a title', P.builtIn.every(p => p.title && p.title.length > 2));
  ok('every passage has text', P.builtIn.every(p => p.text.trim().length > 20));
  ok('every difficulty is valid', P.builtIn.every(p => ['easy', 'medium', 'hard'].indexOf(p.difficulty) >= 0));
  ok('word counts computed', P.builtIn.every(p => p.words === p.text.trim().split(/\s+/).length));

  // ASCII-only: nothing in a passage should be untypeable on a plain keyboard
  const nonAscii = P.builtIn.filter(p => /[^\x20-\x7E]/.test(p.text));
  eq('all passages are plain ASCII', nonAscii.length, 0);
  if (nonAscii.length) console.log('   ! ' + nonAscii.map(p => p.id).join(', '));
  ok('no smart quotes anywhere', P.builtIn.every(p => !/[\u2018\u2019\u201C\u201D\u2013\u2014]/.test(p.text)));

  ok('byId finds a passage', P.byId('warm-1') && P.byId('warm-1').title === 'Slow Hands');
  eq('byId returns null for unknown', P.byId('nope-xyz'), 'null');
  ok('has an endurance passage over 150 words',
    P.builtIn.some(p => p.category === 'endurance' && p.words > 150),
    String(Math.max.apply(null, P.builtIn.map(p => p.words))) + ' max words');
  ok('total library words', P.builtIn.reduce((a, p) => a + p.words, 0) > 1500,
    String(P.builtIn.reduce((a, p) => a + p.words, 0)));
}

/* ============================================================
   2. passages page: library rendering + filters
   ============================================================ */
console.log('\n[2] passages.html');
{
  const { w, errors } = boot('passages.html');
  eq('no script errors', errors.length, 0);
  if (errors.length) errors.forEach(e => console.log('   ! ' + e));

  const cards = w.document.querySelectorAll('#libGrid .passage-card');
  ok('library cards rendered', cards.length >= 25, String(cards.length));
  ok('each card has a type button', Array.prototype.every.call(cards, c => /type this/.test(c.textContent)));
  ok('total count shown', /^\d+ of \d+$/.test(w.document.querySelector('#libCount').textContent),
    w.document.querySelector('#libCount').textContent);
  ok('category filter buttons built', w.document.querySelectorAll('#catFilter .pill').length >= 7,
    String(w.document.querySelectorAll('#catFilter .pill').length));

  // filter by category
  const enduranceBtn = Array.prototype.filter.call(w.document.querySelectorAll('#catFilter .pill'),
    b => b.dataset.cat === 'endurance')[0];
  enduranceBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
  const afterFilter = w.document.querySelectorAll('#libGrid .passage-card').length;
  ok('category filter narrows the list', afterFilter < cards.length && afterFilter >= 1, String(afterFilter));

  // back to all, then difficulty filter
  Array.prototype.filter.call(w.document.querySelectorAll('#catFilter .pill'),
    b => b.dataset.cat === 'all')[0].dispatchEvent(new w.Event('click', { bubbles: true }));
  const hardBtn = Array.prototype.filter.call(w.document.querySelectorAll('#diffFilter .pill'),
    b => b.dataset.diff === 'hard')[0];
  hardBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
  const hardCards = w.document.querySelectorAll('#libGrid .passage-card');
  ok('difficulty filter works', hardCards.length >= 3 && hardCards.length < cards.length, String(hardCards.length));
  ok('filtered cards all say hard', Array.prototype.every.call(hardCards, c => /hard/.test(c.textContent)));

  // search
  Array.prototype.filter.call(w.document.querySelectorAll('#diffFilter .pill'),
    b => b.dataset.diff === 'all')[0].dispatchEvent(new w.Event('click', { bubbles: true }));
  const search = w.document.querySelector('#searchBox');
  search.value = 'zephyr';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  eq('search finds the rare-letters passage', w.document.querySelectorAll('#libGrid .passage-card').length, 1);
  search.value = '';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  eq('clearing search restores the list', w.document.querySelectorAll('#libGrid .passage-card').length, cards.length);

  // type-this hands the passage to practice via sessionStorage
  const firstType = w.document.querySelector('#libGrid .passage-card button');
  const { nav } = { nav: null };
  firstType.dispatchEvent(new w.Event('click', { bubbles: true }));
  const handoff = JSON.parse(w.sessionStorage.getItem('gx.practice.text') || 'null');
  ok('type-this writes a handoff payload', handoff && handoff.text.length > 20, handoff && handoff.title);
  ok('handoff carries title + word count', handoff && handoff.words > 3, handoff && String(handoff.words));
}

/* ============================================================
   3. composer: enter your passage
   ============================================================ */
console.log('\n[3] enter your passage (composer)');
{
  const { w, errors, nav } = boot('passages.html');
  eq('no script errors', errors.length, 0);

  const text = w.document.querySelector('#pText');
  const title = w.document.querySelector('#pTitle');
  const saveBtn = w.document.querySelector('#btnSavePassage');

  eq('save disabled while empty', saveBtn.disabled, true);
  eq('word counter starts at 0', w.document.querySelector('#cWords').textContent, '0');

  title.value = 'My own paragraph';
  text.value = 'hello world this is my passage';
  text.dispatchEvent(new w.Event('input', { bubbles: true }));
  eq('word count updates live', w.document.querySelector('#cWords').textContent, '6');
  eq('char count updates live', w.document.querySelector('#cChars').textContent, String('hello world this is my passage'.length));
  ok('save enabled once there are words', saveBtn.disabled === false);
  ok('length bar grew', /%/.test(w.document.querySelector('#lenBar').style.width),
    w.document.querySelector('#lenBar').style.width);

  saveBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
  const saved = JSON.parse(w.localStorage.getItem('gx.passages.v1') || '[]');
  eq('passage saved to localStorage', saved.length, 1);
  eq('saved title kept', saved[0] && saved[0].title, 'My own paragraph');
  eq('saved text kept', saved[0] && saved[0].text, 'hello world this is my passage');
  ok('saved passage got an id', saved[0] && /^c/.test(saved[0].id), saved[0] && saved[0].id);
  eq('composer cleared after save', w.document.querySelector('#pText').value, '');
  eq('my-passages grid shows it', w.document.querySelectorAll('#myGrid .passage-card').length, 1);
  ok('my count updated', /1 saved/.test(w.document.querySelector('#myCount').textContent));

  // edit flow
  const editBtn = Array.prototype.filter.call(w.document.querySelectorAll('#myGrid button'),
    b => b.textContent === 'edit')[0];
  editBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
  eq('edit loads the text back', w.document.querySelector('#pText').value, 'hello world this is my passage');
  eq('edit switches button label', w.document.querySelector('#btnSavePassage').textContent, 'update passage');
  w.document.querySelector('#pText').value = 'edited text now has more words in it';
  w.document.querySelector('#pText').dispatchEvent(new w.Event('input', { bubbles: true }));
  w.document.querySelector('#btnSavePassage').dispatchEvent(new w.Event('click', { bubbles: true }));
  const after = JSON.parse(w.localStorage.getItem('gx.passages.v1') || '[]');
  eq('update does not duplicate', after.length, 1);
  eq('update changed the text', after[0].text, 'edited text now has more words in it');

  // delete flow
  const delBtn = Array.prototype.filter.call(w.document.querySelectorAll('#myGrid button'),
    b => b.textContent === 'delete')[0];
  delBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
  eq('delete removes it', JSON.parse(w.localStorage.getItem('gx.passages.v1') || '[]').length, 0);

  // "type this now" saves + navigates
  w.document.querySelector('#pText').value = 'quick brown fox jumps over the lazy dog';
  w.document.querySelector('#pText').dispatchEvent(new w.Event('input', { bubbles: true }));
  w.document.querySelector('#btnTypeNow').dispatchEvent(new w.Event('click', { bubbles: true }));
  ok('type-now navigates to practice', nav() === 'practice.html', String(nav()));
  const handoff = JSON.parse(w.sessionStorage.getItem('gx.practice.text') || 'null');
  eq('type-now hands over the text', handoff && handoff.text, 'quick brown fox jumps over the lazy dog');
  eq('type-now also saved it', JSON.parse(w.localStorage.getItem('gx.passages.v1') || '[]').length, 1);
}

/* ============================================================
   4. import
   ============================================================ */
console.log('\n[4] import json');
{
  const { w, errors } = boot('passages.html');
  eq('no script errors', errors.length, 0);
  const payload = [
    { title: 'Imported one', category: 'custom', difficulty: 'easy', text: 'alpha beta gamma delta' },
    { title: 'Imported two', category: 'custom', difficulty: 'hard', text: 'omega sigma theta zeta kappa' },
    { title: 'Broken', text: '   ' }
  ];
  const file = { };
  const input = w.document.querySelector('#importFile');
  // emulate FileReader by calling the handler path directly
  w.FileReader = function () {};
  w.FileReader.prototype.readAsText = function () {
    this.result = JSON.stringify(payload);
    this.onload();
  };
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  const saved = JSON.parse(w.localStorage.getItem('gx.passages.v1') || '[]');
  eq('imported only the valid passages', saved.length, 2);
  eq('import kept titles', saved.map(p => p.title).join('|'), 'Imported one|Imported two');
  eq('my grid shows both', w.document.querySelectorAll('#myGrid .passage-card').length, 2);
}

/* ============================================================
   5. practice page: full run
   ============================================================ */
console.log('\n[5] practice.html — full passage run');
{
  let NOW = 1000;
  const intervals = [];
  const { w, errors, nav } = boot('practice.html', {
    clock: () => NOW,
    intervals,
    session: {
      'gx.practice.text': {
        title: 'Test Passage', category: 'test', difficulty: 'easy',
        text: 'the quick brown fox', words: 4
      }
    }
  });
  eq('no script errors', errors.length, 0);
  if (errors.length) errors.forEach(e => console.log('   ! ' + e));

  ok('typing view shown', !w.document.querySelector('#testView').classList.contains('hidden'));
  ok('no-passage notice hidden', w.document.querySelector('#noPassage').classList.contains('hidden'));
  eq('title rendered', w.document.querySelector('#passageTitle').textContent, 'Test Passage');
  eq('word elements built', w.document.querySelectorAll('#words .word').length, 4);
  eq('total words shown', w.document.querySelector('#totalWords').textContent, '4');
  ok('keyboard built', w.document.querySelectorAll('#keyboard .key').length >= 47);
  ok('focus lock visible at start', !w.document.querySelector('#focusLock').classList.contains('hidden'));

  const words = Array.prototype.map.call(w.document.querySelectorAll('#words .word'), e => e.textContent);
  eq('words match the passage', words.join(' '), 'the quick brown fox');

  function key(k, mods) {
    const ev = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}));
    w.document.dispatchEvent(ev);
    return ev.defaultPrevented;
  }

  ok('first keystroke intercepted', key('t'));
  key('Backspace');            // undo the probe char
  NOW = 1000;

  words.forEach((word) => {
    for (const ch of word) key(ch);
    key(' ');            // a word is committed on space, including the last one
    NOW += 1000;
  });

  ok('result view shown after last word', !w.document.querySelector('#resultView').classList.contains('hidden'));
  ok('typing view hidden', w.document.querySelector('#testView').classList.contains('hidden'));

  // The run-start probe keystroke ('t') is a correct character too: backspace
  // undoes the display but never the statistic, which is how every typing test
  // scores corrections. So the count is 16 passage chars + 1 probe char.
  const chars = 'thequickbrownfox'.length + 1;
  const wpm = Number(w.document.querySelector('#resWpm').textContent);
  eq('wpm = 17 correct chars / 5 over ~3s', wpm, Math.round((chars / 5) / (3 / 60)));
  eq('accuracy 100 on a clean run', w.document.querySelector('#resAcc').textContent, '100.0%');
  eq('errors zero', w.document.querySelector('#resErr').textContent, '0');
  eq('words 4 / 4', w.document.querySelector('#resWords').textContent, '4 / 4');
  eq('title on results', w.document.querySelector('#resTitle').textContent, 'Test Passage');
  ok('grade assigned', /^[A-D][+]?$/.test(w.document.querySelector('#resGradeLabel').textContent),
    w.document.querySelector('#resGradeLabel').textContent);
  ok('badges rendered', w.document.querySelector('#resBadges').children.length > 0);

  const stored = JSON.parse(w.localStorage.getItem('gx.results.v1') || '[]');
  eq('run saved to history', stored.length, 1);
  eq('saved as passage mode', stored[0] && stored[0].mode, 'passage');
  eq('saved passage name', stored[0] && stored[0].passage, 'Test Passage');
  eq('saved wpm matches DOM', stored[0] && stored[0].wpm, wpm);
}

/* ============================================================
   6. practice page: errors, restart, no passage
   ============================================================ */
console.log('\n[6] practice.html — errors + restart');
{
  let NOW = 1000;
  const { w, errors } = boot('practice.html', {
    clock: () => NOW,
    session: { 'gx.practice.text': { title: 'E', text: 'sun run fun', words: 3 } }
  });
  eq('no script errors', errors.length, 0);
  function key(k, mods) {
    const ev = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}));
    w.document.dispatchEvent(ev);
  }
  const word0 = w.document.querySelector('#words .word');
  const word0Text = word0.textContent;
  // a key that appears nowhere in this word is wrong at any index
  const bad = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(c => word0Text.indexOf(c) < 0)[0];
  NOW = 2000;
  key(bad);
  eq('wrong char flagged', word0.children[0].className, 'char incorrect');
  eq('error HUD 1', w.document.querySelector('#errLive').textContent, '1');
  ok('word flagged', word0.classList.contains('error-word'));
  key('Backspace');
  eq('backspace clears it', word0.children[0].className, 'char');
  key('s'); key('u');
  eq('two correct chars', word0.children[1].className, 'char correct');
  key('Backspace', { ctrlKey: true });
  eq('ctrl+backspace wipes the word', word0.children[0].className, 'char');
  eq('progress still 0 words', w.document.querySelector('#doneWords').textContent, '0');

  // restart button
  key('s'); key('u'); key('n');
  w.document.querySelector('#btnRestart').dispatchEvent(new w.Event('click', { bubbles: true }));
  eq('restart resets progress', w.document.querySelector('#doneWords').textContent, '0');
  eq('restart resets wpm', w.document.querySelector('#wpmLive').textContent, '0');
  eq('restart resets errors', w.document.querySelector('#errLive').textContent, '0');
  ok('restart shows typing view', !w.document.querySelector('#testView').classList.contains('hidden'));

  // keyboard toggle
  w.document.querySelector('#btnKb').dispatchEvent(new w.Event('click', { bubbles: true }));
  ok('keyboard toggles off', w.document.querySelector('#keyboard').classList.contains('hidden'));
  w.document.querySelector('#btnKb').dispatchEvent(new w.Event('click', { bubbles: true }));
  ok('keyboard toggles on', !w.document.querySelector('#keyboard').classList.contains('hidden'));
}

console.log('\n[7] practice.html — nothing loaded');
{
  const { w, errors } = boot('practice.html', {});
  eq('no script errors', errors.length, 0);
  ok('no-passage notice shown', !w.document.querySelector('#noPassage').classList.contains('hidden'));
  ok('typing view hidden', w.document.querySelector('#testView').classList.contains('hidden'));
}

console.log('\n[8] practice.html — loads a saved custom passage by id');
{
  const custom = [{ id: 'cTest123', title: 'Saved Custom', category: 'custom', difficulty: 'medium', text: 'one two three four five six' }];
  const { w, errors } = boot('practice.html', { query: '?custom=cTest123', seed: { 'gx.passages.v1': custom } });
  eq('no script errors', errors.length, 0);
  eq('loads the saved passage', w.document.querySelector('#passageTitle').textContent, 'Saved Custom');
  eq('word count from saved text', w.document.querySelectorAll('#words .word').length, 6);
}

console.log('\n[9] practice.html — loads a built-in passage by id');
{
  const { w, errors } = boot('practice.html', { query: '?id=warm-1' });
  eq('no script errors', errors.length, 0);
  eq('loads the built-in passage', w.document.querySelector('#passageTitle').textContent, 'Slow Hands');
  ok('built words', w.document.querySelectorAll('#words .word').length > 10,
    String(w.document.querySelectorAll('#words .word').length));
}

console.log('\n[10] practice.html — unknown id falls back to the empty state');
{
  const { w, errors } = boot('practice.html', { query: '?id=does-not-exist' });
  eq('no script errors', errors.length, 0);
  ok('falls back to no-passage', !w.document.querySelector('#noPassage').classList.contains('hidden'));
}

console.log('\n[practice.html — 35 WPM threshold flash]');
{
  let NOW = 1000;
  const { w, errors } = boot('practice.html', {
    clock: () => NOW,
    session: { 'gx.practice.text': { title: 'Pace', text: 'one two three four five six seven eight nine ten', words: 10 } }
  });
  eq('no script errors', errors.length, 0);
  if (errors.length) errors.forEach(e => console.log('   ! ' + e));

  const target = w.GX.Store.getSettings().wpmFlash;
  eq('threshold defaults to 35 wpm', target, 35);

  function key(k) {
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  }
  const words = Array.prototype.map.call(w.document.querySelectorAll('#words .word'), e => e.textContent);
  const flashes = () => w.document.querySelectorAll('.wpm-flash').length;
  const flashText = () => {
    const f = w.document.querySelector('.wpm-flash span');
    return f ? f.textContent : null;
  };

  eq('no flash before typing', flashes(), 0);

  // 3-letter words, one per second: the instant pace reads ~36 WPM from the
  // first word, but the flash must stay quiet while the run settles.
  for (let i = 0; i < 2; i++) {
    for (const ch of words[i]) key(ch);
    key(' ');
    NOW += 1000;
  }
  eq('no premature flash while the run settles (< 5s)', flashes(), 0);

  let crossed = 0;
  for (let i = 2; i < 8; i++) {
    for (const ch of words[i]) key(ch);
    key(' ');
    NOW += 1000;
    if (flashes() > crossed) crossed = flashes();
  }

  ok('flash appeared once the pace passed 35 wpm', crossed > 0, String(crossed));
  eq('flash shows the target', flashText(), '35 WPM');
  eq('it fires only once, not every keystroke', flashes(), 1);

  // keep typing: still just the one flash
  for (let i = 8; i < 9; i++) {
    for (const ch of words[i]) key(ch);
    key(' ');
    NOW += 1000;
  }
  eq('no repeat flash while above the target', flashes(), 1);

  // restart clears it and lets it fire again on the next crossing
  w.document.querySelector('#btnRestart').dispatchEvent(new w.Event('click', { bubbles: true }));
  eq('flash removed on restart', flashes(), 0);
  for (let i = 0; i < 6; i++) {
    const word = Array.prototype.map.call(w.document.querySelectorAll('#words .word'), e => e.textContent)[i];
    for (const ch of word) key(ch);
    key(' ');
    NOW += 1000;
  }
  ok('flashes again after a restart', flashes() > 0, String(flashes()));
}

console.log('\n[practice.html — flash respects the configured threshold]');
{
  let NOW = 1000;
  // an unreachable target: the flash must never appear
  const { w, errors } = boot('practice.html', {
    clock: () => NOW,
    seed: { 'gx.settings.v1': { wpmFlash: 500 } },
    session: { 'gx.practice.text': { title: 'Pace', text: 'one two three four five six seven eight', words: 8 } }
  });
  eq('no script errors', errors.length, 0);
  function key(k) {
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  }
  for (let i = 0; i < 7; i++) {
    const word = Array.prototype.map.call(w.document.querySelectorAll('#words .word'), e => e.textContent)[i];
    for (const ch of word) key(ch);
    key(' ');
    NOW += 1000;
  }
  eq('no flash when the target is out of reach', w.document.querySelectorAll('.wpm-flash').length, 0);
}

console.log('\n[practice.html — flash off when the threshold is 0]');
{
  let NOW = 1000;
  const { w, errors } = boot('practice.html', {
    clock: () => NOW,
    seed: { 'gx.settings.v1': { wpmFlash: 0 } },
    session: { 'gx.practice.text': { title: 'Pace', text: 'one two three four five six seven eight', words: 8 } }
  });
  eq('no script errors', errors.length, 0);
  function key(k) {
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  }
  for (let i = 0; i < 7; i++) {
    const word = Array.prototype.map.call(w.document.querySelectorAll('#words .word'), e => e.textContent)[i];
    for (const ch of word) key(ch);
    key(' ');
    NOW += 1000;
  }
  eq('threshold 0 disables the flash', w.document.querySelectorAll('.wpm-flash').length, 0);
}

console.log('\n[results screen — flash when the final pace is 35+]');
{
  let NOW = 1000;
  const { w, errors } = boot('practice.html', {
    clock: () => NOW,
    session: { 'gx.practice.text': { title: 'Quick', text: 'one two three four five', words: 5 } }
  });
  eq('no script errors', errors.length, 0);
  function key(k) {
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  }
  const flashes = () => w.document.querySelectorAll('.wpm-flash').length;
  const words = Array.prototype.map.call(w.document.querySelectorAll('#words .word'), e => e.textContent);

  // finish in ~2s: the live gate (< 5s) can never fire during the run, but the
  // final pace is 15 chars over ~2s = ~90 WPM, so the results must celebrate.
  for (let i = 0; i < words.length; i++) {
    for (const ch of words[i]) key(ch);
    if (i < words.length - 1) key(' ');
    NOW += 400;
  }
  eq('live flash stayed silent during the short run', flashes(), 0);
  key(' ');                       // commit the last word -> finish
  eq('run ended on the results view', w.document.querySelector('#resultView').classList.contains('hidden'), false);
  const finalWpm = Number(w.document.querySelector('#resWpm').textContent);
  ok('final pace above the target', finalWpm >= 35, String(finalWpm));
  eq('full-screen celebration fires for a 35+ run',
    w.document.querySelectorAll('.pb-flash').length, 1);
  eq('celebration names the target', w.document.querySelector('.pb-flash span').textContent, '35+ WPM');
  eq('live-style flash not used on the reveal', flashes(), 0);
}

console.log('\n[results screen — no flash when the final pace is under 35]');
{
  let NOW = 1000;
  const { w, errors } = boot('practice.html', {
    clock: () => NOW,
    session: { 'gx.practice.text': { title: 'Slow', text: 'one two three four five', words: 5 } }
  });
  eq('no script errors', errors.length, 0);
  function key(k) {
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  }
  const words = Array.prototype.map.call(w.document.querySelectorAll('#words .word'), e => e.textContent);
  for (const word of words) {
    for (const ch of word) key(ch);
    key(' ');
    NOW += 2500;                     // ~12.5s for 15 chars ≈ 14 WPM
  }
  eq('run ended on the results view', w.document.querySelector('#resultView').classList.contains('hidden'), false);
  const finalWpm = Number(w.document.querySelector('#resWpm').textContent);
  ok('final pace under the target', finalWpm < 35, String(finalWpm));
  eq('no live flash for a sub-35 run', w.document.querySelectorAll('.wpm-flash').length, 0);
  eq('no celebration for a sub-35 run', w.document.querySelectorAll('.pb-flash').length, 0);
}

console.log('\n────────────────────────────────');
console.log('passed: ' + passes + '   failed: ' + failures);
console.log('────────────────────────────────\n');
process.exit(failures ? 1 : 0);
