// Atomic Units map: the core building blocks of Kubernetes and where they live in the
// source, rendered kubectl-get style. Click a Kind for its full definition set, or a
// location to jump straight to the code.
import { el } from './util.js';
import { getState } from './store.js';
import { openConcept, openTarget } from './code.js';

const shortPath = (p) => p.replace(/^staging\/src\/k8s\.io\//, 'k8s.io/');

export function renderAtoms(main) {
  const cm = getState().codeMap;
  const slugs = Object.keys(cm);
  const wrap = el('div', { class: 'atoms' });
  wrap.append(el('h1', {}, el('span', { class: 'prompt' }, '$ '), 'atomic units'));

  const totalDefs = slugs.reduce((a, s) => a + cm[s].tiers.reduce((b, t) => b + t.targets.length, 0), 0);
  wrap.append(el('div', { class: 'lead' },
    `${slugs.length} core objects · ${totalDefs} definitions across the tree (v${(getState().manifest || {}).version || ''}). `
    + 'Click a Kind to open its full definition set, or a location to jump straight to the source.'));

  for (const slug of slugs) {
    const def = cm[slug];
    const table = el('table', { class: 'atoms-table' });
    table.append(el('caption', { title: 'open all definitions', onclick: () => openConcept(slug) },
      def.kind + ' · ' + def.apiVersion + '  ⏎'));
    table.append(el('tr', {}, el('th', {}, 'layer'), el('th', {}, 'role'), el('th', {}, 'source location')));
    for (const tier of def.tiers) {
      tier.targets.forEach((tg, i) => {
        table.append(el('tr', {},
          el('td', { class: 'kind' }, i === 0 ? tier.label : ''),
          el('td', { class: 'role' }, tg.role),
          tg.resolved
            ? el('td', { class: 'loc', title: 'open in code drawer', onclick: () => openTarget(slug, tg.path, tg.line) }, shortPath(tg.path) + ':' + tg.line)
            : el('td', { class: 'role' }, '(unresolved)')));
      });
    }
    wrap.append(table);
  }
  main.append(wrap);
}
