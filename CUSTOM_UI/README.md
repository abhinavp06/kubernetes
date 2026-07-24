# Control Plane

A terminal-native reader for the Kubernetes documentation that links every doc concept to
the exact Go definition of the core component that implements it — with source-anchored
comment threads and a personal learning kanban.

This is the **MVP slice**: it renders three atomic units in full — **Pod · Deployment ·
Service** — spanning every kind of code link the full build will have (API types, validation,
REST storage, controllers, kubelet, kube-proxy, endpoint controllers).

Theme: **PHOSPHOR** — black / white / phosphor-green, mono-dominant, a blinking-cursor
wordmark, ANSI-styled code. See `../CUSTOM_UI_PLAN.md` for the full design + roadmap.

---

## Run it

```bash
cd CUSTOM_UI
npm install
npm run dev        # build docs → JSON, then serve → http://localhost:4173
```

Other scripts:

```bash
npm run build      # (re)build data/ only  (docs JSON + manifest + code-map)
npm run serve      # serve an existing build
npm run smoke      # headless jsdom smoke test (server must be running)
```

Environment (both optional — sensible defaults):

| Var | Default | What |
|-----|---------|------|
| `CODE_ROOT` | `..` | the Kubernetes source tree links resolve into |
| `DOCS_ROOT` | `../../k8s-website/content/en` | the English docs tree that gets rendered |
| `PORT` | `4173` | server port |

---

## What's in the MVP

- **Reader** — hash-routed SPA over the built docs: tree nav rail with scroll-spy, breadcrumb
  status bar, "on this page" TOC, ⌘K / `/` command palette, copy buttons.
- **Definition button** — every concept page shows a `:def <group/version> <Kind> ⏎` button.
  It opens a code drawer grouping the definitions by layer, each lazy-loading an
  ANSI-highlighted source window straight from the repo with the resolved symbol focused.
- **Annotations** — hover any paragraph (`+`) or select text to open a threaded comment
  drawer. Select a line range in the code drawer to annotate the **source** itself; code
  threads show a `~drifted` badge if the source no longer matches the quoted lines.
- **Board** — `#__board` kanban (TO-LEARN / IN-PROGRESS / DOUBTS / DONE) with drag-and-drop
  and link chips back to the doc or the source. A `→ board` action on any annotation captures
  it as a linked DOUBTS card.
- **Atomic Units map** — `#__atoms` lists every core object and where it lives in the tree,
  `kubectl get` style; click a Kind or a location to jump into the code.

Everything degrades gracefully if the API server is offline (the reader still works; the
notes/board features simply disable).

---

## Layout

```
CUSTOM_UI/
  config.mjs                 CODE_ROOT / DOCS_ROOT resolution
  build/build.mjs            docs → data/pages/*.json + manifest.json + code-map.json
  lib/
    shortcodes.mjs           Hugo/Docsy shortcode transforms
    symbols.mjs              resolve a Go symbol → file:line (by name, drift-proof)
    component-registry.mjs   curated doc-slug → source-definition map  ← extend this
    notesStore.mjs           disk store (atomic writes) for threads/notes/board
  server/serve.mjs           node:http: client + data + /api/* + guarded /api/code
  src/                       the PHOSPHOR SPA (vanilla ES modules)
  data/                      generated (gitignored)
  notes/                     user data (gitignored)
```

## Adding more atomic units

Add an entry to `lib/component-registry.mjs` (`CONCEPTS` + `PAGE_FILES`) with the doc slug,
Kind, and the source targets as `{ role, path, pattern }`. `pattern` is matched by name at
build time, so it resolves to the right `file:line` even as the tree changes. Re-run
`npm run build`. The definition button, code drawer, and atoms map all pick it up
automatically.

Targets Kubernetes **v1.36**.
