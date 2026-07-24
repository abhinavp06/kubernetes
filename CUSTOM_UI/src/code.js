// Definition button + source-code drawer + code-anchored threads.
import { getState, refresh, codeThreads } from './store.js';
import { el, esc, toast } from './util.js';
import { api } from './api.js';
import { openCustomDrawer, renderThreadList } from './threads.js';

let changeHook = () => {};
export function setCodeChangeHook(fn) { changeHook = fn; }

const targetCount = (cm) => cm.tiers.reduce((a, t) => a + t.targets.length, 0);

// ---- doc-header definition button ----
export function renderDefinition(container, slug) {
  const cm = getState().codeMap[slug];
  if (!cm) return;
  container.append(
    el('button', { class: 'def-btn', title: 'Jump to the Go definitions', onclick: () => openConcept(slug) },
      el('span', { class: 'kw' }, ':def'), cm.apiVersion + ' ' + cm.kind, el('span', { class: 'ret' }, '⏎')),
    el('span', { class: 'def-note' }, targetCount(cm) + ' definitions · ' + cm.tiers.length + ' layers'));
}

// ---- the code drawer ----
export function openConcept(slug, focus) {
  const cm = getState().codeMap[slug];
  if (!cm) { toast('no source map for this page'); return; }
  openCustomDrawer({
    title: cm.kind + '  ·  ' + cm.apiVersion,
    sub: 'source definitions',
    klass: 'code',
    render: (body) => renderConcept(body, slug, cm, focus),
  });
}

// Open the drawer already expanded to a specific target (used by the atoms map / cards).
export function openTarget(slug, path, line) {
  openConcept(slug, { path, line });
}

function renderConcept(body, slug, cm, focus) {
  body.append(el('div', { class: 'def-blurb' }, cm.blurb));
  for (const tier of cm.tiers) {
    body.append(el('div', { class: 'tier-label' }, tier.label));
    for (const target of tier.targets) {
      const view = targetView(slug, cm, target);
      body.append(view);
      if (focus && focus.path === target.path && focus.line === target.line) {
        setTimeout(() => view._expand(), 30);
      }
    }
  }
}

function targetView(slug, cm, target) {
  const wrap = el('div', { class: 'src' });
  const bodyBox = el('div', { class: 'src-body', hidden: true });
  const threadsBox = el('div', { class: 'src-threads' });
  let loaded = false;

  const head = el('div', { class: 'src-head' },
    el('span', { class: 'role' }, target.role),
    el('span', { class: 'loc', title: 'copy path', onclick: (e) => { e.stopPropagation(); navigator.clipboard?.writeText(target.path + ':' + target.line); toast('path copied'); } },
      shortPath(target.path) + ':' + (target.line || '?')),
    el('span', { class: 'spacer' }),
    target.resolved ? null : el('span', { class: 'stale' }, 'unresolved'),
    el('button', { class: 'toolbtn' }, 'view'));

  head.style.cursor = 'pointer';
  head.addEventListener('click', (e) => { if (e.target.closest('.loc')) return; toggle(); });
  wrap.append(head, bodyBox, threadsBox);

  function toggle() {
    if (!target.resolved) { toast('symbol not found in source'); return; }
    const open = bodyBox.hidden;
    bodyBox.hidden = !open;
    head.querySelector('.toolbtn').textContent = open ? 'hide' : 'view';
    if (open && !loaded) load();
  }
  async function load() {
    loaded = true;
    bodyBox.innerHTML = '';
    bodyBox.append(el('div', { style: 'padding:10px;color:var(--fg-dim)' }, 'loading source…'));
    try {
      const data = await api.code(target.path, target.line, 44);
      renderCode(bodyBox, threadsBox, slug, cm, target, data);
    } catch {
      bodyBox.innerHTML = '';
      bodyBox.append(el('div', { style: 'padding:10px;color:var(--danger)' }, 'failed to load source (is the server running?)'));
    }
  }
  wrap._expand = () => { if (bodyBox.hidden) toggle(); wrap.scrollIntoView({ block: 'start' }); };
  return wrap;
}

function renderCode(bodyBox, threadsBox, slug, cm, target, data) {
  bodyBox.innerHTML = '';
  const table = el('table', { class: 'codelines' });
  const rows = {};
  data.lines.forEach((html, i) => {
    const lineNo = data.start + i;
    const tr = el('tr', { dataset: { line: String(lineNo) } },
      el('td', { class: 'ln', dataset: { line: String(lineNo) } }, String(lineNo)),
      el('td', { class: 'code-col', html: html && html.length ? html : ' ' }));
    if (lineNo === data.focus) tr.classList.add('focus');
    rows[lineNo] = tr;
    table.append(tr);
  });
  const bar = el('div', { class: 'src-anno-bar', hidden: true });
  bodyBox.append(table, bar);

  let anchor = null;
  const clearSel = () => table.querySelectorAll('tr.selrange').forEach((r) => r.classList.remove('selrange'));
  const markSel = (a, b) => { clearSel(); const lo = Math.min(a, b), hi = Math.max(a, b); for (let l = lo; l <= hi; l++) rows[l]?.classList.add('selrange'); };
  const quoteFor = (lo, hi) => {
    const out = [];
    for (let l = lo; l <= hi; l++) if (rows[l]) out.push(rows[l].querySelector('.code-col').textContent.replace(/\s+$/, ''));
    return out.join('\n');
  };

  table.querySelectorAll('.ln').forEach((ln) => {
    ln.addEventListener('click', (e) => {
      const line = Number(ln.dataset.line);
      if (e.shiftKey && anchor != null) { markSel(anchor, line); showBar(anchor, line); }
      else { anchor = line; markSel(line, line); showBar(line, line); }
    });
  });

  function showBar(a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    bar.hidden = false;
    bar.innerHTML = '';
    bar.append(
      el('span', { class: 'hint' }, 'lines ' + lo + (hi !== lo ? '–' + hi : '') + '  (shift-click for a range)'),
      el('button', { class: 'btn-green', onclick: () => annotate(lo, hi) }, '✎ annotate'),
      el('button', { onclick: () => { clearSel(); bar.hidden = true; } }, 'cancel'));
  }

  async function annotate(lo, hi) {
    const quote = quoteFor(lo, hi).slice(0, 500);
    await api.createThread({
      target: { kind: 'code', path: target.path, symbol: cm.kind + ' · ' + target.role, lineStart: lo, lineEnd: hi, version: (getState().manifest || {}).version, openedFrom: slug },
      quote, body: '',
    });
    await refresh();
    changeHook();
    clearSel();
    bar.hidden = true;
    paint();
  }

  const overlaps = (tg) => tg.lineStart <= data.end && tg.lineEnd >= data.start;
  const threadsHere = () => codeThreads(target.path).filter((t) => overlaps(t.target));

  function paint() {
    // line markers
    Object.values(rows).forEach((r) => r.classList.remove('has-anno'));
    for (const t of threadsHere()) {
      for (let l = t.target.lineStart; l <= t.target.lineEnd; l++) rows[l]?.classList.add('has-anno');
    }
    // inline threads with drift detection
    renderThreadList(threadsBox, {
      getThreads: threadsHere,
      noNew: true,
      decorate: (t, card) => {
        const cur = quoteFor(t.target.lineStart, t.target.lineEnd);
        if (t.quote && cur && cur.trim() !== t.quote.trim()) {
          card.querySelector('.quote')?.append(el('span', { class: 'drift-chip', title: 'source changed since this note' }, '~drifted'));
        }
      },
    });
  }
  paint();
}

const shortPath = (p) => p.replace(/^staging\/src\/k8s\.io\//, 'k8s.io/').replace(/^pkg\//, 'pkg/');
