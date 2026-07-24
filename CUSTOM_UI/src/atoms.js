// Atomic Units map. (Filled in during phase 6.)
import { el } from './util.js';

export function renderAtoms(main) {
  main.append(el('div', { class: 'placeholder' },
    el('div', { class: 'big' }, '// atomic units'),
    el('p', {}, 'The atomic-units map lands in phase 6.')));
}
