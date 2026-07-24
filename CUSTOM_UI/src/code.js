// Definition button + source-code drawer. (Filled in during phase 3–5.)
import { getState } from './store.js';
import { el, toast } from './util.js';

export function renderDefinition(container, slug) {
  const cm = getState().codeMap[slug];
  if (!cm) return;
  container.append(el('button', { class: 'def-btn', onclick: () => toast('source drawer arrives in phase 3–5') },
    el('span', { class: 'kw' }, ':def'), cm.apiVersion + ' ' + cm.kind, el('span', { class: 'ret' }, '⏎')));
}

export function openDefinition() { toast('coming soon'); }
export function openCodeTarget() { toast('coming soon'); }
