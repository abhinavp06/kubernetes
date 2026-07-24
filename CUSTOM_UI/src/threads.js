// Annotation threads + the right-hand drawer. Target-agnostic: the same thread UI serves
// doc-block annotations and source-code line ranges. The drawer can also host arbitrary
// content (used by the code view) via openCustomDrawer.
import { el, esc, mdInline, timeAgo, toast } from './util.js';
import { api } from './api.js';
import { refresh, docThreads } from './store.js';

// Capture an annotation onto the board as a DOUBTS card, linked back to its anchor.
async function captureThread(t) {
  const link = t.target.kind === 'doc'
    ? { docSlug: t.target.slug }
    : { codeAnchor: { slug: t.target.openedFrom, path: t.target.path, line: t.target.lineStart } };
  const title = (t.quote || (t.comments[0] && t.comments[0].body) || 'annotation').slice(0, 80);
  await api.createCard({ title, body: t.comments.map((c) => c.body).join('\n'), column: 'doubt', type: 'doubt', link });
  changeHook();
  toast('added to board · DOUBTS');
}

let drawerEl = null;
let overlayEl = null;
let changeHook = () => {};

export function setChangeHook(fn) {
  changeHook = fn;
}

function ensureDrawer() {
  if (drawerEl) return;
  overlayEl = el('div', { class: 'overlay', hidden: true, onclick: closeDrawer });
  drawerEl = el('div', { class: 'drawer' });
  document.body.append(overlayEl, drawerEl);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerEl.classList.contains('open')) closeDrawer();
  });
}

export function closeDrawer() {
  if (!drawerEl) return;
  drawerEl.classList.remove('open');
  overlayEl.hidden = true;
}

// Generic drawer host: { title, sub, klass, render(bodyEl) }
export function openCustomDrawer({ title, sub, klass, render }) {
  ensureDrawer();
  drawerEl.className = 'drawer open' + (klass ? ' ' + klass : '');
  overlayEl.hidden = false;
  const body = el('div', { class: 'drawer-body' });
  drawerEl.innerHTML = '';
  drawerEl.append(
    el('div', { class: 'drawer-head' },
      el('div', { class: 'dh-title' }, title),
      el('div', { class: 'spacer' }),
      sub ? el('div', { class: 'dh-sub' }, sub) : null,
      el('button', { class: 'x', title: 'Close (Esc)', onclick: closeDrawer }, '✕')),
    body);
  render(body);
}

// Thread list mountable into any container.
// config: { getThreads(), newTarget, newQuote, noNew, decorate(t, cardEl) }
export function renderThreadList(mount, config) {
  config._rerender = () => renderThreadList(mount, config);
  mount.innerHTML = '';
  const threads = config.getThreads();
  if (!threads.length && config.noNew) {
    mount.append(el('div', { class: 'empty', style: 'padding:14px' }, 'no threads on this definition yet — select lines to annotate'));
  }
  for (const t of threads) mount.append(threadCard(t, config));
  if (!config.noNew) mount.append(newThreadComposer(config));
}

// Thread drawer = custom drawer + a thread list.
export function openThreadDrawer(config) {
  openCustomDrawer({ title: config.title, sub: config.sub, klass: config.klass, render: (body) => renderThreadList(body, config) });
}

function threadCard(t, config) {
  const wrap = el('div', { class: 'thread' });
  if (t.quote) wrap.append(el('div', { class: 'quote' }, '> ' + t.quote));
  if (config.decorate) config.decorate(t, wrap);
  for (const c of t.comments) wrap.append(commentEl(t, c, config));

  const ta = el('textarea', { rows: '2', placeholder: 'reply…' });
  async function submit() {
    const v = ta.value.trim();
    if (!v) return;
    await api.addComment(t.id, v);
    await refresh();
    changeHook();
    config._rerender();
  }
  ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); });
  wrap.append(el('div', { class: 'composer' }, ta,
    el('div', { class: 'row' },
      el('span', { class: 'hint' }, '⌘/Ctrl+Enter'),
      el('button', { onclick: () => captureThread(t) }, '→ board'),
      el('button', { class: 'btn-danger', onclick: () => delThread(t, config) }, 'delete thread'),
      el('button', { class: 'btn-green', onclick: submit }, 'comment'))));
  return wrap;
}

function commentEl(t, c, config) {
  const bodyEl = el('div', { class: 'body', html: mdInline(c.body) });
  const wrap = el('div', { class: 'comment' },
    el('div', { class: 'meta' },
      el('span', {}, timeAgo(c.updatedAt || c.createdAt)),
      el('div', { class: 'actions' },
        el('button', { onclick: startEdit }, 'edit'),
        el('button', { onclick: del }, 'delete'))),
    bodyEl);

  function startEdit() {
    const ta = el('textarea', { rows: '3' });
    ta.value = c.body;
    const save = async () => { await api.editComment(t.id, c.id, ta.value.trim()); await refresh(); changeHook(); config._rerender(); };
    ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(); });
    wrap.replaceChild(el('div', { class: 'composer' }, ta, el('div', { class: 'row' }, el('button', { class: 'btn-green', onclick: save }, 'save'))), bodyEl);
  }
  async function del() { await api.deleteComment(t.id, c.id); await refresh(); changeHook(); config._rerender(); }
  return wrap;
}

async function delThread(t, config) {
  await api.deleteThread(t.id);
  await refresh();
  changeHook();
  config._rerender();
}

function newThreadComposer(config) {
  const ta = el('textarea', { rows: '3', placeholder: config.getThreads().length ? 'start another thread…' : 'add a note on this passage…' });
  const submit = async () => {
    const v = ta.value.trim();
    if (!v) return;
    await api.createThread({ target: config.newTarget, quote: config.newQuote || '', body: v });
    await refresh();
    changeHook();
    ta.value = '';
    config._rerender();
  };
  ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); });
  return el('div', { class: 'composer', style: 'margin-top:18px;border-top:1px solid var(--rule);padding-top:14px' },
    config.newQuote ? el('div', { class: 'quote' }, '> ' + config.newQuote) : null,
    ta,
    el('div', { class: 'row' }, el('span', { class: 'hint' }, 'new thread'), el('button', { class: 'btn-green', onclick: submit }, 'annotate')));
}

// ---------------- doc annotations ----------------
const ANNOTATABLE = 'p, ul, ol, h2, h3, h4, blockquote, .callout, .code, .figure';

export function initDocAnnotations(slug) {
  const article = document.querySelector('.article');
  if (!article) return;
  const blocks = [...article.children].filter((n) => n.matches && n.matches(ANNOTATABLE));
  blocks.forEach((block, i) => {
    block.classList.add('anno-block');
    block.dataset.block = String(i);
    block.prepend(el('button', {
      class: 'anno-add', title: 'Annotate this block',
      onclick: (e) => { e.stopPropagation(); openBlock(slug, i, blockQuote(block)); },
    }, '+'));
  });
  renderDocMarkers(slug);
  initSelectionPill(slug, article);
}

function blockQuote(block) {
  const t = block.textContent.replace(/^\+/, '').replace(/\s+/g, ' ').trim();
  return t.length > 160 ? t.slice(0, 157) + '…' : t;
}

export function renderDocMarkers(slug) {
  const article = document.querySelector('.article');
  if (!article) return;
  article.querySelectorAll('.anno-marker').forEach((m) => m.remove());
  const blocks = [...article.children].filter((n) => n.classList && n.classList.contains('anno-block'));
  const byBlock = {};
  for (const t of docThreads(slug)) (byBlock[t.target.blockIndex] = byBlock[t.target.blockIndex] || []).push(t);
  blocks.forEach((block) => {
    const bi = Number(block.dataset.block);
    block.classList.toggle('has-anno', !!byBlock[bi]);
    if (byBlock[bi]) {
      const count = byBlock[bi].reduce((a, t) => a + t.comments.length, 0);
      block.appendChild(el('span', {
        class: 'anno-marker', title: 'View annotations',
        onclick: (e) => { e.stopPropagation(); openBlock(slug, bi, blockQuote(block)); },
      }, '✎ ' + count));
    }
  });
}

export function openBlock(slug, blockIndex, quote) {
  openThreadDrawer({
    title: 'Annotations',
    sub: 'block #' + blockIndex,
    getThreads: () => docThreads(slug).filter((t) => t.target.blockIndex === blockIndex),
    newTarget: { kind: 'doc', slug, blockIndex },
    newQuote: quote,
  });
}

function initSelectionPill(slug, article) {
  let pill = null;
  const clear = () => { if (pill) { pill.remove(); pill = null; } };
  article.addEventListener('mouseup', () => {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel && sel.toString().trim();
      clear();
      if (!text || text.length < 3) return;
      const range = sel.getRangeAt(0);
      if (!article.contains(range.commonAncestorContainer)) return;
      let node = range.startContainer;
      while (node && node !== article && !(node.classList && node.classList.contains('anno-block'))) node = node.parentNode;
      if (!node || node === article) return;
      const blockIndex = Number(node.dataset.block);
      const rect = range.getBoundingClientRect();
      const quote = text.replace(/\s+/g, ' ').slice(0, 160);
      pill = el('div', { class: 'sel-pill' },
        el('span', { style: 'cursor:pointer', onclick: () => { clear(); openBlock(slug, blockIndex, quote); } }, '✎ annotate'),
        el('span', { style: 'cursor:pointer;color:var(--fg-dim);border-left:1px solid var(--rule);padding-left:6px', onclick: async () => { clear(); await api.createCard({ title: quote.slice(0, 80), body: '', column: 'doubt', type: 'doubt', link: { docSlug: slug } }); changeHook(); toast('added to board · DOUBTS'); } }, '→ board'));
      pill.style.left = rect.left + rect.width / 2 + 'px';
      pill.style.top = rect.top + 'px';
      document.body.append(pill);
    }, 10);
  });
  document.addEventListener('mousedown', (e) => { if (pill && !pill.contains(e.target)) clear(); });
}
