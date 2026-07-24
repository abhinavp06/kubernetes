// Thin fetch layer over the server API + static data.
async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

export const api = {
  state: () => req('GET', '/api/state'),
  code: (path, line, span = 48) =>
    req('GET', `/api/code?path=${encodeURIComponent(path)}&line=${line}&span=${span}`),

  createThread: (t) => req('POST', '/api/threads', t),
  deleteThread: (id) => req('DELETE', `/api/threads/${id}`),
  addComment: (id, body) => req('POST', `/api/threads/${id}/comments`, { body }),
  editComment: (id, cid, body) => req('PATCH', `/api/threads/${id}/comments/${cid}`, { body }),
  deleteComment: (id, cid) => req('DELETE', `/api/threads/${id}/comments/${cid}`),

  createNote: (n) => req('POST', '/api/notes', n),
  updateNote: (id, patch) => req('PATCH', `/api/notes/${id}`, patch),
  deleteNote: (id) => req('DELETE', `/api/notes/${id}`),

  createCard: (c) => req('POST', '/api/board/cards', c),
  updateCard: (id, patch) => req('PATCH', `/api/board/cards/${id}`, patch),
  deleteCard: (id) => req('DELETE', `/api/board/cards/${id}`),

  analyze: () => req('POST', '/api/analyze'),
  analyzeStatus: () => req('GET', '/api/analyze/status'),
};

export async function loadManifest() {
  return (await fetch('/data/manifest.json')).json();
}
export async function loadCodeMap() {
  const r = await fetch('/data/code-map.json');
  return r.ok ? r.json() : {};
}
export async function loadPage(slug) {
  const r = await fetch('/data/pages/' + slug.replace(/\//g, '__') + '.json');
  return r.ok ? r.json() : null;
}
