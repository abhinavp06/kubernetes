# CLAUDE.md

This branch (`abhinavp06/K8s-LEARNING`) is a Kubernetes-learning workspace. The active build is
**Control Plane** — a terminal-native docs→source reader in `CUSTOM_UI/`.

## Where things are (workspace root = `/root/KUBERNETES`)
- `kubernetes/` — the Kubernetes source (this repo).
- `k8s-website/` — the docs; the English docs the UI renders live in `k8s-website/content/en`.
- `kubernetes/CUSTOM_UI/` — the app. **Read `CUSTOM_UI/CLAUDE.md` before UI work** (architecture,
  conventions, run/verify, push-auth trick). Plan: `CUSTOM_UI_PLAN.md`.

## Golden rules — do automatically, don't ask
1. **Full autonomy:** assume "yes" on permissions, don't re-ask, work through multi-step tasks,
   ping when done.
2. **Commit + push after each change** on `abhinavp06/K8s-LEARNING` (end messages with the
   `Co-Authored-By: Claude Opus 4.8` line). Pushing needs the VS Code IPC-socket retarget — see
   `CUSTOM_UI/CLAUDE.md`.
3. **Update `CUSTOM_UI/UI_CHANGELOG/CHANGELOG.md`** on every UI change, in the same commit.
4. **Keep these CLAUDE.md files current.** Whenever architecture, module layout, conventions,
   workflow, commands, or preferences change, update the relevant CLAUDE.md in the **same commit**
   as the change — `kubernetes/CLAUDE.md` for repo-level, `CUSTOM_UI/CLAUDE.md` for the app.
5. **Keep `CUSTOM_UI` `npm run smoke` green.**

> `/root/KUBERNETES/CLAUDE.md` is a symlink to this file, so the workspace-root and in-repo copies
> are always identical — edit this one.
