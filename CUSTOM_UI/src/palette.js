// kubectl-style command palette: fuzzy search over pages + jump commands.
import { el, esc, fuzzyScore, debounce } from './util.js';
import { getState } from './store.js';

let navigate = () => {};
let boxWrap = null;
let input = null;
let resultsEl = null;
let items = [];
let sel = 0;

export function initPalette(onNavigate) {
  navigate = onNavigate;
  document.addEventListener('keydown', (e) => {
    const typing = /^(input|textarea)$/i.test((e.target.tagName || '')) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    } else if (e.key === '/' && !typing && !isOpen()) {
      e.preventDefault();
      openPalette();
    }
  });
}

const isOpen = () => !!boxWrap;

export function openPalette() {
  if (boxWrap) return;
  input = el('input', { type: 'text', placeholder: 'search docs · jump to view…', autofocus: true });
  resultsEl = el('div', { class: 'palette-results' });
  const box = el('div', { class: 'palette-box' },
    el('div', { class: 'palette-input' }, el('span', { class: 'prompt' }, '/'), input),
    resultsEl);
  boxWrap = el('div', { class: 'palette', onclick: (e) => { if (e.target === boxWrap) closePalette(); } }, box);
  document.body.append(boxWrap);
  input.addEventListener('input', debounce(() => update(input.value), 60));
  input.addEventListener('keydown', onKey);
  update('');
  input.focus();
}

export function closePalette() {
  if (boxWrap) { boxWrap.remove(); boxWrap = null; }
}

function commands() {
  return [
    { kind: 'view', label: 'Atomic Units map', sub: '⎔', action: () => navigate('#__atoms'), keys: 'atoms atomic units components map' },
    { kind: 'view', label: 'Notes & annotations', sub: '✎', action: () => navigate('#__notes'), keys: 'notes annotations' },
    { kind: 'view', label: 'Kanban board', sub: '▤', action: () => navigate('#__board'), keys: 'board kanban doubts todo' },
    { kind: 'view', label: 'Knowledge graph', sub: '◈', action: () => navigate('#__graph'), keys: 'graph knowledge concept map agent' },
  ];
}

function update(q) {
  const st = getState();
  const pages = (st.manifest && st.manifest.search) || [];
  const results = [];

  for (const p of pages) {
    const titleScore = fuzzyScore(q, p.title);
    const sectionScore = fuzzyScore(q, p.section) * 0.4;
    let headScore = -1;
    for (const h of p.headings || []) headScore = Math.max(headScore, fuzzyScore(q, h));
    const score = Math.max(titleScore, sectionScore, headScore * 0.6);
    if (q === '' || score > 0) {
      results.push({ kind: p.type || 'doc', label: p.title, sub: p.section, score: q === '' ? 0 : score, action: () => navigate('#/' + p.slug) });
    }
  }
  for (const c of commands()) {
    const score = q === '' ? 0 : fuzzyScore(q, c.keys);
    if (q === '' || score > 0) results.push({ ...c, score: score + 50 });
  }

  results.sort((a, b) => b.score - a.score);
  items = results.slice(0, 40);
  sel = 0;
  paint(q);
}

function paint(q) {
  resultsEl.innerHTML = '';
  if (!items.length) {
    resultsEl.append(el('div', { class: 'palette-empty' }, 'no matches'));
    return;
  }
  items.forEach((it, i) => {
    resultsEl.append(el('div', {
      class: 'palette-item' + (i === sel ? ' sel' : ''),
      onmouseenter: () => { sel = i; highlight(); },
      onclick: () => run(i),
    },
      el('span', { class: 'kind' }, it.kind),
      el('span', { class: 'label', html: hl(it.label, q) }),
      el('span', { class: 'sub' }, it.sub || '')));
  });
}

function hl(text, q) {
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return esc(text);
  return esc(text.slice(0, idx)) + '<b>' + esc(text.slice(idx, idx + q.length)) + '</b>' + esc(text.slice(idx + q.length));
}

function highlight() {
  [...resultsEl.children].forEach((c, i) => c.classList.toggle('sel', i === sel));
  const cur = resultsEl.children[sel];
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

function onKey(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); highlight(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); highlight(); }
  else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
}

function run(i) {
  const it = items[i];
  if (!it) return;
  closePalette();
  it.action();
}
