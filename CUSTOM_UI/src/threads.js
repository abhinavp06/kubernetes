// Annotation threads + the right-hand drawer. Target-agnostic: the same drawer serves
// doc-block annotations and (later) source-code line ranges.
import { el, esc, mdInline, timeAgo, toast } from './util.js';
import { api } from './api.js';
import { refresh, docThreads } from './store.js';

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

// config: { title, sub, klass, getThreads(), newTarget, newQuote, onChange() }
export function openThreadDrawer(config) {
  ensureDrawer();
  drawerEl.className = 'drawer open' + (config.klass ? ' ' + config.klass : '');
  overlayEl.hidden = false;
  renderDrawer(config);
}

function renderDrawer(config) {
  const threads = config.getThreads();
  const body = el('div', { class: 'drawer-body' });

  for (const t of threads) body.append(threadCard(t, config));

  // new-thread composer
  body.append(newThreadComposer(config));

  drawerEl.innerHTML = '';
  drawerEl.append(
    el('div', { class: 'drawer-head' },
      el('div', { class: 'dh-title' }, config.title),
      el('div', { class: 'spacer' }),
      config.sub ? el('div', { class: 'dh-sub' }, config.sub) : null,
      el('button', { class: 'x', title: 'Close (Esc)', onclick: closeDrawer }, '✕'),
    ),
    body,
  );
}

function rerender(config) {
  renderDrawer(config);
}

function threadCard(t, config) {
  const wrap = el('div', { class: 'thread' });
  if (t.quote) wrap.append(el('div', { class: 'quote' }, '> ' + t.quote));

  for (const c of t.comments) {
    wrap.append(commentEl(t, c, config));
  }

  // add-comment composer
  const ta = el('textarea', { rows: '2', placeholder: 'reply…' });
  const addBtn = el('button', { class: 'btn-green', onclick: submit }, 'comment');
  async function submit() {
    const v = ta.value.trim();
    if (!v) return;
    await api.addComment(t.id, v);
    await refresh();
    changeHook();
    rerender(config);
  }
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
  });
  wrap.append(el('div', { class: 'composer' }, ta,
    el('div', { class: 'row' },
      el('span', { class: 'hint' }, '⌘/Ctrl+Enter'),
      el('button', { class: 'btn-danger', onclick: () => delThread(t, config) }, 'delete thread'),
      addBtn,
    )));
  return wrap;
}

function commentEl(t, c, config) {
  const bodyEl = el('div', { class: 'body', html: mdInline(c.body) });
  const meta = el('div', { class: 'meta' },
    el('span', {}, timeAgo(c.updatedAt || c.createdAt)),
    el('div', { class: 'actions' },
      el('button', { onclick: startEdit }, 'edit'),
      el('button', { onclick: del }, 'delete'),
    ));
  const wrap = el('div', { class: 'comment' }, meta, bodyEl);

  function startEdit() {
    const ta = el('textarea', { rows: '3' });
    ta.value = c.body;
    const save = async () => {
      await api.editComment(t.id, c.id, ta.value.trim());
      await refresh();
      changeHook();
      rerender(config);
    };
    ta.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
    });
    wrap.replaceChild(el('div', { class: 'composer' }, ta,
      el('div', { class: 'row' }, el('button', { class: 'btn-green', onclick: save }, 'save'))), bodyEl);
  }
  async function del() {
    await api.deleteComment(t.id, c.id);
    await refresh();
    changeHook();
    rerender(config);
  }
  return wrap;
}

async function delThread(t, config) {
  await api.deleteThread(t.id);
  await refresh();
  changeHook();
  rerender(config);
}

function newThreadComposer(config) {
  const ta = el('textarea', { rows: '3', placeholder: config.getThreads().length ? 'start another thread here…' : 'add a note on this passage…' });
  const submit = async () => {
    const v = ta.value.trim();
    if (!v) return;
    await api.createThread({ target: config.newTarget, quote: config.newQuote || '', body: v });
    await refresh();
    changeHook();
    ta.value = '';
    rerender(config);
  };
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
  });
  return el('div', { class: 'composer', style: 'margin-top:18px;border-top:1px solid var(--rule);padding-top:14px' },
    config.newQuote ? el('div', { class: 'quote' }, '> ' + config.newQuote) : null,
    ta,
    el('div', { class: 'row' }, el('span', { class: 'hint' }, 'new thread'), el('button', { class: 'btn-green', onclick: submit }, 'annotate')));
}

// ---------------- doc annotations ----------------
const ANNOTATABLE = 'p, ul, ol, h2, h3, h4, blockquote, table, .callout, .code, .figure';

export function initDocAnnotations(slug) {
  const article = document.querySelector('.article');
  if (!article) return;
  const blocks = [...article.children].filter((n) => n.matches(ANNOTATABLE));
  blocks.forEach((block, i) => {
    block.classList.add('anno-block');
    block.dataset.block = String(i);
    const add = el('button', {
      class: 'anno-add', title: 'Annotate this block',
      onclick: (e) => {
        e.stopPropagation();
        openBlock(slug, i, blockQuote(block));
      },
    }, '+');
    block.prepend(add);
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
  const threads = docThreads(slug);
  const byBlock = {};
  for (const t of threads) {
    const bi = t.target.blockIndex;
    (byBlock[bi] = byBlock[bi] || []).push(t);
  }
  blocks.forEach((block) => {
    const bi = Number(block.dataset.block);
    block.classList.toggle('has-anno', !!byBlock[bi]);
    if (byBlock[bi]) {
      const count = byBlock[bi].reduce((a, t) => a + t.comments.length, 0);
      const marker = el('span', {
        class: 'anno-marker', title: 'View annotations',
        onclick: (e) => { e.stopPropagation(); openBlock(slug, bi, blockQuote(block)); },
      }, '✎ ' + count);
      // attach marker to the first heading/first line
      block.appendChild(marker);
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
      pill = el('div', {
        class: 'sel-pill',
        onclick: () => { clear(); openBlock(slug, blockIndex, quote); },
      }, '✎ Annotate selection');
      pill.style.left = rect.left + rect.width / 2 + 'px';
      pill.style.top = rect.top + 'px';
      document.body.append(pill);
    }, 10);
  });
  document.addEventListener('mousedown', (e) => { if (pill && !pill.contains(e.target)) clear(); });
}
