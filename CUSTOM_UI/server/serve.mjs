// node:http server: serves the client (src/), built data (data/), docs static assets,
// a guarded source-code endpoint, and a JSON API for threads / notes / board.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import hljs from 'highlight.js';

import { SRC_DIR, DATA_DIR, STATIC_DIR, CODE_ROOT, PORT } from '../config.mjs';
import * as store from '../lib/notesStore.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// Resolve a request path under a root, refusing anything that escapes it.
function safeJoin(root, rel) {
  const abs = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  const base = path.resolve(root);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}

function serveStatic(res, root, rel, fallback) {
  let abs = safeJoin(root, rel);
  if (!abs) return json(res, 403, { error: 'forbidden' });
  fs.stat(abs, (err, st) => {
    if (!err && st.isDirectory()) abs = path.join(abs, 'index.html');
    fs.readFile(abs, (e, buf) => {
      if (e) {
        if (fallback) return serveStatic(res, root, fallback);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
      res.end(buf);
    });
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// Split highlight.js output into per-line HTML, re-balancing spans across newlines.
function splitHighlightedLines(html) {
  const out = [];
  const open = [];
  for (const rawLine of html.split('\n')) {
    let line = open.join('') + rawLine;
    const re = /<span[^>]*>|<\/span>/g;
    let m;
    while ((m = re.exec(rawLine))) {
      if (m[0] === '</span>') open.pop();
      else open.push(m[0]);
    }
    line += '</span>'.repeat(open.length);
    out.push(line);
  }
  return out;
}

// GET /api/code?path=..&line=..&span=..  -> highlighted source window (guarded to CODE_ROOT, .go only)
function handleCode(res, url) {
  const rel = url.searchParams.get('path') || '';
  const line = Math.max(1, Number(url.searchParams.get('line') || '1'));
  const span = Math.min(Math.max(Number(url.searchParams.get('span') || '48'), 4), 240);
  if (!rel.endsWith('.go')) return json(res, 400, { error: 'only .go files are served' });
  const abs = safeJoin(CODE_ROOT, rel);
  if (!abs) return json(res, 403, { error: 'forbidden' });
  let src;
  try {
    src = fs.readFileSync(abs, 'utf8');
  } catch {
    return json(res, 404, { error: 'file not found: ' + rel });
  }
  const all = src.split('\n');
  const start = Math.max(1, line - 3);
  const end = Math.min(all.length, start + span - 1);
  const slice = all.slice(start - 1, end).join('\n');
  const highlighted = hljs.highlight(slice, { language: 'go', ignoreIllegals: true }).value;
  const lines = splitHighlightedLines(highlighted);
  json(res, 200, { path: rel, focus: line, start, end, total: all.length, lines });
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  if (p === '/api/state' && method === 'GET') return json(res, 200, store.getState());
  if (p === '/api/code' && method === 'GET') return handleCode(res, url);

  // threads
  if (p === '/api/threads' && method === 'POST') {
    const body = await readBody(req);
    return json(res, 201, store.createThread(body));
  }
  let m;
  if ((m = p.match(/^\/api\/threads\/([^/]+)\/comments$/)) && method === 'POST') {
    const body = await readBody(req);
    return json(res, 201, store.addComment(m[1], body.body));
  }
  if ((m = p.match(/^\/api\/threads\/([^/]+)\/comments\/([^/]+)$/)) && method === 'PATCH') {
    const body = await readBody(req);
    return json(res, 200, store.editComment(m[1], m[2], body.body));
  }
  if ((m = p.match(/^\/api\/threads\/([^/]+)\/comments\/([^/]+)$/)) && method === 'DELETE') {
    return json(res, 200, store.deleteComment(m[1], m[2]));
  }
  if ((m = p.match(/^\/api\/threads\/([^/]+)$/)) && method === 'DELETE') {
    return json(res, 200, store.deleteThread(m[1]));
  }

  // notes
  if (p === '/api/notes' && method === 'POST') {
    const body = await readBody(req);
    return json(res, 201, store.createNote(body));
  }
  if ((m = p.match(/^\/api\/notes\/([^/]+)$/)) && method === 'PATCH') {
    const body = await readBody(req);
    return json(res, 200, store.updateNote(m[1], body));
  }
  if ((m = p.match(/^\/api\/notes\/([^/]+)$/)) && method === 'DELETE') {
    return json(res, 200, store.deleteNote(m[1]));
  }

  // board
  if (p === '/api/board/cards' && method === 'POST') {
    const body = await readBody(req);
    return json(res, 201, store.createCard(body));
  }
  if ((m = p.match(/^\/api\/board\/cards\/([^/]+)$/)) && method === 'PATCH') {
    const body = await readBody(req);
    return json(res, 200, store.updateCard(m[1], body));
  }
  if ((m = p.match(/^\/api\/board\/cards\/([^/]+)$/)) && method === 'DELETE') {
    return json(res, 200, store.deleteCard(m[1]));
  }

  return json(res, 404, { error: 'no such endpoint' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (pathname.startsWith('/data/')) return serveStatic(res, DATA_DIR, pathname.slice(6));
    if (pathname.startsWith('/static/')) return serveStatic(res, STATIC_DIR, pathname.slice(8));
    if (pathname === '/' || pathname === '') return serveStatic(res, SRC_DIR, 'index.html');
    return serveStatic(res, SRC_DIR, pathname.replace(/^\//, ''), 'index.html');
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`[serve] control-plane on http://localhost:${PORT}`);
  console.log(`[serve] CODE_ROOT = ${CODE_ROOT}`);
});
