// Headless smoke test: boot the real client under jsdom against the running server
// and assert the doc reader, nav, TOC, definition button, atoms map, and board render
// without runtime errors. Requires `npm run serve` on PORT (default 4173).
import { JSDOM } from 'jsdom';

const PORT = process.env.PORT || 4173;
const base = 'http://localhost:' + PORT;

const dom = new JSDOM(
  `<!doctype html><html><body>
    <header id="statusbar" class="statusbar"></header>
    <div id="shell" class="shell"><aside id="nav" class="nav"></aside><main id="main" class="main"></main><aside id="toc" class="toc"></aside></div>
  </body></html>`,
  { url: base + '/#/concepts/workloads/pods', pretendToBeVisual: true },
);

const { window } = dom;
const setGlobal = (k, v) => {
  try { globalThis[k] = v; } catch { try { Object.defineProperty(globalThis, k, { value: v, configurable: true }); } catch {} }
};
window.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
setGlobal('window', window);
setGlobal('document', window.document);
setGlobal('location', window.location);
setGlobal('history', window.history);
setGlobal('HTMLElement', window.HTMLElement);
setGlobal('getSelection', () => ({ toString: () => '', rangeCount: 0 }));
setGlobal('IntersectionObserver', window.IntersectionObserver);
try { Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true }); } catch {}

const realFetch = global.fetch;
const patched = (u, o) => realFetch(typeof u === 'string' && u.startsWith('/') ? base + u : u, o);
global.fetch = patched;
window.fetch = patched;

let errors = 0;
const log = [];
window.addEventListener('error', (e) => { errors++; log.push('window error: ' + (e.error?.stack || e.message)); });
process.on('unhandledRejection', (e) => { errors++; log.push('unhandledRejection: ' + (e?.stack || e)); });
process.on('uncaughtException', (e) => { errors++; log.push('uncaughtException: ' + (e?.stack || e)); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await import('../src/app.js');
await wait(900);

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const checks = [];
const check = (name, cond) => { checks.push([name, !!cond]); };

// doc reader
check('article rendered', $('.article'));
check('h1 title', $('.reader h1'));
check('definition button', $('.def-btn'));
check('nav nodes', $$('.nav .node').length >= 3);
check('toc links', $$('#toc a').length > 0);
check('code blocks in article', $$('.article .code').length > 0);
check('anno-add affordances', $$('.anno-add').length > 0);
check('status bar brand', $('.statusbar .brand'));

// route to atoms
window.location.hash = '#__atoms';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await wait(200);
check('atoms tables', $$('.atoms-table').length >= 3);
check('atoms locations', $$('.atoms-table .loc').length > 0);

// route to board
window.location.hash = '#__board';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await wait(200);
check('board columns', $$('.board-col').length === 4);

// route to notes
window.location.hash = '#__notes';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await wait(200);
check('notes workspace', $('.workspace'));
check('notes tabs', $$('.wtabs .tab').length === 2);

let pass = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (ok) pass++;
}
console.log(`\n${pass}/${checks.length} checks passed; ${errors} runtime error(s)`);
if (log.length) console.log('\n--- errors ---\n' + log.join('\n'));
process.exit(pass === checks.length && errors === 0 ? 0 : 1);
