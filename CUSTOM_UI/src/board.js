// Kanban board. (Filled in during the board phase.)
import { el } from './util.js';

export function renderBoard(main) {
  main.append(el('div', { class: 'placeholder' },
    el('div', { class: 'big' }, '// board'),
    el('p', {}, 'The kanban board lands in a later phase.')));
}
