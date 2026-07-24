// Nav rail: file-tree of docs + a workspace section (Notes / Board / Atoms) with live counts.
import { el } from './util.js';
import { getState, cardCount, threadCount, noteCount } from './store.js';

let onNavigate = () => {};
export function setNavigate(fn) {
  onNavigate = fn;
}

function treeNode(node, activeSlug) {
  if (node.type === 'page') {
    const n = el('div', {
      class: 'node page' + (node.slug === activeSlug ? ' active' : ''),
      onclick: () => onNavigate('#/' + node.slug),
    }, node.title);
    return el('li', {}, n);
  }
  // section / group
  const li = el('li', {});
  const head = el('div', { class: 'node group' }, el('span', { class: 'disclosure' }, '▾'), node.title);
  li.append(head);
  if (node.children && node.children.length) {
    const ul = el('ul', { class: 'tree' }, ...node.children.map((c) => treeNode(c, activeSlug)));
    li.append(ul);
    head.addEventListener('click', () => {
      const open = ul.style.display !== 'none';
      ul.style.display = open ? 'none' : '';
      head.querySelector('.disclosure').textContent = open ? '▸' : '▾';
    });
  }
  return li;
}

export function renderNav(activeSlug, activeView) {
  const nav = document.getElementById('nav');
  const st = getState();
  const manifest = st.manifest || { nav: [] };
  nav.innerHTML = '';

  nav.append(el('div', { class: 'nav-section-label' }, 'docs'));
  const tree = el('ul', { class: 'tree' }, ...manifest.nav.map((n) => treeNode(n, activeSlug)));
  nav.append(tree);

  nav.append(el('div', { class: 'nav-section-label' }, 'workspace'));
  const ws = el('ul', { class: 'tree workspace' });
  const wsItem = (view, ico, label, count) =>
    el('li', {}, el('div', {
      class: 'node' + (activeView === view ? ' active' : ''),
      onclick: () => onNavigate('#' + view),
    }, el('span', { class: 'ico' }, ico), label, el('span', { class: 'count' }, String(count))));
  ws.append(wsItem('__atoms', '⎔', 'Atomic Units', (manifest.concepts || []).length));
  ws.append(wsItem('__notes', '✎', 'Notes', threadCount() + noteCount()));
  ws.append(wsItem('__board', '▤', 'Board', cardCount()));
  nav.append(ws);
}
