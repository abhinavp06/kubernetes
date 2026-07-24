# Control Plane UI — Changelog

Newest first. Format + rules: see `README.md` in this directory.
Scope of the MVP: **Pod · Deployment · Service** across all layers. Target Kubernetes **v1.36**.

<!-- NEW ENTRIES BELOW -->

## [2026-07-24] Knowledge graph from notes via local agent — `1c597c1`
- **type:** feature
- **area:** graph · server · build
- **summary:** interactive concept graph built from notes + annotations by the local `claude` CLI.
- **details:**
  - `lib/analyze.mjs` — single-flight job; feeds the notes/annotations corpus to `claude -p
    --output-format json`, extracts + validates the graph (drop dangling links, clamp weights 1–5,
    normalize groups), saves `notes/graph.json`.
  - server: `POST /api/analyze` (202, single job) + `GET /api/analyze/status`; graph + job status
    folded into `/api/state`.
  - `src/graph.js` + `#__graph`: canvas force-directed graph (repulsion/spring/centering sim, drag
    nodes, scroll-zoom, pan, hover highlight, click detail panel, legend by group) with an
    "analyze notes with local agent" button that polls to completion. Guarded for headless (no ctx).
  - nav + palette entries; store carries `graph` + `analyze` state.
- **files:** lib/analyze.mjs, lib/notesStore.mjs, server/serve.mjs, src/graph.js, src/app.js, src/nav.js, src/palette.js, src/store.js, src/api.js, src/app.css, test/smoke.mjs, README.md
- **verified:** `npm run smoke` 16/16, 0 errors; real agent run → 11 nodes / 15 links, 0 dangling, 0 out-of-range weights.

## [2026-07-24] Render Hugo explicit heading IDs (`{#custom-id}`) — `67cc629`
- **type:** fix
- **area:** build
- **summary:** `## Heading {#custom-id}` was leaking as literal text; now consumed as the anchor id.
- **details:**
  - markdown-it core rule (runs after markdown-it-anchor) strips a trailing `{#id}` / `{.class}`
    block from headings, applies the authored id, and repoints the permalink so in-page links resolve.
- **files:** build/build.mjs
- **verified:** rebuild → 0 leftover `{#` in rendered pages; `service-nodeport-custom-listen-address` id resolves; TOC clean.

## [2026-07-24] Icon actions + protect annotation-linked board cards — `06b8d23`
- **type:** enhancement
- **area:** threads · board · theme · server
- **summary:** edit/delete become symbols; annotation cards can't be deleted from the board.
- **details:**
  - edit/delete controls are now `✎` / `✕` with hover titles (comments, notes, cards); delete hovers red.
  - annotation-linked (auto) board cards show a `↳ from annotation` tag instead of edit/delete and are
    removed only by deleting the thread. Enforced in UI and in `deleteCard` (refuses linked cards).
- **files:** src/threads.js, src/app.js, src/board.js, src/app.css, lib/notesStore.mjs
- **verified:** endpoint test — `DELETE` on a linked card returns `{ok:false}`; card removed only after thread delete.

## [2026-07-24] Auto-mirror every annotation to the board — `c4d8a4e`
- **type:** feature
- **area:** threads · board · server
- **summary:** annotating/commenting anywhere auto-creates a linked DOUBTS card, kept in sync.
- **details:**
  - `notesStore` mirrors each thread 1:1 to a card (title = quote, body = comments); updates on
    comment add/edit, removes on thread delete/prune.
  - removed the now-redundant manual "→ board" buttons.
- **files:** lib/notesStore.mjs, src/threads.js, src/board.js, README.md
- **verified:** endpoint lifecycle — create thread → 1 card; comment → body syncs, no dupes; delete thread → card gone; code-annotation path carries `codeAnchor`.

## [2026-07-24] Atomic-units map, smoke test, README (phase 6) — `cb888f2`
- **type:** feature
- **area:** atoms · build
- **summary:** the "where do the atomic units live" map + a headless smoke harness.
- **details:**
  - `#__atoms`: every core object + its source locations, `kubectl get` style; click a Kind or a
    location to open the code drawer.
  - `test/smoke.mjs`: jsdom harness booting the real client against the server; wired as `npm run smoke`.
  - guard `main.scrollTo` for environments that lack it.
- **files:** src/atoms.js, src/app.js, package.json, package-lock.json, README.md, test/smoke.mjs
- **verified:** `npm run smoke` 13/13, 0 errors.

## [2026-07-24] Kanban learning board (extension B) — `c05f847`
- **type:** feature
- **area:** board · server
- **summary:** `#__board` kanban with drag-and-drop and deep-link chips.
- **details:**
  - four columns (TO-LEARN / IN-PROGRESS / DOUBTS / DONE), drag-and-drop, card CRUD, card types as
    code-comment tags (`// TODO` etc.).
  - cards carry link chips back to the doc paragraph or the source definition.
- **files:** src/board.js, src/threads.js, src/app.css
- **verified:** endpoint test — create card (linked to code) → move column → delete.

## [2026-07-24] Definition button, code drawer, code threads (phases 3–5) — `86d3d2b`
- **type:** feature
- **area:** code-drawer · threads · server
- **summary:** jump from a doc concept to the Go definitions, and annotate the source.
- **details:**
  - command-styled `:def <group/version> <Kind> ⏎` button per concept, driven by `data/code-map.json`.
  - wide code drawer grouping definitions by layer; each target lazy-loads an ANSI-highlighted source
    window from the guarded `/api/code` endpoint with the resolved symbol focused.
  - code-anchored threads: select a line range → annotate; inline threads with CRUD, line markers, and
    a `~drifted` badge when the source no longer matches the quoted lines.
- **files:** src/code.js, src/threads.js, src/app.js, src/app.css
- **verified:** endpoint test — code thread create + comment persists, anchored to line range.

## [2026-07-24] PHOSPHOR reader shell + server + doc annotations (phase 2) — `ea173c6`
- **type:** feature
- **area:** reader · server · threads · theme
- **summary:** the terminal-native reader with the PHOSPHOR design system.
- **details:**
  - `server/serve.mjs` (client + data + docs static + guarded `/api/code` + threads/notes/board API);
    `lib/notesStore.mjs` disk store with atomic writes.
  - hash router, tree nav rail with scroll-spy, breadcrumb status bar, "on this page" TOC, ⌘K/`/`
    command palette, copy buttons, block + text-selection annotations with a threaded drawer, Notes
    workspace. PHOSPHOR theme (black/white/phosphor-green, Space Mono + JetBrains Mono + IBM Plex Sans,
    blinking-cursor wordmark, ANSI code). Graceful offline.
- **files:** lib/notesStore.mjs, server/serve.mjs, src/* (index.html, app.css, app.js, api.js, util.js, store.js, nav.js, palette.js, threads.js, code/board/atoms stubs)
- **verified:** endpoint sweep all 200; traversal guards; import/export graph consistent.

## [2026-07-24] Docs build pipeline + code-map (phase 1) — `d04c722`
- **type:** build
- **area:** build
- **summary:** render Pod/Deployment/Service docs to static JSON + resolve the code-map.
- **details:**
  - `lib/shortcodes.mjs` (Hugo/Docsy shortcode transforms), `lib/symbols.mjs` (resolve a Go symbol →
    file:line by name), `lib/component-registry.mjs` (curated doc-slug → source-definition map),
    `build/build.mjs` (markdown-it render, nav + search manifest, code-map.json).
- **files:** lib/shortcodes.mjs, lib/symbols.mjs, lib/component-registry.mjs, build/build.mjs
- **verified:** build resolves 18/18 target symbols; clean render (no leftover shortcodes).

## [2026-07-24] Scaffold terminal-native docs reader (phase 0) — `2a34acb`
- **type:** build
- **area:** build
- **summary:** project scaffold + consolidated plan.
- **details:**
  - `package.json` (markdown-it, markdown-it-anchor, js-yaml, highlight.js), `config.mjs`
    (CODE_ROOT / DOCS_ROOT resolution), `.gitignore`, and `../CUSTOM_UI_PLAN.md`.
- **files:** package.json, config.mjs, .gitignore, ../CUSTOM_UI_PLAN.md
- **verified:** `npm install` clean.
