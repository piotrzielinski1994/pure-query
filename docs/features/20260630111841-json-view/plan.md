# Plan — JSON View for Table Rows

## Approach

A **third view** in `TableView`, layered as an independent boolean over the existing
`isRecordView` toggle (chosen: independent toggle, not a 3-state cycle). Mirrors `requi`'s
`JsonViewer` (CodeMirror + `@codemirror/lang-json` + fold) but editable, with **explicit
Save/Discard** (no debounce — the user rejected auto-apply after the mass-delete footgun).

All edit logic is a **pure lib** (`src/lib/workspace/json-edit.ts`) returning **ADT
results** and **rowIndex-keyed intents**; `LiveTable` maps the intents onto the existing
`PendingMutation` pipeline via its existing `preview` strategy and `tableId`/`tableName`,
reusing the exact mutation shapes inline edits already produce. **No backend change, no
new IPC structs**: SQL → `cell` mutations, MongoDB → `replace`, both → `insert`/`delete`.

### Why pure-lib + intents (vs building PendingMutation in the lib)

`PendingMutation` carries `sql` (engine-specific, built by `queryPreview`), `tableId`,
`tableName`, `draftId` — runtime context the pure lib shouldn't own. The lib returns
intents (`{ type, rowIndex?, column?, newValue?, values? }`); `LiveTable` enriches them
exactly like `commitEdit`/`deleteRow`/`addRow` do today. Keeps the diff fully unit-
testable with no mocks.

## Files

### New

- `src/lib/workspace/json-edit.ts` — pure lib:
  - `rowsToJson(columns, rows): string` — pretty JSON array; cell `null` → JSON `null`;
    a cell that parses as JSON (Mongo nested) → embedded value, else string. (Mirrors the
    `openDocEditor` parse-or-keep logic in table-card.)
  - `parseJsonRows(text): { ok; value } | { ok:false; error }` — JSON array of objects.
  - `diffToMutations({ columns, rows, edited, primaryKey, engine }): Ok(intents) | Err` —
    PK-keyed diff → intents: `cell`(sql, per changed field) / `replace`(mongo) / `insert`
    / `delete`. Validates SQL key set (reject unknown/missing) + PK uniqueness.
  - Intent type: `JsonMutationIntent =
      | { type: "cell"; rowIndex; column; newValue }
      | { type: "replace"; rowIndex }
      | { type: "insert"; values: Record<string,string|null> }
      | { type: "delete"; rowIndex }`.
- `src/components/workspace/json-view.tsx` — `JsonView`: CodeMirror (lang-json + fold,
  read-only when no edit callbacks; editable buffer + Save/Discard + inline error when
  given them). Reuses `sql-editor`'s CodeMirror theme tokens; foldable like `requi`.
- `src/lib/workspace/__tests__/json-edit.test.ts` — TC-001..008 (the test spine).
- `src/components/workspace/__tests__/json-view.test.tsx` — TC-009, TC-010.

### Modified

- `src/lib/shortcuts/registry.ts` — add `toggle-json-view` to `ShortcutActionId` +
  `SHORTCUT_ACTIONS` (`scope: "grid"`, `defaultHotkey: "Mod+Shift+J"`, name/description).
- `src/lib/shortcuts/__tests__/registry.test.ts` — add `toggle-json-view` to the grid
  scope list (TC-001 lands here too).
- `src/components/workspace/table-card.tsx`:
  - `TableView`: add `isJsonView` state + a second window-keydown listener matching the
    resolved `toggle-json-view` binding (guarded by `isEditableTarget`, mirroring the
    `toggle-record-view` effect). When on, render `JsonView` instead of grid/record.
    Pass editable props only on the live path.
  - Thread an `onSaveJson(edited)` callback from `LiveTable` (maps intents →
    `upsertPendingEdit`, reusing the `preview`/ids logic) down through `TableView`. Static
    path passes none → read-only.
- `src/components/workspace/command-registry.ts` — add `toggle-json-view` to
  `PaletteCommandId` + `PALETTE_COMMANDS` (`actionId: "toggle-json-view"`, shown when a
  table tab is active — gate via a new `PaletteState` flag, e.g. `isTableActive`).
- `src/components/workspace/command-palette.tsx` — wire the handler (toggle JSON view)
  and the `isTableActive` state; hint derives from `resolveShortcuts` already.
- `src/components/workspace/__tests__/command-palette*.test.tsx` (if present) — TC-011.

## Edge cases (from spec step 7)

- Empty table → `[]`; add object → `insert`.
- No PK (`editable===false`) → JSON view read-only (cannot key the diff).
- Mongo nested cell JSON round-trips (parse-or-keep).
- Reordered array → ignored (PK identity).
- `Mod+Shift+J` while typing → `isEditableTarget` suppresses.
- Mid-edit empty/partial buffer → no auto-apply; only explicit Save diffs (footgun gone).
- PK edited to collide / duplicated PK across objects → `Err`, stage nothing.

## Tests to write (≥1 per AC)

| AC | Test |
| -- | ---- |
| AC-001 | registry test: `toggle-json-view` grid/`Mod+Shift+J` (TC-001) |
| AC-002 | `rowsToJson`/`parseJsonRows` round-trip + Err cases (TC-002, TC-003) |
| AC-003 | `diffToMutations` mongo replace / sql cells / insert / delete (TC-004..006) |
| AC-004 | `diffToMutations` sql unknown+missing key Err; duplicate PK Err (TC-007, TC-008) |
| AC-005 | `JsonView` controls present/absent + prettified text (TC-009, TC-010) |
| AC-006 | `JsonView` independent toggle render (covered by render test; key-fire = manual smoke) |
| AC-007 | live Save stages into `pendingEdits` (intent-mapping unit; wiring = manual smoke) |
| AC-008 | palette `toggle-json-view` command + hint from resolver (TC-011) |

## Execution order (TDD red→green per AC)

1. AC-001 registry (+ test) — smallest, unblocks scope wiring.
2. AC-002 `rowsToJson`/`parseJsonRows` (+ tests).
3. AC-003/AC-004 `diffToMutations` (+ tests) — the core.
4. AC-005 `JsonView` component (+ tests).
5. AC-006/AC-007 `TableView`/`LiveTable` wiring (toggle + Save/Discard intent mapping).
6. AC-008 palette command + hint (+ test).

## Acceptance verification

- `npm test` green (Vitest); the pure-lib suite is the spine.
- `npm run lint` + `tsc` clean (no `any`, ADT over try/catch in the lib).
- Manual smoke (`npm run tauri dev`): toggle JSON on a live Postgres table and a Mongo
  collection, edit a field, Save → row appears in Changes tab → bottom Save commits;
  Discard reverts buffer; invalid JSON shows inline error and stages nothing.

## Risks

- CodeMirror editing/fold + bare-key toggles don't run in jsdom → behavioral coverage
  stays at the pure-lib + render layer, toggle/Save wiring is manual smoke (same
  constraint the shortcuts + dnd-kit features accept).
- Mongo nested-cell round-trip could mangle a value that looks like JSON but is a string
  → mitigated by mirroring the existing `openDocEditor` parse-or-keep, tested in TC-002.
- Scope creep into the read-only SQL result grid → explicitly out of scope.
