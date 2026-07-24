// Shared client state: threads / notes / board, mirrored from the server.
// Views subscribe and re-render on change. Mutations go through the API then refresh.
import { api } from './api.js';

const state = {
  online: false,
  threads: [],
  notes: [],
  board: { columns: [], cards: [] },
  manifest: null,
  codeMap: {},
};

const subs = new Set();

export const getState = () => state;
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
function emit() {
  for (const fn of subs) fn(state);
}

export function setStatic({ manifest, codeMap }) {
  if (manifest) state.manifest = manifest;
  if (codeMap) state.codeMap = codeMap;
}

export async function refresh() {
  try {
    const s = await api.state();
    state.threads = s.threads || [];
    state.notes = s.notes || [];
    state.board = s.board || { columns: [], cards: [] };
    state.online = true;
  } catch {
    state.online = false;
  }
  emit();
}

// Threads for a given doc slug (or all code threads for a file path).
export const docThreads = (slug) =>
  state.threads.filter((t) => t.target && t.target.kind === 'doc' && t.target.slug === slug);
export const codeThreads = (path) =>
  state.threads.filter((t) => t.target && t.target.kind === 'code' && t.target.path === path);
export const allCodeThreads = () =>
  state.threads.filter((t) => t.target && t.target.kind === 'code');

export const cardCount = () => state.board.cards.length;
export const threadCount = () => state.threads.length;
export const noteCount = () => state.notes.length;
