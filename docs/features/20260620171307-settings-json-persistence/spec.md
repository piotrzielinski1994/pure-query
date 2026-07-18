# Spec: JSON-file persistence layer (settings.json + workspace.json)

**Version:** 0.2.0
**Created:** 2026-06-20
**Status:** Implemented

## Revision history

- **0.2.0** - **Sidebar tree moved to `workspace.json`; `connections.json` removed.**
  v0.1 persisted connection configs in a separate `connections.json` keyed by mock
  node id - redundant, since a `DatabaseNode` already carries its connection fields, and
  the sidebar still showed fixed mock data. v0.2 makes the sidebar tree come from a
  persisted `workspace.json` (folders + database nodes, each node carrying its own
  connection config), modeled on requi's structure/settings split. `connections.json`
  and the `connections` slice of `Settings` are gone - the tree node IS the saved
  connection. New `src/lib/workspace/` module (parallel to `src/lib/settings/`). Empty
  start when `workspace.json` is absent (no mock data). New ACs AC-013..AC-019.
- **0.1.x** - Settings persistence + restore-path fixes (auto-connect, tables-only-after-
  connect, EXPLAIN/SHOW SQL fix), layouts slice (panel sizes). See AC-001..AC-012.
- **0.1.0** - Settings + JSON persistence layer modeled on requi (below).

## AC traceability

| AC | Test |
|----|------|
| AC-001 | settings `DEFAULT_SETTINGS should expose the documented default shape` |
| AC-002 | settings `mergeSettings` suite (full pass-through, missing-key fill, unknown-key drop, per-slice fallback, activeTabId coercion, garbage never-throws) |
| AC-004 | in-memory-store `createInMemorySettingsStore` suite (default / seed / save-load / overwrite) |
| AC-005 | settings `tauri-store.ts` (runtime seam: LazyStore + `.catch`->defaults; verified by typecheck/build/manual) |
| AC-006 | settings-context `SettingsProvider` suite (load, render-after-load, persist updates, save-through, remount round-trip) + `useSettings should throw ...` |
| AC-007 | workspace-persistence `WorkspaceProvider seeded persistence state` suite (sidebar/console hidden, split, layouts, expanded, open tabs+active) |
| AC-008 | workspace-persistence `onPersist side-effect contract` suite (sidebar/console/split/layout/expand/open-tab) |
| AC-009 | workspace-persistence `should seed the connections map from initialConnections` + database-card auto-connect + sidebar-tree `should not reveal table leaves when an expanded database is not connected` |
| AC-010 | workspace-persistence `should still toggle the sidebar with no onPersist prop and not throw` + pre-existing workspace tests unchanged |
| AC-011 | `Cargo.toml` + `lib.rs` plugin reg + `capabilities/default.json` `store:default` + `package.json` dep (runtime seam) |
| AC-012 | `npm run lint` (0 errors) / `npm run typecheck` / `npm test` / `cargo test` |
| AC-013 | workspace `DEFAULT_WORKSPACE should expose the documented default shape with an empty tree` |
| AC-014 | workspace `mergeWorkspace` suites (garbage / valid nodes / malformed nodes / folder recursion) |
| AC-015 | workspace `hydrate` + `dehydrate` suites (config carried, runtime defaults, order, round-trip) |
| AC-016 | workspace `createInMemoryWorkspaceStore` suite + workspace-store-context `WorkspaceStoreProvider` suite + `useWorkspaceStore should throw ...` |
| AC-017 | workspace-tree-persistence `should render the No connection empty state when the tree is empty` + store-context `should expose an empty tree if the store is empty` |
| AC-018 | workspace-tree-persistence `should fire onTreeChange with the edited host when updateDatabaseConfig is called` + `should fire onTreeChange with the connected config when connect succeeds` |
| AC-019 | settings tests updated (no `connections`); `connections` removed from `Settings`/`mergeSettings`/settings tauri-store |

## Known minor (non-blocking)

- `mergeWorkspace`/`isConnectionConfig` accept `port: NaN` (`typeof NaN === "number"`);
  harmless (fails at connect time, never crashes merge). Harden with `Number.isFinite`
  if revisited.

## 1. Overview

purequery held all UI and connection state in memory (`WorkspaceProvider`); nothing survived a
restart, and the sidebar was hardcoded `mockTree`. This feature adds a **JSON-file
persistence layer modeled on the `requi` repo**, which persists frontend state to
OS-config-dir JSON files via `@tauri-apps/plugin-store` (`LazyStore`), validated through
a `merge*()` gatekeeper, behind a `*Store` interface (Tauri + in-memory) and a React
context. requi keeps **two concerns in two files**: UI state and the workspace structure.
purequery mirrors that:

- **`settings.json`** (`src/lib/settings/`) - UI/layout state: sidebar/console visibility,
  split orientation, panel layouts, expanded tree nodes, open tabs + active tab.
- **`workspace.json`** (`src/lib/workspace/`) - the sidebar tree: folders + database nodes,
  each node carrying its own connection config (engine/host/port/database/user/password).

What this delivers:
- `src/lib/settings/`: `Settings` + `DEFAULT_SETTINGS`, `mergeSettings()`, `SettingsStore`
  (Tauri + in-memory), `SettingsProvider`/`useSettings()`.
- `src/lib/workspace/`: `PersistedWorkspace` + `DEFAULT_WORKSPACE` (empty tree),
  `mergeWorkspace()`, `hydrate`/`dehydrate` (persisted shape <-> runtime `TreeNode`),
  `WorkspaceStore` (Tauri + in-memory), `WorkspaceStoreProvider`/`useWorkspaceStore()`.
- Restore on launch: panel layout + open tabs + expanded nodes rehydrate from
  `settings.json`; the sidebar tree rehydrates from `workspace.json` (empty if absent).
- Tables ALWAYS come from a live `connect_database` fetch - never persisted, never shown
  before a real connect. A restored connection retains its config (no re-type) and
  auto-connects on open.

What this does **not** deliver (out of scope, not requested):
- No backend (Rust) persistence logic beyond enabling the store plugin + capability.
- No encryption / OS keychain for passwords (plaintext JSON, matching requi).
- No new settings UI; no Add/Remove/Rename-database UI (the tree is hand-authored in
  `workspace.json` or grown via the connect-edit path). Add/Remove UI is the next slice.
- No directory-scan workspace (requi scans `folder.json`/`.req.json`); purequery uses a single
  `workspace.json` manifest holding the whole tree.
- No persistence of runtime/derived fields (tables, views, sql editor text, script, query
  result), connection status, query history, or pending edits.
- No file migration beyond the `version` field + forward-compat merge.

### User Story

As a developer using purequery, I want my panel layout, open tabs, and my sidebar's databases
(folders + connection details) to survive a restart, so I resume where I left off without
re-typing credentials or re-toggling panels - and the sidebar reflects MY databases, not
fixed mock data.

## 2. Acceptance Criteria

### Settings (settings.json)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | A `Settings` type + `DEFAULT_SETTINGS` exist: `version`, `sidebarHidden`, `consoleHidden`, `splitOrientation`, `layouts`, `expandedIds`, `openTabIds`, `activeTabId` | Must |
| AC-002 | `mergeSettings(defaults, partial)` returns a fully valid `Settings`, never throws, drops type-mismatched/unknown fields, falls back to defaults per slice; validates `layouts` (known groups, numeric sizes) and coerces `activeTabId` to null unless in `openTabIds` | Must |
| AC-004 | A `SettingsStore` interface (`load`/`save`) with a `createInMemorySettingsStore()` for tests | Must |
| AC-005 | `createTauriSettingsStore()` persists to `settings.json` via `LazyStore`; load runs through `mergeSettings`; missing/corrupt file yields `DEFAULT_SETTINGS` (errors caught/warned, not thrown) | Must |
| AC-006 | A `SettingsProvider` loads on mount (renders nothing until loaded); `useSettings()` exposes `settings` + `persist(next)`; throws outside the provider | Must |
| AC-007 | On launch the workspace seeds sidebar/console visibility, split orientation, layouts, expanded ids, open tabs + active tab from loaded settings | Must |
| AC-008 | Changing any persisted UI slice (toggle sidebar/console, flip split, drag a panel, expand/collapse, open/close/switch a tab) writes the updated `Settings` via the store | Must |
| AC-009 | A restored connection retains its config (no re-type): opening that database auto-connects with the stored config and fetches the live catalog. Tables are NEVER shown until a real connect succeeds - a restored connection re-fetches rather than displaying stale tables | Must |
| AC-010 | Existing `WorkspaceProvider` tests pass unchanged (persistence opt-in; standalone provider keeps in-memory behavior) | Must |
| AC-011 | Tauri store plugin enabled (Rust `tauri-plugin-store`, npm `@tauri-apps/plugin-store`, `store:default` capability) | Must |
| AC-012 | `npm run lint`, `npm run typecheck`, `npm test`, `cargo test` all exit 0 | Must |

### Workspace tree (workspace.json)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-013 | A `PersistedWorkspace` type + `DEFAULT_WORKSPACE` exist: `{ version:1; tree: PersistedNode[] }`, default `tree:[]`. `PersistedNode` = persisted folder (kind/id/name/children) or persisted database (kind/id/name + connection fields) - NO runtime fields | Must |
| AC-014 | `mergeWorkspace(partial)` returns a valid `PersistedWorkspace`, never throws, drops malformed nodes (bad kind, missing/typed fields, invalid engine, non-number port), recurses into folders, returns the empty tree for non-object/garbage | Must |
| AC-015 | `hydrate(persisted)` -> runtime `TreeNode[]`: a persisted database becomes a `DatabaseNode` with its config + empty runtime defaults (`tables:[]`, `views:[]`, `sql:""`, `savedScripts:[]`, `script:""`, empty `result`); folders recurse. `dehydrate(tree)` is the inverse, stripping runtime fields | Must |
| AC-016 | A `WorkspaceStore` interface (`load`/`save`) with in-memory impl; a `WorkspaceStoreProvider` loads on mount (renders nothing until loaded); `useWorkspaceStore()` exposes `{ tree, persistTree }` and throws outside the provider | Must |
| AC-017 | On launch the sidebar renders the hydrated `workspace.json` tree; with no file the sidebar is empty (the `tree.length === 0` "No connection" state), no mock databases | Must |
| AC-018 | Connecting with edited connection fields updates that database node's config and persists the tree via the workspace store (survives reload) | Must |
| AC-019 | `connections.json` + the `connections` slice are removed from `Settings`/`mergeSettings`/the settings Tauri store. The runtime `connections` map stays session-only (empty at launch, filled on connect) so tables appear only after a live connect | Must |

## 3. User Test Cases

### TC-001 (happy path): Layout survives restart
Hide sidebar (`Cmd/Ctrl+B`), flip split vertical (`Cmd/Ctrl+\`), drag a panel, expand a
folder, open two tabs. Restart.
**Expected:** sidebar hidden, split vertical, panel size kept, folder expanded, both tabs
open with the same active tab. **Maps to:** AC-007, AC-008.

### TC-002 (happy path): Connection survives restart
A `workspace.json` database; open its Settings, Connect. Restart.
**Expected:** the database is in the sidebar; opening it auto-connects with the saved
config and lists live tables; the Settings form shows the saved values. **Maps to:**
AC-009, AC-017, AC-018.

### TC-003 (cold start): No files yet
First launch (no `settings.json`/`workspace.json`).
**Expected:** default layout; empty sidebar ("No connection ..."); no mock databases; no
crash. **Maps to:** AC-005, AC-017.

### TC-004 (resilience): Corrupt / partial files
`settings.json` has garbage/typo'd slices; `workspace.json` has a malformed node among
valid ones.
**Expected:** `mergeSettings`/`mergeWorkspace` drop the invalid parts, keep the valid ones,
fill the rest; app loads. **Maps to:** AC-002, AC-014.

### TC-005 (round-trip, unit): Store save -> load (-> hydrate)
Save a non-default settings / non-empty workspace, load via a fresh store.
**Expected:** loaded equals saved (after merge); hydrated tree carries runtime defaults.
**Maps to:** AC-004, AC-005, AC-015, AC-016.

### TC-006 (no regression): tables only after connect
Expand a database before connecting.
**Expected:** no table leaves until a successful connect. **Maps to:** AC-009.

## 4. UI States

| State | Behavior |
| ----- | -------- |
| Loading (files not yet read) | `SettingsProvider`/`WorkspaceStoreProvider` render nothing until `load()` resolves |
| Cold (no files) | Default layout; empty sidebar; zero databases |
| Corrupt/partial file | Invalid slices/nodes dropped, valid ones kept, rest defaulted; no error surfaced |
| Restored | Panel layout / tabs / expanded nodes match last session; sidebar shows saved databases; each idle until connected |
| Edited connection | Node config updated + persisted; reload reflects it |

## 5. Data Model

`src/lib/settings/settings.ts`:

```ts
type PanelLayout = Record<string, number>;     // panel id -> size %
type PanelGroupKey = "workspace" | "main" | "sql";
type Settings = {
  version: 1;
  sidebarHidden: boolean;        // requi naming (hidden, not visible)
  consoleHidden: boolean;
  splitOrientation: "horizontal" | "vertical";
  layouts: Partial<Record<PanelGroupKey, PanelLayout>>; // resizable panel sizes
  expandedIds: string[];
  openTabIds: string[];
  activeTabId: string | null;
};
```

`layouts`: `workspace` (sidebar|content) + `main` (content|console) are
`react-resizable-panels` groups captured via `onLayoutChanged`/`defaultLayout`; `sql` is
the hand-rolled SQL editor|results split (`{ left: number }`, persisted on drag-end).

`src/lib/workspace/workspace.ts`:

```ts
type PersistedDatabase = {
  kind: "database"; id: string; name: string;
  engine: DbEngine; host: string; port: number;
  database: string; user: string; password: string; // plaintext
};
type PersistedFolder = { kind: "folder"; id: string; name: string; children: PersistedNode[] };
type PersistedNode = PersistedFolder | PersistedDatabase;
type PersistedWorkspace = { version: 1; tree: PersistedNode[] };
```

`hydrate`/`dehydrate` bridge `PersistedNode[]` <-> runtime `TreeNode[]` (`mock-data.ts`).
Runtime-only fields (tables, views, sql, savedScripts, script, result) are filled with
empty defaults on hydrate, stripped on dehydrate. `ConnectionConfig` reused from
`mock-data.ts`.

Storage (both via `LazyStore`, OS app-config dir, e.g.
`~/Library/Application Support/com.pzielinski.purequery/`):
- `settings.json` key `settings` <- the `Settings` object.
- `workspace.json` key `workspace` <- the `PersistedWorkspace`.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | No file (cold start) | `LazyStore.get` -> undefined -> `merge*` returns defaults / empty tree |
| E-2 | Corrupt JSON / wrong types | `.catch(() => undefined)` on get; `merge*` drops bad slices/nodes |
| E-3 | Unknown / future keys / malformed node | Ignored (settings) / dropped per-node, folders recurse (workspace) |
| E-4 | Malformed connection / duplicate node ids | Dropped per-node; dup ids kept as authored (dedup out of scope) |
| E-5 | `activeTabId` not in `openTabIds`, or open-tab/expanded id not in the tree | Coerced to `null` / harmlessly unresolved (`nodesById.get` -> undefined) |
| E-6 | Disk write fails | `.catch` warns; in-memory state unaffected, no crash |
| E-7 | Tests with no `SettingsProvider`/`onTreeChange` | `WorkspaceProvider` uses defaults; no store calls (opt-in) |

## 7. Dependencies

- Rust: `tauri-plugin-store = "2"`; `.plugin(tauri_plugin_store::Builder::new().build())`.
- Frontend: `@tauri-apps/plugin-store` (npm).
- Capability: `store:default` in `src-tauri/capabilities/default.json`.
- Reuses `ConnectionConfig`/`DbEngine`/`TreeNode` (`mock-data.ts`), `WorkspaceProvider`
  props, React 19 / TanStack Router.

## 8. Out of Scope

Backend persistence, password encryption/keychain, new settings UI, Add/Remove/Rename-
database UI, drag-reorder of the tree, directory-scan / multiple workspaces, file
migration beyond `version` + forward-compat merge, persisting runtime/ephemeral state
(connection status, query history, pending edits, SQL editor text, results).

**Security note:** connection passwords are written to `workspace.json` in plaintext (an
explicit product decision; same trust model as requi's plaintext store files).
