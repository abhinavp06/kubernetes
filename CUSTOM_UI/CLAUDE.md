# CLAUDE.md — Control Plane (CUSTOM_UI)

Working agreement + project map for this app. **Read this before implementing changes here** so
context never has to be re-explained. See also `CUSTOM_UI_PLAN.md` (consolidated plan) and
`README.md` (run docs).

## What this is
A terminal-native reader for the Kubernetes docs that links each concept to the Go definitions of
its core components, with source-anchored comment threads, a kanban board, and a knowledge graph.
MVP scope: **Pod · Deployment · Service** across all layers. Target Kubernetes **v1.36**.

## Golden rules — do these automatically, no need to ask
1. **Commit + push after each change** on branch `abhinavp06/K8s-LEARNING`. Descriptive message,
   end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
2. **Update `UI_CHANGELOG/CHANGELOG.md`** (newest first, under the `<!-- NEW ENTRIES BELOW -->`
   marker) in the **same commit** as any UI change. Template + rule in `UI_CHANGELOG/README.md`.
3. **Keep `npm run smoke` green** (jsdom harness; server must be running). Run it before calling a
   change done, and extend it when adding a new view.
4. **Autonomy:** assume "yes" on permissions, don't re-ask, work through multi-step tasks, ping when
   done.

## Pushing (auth quirk — important)
The VS Code git credential socket goes stale as windows cycle. To push, retarget it to the newest
live socket, from the **foreground** (background can't reach it):
```
SOCK=$(ls -t /run/user/0/vscode-git-*.sock | head -1)
env VSCODE_GIT_IPC_HANDLE="$SOCK" git push origin HEAD
```
Repo is ~1.19 GiB, so negotiation is slow — give the push a long timeout.

## Architecture map
- `config.mjs` — `CODE_ROOT` (`..` = k8s source), `DOCS_ROOT` (`../../k8s-website/content/en`).
- `build/build.mjs` — docs → `data/pages/*.json` + `manifest.json` + `code-map.json`. markdown-it
  with custom fence + anchors + link rewriting + a `{#custom-id}` heading rule + shortcode expansion.
- `lib/shortcodes.mjs` — Hugo/Docsy shortcode transforms (callouts, tabs, code_sample, glossary…).
- `lib/symbols.mjs` — resolve a Go symbol → `file:line` by name (drift-proof; patterns are regex).
- `lib/component-registry.mjs` — `CONCEPTS` map (doc slug → source targets). **Extend this to add
  concepts.**
- `lib/notesStore.mjs` — disk store (threads/notes/board/graph), atomic writes, thread→card mirror.
- `lib/analyze.mjs` — knowledge graph via the local `claude` CLI (`-p --output-format json`).
- `server/serve.mjs` — `node:http`: client + data + docs static + guarded `/api/code` + JSON API.
- `src/` — vanilla ES modules, no framework/bundler: `app.js` (router + reader), `nav`, `palette`,
  `threads`, `code`, `board`, `atoms`, `graph`, `store`, `api`, `util`; `app.css` = PHOSPHOR theme.
- `data/` (gitignored, generated), `notes/` (gitignored, user data).

## Conventions & gotchas
- **Server-side edits** (`lib/`, `server/`) need a **server restart** (module cache). **Client edits**
  (`src/`) are served fresh per request — no restart.
- Start the server with an **absolute path** (cwd varies between calls):
  `node /root/KUBERNETES/kubernetes/CUSTOM_UI/server/serve.mjs`.
  Stop it via `pgrep -f '[s]erve\.mjs'` (the `[s]` bracket avoids the pkill self-match that killed
  the shell before — never `pkill -f serve.mjs`).
- **Theme = PHOSPHOR:** black/white/phosphor-green; Space Mono (display) / JetBrains Mono (UI+code) /
  IBM Plex Sans (body); square corners, hairline rules, blinking-cursor wordmark, ANSI-styled code.
  Keep new UI on-theme.
- **Adding a concept:** add to `lib/component-registry.mjs` (`CONCEPTS` + `PAGE_FILES`) with
  `{ role, path, pattern }` targets, then `npm run build`. The definition button, code drawer, and
  atoms map pick it up automatically.
- Canvas/graph code is **guarded for headless** (null 2D context) so the smoke test passes.
- Watch for stray NUL bytes if a template-literal edit ever looks off (bit us once); `grep -aP '\x00'`.

## Run / verify
```
npm run dev     # build + serve → http://localhost:4173
npm run build   # rebuild data/ only
npm run smoke   # jsdom smoke test (server must be running)
```

## Status / next
MVP done (Pod/Deployment/Service; reader, code drawer, threads, board, atoms, knowledge graph).
Next: extend coverage to all core components (via the registry) after user testing.
