# Plan: JSON-file persistence layer (settings.json + workspace.json)

Implements `spec.md` v0.2.0. Modeled on `requi/src/lib/settings/` (UI state) + requi's
workspace split (sidebar tree). TDD, red-green-refactor.

Coverage threshold: none (no threshold configured in `vitest.config.ts`).

## Approach & key decisions

- **Two modules mirroring requi's two-file split.** `src/lib/settings/` (UI state) and
  `src/lib/workspace/` (sidebar tree) each have the same five-piece shape: types +
  `DEFAULT_*` + `merge*` validator, `tauri-store.ts` (`LazyStore`), `in-memory-store.ts`,
  and a `*Provider`/`use*` context. Same `*Store` interface (`load`/`save`), same
  store-injected-as-prop pattern (tests never import the Tauri plugin -> jsdom stays
  happy).

- **`merge*` is the gatekeeper (ADT-style, never throws).** Pure, guard helpers, drops
  invalid/unknown data, fills from defaults. `mergeSettings` validates layouts (known
  groups, numeric sizes) + coerces `activeTabId` to null unless in `openTabIds`.
  `mergeWorkspace` drops malformed nodes and recurses into folders.

- **Persisted shape excludes runtime fields (workspace).** `PersistedDatabase` carries
  only structure + connection config. `hydrate` fills runtime defaults (tables/views/
  sql/savedScripts/script/empty result) to produce a `DatabaseNode`; `dehydrate` strips
  them. Single source of truth for "what persists"; tables come from a live connect, never
  the file. `dehydrateNode` drops `kind:"table"` children.

- **Persistence is opt-in on `WorkspaceProvider` (keeps AC-010 cheap).** The workspace owns
  all persisted state in `useState`. Two optional props + two derive-effects, not threaded
  setters:
  - `onPersist?: (settings: Settings) => void` - fires when any UI slice changes.
  - `onTreeChange?: (tree: TreeNode[]) => void` - fires when the tree changes.
  Absent (existing tests) -> zero behavior change. *Alternative considered:* requi's
  granular `save*` methods - rejected; the derive-effect is one integration point and
  naturally batches.

- **`connections.json` removed; the tree node IS the saved connection.** The `connections`
  slice is gone from `Settings`/`mergeSettings`/the settings Tauri store. The runtime
  `connections` Map in `workspace-context` stays (session-only, empty at launch, filled by
  `setConnection` on connect) so the tables-only-after-connect rule holds.
  `updateDatabaseConfig(id, config)` updates the node in the tree; `useConnectionActions.
  connect` calls it so an edited config persists via `onTreeChange`.

- **Restore is live for free (stateless backend).** Every `fetch_table`/`execute_sql`
  reconnects with the passed config, so a restored config is immediately usable. Restored
  connections seed config only (NOT a "connected" status) - `useAutoConnect` gates on
  `status === undefined` and re-fetches the live catalog on open.

- **Providers at the root.** `__root.tsx` wraps in `SettingsProvider` +
  `WorkspaceStoreProvider` (stores via `useState`); each renders nothing until `load()`
  resolves. `HomePage` (`index.tsx`) bridges: `useSettings()` -> `WorkspaceProvider`
  initial props + `onPersist`; `useWorkspaceStore()` -> `tree` + `onTreeChange`.

## Files

Backend:
- `src-tauri/Cargo.toml` - add `tauri-plugin-store = "2"`.
- `src-tauri/src/lib.rs` - `.plugin(tauri_plugin_store::Builder::new().build())`.
- `src-tauri/capabilities/default.json` - add `"store:default"`.

Frontend (new):
- `src/lib/settings/` - `settings.ts`, `tauri-store.ts` (`settings.json`), `in-memory-store.ts`, `settings-context.tsx`.
- `src/lib/workspace/` - `workspace.ts` (types/`mergeWorkspace`/`hydrate`/`dehydrate`), `tauri-store.ts` (`workspace.json`), `in-memory-store.ts`, `workspace-store-context.tsx`.

Frontend (edits):
- `src/components/workspace/workspace-context.tsx` - initial UI-slice props + `onPersist` effect; `onTreeChange` effect + `updateDatabaseConfig`.
- `src/components/workspace/use-connection.ts` - on connect, also `updateDatabaseConfig(id, config)`.
- `src/components/workspace/tree-row.tsx` - table leaves render only when `status === "connected"`.
- `src/components/workspace/database-card.tsx` - `useAutoConnect` gates on status only, uses the restored config.
- `src/routes/__root.tsx` - wrap in both providers.
- `src/routes/index.tsx` - bridge settings + workspace store into `WorkspaceProvider`.
- `package.json` - add `@tauri-apps/plugin-store`.

Tests (RED first, subagent):
- `src/lib/settings/__tests__/*` - `mergeSettings`, in-memory store, `SettingsProvider`.
- `src/lib/workspace/__tests__/*` - `mergeWorkspace`/`hydrate`/`dehydrate`, in-memory store, `WorkspaceStoreProvider`.
- `src/components/workspace/__tests__/workspace-persistence.test.tsx` - seed + `onPersist` contract.
- `src/components/workspace/__tests__/workspace-tree-persistence.test.tsx` - `onTreeChange` + `updateDatabaseConfig` + connect-edit + empty sidebar.
- Updates to sidebar-tree / settings-tab / database-card / command-palette / content-header / workspace-layout tests for the tables-only-after-connect rule + connections removal.

## Edge cases to handle

E-1 cold start -> defaults / empty tree; E-2 corrupt -> `.catch`->defaults via merge;
E-3 unknown keys ignored / malformed node dropped (folders recurse); E-4 malformed
connection dropped, dup ids kept; E-5 dangling activeTabId -> null / unresolved id
harmless; E-6 write fail -> warn; E-7 no provider/callback -> in-memory, no store calls.

## Test mocking & non-tested seams

- Tests use the in-memory stores + `onPersist`/`onTreeChange` spies; never import either
  `tauri-store.ts` (both import `@tauri-apps/plugin-store`, absent in jsdom). The contexts
  take the store as a prop so they never transitively import the plugin.
- `createTauriSettingsStore`/`createTauriWorkspaceStore` + the Rust plugin registration
  (AC-011) require the Tauri runtime; verified by typecheck/build/manual end-to-end, not
  unit-tested. This split mirrors requi.

## Execution order

1. RED: settings + workspace unit/context tests + the two persistence tests + the
   tables-only-after-connect/connections-removal test updates (subagents).
2. GREEN: `settings.ts` -> `in-memory` -> `settings-context` -> `workspace-context`
   wiring; then `workspace.ts` -> `workspace` stores/context -> remove `connections` from
   settings -> Tauri stores + root + `index.tsx` bridge + Cargo/capability/npm.
3. REFACTOR: dedupe validators; keep hydrate/dehydrate symmetric; tidy the settings removal.
4. VERIFY: fresh verifier subagent runs lint/typecheck/`npm test`/`cargo test` + probes E-1..E-7.

## Acceptance verification

One test per unit-testable AC (Vitest); AC-005/011/017-Tauri-leg via typecheck/build/
manual; AC-012 via the four gates. Manual end-to-end (restart with a hand-authored
`workspace.json` + a live DB) covers TC-001..TC-003.

## Risks

- **Plaintext credentials on disk** (`workspace.json`): explicit decision; documented.
- **`@tauri-apps/plugin-store` import in jsdom**: mitigated by store-as-prop injection.
- **Persist/tree effects firing on mount**: redundant idempotent first write; harmless
  (dehydrate strips runtime fields). No loop - the `tree` prop seeds `useState` only and
  is not synced back, so `persistTree` -> new hydrated prop does not re-fire the effect.
- **Removing `connections.json`**: it shipped earlier; the diff touches settings types +
  tests broadly. Mitigation: AC-019 + updated settings tests pin the removal; `npm test`.
