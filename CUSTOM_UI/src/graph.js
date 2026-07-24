// Knowledge graph: an interactive canvas force-directed graph built by the local `claude`
// agent from your notes + annotations. Drag nodes, scroll to zoom, pan, hover to highlight,
// click for detail.
import { el, toast } from './util.js';
import { getState, refresh } from './store.js';
import { api } from './api.js';

const GROUP_COLOR = {
  api: '#34ff5e',
  controller: '#ffb454',
  runtime: '#57c7ff',
  networking: '#b98cff',
  storage: '#ff8f6b',
  concept: '#e6ede6',
  security: '#ff5f56',
};
const colorFor = (g) => GROUP_COLOR[g] || '#e6ede6';
const clone = (g) => JSON.parse(JSON.stringify(g || { nodes: [], links: [] }));

export function renderGraph(main) {
  const wrap = el('div', { class: 'graph-view' });
  const status = el('span', { class: 'g-status' });
  const analyzeBtn = el('button', { class: 'btn-green', onclick: analyze }, '⟳ analyze notes with local agent');
  wrap.append(el('div', { class: 'g-toolbar' },
    el('h1', {}, el('span', { class: 'prompt' }, '$ '), 'knowledge graph'),
    el('div', { style: 'flex:1' }),
    status, analyzeBtn));
  const stage = el('div', { class: 'g-stage' });
  const canvas = el('canvas', { class: 'g-canvas' });
  const legend = el('div', { class: 'g-legend' });
  const detail = el('div', { class: 'g-detail', hidden: true });
  stage.append(canvas, legend, detail);
  wrap.append(stage);
  main.append(wrap);

  const ctx = canvas.getContext('2d');
  let nodes = [];
  let links = [];
  let alpha = 1;
  const view = { scale: 1, x: 0, y: 0 };
  let hover = null;
  let selected = null;
  let dragNode = null;
  let panning = false;
  let last = { x: 0, y: 0 };
  let moved = 0;

  function size() {
    const r = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: r.width, h: r.height };
  }

  function build() {
    const g = clone(getState().graph);
    const deg = {};
    for (const l of g.links) { deg[l.source] = (deg[l.source] || 0) + 1; deg[l.target] = (deg[l.target] || 0) + 1; }
    const N = g.nodes.length;
    nodes = g.nodes.map((n, i) => ({
      ...n,
      r: 6 + Math.min(10, (deg[n.id] || 0) * 1.6),
      x: Math.cos((i / Math.max(1, N)) * Math.PI * 2) * 120 + (Math.random() - 0.5) * 20,
      y: Math.sin((i / Math.max(1, N)) * Math.PI * 2) * 120 + (Math.random() - 0.5) * 20,
      vx: 0, vy: 0,
    }));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    links = g.links.map((l) => ({ source: byId[l.source], target: byId[l.target], weight: l.weight })).filter((l) => l.source && l.target);
    alpha = 1;
    const { w, h } = size();
    view.x = w / 2; view.y = h / 2; view.scale = 1;
    legend.innerHTML = '';
    const groups = [...new Set(nodes.map((n) => n.group))];
    for (const gr of groups) legend.append(el('span', { class: 'g-leg' }, el('i', { style: `background:${colorFor(gr)}` }), gr));
    status.textContent = nodes.length ? `${nodes.length} concepts · ${links.length} links` : 'no graph yet — run the agent on your notes';
  }

  function step() {
    if (alpha < 0.005) return;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy || 0.01;
        const f = (3200 / d2) * alpha;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }
    for (const l of links) {
      let dx = l.target.x - l.source.x, dy = l.target.y - l.source.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - (90 + (6 - l.weight) * 12)) * 0.02 * alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      l.source.vx += fx; l.source.vy += fy; l.target.vx -= fx; l.target.vy -= fy;
    }
    for (const n of nodes) {
      n.vx += -n.x * 0.003 * alpha; n.vy += -n.y * 0.003 * alpha;
      if (n === dragNode) continue;
      n.x += (n.vx *= 0.85); n.y += (n.vy *= 0.85);
    }
    alpha *= 0.985;
  }

  function toScreen(x, y) { return { x: x * view.scale + view.x, y: y * view.scale + view.y }; }
  function toWorld(sx, sy) { return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale }; }

  function draw() {
    if (!ctx) return;
    const { w, h } = { w: canvas.clientWidth, h: canvas.clientHeight };
    ctx.clearRect(0, 0, w, h);
    const hi = hover || selected;
    const neigh = new Set();
    if (hi) for (const l of links) { if (l.source === hi) neigh.add(l.target); if (l.target === hi) neigh.add(l.source); }
    for (const l of links) {
      const s = toScreen(l.source.x, l.source.y), t = toScreen(l.target.x, l.target.y);
      const active = hi && (l.source === hi || l.target === hi);
      ctx.strokeStyle = active ? 'rgba(52,255,94,0.55)' : 'rgba(52,255,94,0.12)';
      ctx.lineWidth = (active ? 1.6 : 0.8) * Math.max(0.6, l.weight / 3);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    }
    for (const n of nodes) {
      const p = toScreen(n.x, n.y);
      const dim = hi && n !== hi && !neigh.has(n);
      const rr = n.r * Math.max(0.7, view.scale);
      ctx.globalAlpha = dim ? 0.3 : 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      ctx.fillStyle = colorFor(n.group); ctx.fill();
      if (n === selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.fillStyle = '#cdd5cd';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillText(n.label, p.x + rr + 4, p.y + 4);
      ctx.globalAlpha = 1;
    }
  }

  function nodeAt(sx, sy) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const p = toScreen(nodes[i].x, nodes[i].y);
      const rr = nodes[i].r * Math.max(0.7, view.scale) + 4;
      if ((p.x - sx) ** 2 + (p.y - sy) ** 2 <= rr * rr) return nodes[i];
    }
    return null;
  }

  function showDetail(n) {
    selected = n;
    if (!n) { detail.hidden = true; return; }
    const conns = links.filter((l) => l.source === n || l.target === n).map((l) => (l.source === n ? l.target : l.source));
    detail.hidden = false;
    detail.innerHTML = '';
    detail.append(
      el('div', { class: 'g-d-head' }, el('i', { style: `background:${colorFor(n.group)}` }), n.label),
      el('div', { class: 'g-d-group' }, n.group),
      el('div', { class: 'g-d-links' }, conns.length ? 'connects to:' : 'no links'),
      ...conns.map((c) => el('div', { class: 'g-d-link', onclick: () => showDetail(c) }, '→ ' + c.label)));
  }

  // ---- interactions ----
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    moved = 0; last = { x: sx, y: sy };
    const n = nodeAt(sx, sy);
    if (n) { dragNode = n; } else { panning = true; }
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  function onMove(e) {
    if (!document.body.contains(canvas)) { cleanup(); return; }
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (dragNode) {
      const w = toWorld(sx, sy); dragNode.x = w.x; dragNode.y = w.y; dragNode.vx = 0; dragNode.vy = 0; alpha = Math.max(alpha, 0.4);
      moved += 5;
    } else if (panning) {
      view.x += sx - last.x; view.y += sy - last.y; last = { x: sx, y: sy }; moved += 5;
    } else {
      const n = nodeAt(sx, sy);
      hover = n; canvas.style.cursor = n ? 'pointer' : 'default';
    }
  }
  function onUp(e) {
    if (dragNode && moved < 4) showDetail(dragNode);
    else if (panning && moved < 4) showDetail(null);
    dragNode = null; panning = false;
  }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    view.scale = Math.max(0.3, Math.min(4, view.scale * f));
    view.x = sx - (sx - view.x) * f; view.y = sy - (sy - view.y) * f;
  }, { passive: false });

  let raf = 0;
  function loop() {
    if (!document.body.contains(canvas)) { cleanup(); return; }
    step(); draw();
    raf = requestAnimationFrame(loop);
  }
  function cleanup() {
    cancelAnimationFrame(raf);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }

  async function analyze() {
    if (getState().analyze && getState().analyze.running) return;
    analyzeBtn.disabled = true;
    status.textContent = 'analyzing with local agent…';
    try {
      await api.analyze();
      const poll = setInterval(async () => {
        const s = await api.analyzeStatus();
        if (!s.running) {
          clearInterval(poll);
          analyzeBtn.disabled = false;
          await refresh();
          if (s.error) { status.textContent = '⚠ ' + s.error; toast('analysis failed: ' + s.error); }
          else { build(); }
        }
      }, 1500);
    } catch (e) {
      analyzeBtn.disabled = false;
      status.textContent = '⚠ ' + e.message;
    }
  }

  build();
  if (ctx) loop();
}
