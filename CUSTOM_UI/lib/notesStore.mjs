// Disk-backed JSON store for threads, notes, and the kanban board.
// Atomic writes (temp file + rename); plain JSON so it can be read/edited by hand.
import fs from 'node:fs';
import path from 'node:path';
import { NOTES_DIR } from '../config.mjs';

fs.mkdirSync(NOTES_DIR, { recursive: true });

const fileOf = (name) => path.join(NOTES_DIR, name);

function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(fileOf(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function save(name, data) {
  const dest = fileOf(name);
  const tmp = dest + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, dest);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------------- threads ----------------
export const getThreads = () => load('threads.json', []);
const setThreads = (t) => save('threads.json', t);

export function createThread({ target, quote, body }) {
  const threads = getThreads();
  const now = Date.now();
  const thread = {
    id: uid(),
    target,
    quote: quote || '',
    createdAt: now,
    updatedAt: now,
    comments: [],
  };
  if (body && body.trim()) {
    thread.comments.push({ id: uid(), body: body.trim(), createdAt: now, updatedAt: now });
  }
  threads.push(thread);
  setThreads(threads);
  upsertCardForThread(thread);
  return thread;
}

export function addComment(threadId, body) {
  const threads = getThreads();
  const t = threads.find((x) => x.id === threadId);
  if (!t) return null;
  const now = Date.now();
  const c = { id: uid(), body: (body || '').trim(), createdAt: now, updatedAt: now };
  t.comments.push(c);
  t.updatedAt = now;
  setThreads(threads);
  upsertCardForThread(t);
  return t;
}

export function editComment(threadId, commentId, body) {
  const threads = getThreads();
  const t = threads.find((x) => x.id === threadId);
  if (!t) return null;
  const c = t.comments.find((x) => x.id === commentId);
  if (!c) return null;
  c.body = (body || '').trim();
  c.updatedAt = Date.now();
  t.updatedAt = c.updatedAt;
  setThreads(threads);
  upsertCardForThread(t);
  return t;
}

export function deleteComment(threadId, commentId) {
  let threads = getThreads();
  const t = threads.find((x) => x.id === threadId);
  if (!t) return null;
  t.comments = t.comments.filter((x) => x.id !== commentId);
  t.updatedAt = Date.now();
  // prune empty threads (unless they carry a quote, e.g. a bare code annotation)
  const prune = t.comments.length === 0 && !t.quote;
  if (prune) threads = threads.filter((x) => x.id !== threadId);
  setThreads(threads);
  if (prune) removeCardForThread(threadId);
  else upsertCardForThread(t);
  return { pruned: prune };
}

export function deleteThread(threadId) {
  setThreads(getThreads().filter((x) => x.id !== threadId));
  removeCardForThread(threadId);
  return { ok: true };
}

// ---------------- notes ----------------
export const getNotes = () => load('notes.json', []);
const setNotes = (n) => save('notes.json', n);

export function createNote({ title, body }) {
  const notes = getNotes();
  const now = Date.now();
  const note = { id: uid(), title: title || 'Untitled', body: body || '', createdAt: now, updatedAt: now };
  notes.unshift(note);
  setNotes(notes);
  return note;
}

export function updateNote(id, patch) {
  const notes = getNotes();
  const n = notes.find((x) => x.id === id);
  if (!n) return null;
  if (patch.title != null) n.title = patch.title;
  if (patch.body != null) n.body = patch.body;
  n.updatedAt = Date.now();
  setNotes(notes);
  return n;
}

export function deleteNote(id) {
  setNotes(getNotes().filter((x) => x.id !== id));
  return { ok: true };
}

// ---------------- board ----------------
const DEFAULT_BOARD = {
  columns: [
    { id: 'learn', title: 'TO-LEARN', mark: '[ ]' },
    { id: 'doing', title: 'IN-PROGRESS', mark: '[~]' },
    { id: 'doubt', title: 'DOUBTS', mark: '[?]' },
    { id: 'done', title: 'DONE', mark: '[x]' },
  ],
  cards: [],
};

export const getBoard = () => load('board.json', DEFAULT_BOARD);
const setBoard = (b) => save('board.json', b);

export function createCard({ title, body, column, type, link }) {
  const board = getBoard();
  const now = Date.now();
  const col = board.columns.find((c) => c.id === column) ? column : 'doubt';
  const order = board.cards.filter((c) => c.column === col).length;
  const card = {
    id: uid(),
    title: title || 'Untitled',
    body: body || '',
    column: col,
    type: type || 'todo',
    link: link || null,
    order,
    createdAt: now,
    updatedAt: now,
  };
  board.cards.push(card);
  setBoard(board);
  return card;
}

export function updateCard(id, patch) {
  const board = getBoard();
  const c = board.cards.find((x) => x.id === id);
  if (!c) return null;
  for (const k of ['title', 'body', 'column', 'type', 'order', 'link']) {
    if (patch[k] !== undefined) c[k] = patch[k];
  }
  c.updatedAt = Date.now();
  setBoard(board);
  return c;
}

export function deleteCard(id) {
  const board = getBoard();
  const card = board.cards.find((x) => x.id === id);
  // Annotation-linked cards can only be removed by deleting their thread.
  if (card && (card.auto || (card.link && card.link.threadId))) {
    return { ok: false, reason: 'linked to an annotation; delete the thread instead' };
  }
  board.cards = board.cards.filter((x) => x.id !== id);
  setBoard(board);
  return { ok: true };
}

// ---------------- thread → board mirror ----------------
// Every annotation thread is mirrored to a linked DOUBTS card so it lands on the board
// automatically. The card tracks the thread (title = quoted passage, body = its comments)
// and is removed when the thread is deleted or pruned.
function upsertCardForThread(thread) {
  const board = getBoard();
  const title = (thread.quote || (thread.comments[0] && thread.comments[0].body) || 'annotation').slice(0, 90);
  const body = thread.comments.map((c) => c.body).filter(Boolean).join('\n\n');
  const link = thread.target.kind === 'doc'
    ? { threadId: thread.id, docSlug: thread.target.slug, blockIndex: thread.target.blockIndex }
    : { threadId: thread.id, codeAnchor: { slug: thread.target.openedFrom, path: thread.target.path, line: thread.target.lineStart } };
  const now = Date.now();
  let card = board.cards.find((c) => c.link && c.link.threadId === thread.id);
  if (card) {
    card.title = title;
    card.body = body;
    card.link = link;
    card.updatedAt = now;
  } else {
    const column = 'doubt';
    board.cards.push({
      id: uid(), title, body, column, type: 'doubt', link, auto: true,
      order: board.cards.filter((c) => c.column === column).length,
      createdAt: now, updatedAt: now,
    });
  }
  setBoard(board);
}

function removeCardForThread(threadId) {
  const board = getBoard();
  const kept = board.cards.filter((c) => !(c.link && c.link.threadId === threadId));
  if (kept.length !== board.cards.length) {
    board.cards = kept;
    setBoard(board);
  }
}

// ---------------- knowledge graph ----------------
export const getGraph = () => load('graph.json', { nodes: [], links: [] });
export const setGraph = (g) => save('graph.json', g);

// ---------------- aggregate ----------------
export function getState() {
  return { threads: getThreads(), notes: getNotes(), board: getBoard(), graph: getGraph() };
}
