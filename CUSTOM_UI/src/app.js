// Control Plane — bootstrap, status bar, hash router, and the doc reader.
import { $, el, esc, mdInline, timeAgo, toast } from './util.js';
import { api, loadManifest, loadCodeMap, loadPage } from './api.js';
import { getState, setStatic, refresh, subscribe, docThreads, allCodeThreads, threadCount, noteCount, cardCount } from './store.js';
import { renderNav, setNavigate } from './nav.js';
import { initPalette } from './palette.js';
import { initDocAnnotations, renderDocMarkers, openBlock, setChangeHook, closeDrawer } from './threads.js';
import { renderDefinition } from './code.js';
import { renderBoard } from './board.js';
import { renderAtoms } from './atoms.js';

let current = { view: 'home', slug: null };
let pendingBlock = null; // {slug, blockIndex} to open after a doc renders
let scrollSpy = null;

// ---------------- navigation ----------------
export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function parseHash() {
  let h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!h || h === '/') return { view: 'home' };
  if (h.startsWith('__')) return { view: h.replace(/^__/, '') };
  if (h.startsWith('/')) {
    const [slug, anchor] = h.slice(1).split('#');
    return { view: 'doc', slug, anchor };
  }
  return { view: 'home' };
}

function homeSlug() {
  const nav = (getState().manifest || {}).nav || [];
  const firstPage = (node) => {
    if (node.type === 'page') return node.slug;
    for (const c of node.children || []) {
      const s = firstPage(c);
      if (s) return s;
    }
    return null;
  };
  for (const n of nav) {
    const s = firstPage(n);
    if (s) return s;
  }
  return 'concepts/workloads/pods';
}

async function route() {
  const r = parseHash();
  closeDrawer();
  document.querySelector('.nav')?.classList.remove('open');
  if (r.view === 'home') return navigate('#/' + homeSlug());
  if (r.view === 'doc') return renderDoc(r.slug, r.anchor);
  if (r.view === 'atoms') return showView('atoms', () => renderAtoms($('#main')));
  if (r.view === 'board') return showView('board', () => renderBoard($('#main')));
  if (r.view === 'notes') return showView('notes', () => renderNotes($('#main')));
  return navigate('#/' + homeSlug());
}

function showView(name, render) {
  current = { view: name, slug: null };
  const shell = $('#shell');
  shell.className = 'shell full';
  $('#toc').innerHTML = '';
  const main = $('#main');
  main.innerHTML = '';
  setStatusPath(null, { title: name });
  renderNav(null, '__' + name);
  render();
}

// ---------------- doc reader ----------------
async function renderDoc(slug, anchor) {
  current = { view: 'doc', slug };
  const page = await loadPage(slug);
  const shell = $('#shell');
  shell.className = 'shell';
  const main = $('#main');
  main.innerHTML = '';
  renderNav(slug, null);
  setStatusPath(slug, page);

  if (!page) {
    $('#toc').innerHTML = '';
    shell.className = 'shell full';
    main.append(el('div', { class: 'placeholder' },
      el('div', { class: 'big' }, '// not scheduled'),
      el('p', {}, esc(slug) + ' is in the nav but not part of this build.')));
    return;
  }

  const reader = el('div', { class: 'reader' });
  reader.append(crumbs(slug, page));
  reader.append(el('div', { class: 'eyebrow' }, (page.type || 'concept')));
  reader.append(el('h1', {}, el('span', { class: 'prompt' }, '$'), page.title));

  const defbar = el('div', { class: 'defbar' });
  reader.append(defbar);

  const article = el('div', { class: 'article', html: page.html });
  reader.append(article);
  main.append(reader);

  renderDefinition(defbar, slug);
  initDocAnnotations(slug);
  buildToc(page.toc);
  setupScrollSpy();

  if (pendingBlock && pendingBlock.slug === slug) {
    openBlock(slug, pendingBlock.blockIndex, '');
    pendingBlock = null;
  }
  if (anchor) setTimeout(() => scrollToAnchor(anchor), 80);
  else main.scrollTo(0, 0);
}

function crumbs(slug, page) {
  const parts = slug.split('/');
  const nice = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const spans = [];
  parts.forEach((p, i) => {
    if (i) spans.push(el('span', { class: 'sep' }, '/'));
    spans.push(i === parts.length - 1 ? el('span', {}, page ? page.title : nice(p)) : nice(p));
  });
  return el('div', { class: 'crumbs' }, ...spans);
}

function buildToc(toc) {
  const rail = $('#toc');
  rail.innerHTML = '';
  if (!toc || !toc.length) return;
  rail.append(el('div', { class: 'toc-title' }, 'On this page'));
  for (const t of toc) {
    rail.append(el('a', {
      href: '#' + t.id,
      class: t.level === 3 ? 'h3' : '',
      dataset: { anchor: t.id },
      onclick: (e) => { e.preventDefault(); scrollToAnchor(t.id); },
    }, t.text));
  }
}

function scrollToAnchor(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (current.slug) history.replaceState(null, '', '#/' + current.slug + '#' + id);
  setActiveToc(id);
}

function setActiveToc(id) {
  $('#toc').querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.anchor === id));
}

function setupScrollSpy() {
  if (scrollSpy) scrollSpy.disconnect();
  const heads = [...document.querySelectorAll('.article h2[id], .article h3[id]')];
  if (!heads.length) return;
  scrollSpy = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) setActiveToc(visible[0].target.id);
  }, { root: $('#main'), rootMargin: '0px 0px -70% 0px', threshold: 0 });
  heads.forEach((h) => scrollSpy.observe(h));
}

// ---------------- notes workspace ----------------
function renderNotes(main) {
  const st = getState();
  let tab = 'annotations';
  const container = el('div', { class: 'workspace' });
  const head = el('h1', {}, el('span', { class: 'prompt' }, '$ '), 'notes');
  const tabsEl = el('div', { class: 'wtabs' });
  const bodyEl = el('div', {});

  const setTab = (t) => {
    tab = t;
    [...tabsEl.children].forEach((c) => c.classList.toggle('active', c.dataset.tab === t));
    bodyEl.innerHTML = '';
    bodyEl.append(t === 'annotations' ? annotationsTab() : notesTab());
  };
  tabsEl.append(
    el('div', { class: 'tab', dataset: { tab: 'annotations' }, onclick: () => setTab('annotations') }, 'Annotations'),
    el('div', { class: 'tab', dataset: { tab: 'notes' }, onclick: () => setTab('notes') }, 'Notes'));

  container.append(head, tabsEl, bodyEl);
  main.append(container);
  setTab('annotations');

  function annotationsTab() {
    const wrap = el('div', {});
    const threads = getState().threads;
    if (!threads.length) return el('div', { class: 'empty' }, 'No annotations yet. Hover a paragraph and hit + , or select text in any doc.');
    // group by target
    const groups = {};
    for (const t of threads) {
      const key = t.target.kind === 'doc' ? 'doc:' + t.target.slug : 'code:' + t.target.path;
      (groups[key] = groups[key] || []).push(t);
    }
    for (const [key, list] of Object.entries(groups)) {
      const isDoc = key.startsWith('doc:');
      const label = isDoc ? pageTitle(key.slice(4)) : key.slice(5);
      const g = el('div', { class: 'thread-group' }, el('h3', {}, (isDoc ? '' : '⌗ ') + label));
      for (const t of list) {
        const count = t.comments.length;
        g.append(el('div', {
          class: 'thread-ref',
          onclick: () => {
            if (isDoc) {
              pendingBlock = { slug: t.target.slug, blockIndex: t.target.blockIndex };
              navigate('#/' + t.target.slug);
            } else {
              toast('open the Deployment/Pod/Service page to view code threads');
            }
          },
        },
          el('span', { class: 'tk' }, isDoc ? 'DOC' : 'CODE'),
          el('span', { class: 'q' }, t.quote || '(no quote)'),
          el('span', { class: 'c' }, '✎ ' + count)));
      }
      wrap.append(g);
    }
    return wrap;
  }

  function notesTab() {
    const wrap = el('div', {});
    // composer
    const title = el('input', { class: 'txt', placeholder: 'note title' });
    const body = el('textarea', { rows: '3', placeholder: 'freeform note — `code`, **bold** supported' });
    const add = async () => {
      if (!title.value.trim() && !body.value.trim()) return;
      await api.createNote({ title: title.value.trim() || 'Untitled', body: body.value.trim() });
      await refresh();
      title.value = ''; body.value = '';
      setTab('notes');
    };
    wrap.append(el('div', { class: 'composer', style: 'margin-bottom:18px' }, title, body,
      el('div', { class: 'row' }, el('button', { class: 'btn-green', onclick: add }, 'add note'))));

    const notes = getState().notes;
    if (!notes.length) wrap.append(el('div', { class: 'empty' }, 'No notes yet.'));
    for (const n of notes) wrap.append(noteItem(n, setTab));
    return wrap;
  }
}

function noteItem(n, setTab) {
  const item = el('div', { class: 'note-item' });
  const render = () => {
    item.innerHTML = '';
    item.append(
      el('div', { class: 'n-title' }, n.title),
      el('div', { class: 'n-body', html: mdInline(n.body) }),
      el('div', { class: 'n-actions' },
        el('span', { style: 'color:var(--fg-faint);font-size:11px' }, timeAgo(n.updatedAt)),
        el('button', { onclick: edit }, 'edit'),
        el('button', { onclick: del }, 'delete')));
  };
  function edit() {
    const title = el('input', { class: 'txt' }); title.value = n.title;
    const body = el('textarea', { rows: '4' }); body.value = n.body;
    const save = async () => { await api.updateNote(n.id, { title: title.value, body: body.value }); await refresh(); setTab('notes'); };
    item.innerHTML = '';
    item.append(el('div', { class: 'composer' }, title, body, el('div', { class: 'row' }, el('button', { class: 'btn-green', onclick: save }, 'save'))));
  }
  async function del() { await api.deleteNote(n.id); await refresh(); setTab('notes'); }
  render();
  return item;
}

function pageTitle(slug) {
  const search = (getState().manifest || {}).search || [];
  const p = search.find((x) => x.slug === slug);
  return p ? p.title : slug;
}

// ---------------- status bar ----------------
function renderStatusBar() {
  const bar = $('#statusbar');
  bar.innerHTML = '';
  bar.append(
    el('button', { class: 'hamburger', onclick: () => $('.nav').classList.toggle('open') }, '≡'),
    el('div', { class: 'brand', onclick: () => navigate('#/' + homeSlug()) },
      el('span', { class: 'heptagon' }, '⏣'), 'control-plane', el('span', { class: 'cursor' })),
    el('div', { class: 'path', id: 'statuspath' }),
    el('div', { class: 'spacer' }),
    el('div', { class: 'stat', id: 'stat-online', onclick: () => refresh() }),
    el('div', { class: 'stat', onclick: () => navigate('#__notes') }, '✎ ', el('b', {}, String(threadCount() + noteCount()))),
    el('div', { class: 'stat', onclick: () => navigate('#__board') }, '▤ ', el('b', {}, String(cardCount()))),
    el('div', { class: 'kbd' }, el('kbd', {}, '⌘K')),
  );
  updateOnline();
}

function updateOnline() {
  const s = $('#stat-online');
  if (!s) return;
  const st = getState();
  s.classList.toggle('offline', !st.online);
  s.innerHTML = '';
  s.append(document.createTextNode('v' + ((st.manifest && st.manifest.version) || '?').replace(/^v/, '') + ' '));
  s.append(el('b', {}, st.online ? '● live' : '○ offline'));
}

function setStatusPath(slug, page) {
  const p = $('#statuspath');
  if (!p) return;
  p.innerHTML = '';
  if (!slug) { p.append(el('b', {}, '~/' + (page ? page.title : ''))); return; }
  const parts = slug.split('/');
  p.append(document.createTextNode('~/'));
  parts.forEach((seg, i) => {
    if (i) p.append(el('span', { class: 'sep' }, '/'));
    p.append(i === parts.length - 1 ? el('b', {}, page ? page.title.toLowerCase().replace(/\s+/g, '-') : seg) : document.createTextNode(seg));
  });
  p.append(document.createTextNode(' $'));
}

// ---------------- global handlers ----------------
function initGlobal() {
  // copy buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const code = btn.closest('.code')?.querySelector('pre code');
    if (code) {
      navigator.clipboard.writeText(code.textContent).then(() => {
        btn.textContent = 'copied';
        setTimeout(() => (btn.textContent = 'copy'), 1200);
      });
    }
  });
  // in-page anchor links
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#') && !href.startsWith('#/') && href.length > 1) {
      const id = href.slice(1);
      if (document.getElementById(id)) { e.preventDefault(); scrollToAnchor(id); }
    }
  });
}

// ---------------- boot ----------------
async function boot() {
  const [manifest, codeMap] = await Promise.all([loadManifest(), loadCodeMap()]);
  setStatic({ manifest, codeMap });
  await refresh();

  setNavigate(navigate);
  setChangeHook(() => {
    if (current.view === 'doc' && current.slug) renderDocMarkers(current.slug);
    renderNav(current.slug, current.view === 'doc' ? null : '__' + current.view);
    updateStats();
  });
  initPalette(navigate);
  initGlobal();
  renderStatusBar();

  subscribe(() => updateStats());
  window.addEventListener('hashchange', route);
  route();
}

function updateStats() {
  updateOnline();
  const bar = $('#statusbar');
  const stats = bar.querySelectorAll('.stat');
  if (stats[1]) stats[1].querySelector('b').textContent = String(threadCount() + noteCount());
  if (stats[2]) stats[2].querySelector('b').textContent = String(cardCount());
}

boot();
