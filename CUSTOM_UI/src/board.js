// Kanban learning board: columns, drag-and-drop, card CRUD, and deep-link chips
// back to the doc paragraph or the source definition a card came from.
import { el, mdInline, toast } from './util.js';
import { api } from './api.js';
import { getState, refresh } from './store.js';
import { openConcept } from './code.js';

const navigate = (h) => { location.hash = h; };
const basename = (p) => p.split('/').pop();

export function renderBoard(main) {
  const board = getState().board;
  const wrap = el('div', { class: 'board' });
  wrap.append(el('div', { class: 'board-head' },
    el('h1', {}, el('span', { class: 'prompt' }, '$ '), 'board'),
    el('div', { class: 'sub' }, "what you've learned · what's in flight · your doubts")));
  const cols = el('div', { class: 'board-cols' });
  for (const col of board.columns) cols.append(columnEl(col, board, main));
  wrap.append(cols);
  main.append(wrap);
}

function rerender(main) { main.innerHTML = ''; renderBoard(main); }

function typeSelect(val) {
  const s = el('select', { class: 'txt' });
  for (const t of ['todo', 'doubt', 'note', 'done']) s.append(el('option', { value: t, selected: t === val }, t));
  return s;
}

function columnEl(col, board, main) {
  const cards = board.cards.filter((c) => c.column === col.id).sort((a, b) => a.order - b.order);
  const body = el('div', { class: 'board-col-body' });
  const colEl = el('div', { class: 'board-col', dataset: { col: col.id } },
    el('div', { class: 'board-col-head' },
      el('span', { class: 'mark' }, col.mark || '[ ]'),
      col.title,
      el('span', { class: 'cnt' }, String(cards.length)),
      el('button', { class: 'add', title: 'add card', onclick: () => addCard(col, main) }, '+')),
    body);
  for (const c of cards) body.append(cardEl(c, main));

  colEl.addEventListener('dragover', (e) => { e.preventDefault(); colEl.classList.add('dragover'); });
  colEl.addEventListener('dragleave', () => colEl.classList.remove('dragover'));
  colEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    colEl.classList.remove('dragover');
    const id = e.dataTransfer.getData('text/card');
    if (!id) return;
    await api.updateCard(id, { column: col.id, order: cards.length });
    await refresh();
    rerender(main);
  });
  return colEl;
}

function cardEl(c, main) {
  const card = el('div', { class: 'card ' + (c.type || 'todo'), draggable: 'true' });
  card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/card', c.id); card.classList.add('dragging'); });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.append(
    el('div', { class: 'tag' }, '// ' + (c.type || 'todo').toUpperCase()),
    el('div', { class: 'title' }, c.title));
  if (c.body) card.append(el('div', { class: 'body', html: mdInline(c.body) }));
  if (c.link) {
    const chips = el('div', { class: 'chips' });
    if (c.link.docSlug) chips.append(el('span', { class: 'chip', title: 'open the doc', onclick: () => navigate('#/' + c.link.docSlug) }, '↳ doc'));
    if (c.link.codeAnchor) chips.append(el('span', { class: 'chip', title: 'open the source', onclick: () => openConcept(c.link.codeAnchor.slug, { path: c.link.codeAnchor.path, line: c.link.codeAnchor.line }) }, '↳ ' + basename(c.link.codeAnchor.path)));
    if (chips.children.length) card.append(chips);
  }
  card.append(el('div', { class: 'cardactions' },
    el('button', { onclick: (e) => { e.stopPropagation(); editCard(c, card, main); } }, 'edit'),
    el('button', { onclick: async (e) => { e.stopPropagation(); await api.deleteCard(c.id); await refresh(); rerender(main); } }, 'delete')));
  return card;
}

function addCard(col, main) {
  const colBody = document.querySelector('.board-col[data-col="' + col.id + '"] .board-col-body');
  if (!colBody) return;
  const title = el('input', { class: 'txt', placeholder: 'card title' });
  const body = el('textarea', { rows: '2', placeholder: 'details (optional)' });
  const type = typeSelect(col.id === 'doubt' ? 'doubt' : col.id === 'done' ? 'done' : 'todo');
  const save = async () => {
    if (!title.value.trim()) return;
    await api.createCard({ title: title.value.trim(), body: body.value.trim(), column: col.id, type: type.value });
    await refresh();
    rerender(main);
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  const form = el('div', { class: 'card', style: 'cursor:default' }, title, body,
    el('div', { style: 'display:flex;gap:6px;margin-top:6px;align-items:center' }, type, el('button', { class: 'btn-green', onclick: save }, 'add'), el('button', { onclick: () => rerender(main) }, 'cancel')));
  colBody.prepend(form);
  title.focus();
}

function editCard(c, card, main) {
  const title = el('input', { class: 'txt' }); title.value = c.title;
  const body = el('textarea', { rows: '3' }); body.value = c.body;
  const type = typeSelect(c.type || 'todo');
  const save = async () => { await api.updateCard(c.id, { title: title.value.trim(), body: body.value.trim(), type: type.value }); await refresh(); rerender(main); };
  card.innerHTML = '';
  card.append(title, body, el('div', { style: 'display:flex;gap:6px;margin-top:6px;align-items:center' }, type, el('button', { class: 'btn-green', onclick: save }, 'save'), el('button', { onclick: () => rerender(main) }, 'cancel')));
}

// Capture helper used by the annotation drawer / selection pill.
export async function captureToBoard({ title, body, link }) {
  await api.createCard({ title: (title || 'doubt').slice(0, 80), body: body || '', column: 'doubt', type: 'doubt', link: link || null });
  toast('added to board · DOUBTS');
}
