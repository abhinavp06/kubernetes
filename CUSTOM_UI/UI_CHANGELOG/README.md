# UI_CHANGELOG

Running log of every change to the Control Plane UI (`CUSTOM_UI/`). Kept here so the state of
the app is always reconstructable without re-reading the whole git history.

## Files
- **`CHANGELOG.md`** — the master log, **newest entry first**. This is the source of truth.

## Entry format (copy this template for each change)
```
## [YYYY-MM-DD] <short title> — `<commit>`
- **type:** feature | enhancement | fix | refactor | build
- **area:** reader · build · server · code-drawer · threads · board · graph · atoms · theme
- **summary:** one line, what changed and why.
- **details:**
  - bullet points of the concrete changes
- **files:** comma-separated paths (relative to CUSTOM_UI/)
- **verified:** how it was checked (e.g. `npm run smoke` 16/16, endpoint test, manual)
```

## The rule (for the assistant)
**Whenever a feature is added or the UI changes, append a new entry to `CHANGELOG.md` (newest
first) before committing.** New entries go directly under the `<!-- NEW ENTRIES BELOW -->`
marker. Keep the commit hash in sync with the commit that ships the change.
