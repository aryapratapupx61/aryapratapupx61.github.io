/* ============================================================
   GODXSHADOW — passages page (library + "enter your passage")
   js/passages-page.js
   ============================================================ */
(function () {
  const KEY_CUSTOM = 'gx.passages.v1';
  const KEY_HANDOFF = 'gx.practice.text';

  /* ---------- custom passage storage ---------- */
  function readCustom() {
    try { return JSON.parse(localStorage.getItem(KEY_CUSTOM) || '[]'); }
    catch (e) { return []; }
  }
  function writeCustom(list) {
    try { localStorage.setItem(KEY_CUSTOM, JSON.stringify(list.slice(0, 100))); } catch (e) {}
  }
  function customById(id) {
    const found = readCustom().filter(function (p) { return p.id === id; })[0];
    return found || null;
  }

  /* ---------- hand a passage to the practice page ---------- */
  function practice(passage) {
    if (!passage || !passage.text.trim()) return;
    const words = GX_PASSAGES.wordCount(passage.text);
    if (!words) { alert('That passage has no words in it yet.'); return; }
    try {
      sessionStorage.setItem(KEY_HANDOFF, JSON.stringify({
        title: passage.title || 'Your passage',
        category: passage.category || 'custom',
        difficulty: passage.difficulty || 'custom',
        text: passage.text.trim(),
        words: words
      }));
    } catch (e) {}
    GX.go('practice.html');
  }
  window.GX_practice = practice;   // used by inline card buttons
  window.GX_practiceById = function (id) {
    const p = GX_PASSAGES.byId(id) || customById(id);
    if (p) practice(p);
  };
  window.GX_practiceCustomById = function (id) { practice(customById(id)); };

  /* ---------- library rendering ---------- */
  const state = { cat: 'all', diff: 'all', q: '' };

  function matches(p) {
    if (state.cat !== 'all' && p.category !== state.cat) return false;
    if (state.diff !== 'all' && p.difficulty !== state.diff) return false;
    if (state.q) {
      const hay = (p.title + ' ' + p.text).toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function diffClass(d) {
    return d === 'easy' ? 'lime' : d === 'hard' ? 'pink' : '';
  }

  function card(p, isCustom) {
    const el = GX.make('div', 'panel flat passage-card');
    const head = GX.make('div', 'passage-head');
    head.appendChild(GX.make('span', 'tag', p.category));
    const badge = GX.make('span', 'badge ' + diffClass(p.difficulty), p.difficulty);
    head.appendChild(badge);
    el.appendChild(head);

    el.appendChild(GX.make('h3', 'passage-title', p.title));

    const preview = GX.make('p', 'passage-preview muted', null);
    preview.textContent = p.text.length > 168 ? p.text.slice(0, 168) + '…' : p.text;
    el.appendChild(preview);

    const meta = GX.make('div', 'passage-meta');
    meta.appendChild(GX.make('span', null, p.words + ' words'));
    meta.appendChild(GX.make('span', null, '~' + Math.max(1, Math.round(p.words / 30)) + ' min read'));
    el.appendChild(meta);

    const actions = GX.make('div', 'pills');
    const go = GX.make('button', 'btn sm', 'type this');
    go.addEventListener('click', function () { practice(p); });
    actions.appendChild(go);

    const copy = GX.make('button', 'btn ghost sm', 'copy');
    copy.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(p.text).then(function () {
          copy.textContent = 'copied';
          setTimeout(function () { copy.textContent = 'copy'; }, 1300);
        });
      }
    });
    actions.appendChild(copy);

    if (isCustom) {
      const edit = GX.make('button', 'btn ghost sm', 'edit');
      edit.addEventListener('click', function () { loadIntoComposer(p); });
      actions.appendChild(edit);

      const del = GX.make('button', 'btn pink sm', 'delete');
      del.addEventListener('click', function () {
        if (!confirm('Delete "' + p.title + '"?')) return;
        writeCustom(readCustom().filter(function (x) { return x.id !== p.id; }));
        renderAll();
      });
      actions.appendChild(del);
    }
    el.appendChild(actions);
    return el;
  }

  function renderLibrary() {
    const grid = GX.el('#libGrid');
    grid.textContent = '';
    const list = GX_PASSAGES.builtIn.filter(matches);
    if (!list.length) {
      grid.appendChild(GX.make('p', 'muted', 'No passage matches those filters.'));
      return;
    }
    list.forEach(function (p) { grid.appendChild(card(p, false)); });
    GX.el('#libCount').textContent = list.length + ' of ' + GX_PASSAGES.builtIn.length;
  }

  function renderCustom() {
    const grid = GX.el('#myGrid');
    const list = readCustom().filter(matches);
    grid.textContent = '';
    const total = readCustom().length;
    GX.el('#myCount').textContent = total + ' saved';
    if (!total) {
      grid.appendChild(GX.make('p', 'muted', 'Nothing saved yet — write one below or paste anything you like.'));
      return;
    }
    if (!list.length) {
      grid.appendChild(GX.make('p', 'muted', 'Saved passages exist but none match the filters.'));
      return;
    }
    list.forEach(function (p) {
      p = Object.assign({}, p, { words: GX_PASSAGES.wordCount(p.text) });
      grid.appendChild(card(p, true));
    });
  }

  function renderAll() { renderLibrary(); renderCustom(); }

  /* ---------- composer ---------- */
  let editingId = null;

  function updateCounts() {
    const text = GX.el('#pText').value;
    const words = GX_PASSAGES.wordCount(text);
    const chars = text.length;
    GX.el('#cWords').textContent = words;
    GX.el('#cChars').textContent = chars;
    GX.el('#cTime').textContent = words ? Math.max(1, Math.round(words / 30)) + ' min' : '—';
    GX.el('#btnSavePassage').disabled = words === 0;
    GX.el('#btnTypeNow').disabled = words === 0;
    const bar = GX.el('#lenBar');
    if (bar) bar.style.width = Math.min(100, (words / 300) * 100) + '%';
  }

  function currentComposerPassage() {
    return {
      title: (GX.el('#pTitle').value || 'Untitled passage').trim().slice(0, 60),
      category: (GX.el('#pCategory').value || 'custom').trim().slice(0, 30),
      difficulty: GX.el('#pDiff').value,
      text: GX.el('#pText').value.trim()
    };
  }

  function loadIntoComposer(p) {
    editingId = p.id;
    GX.el('#pTitle').value = p.title;
    GX.el('#pCategory').value = p.category;
    GX.el('#pDiff').value = p.difficulty;
    GX.el('#pText').value = p.text;
    GX.el('#composerTitle').textContent = 'editing: ' + p.title;
    GX.el('#btnSavePassage').textContent = 'update passage';
    updateCounts();
    GX.el('#composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetComposer() {
    editingId = null;
    GX.el('#pTitle').value = '';
    GX.el('#pCategory').value = 'custom';
    GX.el('#pDiff').value = 'medium';
    GX.el('#pText').value = '';
    GX.el('#composerTitle').textContent = 'enter your passage';
    GX.el('#btnSavePassage').textContent = 'save passage';
    updateCounts();
  }

  function saveComposer() {
    const p = currentComposerPassage();
    if (!p.text) { alert('Type or paste something first.'); return; }
    const list = readCustom();
    if (editingId) {
      const i = list.findIndex(function (x) { return x.id === editingId; });
      if (i >= 0) list[i] = Object.assign({}, list[i], p, { updated: Date.now() });
    } else {
      list.unshift(Object.assign({}, p, {
        id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        created: Date.now()
      }));
    }
    writeCustom(list);
    const msg = GX.el('#saveMsg');
    msg.textContent = editingId ? 'updated ✓' : 'saved ✓';
    setTimeout(function () { msg.textContent = ''; }, 1800);
    resetComposer();
    renderCustom();
  }

  /* ---------- export / import ---------- */
  function exportCustom() {
    const list = readCustom();
    if (!list.length) { alert('No saved passages to export.'); return; }
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'godxshadow-passages.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importCustom(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const incoming = JSON.parse(String(reader.result));
        if (!Array.isArray(incoming)) throw new Error('not an array');
        const clean = incoming.filter(function (p) { return p && typeof p.text === 'string' && p.text.trim(); })
          .map(function (p) {
            return {
              id: p.id || 'c' + Math.random().toString(36).slice(2, 9),
              title: String(p.title || 'Untitled passage').slice(0, 60),
              category: String(p.category || 'custom').slice(0, 30),
              difficulty: ['easy', 'medium', 'hard'].indexOf(p.difficulty) >= 0 ? p.difficulty : 'medium',
              text: String(p.text).slice(0, 20000),
              created: p.created || Date.now()
            };
          });
        const existing = readCustom();
        const seen = {};
        const merged = clean.concat(existing).filter(function (p) {
          if (seen[p.id]) return false;
          seen[p.id] = 1; return true;
        });
        writeCustom(merged);
        renderCustom();
        alert('Imported ' + clean.length + ' passage(s).');
      } catch (e) {
        alert('That file does not look like a GODXSHADOW passage export.');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    // category filter buttons
    const catRow = GX.el('#catFilter');
    ['all'].concat(GX_PASSAGES.categories()).forEach(function (c) {
      const b = GX.make('button', 'pill' + (c === 'all' ? ' on' : ''), c);
      b.dataset.cat = c;
      b.addEventListener('click', function () {
        state.cat = c;
        GX.els('#catFilter .pill').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        renderAll();
      });
      catRow.appendChild(b);
    });

    GX.els('#diffFilter .pill').forEach(function (b) {
      b.addEventListener('click', function () {
        state.diff = b.dataset.diff;
        GX.els('#diffFilter .pill').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        renderAll();
      });
    });

    GX.el('#searchBox').addEventListener('input', function (e) {
      state.q = e.target.value;
      renderAll();
    });

    GX.el('#pText').addEventListener('input', updateCounts);
    GX.el('#pTitle').addEventListener('input', updateCounts);
    GX.el('#btnSavePassage').addEventListener('click', saveComposer);
    GX.el('#btnTypeNow').addEventListener('click', function () {
      const p = currentComposerPassage();
      if (p.text && !editingId) {
        // save it too, so "type now" never loses your writing
        const list = readCustom();
        list.unshift(Object.assign({}, p, {
          id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
          created: Date.now()
        }));
        writeCustom(list);
        renderCustom();
      }
      practice(p);
    });
    GX.el('#btnClearComposer').addEventListener('click', resetComposer);
    GX.el('#btnExport').addEventListener('click', exportCustom);
    GX.el('#importFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importCustom(e.target.files[0]);
      e.target.value = '';
    });
    GX.el('#btnPaste').addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (t) {
          if (t) { GX.el('#pText').value = t; updateCounts(); }
        }).catch(function () { GX.el('#pText').focus(); });
      } else {
        GX.el('#pText').focus();
      }
    });

    // sample starter, so the box is never empty on first visit
    if (!readCustom().length && !localStorage.getItem('gx.passages.seeded')) {
      localStorage.setItem('gx.passages.seeded', '1');
    }

    updateCounts();
    renderAll();

    GX.el('#libTotal').textContent = GX_PASSAGES.builtIn.length;
    const totalWords = GX_PASSAGES.builtIn.reduce(function (a, p) { return a + p.words; }, 0);
    GX.el('#libWords').textContent = totalWords.toLocaleString();
  });
})();
