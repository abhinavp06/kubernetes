# CUSTOM_UI — Consolidated Plan

> **Status: PLAN ONLY. Nothing here is implemented yet.**
> This is the single source of truth for the `CUSTOM_UI` project. Update *this* file as the
> plan evolves — do not spawn parallel plan docs.
>
> **Product:** "Control Plane" — a terminal-native reader for the Kubernetes documentation that
> links every doc concept to the exact Go definition of the atomic unit that implements it, with
> code-anchored comment threads and a personal learning kanban.
> **Theme:** "PHOSPHOR" (see §4).
> **Location:** `kubernetes/CUSTOM_UI/`  **Target K8s version:** v1.36

---

## 1. What this is

A self-contained dark SPA (no Hugo, no Docsy) that:

1. Renders the **English** Kubernetes docs (`k8s-website/content/en/docs`) → static JSON.
2. Adds a **"View definition"** affordance that jumps from a doc page to the precise source
   location of the **core components / atomic units** in the Kubernetes source tree.
3. Lets you attach **comment threads** to both doc passages *and* source-code line ranges.
4. Gives you a **kanban board** to track what you've learned, what's in progress, and your doubts.

It reuses the architecture of `k8s-website/NEW_UI_CLAUDE_PLAN.md` (which describes a `reader/`
app that does not exist yet) and rebuilds it inside `CUSTOM_UI`, adding the code-linkage,
code-threads, kanban, and PHOSPHOR theme on top.

---

## 2. Analysis findings (both trees)

### 2.1 Docs side — `k8s-website/content/en/docs` (English only)
- English docs live entirely under `content/en/`. Learning core = `setup`, `concepts`, `tasks`,
  `tutorials`, `reference` (same scope as the reference reader).
- **Three linkage signals already present in the docs** map a page → source deterministically:

  | Signal | Where | Example | Maps to |
  |---|---|---|---|
  | `api_metadata` frontmatter | 161 pages | `apiVersion: "apps/v1", kind: "Deployment"` | the Go struct for that Kind |
  | `glossary_tooltip term_id=` | inline, throughout | `term_id="kube-scheduler"` | a component binary |
  | glossary term files | `reference/glossary/*.md` | `kube-apiserver.md`, `kubelet.md`, `etcd.md` | component binaries |

### 2.2 Code side — `kubernetes/` (verified anchors, resolved by symbol name, not line number)
- **API object types (declarative atoms):** `kind`+`apiVersion` → `staging/src/k8s.io/api/<group>/<version>/types.go`
  at `type <Kind> struct`. Verified: `type Pod struct` @ `core/v1/types.go:5791`. Each object also has an
  **internal type** (`pkg/apis/core/types.go:4958`), **validation** (`pkg/apis/<group>/validation/`),
  and **REST storage** (`pkg/registry/<group>/<resource>/`).
- **Components (runtime atoms):** entrypoints verified — `cmd/kube-apiserver/apiserver.go`,
  `cmd/kube-scheduler/scheduler.go`, `cmd/kube-controller-manager/app/controllermanager.go`,
  `cmd/kubelet/kubelet.go`, `cmd/kube-proxy/proxy.go`, `cmd/cloud-controller-manager/main.go`.
  Implementations: `pkg/controlplane`, `pkg/scheduler` (`scheduler.go:286 func New`),
  `pkg/kubelet` (`kubelet.go:454 NewMainKubelet`, `:2053 SyncPod`), `pkg/proxy`.
- **Controllers (per-resource reconcilers):** one package each under `pkg/controller/` — `deployment`,
  `replicaset`, `statefulset`, `daemon`, `job`, `cronjob`, `endpointslice`, `nodelifecycle`,
  `garbagecollector`, `namespace`, `resourcequota`, … Verified:
  `pkg/controller/deployment/deployment_controller.go:67 type DeploymentController struct`,
  `:104 NewDeploymentController`.

**Consequence:** the mapping is ~80% auto-derivable (`api_metadata` + symbol grep) and ~20% a small
curated registry (components/controllers have no frontmatter). That split drives Phase 3.

### 2.3 Path assumption
`CUSTOM_UI` sits at `kubernetes/CUSTOM_UI`. Both roots are configurable env vars:
- `CODE_ROOT` default `..` → the kubernetes repo (read `.go` definitions)
- `DOCS_ROOT` default `../../k8s-website/content/en` → English docs (siblings under `/root/KUBERNETES`)

---

## 3. The atomic-unit taxonomy (what the button targets)

Three tiers; a doc page links into whichever tier(s) apply.

1. **API resources** → external type · internal type · validation · REST storage
2. **Components** (apiserver, scheduler, controller-manager, kubelet, kube-proxy, CCM; etcd noted as
   external store) → entrypoint · core package · key loop function
3. **Controllers** → controller struct · `New…` constructor · reconcile/sync function

---

## 4. Design system — "PHOSPHOR"

**Thesis: the interface *is* a shell, not a website about shells.** The brief fixes the palette
(black / white / terminal green), so we follow it exactly, but earn distinctiveness from the
subject's own vernacular — kubectl, Go, terminals — rather than generic green-on-black. Actions read
as commands; the atomic-units map reads like `kubectl get` output; opening a definition feels like
`cat`-ing a file with `grep`-highlighted lines.

### 4.1 Color tokens
```
--bg        #080B08   /* phosphor-black, a whisper of green   */
--surface   #0E130E   /* raised pane / drawer / card          */
--fg        #E6EDE6   /* soft white body text (not #FFF)      */
--fg-dim    #7A8A7A   /* muted green-grey: secondary/meta      */
--green     #34FF5E   /* PRIMARY: prompts, links, active, ok   */
--amber     #FFB454   /* STATE: stale anchors, doubts, caution */
--danger    #FF5F56   /* destructive only (delete)             */
--rule      rgba(52,255,94,0.14)  /* 1px hairlines             */
--glow      0 0 6px rgba(52,255,94,0.35) /* accent-only glow   */
```
Discipline: green is the *only* saturated hue on the page; amber is state-only; danger is
delete-only. Everything else is white/dim on black.

### 4.2 Typography (3 roles, monospace-dominant)
- **Display / wordmark / section prompts — Space Mono.** Retro-terminal character; the geeky signature.
- **UI chrome + all code + data/tables — JetBrains Mono.** Engineered, ligatures, great for Go.
- **Long doc body prose — IBM Plex Sans.** Deliberate exception: monospace body over ~1,600 pages
  fatigues; the terminal identity lives in chrome + green + cursor, not in punishing the reader.
- Scale is tight and mechanical: 12 / 14 / 16 / 20 / 28 / 40, weights 400/500/700, generous
  line-height (1.7) on body.

### 4.3 Layout — terminal cockpit
```
┌──────────────────────────────────────────────────────────────────────┐
│ ▮ control-plane  ~/concepts/workloads/pods $        [th:3][?:2][�ók]    │  status bar (tmux-like)
├───────────────┬──────────────────────────────────┬───────────────────┤
│ ▾ concepts     │  $ Pods                          │  ON THIS PAGE      │
│  ▾ workloads   │  ─────────────────────────────   │  › What is a Pod   │
│   ▸ pods  ◂    │  Pods are the smallest …         │  › Using Pods      │
│   ▸ deploy…    │                                  │  › Pod lifecycle   │
│ ▸ services     │  [ :def core/v1 Pod ⏎ ]          │                    │  ← definition btn
│ ▸ storage      │                                  │  ── DEFINITION ──  │
│                │  … prose …                       │  core/v1 types.go  │  ← code drawer
│ ── WORKSPACE ──│                                  │  5791 type Pod {   │    slides from right
│  notes    (5)  │                                  │  …grep-highlighted │
│  board    (7)  │                                  │  ANSI colors…      │
│  atoms         │                                  │                    │
└───────────────┴──────────────────────────────────┴───────────────────┘
```
- **Zero border-radius**, 1px `--rule` hairlines, flat surfaces — terminals are square.
- **Status bar** = a vim/tmux statusline: left = breadcrumb as a shell path + prompt; right = live
  counts (threads, doubts) + a build/health glyph.
- **Nav rail** = `tree`-style file listing with `▸`/`▾` disclosure and scroll-spy.

### 4.4 Signature & motion (spend boldness once)
- **Signature:** a blinking block cursor `▮` + prompt motif threading through the UI — the wordmark,
  the command palette, and section headers (`$ Pods`). The "View definition" control is phrased as a
  command: `:def core/v1 Pod ⏎`.
- **The one glow:** phosphor `--glow` on the wordmark, active prompt, and focus rings only.
- **Motion, minimal:** cursor blink; a one-line "type-in" reveal on the palette; drawer slides in
  from the right. Respect `prefers-reduced-motion` (cursor stops blinking, no slides).

### 4.5 One aesthetic risk — ANSI code rendering
Go definitions and fenced code render through a **strict ANSI 16-color terminal palette** (not a
modern rainbow theme): keywords/green, types/white-bold, comments/dim, strings/amber. Justified —
reinforces the CRT identity and enforces the same color discipline as the rest of the page.

### 4.6 In-theme components
- **Comment threads:** a thread reads like a terminal transcript; each comment prefixed with a `>`
  quote of the anchored passage/lines; the composer is a prompt.
- **Kanban cards** styled as code-comment tags — `// TODO`, `// FIXME` (doubt), `// NOTE`,
  `// DONE`; columns labelled `[ ] TO-LEARN`, `[~] IN-PROGRESS`, `[?] DOUBTS`, `[x] DONE`.
- **Stale code anchors** flagged in `--amber` with a `~drifted` tag.
- **Accessibility floor (non-negotiable):** WCAG-AA contrast (soft-white body, not pure green text on
  black for long copy), visible keyboard focus, full keyboard nav, reduced-motion honored,
  responsive to mobile.

---

## 5. Directory layout (created in Phase 0)
```
kubernetes/CUSTOM_UI/
  package.json  config.mjs  .gitignore  README.md
  build/    build.mjs                    # docs → JSON + manifest + code-map
  lib/      shortcodes.mjs               # Hugo/Docsy shortcode transforms
            symbols.mjs                  # resolve Go symbols → file:line
            codeMap.mjs                  # api_metadata + registry → code-map.json
            component-registry.mjs       # curated component/controller table
            notesStore.mjs               # disk store: threads/notes/board (atomic writes)
  server/   serve.mjs                    # node:http: static + /api/*
  src/      index.html app.css app.js    # PHOSPHOR SPA
  data/     pages/*.json manifest.json code-map.json   # generated (gitignored)
  notes/    threads.json notes.json board.json         # user data (gitignored)
```

---

## 6. Phase-by-phase plan

Core reader = Phases 0–7. Extension A (code threads) and Extension B (kanban) are additive and can
ship after the core.

### Phase 0 — Scaffold `CUSTOM_UI`
- Create the layout above; `package.json` deps: `markdown-it`, `markdown-it-anchor`, `js-yaml`,
  `highlight.js`. `config.mjs` reads `DOCS_ROOT`/`CODE_ROOT` with the §2.3 defaults. `.gitignore`
  excludes `data/` and `notes/`.
- **Theme:** vendor Space Mono / JetBrains Mono / IBM Plex Sans locally; define the §4.1 tokens in
  `app.css`.
- **Acceptance:** `npm install` ok; stub `npm run build` verifies it can see both roots.

### Phase 1 — Docs ingestion pipeline (English only)
- `lib/shortcodes.mjs`: transform `glossary_tooltip`, `note/caution/warning/tip/info`,
  `code_sample`/`code` (read from `content/en/examples`), `include`, `ref`/`relref`, `feature-state`,
  `tabs`, `mermaid`, version helpers; strip unknown shortcodes.
- `build/build.mjs`: walk the 5 learning-core sections → `data/pages/<slug>.json`
  (`title,type,section,html,toc` **plus captured `api_metadata` and inline `term_id`s** — needed by
  Phase 3). Emit `manifest.json` (nav tree by `weight`/title, built slugs, search index). Custom
  fenced-code renderer, anchored headings, hash-route link rewriting. Vertical-slice default (5 full
  pages) + `RENDER_ALL=1`.
- **Acceptance:** page JSON + manifest generated; `api_metadata` captured for the ~161 pages.

### Phase 2 — Reader shell + base annotation stack (the "documentation view")
- SPA: hash router over the manifest, `tree`-style nav rail + scroll-spy, breadcrumb-as-shell-path
  status bar, "On this page" TOC (`IntersectionObserver`), ⌘K/`/` command palette (fuzzy, ranked),
  copy buttons, mobile hamburger, graceful degradation when API offline.
- **Base annotations (from reference §4/§5):** `server/serve.mjs` (`node:http`, path-traversal
  guarded) + `lib/notesStore.mjs` (atomic writes) + `threads.json`/`notes.json`; hover-block `+` /
  select-text **Annotate** pill; right-hand threaded drawer (CRUD, replies, ⌘/Ctrl+Enter, Esc);
  Notes workspace (`#__notes`) with Annotations + Notes tabs.
- **Theme:** full PHOSPHOR skin applied here (status bar, cursor, palette-as-prompt, ANSI code).
- **Acceptance:** built pages render; nav/palette/TOC work; doc passages can be threaded and persist.

### Phase 3 — Code-map engine (the linkage)
- `lib/symbols.mjs`: resolve a symbol (`type <Kind> struct`, `func New<Kind>…`) → `{path,line}` by
  grepping the correct file — resilient to edits.
- **Auto:** every `api_metadata` page → 4 Go targets (external/internal type, validation, storage).
- **Curated:** `lib/component-registry.mjs` (~20–25 reviewed entries) mapping component/controller
  `term_id`s and specific slugs (`concepts/overview/components`, `concepts/architecture/*`) →
  entrypoint + package + key function, resolved by the same resolver.
- Output `data/code-map.json` keyed by slug → `[{tier,label,targets:[{role,path,line,symbol}]}]`.
- **Acceptance:** all api_metadata pages + component/architecture pages covered; every target
  resolves to a real `file:line`; build fails loudly on an unresolved symbol.

### Phase 4 — "View definition" button UI
- Header affordance when a slug has code-map entries. API pages → command-styled button
  `:def core/v1 Pod ⏎`; component/architecture pages → a grouped panel per component/controller.
- Opens the **right-side code drawer**: role-labelled targets (Type · Internal · Validation · Storage,
  or Entrypoint · Package · Sync loop), each a `path:line` row with an ANSI-highlighted snippet + copy-path.
- **Acceptance:** Pods page reveals `core/v1 type Pod struct` + internal + validation + storage;
  `concepts/overview/components` links every component to its entrypoint + core function.

### Phase 5 — Source-serving API
- `GET /api/code?path=…&symbol=…` → resolved line + snippet window (±N lines) + highlighted HTML.
  **Scoped strictly to `CODE_ROOT`**: canonicalize, reject traversal, `.go` only.
- Deep-link builders: local editor (`vscode://file/…`) and GitHub `blob` at the pinned commit, so a
  target is reachable even without the server.
- **Acceptance:** drawer loads live snippets from the real repo; traversal attempts rejected.

### Phase 6 — Atomic-units map (`#__atoms`)
- A dedicated workspace route rendering the §3 taxonomy as browsable **`kubectl get`-style output** —
  API resources, components, controllers — each row one click into code via Phase 5. The "where are
  the atomic units" index, independent of the current page.
- **Acceptance:** any core atomic unit's source is one click away from a single screen.

### Phase 7 — Validation & polish
- `verify` step asserting every code-map symbol still resolves (guards source drift); pins v1.36 +
  records the commit for deep links.
- `README.md` (run instructions, env vars, how to extend the registry). Responsive/theme/a11y polish;
  graceful degradation if `CODE_ROOT` missing (definition button hidden, reader still works).

---

### Extension A — Comments & threads on source code
*Depends on Phase 2 (annotation stack), Phase 3 (symbol resolver), Phase 5 (source API).*

**A1 — Unify the thread model.** Discriminated target in one `threads.json`:
```
target = { kind:"doc",  slug, blockIndex, quote }                                  // existing
        | { kind:"code", path, symbol, lineStart, lineEnd, commit, contentHash, quote }
```
Plus `openedFrom` (originating doc slug) so a code thread remembers its docs provenance. Drawer,
counts, CRUD all become target-agnostic; schema versioned/migrated.
- **Acceptance:** existing doc threads still load under the new schema.

**A2 — Code anchoring + drift.** Anchor by **symbol + content hash** via the Phase 3 resolver. On
load, re-resolve the symbol; if the hash matches, silently re-anchor; if it drifted, mark **stale**
(`~drifted`, amber) and fuzzy re-locate within the symbol.
- **Acceptance:** editing unrelated code keeps a `Pod` thread anchored; editing the annotated lines
  flags it stale rather than mis-pointing.

**A3 — Annotate inside the code drawer.** Line-gutter hover / range-select → **Annotate** pill; gutter
markers with counts; the same threaded drawer as docs.
- **Acceptance:** from the Pods page, annotate the `Spec PodSpec` line in `type Pod struct` and have it
  persist and re-open.

**A4 — Code-notes index.** A "Code notes" tab in the Notes workspace grouped by file/component; click
jumps back into the drawer at the anchored lines; stale threads sort first.
- **Acceptance:** every code thread is reachable from one index and round-trips to source.

### Extension B — Kanban learning board
*Depends on Phase 2 (store/API) and Extension A (cards can link to code threads).*

**B1 — Model + storage.** New `board.json` (atomic writes):
```
board = { columns:[{id,title,order}],
          cards:[{ id, title, body(md), column, order, tags[],
                   type:"todo|doubt|note|done",
                   link?:{ docSlug?, codeAnchor?, threadId? } }] }
```
Default columns **TO-LEARN · IN-PROGRESS · DOUBTS · DONE** (editable). New `GET/POST/PATCH/DELETE
/api/board*` routes.
- **Acceptance:** cards/columns persist; a card can carry doc slug + code anchor + thread id.

**B2 — Board UI (`#__board`).** Columns as terminal panes with drag-and-drop; cards styled as
`// TODO`/`// FIXME`/`// NOTE`/`// DONE` tags; markdown body; **link chips** that jump to the linked
doc paragraph, open the code drawer at the anchored lines, or open the thread.
- **Acceptance:** drag a card DOUBTS→DONE; its chip lands on the exact `type Pod struct` lines.

**B3 — Capture from anywhere.** A **"→ Board"** action on any doc annotation, any code thread, and on
selected text → creates a pre-linked card (default DOUBTS). Palette command "New card". Live card
counts in the nav rail.
- **Acceptance:** selecting a puzzling paragraph → "→ Board" makes a Doubts card whose chip returns to it.

**B4 — Polish.** Filters (by column / tag / linked component — e.g. "everything I flagged in the
scheduler"), keyboard nav, empty states, offline graceful degradation.

---

## 7. Sequencing summary

| Order | Phase | Ships |
|---|---|---|
| 1 | 0–2 | Scaffold · docs pipeline · reader + base doc annotations (PHOSPHOR skin) |
| 2 | 3–5 | Code-map · definition button · source API |
| 3 | 6–7 | Atomic-units map · validation/polish |
| 4 | A1–A4 | Code-anchored threads |
| 5 | B1–B4 | Kanban learning board |

---

## 8. Data-model reference
- **thread** — see A1. One file `notes/threads.json`.
- **code-map** — `data/code-map.json`, keyed by slug → tiered targets (Phase 3).
- **board** — see B1. `notes/board.json`.
- **note** — freeform standalone note (`notes/notes.json`), markdown body.

---

## 9. Decisions defaulted (override before Phase 0 if wanted)
1. **Docs read live** from the sibling `k8s-website` repo (not vendored).
2. **Definition button = inline code drawer** (server reads real `.go`) primary; editor/GitHub deep
   links secondary.
3. **Scope = all three tiers** (API objects + components + controllers). Can trim to components + top
   API objects if leaner is preferred.
4. **Symbol-name resolution over line numbers** everywhere (survives edits).
5. **One `threads.json`** for doc + code threads (discriminated), not two.
6. **Code anchors flag drift as stale**, never auto-delete.
7. **Default kanban columns** TO-LEARN · IN-PROGRESS · DOUBTS · DONE; cards may be standalone or linked.
8. **Theme = PHOSPHOR** per §4: black/white/terminal-green, Space Mono + JetBrains Mono + IBM Plex
   Sans, ANSI code highlighting, blinking-cursor signature.

---

## 10. How to run (target state, once built)
```bash
cd kubernetes/CUSTOM_UI
npm install
npm run dev            # build (vertical slice) + serve → http://localhost:4173
RENDER_ALL=1 npm run build   # full learning core
npm run serve          # serve an existing build
# env: DOCS_ROOT=../../k8s-website/content/en  CODE_ROOT=..
```
