# JSON View for Table Rows

> Status: implemented on branch `20260630111841-json-view`. All ACs verified green
> (`npm test` 834 pass, lint 0 errors, `tsc` clean). AC traceability at the bottom.

## Overview

The table card today shows rows two ways: the grid (`DataGrid`) and a single-row
"record view", toggled by the `toggle-record-view` grid shortcut. This feature adds a
**third view**: an **editable, foldable JSON view** of all currently-loaded rows as a
JSON array, toggled by its own grid shortcut and a command-palette command.

It mirrors `requi`'s `JsonViewer` (CodeMirror + `@codemirror/lang-json`, `withFold`)
but makes it editable. Edits **auto-stage on a debounce** into the existing pending-edits
pipeline — there is **no local Save/Discard** (the Changes-tab pending bar is the single
stage/commit gate, matching inline cell edits which also auto-stage). Each debounced edit
parses the array, diffs it against the original rows by primary key, and **reconciles the
staged mutations to that diff** — so reverting an edit un-stages it. Every JSON edit is
reversible via the Changes tab and is committed to the database by the table card's
existing bottom Save bar (which shows the SQL before touching the DB), exactly like an
inline cell edit.

## Scope of the view

- Source = the **saved, currently-loaded rows** of the active live table (`rows`, the
  flattened fetched pages). Draft (unsaved-insert) rows are NOT included — they live in
  table view until saved.
- Rendered as a pretty-printed JSON **array of objects**, one object per row, keys =
  column names in column order (`_id`/PK first, as the grid orders them), foldable per
  object.
- Editable only on the **live** table path (where the mutation pipeline exists). On the
  static/mock path (no connection) the JSON view is a **read-only viewer** (no Save).
- The read-only SQL result grid (`sql-tab.tsx`, renders `DataGrid` directly) is **out of
  scope** — it has no record view today either.

## View-model: independent toggle

`toggle-json-view` is an **independent** boolean layered over the existing
table/record toggle:

- JSON off → table or record view as today (`isRecordView`).
- JSON on → JSON view renders regardless of `isRecordView`.
- Toggling JSON off → returns to whatever table/record state was active.

This matches the user's choice of "independent toggle" over a 3-state cycle.

## Editing model

Identity is the **primary key** (`_id` for MongoDB, the table's primary key for SQL).
On each debounced edit, the edited array is parsed and diffed against the original rows by PK:

| Edited array vs original                          | Staged mutation                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| object whose PK matches an original, fields differ | MongoDB: one `replace` (full doc). SQL: one `cell` per changed field. |
| object whose PK matches an original, no diff       | nothing                                                          |
| object with a PK not present in originals          | `insert`                                                         |
| original PK absent from the edited array           | `delete`                                                         |

All staged mutations flow through `upsertPendingEdit` into `pendingEdits` → the Changes
tab → committed/reverted by the table card's existing bottom Save bar. `LiveTable.saveJson`
is **reconciling + idempotent** (the debounce calls it on every edit): it re-stages the
current diff with **deterministic ids** and discards any id it previously staged that the
new diff dropped (tracked in a `jsonStagedIds` ref), so a reverted edit un-stages itself
and a re-fire never duplicates an insert.

SQL has **no whole-row replace** (the backend's `build_mutation` rejects `Replace` by
design — Mongo-only invariant), so a changed SQL object is decomposed into one `cell`
mutation per changed field. MongoDB uses the existing `replace` mutation (`replaceOne`).

### Validation (stages nothing, shows inline error, prior staging untouched)

- The buffer is not valid JSON, or not an array, or any element is not an object.
- **SQL only**: an object has a key that is not a real column, **or** is missing any
  column key (both rejected — SQL rows have a fixed column set). The error names the
  offending key.
- A primary-key value is edited in place such that it no longer matches its original and
  collides with another row's PK, or a PK is duplicated across objects → error (PK must
  stay a unique identity). A PK that simply disappears is a delete; a brand-new PK is an
  insert — those are allowed.

## Acceptance Criteria

- AC-001: The shortcut registry gains a `toggle-json-view` action (`scope: "grid"`,
  default hotkey `Mod+Shift+J`, non-empty `name`/`description`); `ShortcutActionId`
  includes it and the registry test's grid scope lists it.
- AC-002: `rowsToJson(columns, rows)` serialises the row array to a pretty JSON string —
  an array of objects, one per row, keys in `columns` order, a `null` cell → JSON
  `null`. `parseJsonRows(text)` returns an ADT: `Ok(objects)` for a JSON array of
  objects, else `Err(message)` (not JSON / not an array / element not an object).
- AC-003: `diffToMutations({ columns, rows, edited, primaryKey, engine })` returns an
  ADT `Ok(mutations)` | `Err(message)` where, by PK identity: a changed matched object →
  one `replace` (mongodb) or one `cell` per changed field (sql); a new PK → `insert`; a
  missing PK → `delete`; an unchanged object → no mutation.
- AC-004: `diffToMutations` returns `Err` (and no mutations) when, for a SQL engine, any
  edited object has an unknown column key or is missing a column key; and when a PK value
  is duplicated across edited objects.
- AC-005: A `JsonView` component renders the rows as a foldable JSON array via CodeMirror
  (`@codemirror/lang-json`, fold gutter). Given an `onSave` callback it is editable (NO
  local Save/Discard buttons, NO persistent status bar - just the editor); without it
  (static path) it is a read-only viewer. An error bar appears ONLY when the buffer is
  invalid JSON / fails validation.
- AC-006: `TableView` supports an independent JSON view: when JSON is on it renders
  `JsonView` regardless of `isRecordView`; the `toggle-json-view` resolved binding (grid
  scope, guarded by `isEditableTarget`) toggles it; toggling off restores the prior view.
- AC-007: In the live table, a JSON edit auto-stages (debounced) the diffed mutations into
  `pendingEdits` (visible in the Changes tab, committed by the existing Save bar);
  reverting an edit un-stages it (reconciled by deterministic ids); a validation error
  shows inline and stages nothing (prior staging untouched).
- AC-008: The command palette gains a `toggle-json-view` command (shown when a table tab
  is active) whose hint is derived from the resolved `toggle-json-view` binding.

## Test Cases

- TC-001 (AC-001): registry contains `toggle-json-view` with `scope: "grid"`,
  default `Mod+Shift+J`, non-empty name/description. Maps to: AC-001
- TC-002 (AC-002): `rowsToJson(["_id","name"], [["1","Al"],["2",null]])` parses back to
  `[{_id:"1",name:"Al"},{_id:"2",name:null}]`. Maps to: AC-002
- TC-003 (AC-002): `parseJsonRows("not json")` → `Err`; `parseJsonRows("{}")` → `Err`
  (not an array); `parseJsonRows("[1]")` → `Err` (element not object);
  `parseJsonRows("[{}]")` → `Ok`. Maps to: AC-002
- TC-004 (AC-003, mongodb): one object's non-PK field changed → one `replace` mutation
  for that `_id`; unchanged objects → no mutation. Maps to: AC-003
- TC-005 (AC-003, sql): one object's two fields changed → two `cell` mutations (one per
  field) keyed by PK; an unchanged field → no mutation for it. Maps to: AC-003
- TC-006 (AC-003): an object with a PK absent from originals → `insert`; an original PK
  absent from the edited array → `delete`. Maps to: AC-003
- TC-007 (AC-004, sql): an edited object with an unknown key → `Err`, no mutations; an
  edited object missing a column key → `Err`, no mutations. Maps to: AC-004
- TC-008 (AC-004): the same PK value on two edited objects → `Err`, no mutations.
  Maps to: AC-004
- TC-009 (AC-005): `JsonView` renders NO local Save/Discard buttons and NO status bar at
  rest (read-only when no `onSave`). Maps to: AC-005
- TC-010 (AC-005): `JsonView` seeds the editor with the prettified JSON of the given rows;
  editing auto-stages the parsed rows (debounced) and bad JSON shows inline without
  staging. Maps to: AC-005, AC-007
- TC-011 (AC-008): palette includes a "View rows as JSON" command whose hint reflects
  `resolveShortcuts` for `toggle-json-view` (default and an override). Maps to: AC-008

## UI States

| State        | Behavior                                                                       |
| ------------ | ------------------------------------------------------------------------------ |
| JSON off     | Table or record view as today.                                                 |
| JSON on      | Foldable JSON array of the loaded rows; just the editor (no buttons/bar).       |
| Editing      | Buffer differs from rows; edits auto-stage (debounced) into the Changes tab.    |
| Invalid JSON | Error bar appears below the editor; stages nothing (prior staging untouched).   |
| Read-only    | Static/mock path: JSON shown, never an error bar.                               |

## ASCII wireframes

JSON view ON (live, editable):

```
+--------------------------------------------------------------+
| { } find filter (JSON) - Enter to run                  [ Q ] |
+--------------------------------------------------------------+
| v [                                                          |
|     {                                                        |
|       "_id": "65f0...",   PK                                 |
|       "name": "Alice",                                       |
|       "age": 30                                              |
|     },                                                       |
|   > { "_id": "65f1...", ... },                               |
|   ]                                                          |
|                                                              |
+--------------------------------------------------------------+
| 200 of 1240 rows          Page size [200]    Load more   [+] |
+--------------------------------------------------------------+
```

When the buffer is invalid JSON, an error bar (`Invalid JSON: ...`) appears between the
editor and the rows footer; otherwise there is no bar. JSON view ON (static / read-only):
identical, never an error bar.

## Data model

```ts
// pure lib: src/lib/workspace/json-edit.ts
type JsonRow = Record<string, unknown>;
type Parsed = { ok: true; value: JsonRow[] } | { ok: false; error: string };

function rowsToJson(columns: string[], rows: Cell[][]): string;
function parseJsonRows(text: string): Parsed;
function diffToMutations(input: {
  columns: string[];
  rows: Cell[][];          // originals
  edited: JsonRow[];       // parsed edited array
  primaryKey: string | null;
  engine: DbEngine | "mongodb";
}):
  | { ok: true; value: StagedMutation[] }   // shape consumed by upsertPendingEdit
  | { ok: false; error: string };
```

No new IPC structs, no backend change: SQL → existing `cell` mutations, MongoDB →
existing `replace` mutation, both → existing `insert`/`delete`.

## Edge cases

- Empty table (no rows) → JSON view shows `[]`; editing to add an object stages an
  `insert`.
- A cell holding compact JSON (MongoDB nested object/array) round-trips: `rowsToJson`
  emits it as a parsed value where it parses, else as a string (mirrors the existing
  `openDocEditor` behaviour in table-card).
- No primary key (SQL table without PK, `editable === false`) → JSON view is read-only
  (cannot stage edits without a key), same as inline editing is disabled there.
- Reordering objects in the array → ignored (identity is PK, not position).
- `Mod+Shift+J` while typing in the filter editor or a cell → suppressed by
  `isEditableTarget` (grid-scope guard), never toggles.

## Dependencies

- Existing only: `@codemirror/lang-json`, `@codemirror/language` (fold), CodeMirror via
  `@uiw/react-codemirror`, the shortcuts stack, the pending-edits pipeline. No new deps,
  no backend change.

## Out of scope

- JSON view for the read-only SQL result grid (`sql-tab`).
- Structural edits beyond add/remove/field-change diffed by PK (no schema changes, no
  type coercion UI).
- A separate DB-commit path: JSON Save stages into the existing pipeline; the existing
  bottom Save bar commits.

## Testing strategy

- Pure lib `json-edit.ts` (`rowsToJson` / `parseJsonRows` / `diffToMutations`) is the
  test spine — fully unit-tested in jsdom (TC-001..008), ADT results, no mocks.
- `JsonView` render tests for control presence and prettified text (TC-009, TC-010).
- Palette hint derivation test (TC-011).
- Real key-event firing + CodeMirror editing do not run meaningfully in jsdom (same
  constraint as the shortcuts and dnd-kit features); the toggle wiring is covered by the
  pure resolver + render tests plus manual smoke.

## AC traceability (verified)

| AC | Test(s) |
| -- | ------- |
| AC-001 | `registry.test.ts` → "should carry the documented default binding for the JSON view toggle"; "should define every documented action id exactly once"; "should place each action in the scope the spec assigns it" |
| AC-002 | `json-edit.test.ts` → "should round-trip rows through rowsToJson and parseJsonRows"; "should embed a cell that parses as JSON as the parsed value"; the four `parseJsonRows ADT` cases |
| AC-003 | `json-edit.test.ts` → "should stage one replace if a matched mongo object changed a non-PK field"; "should stage one cell per changed field…"; "should stage no mutation if a matched sql object is unchanged"; "should stage an insert for a new PK and a delete for a removed PK" |
| AC-004 | `json-edit.test.ts` → "should return Err if a sql edited object has an unknown column key"; "…is missing a column key"; "…a PK value is duplicated across edited objects" |
| AC-005 | `json-view.test.tsx` → "should not render local Save or Discard controls"; "should render no status bar when there is no error"; "should seed the editor with the prettified JSON of the rows" |
| AC-006 | `table-card.test.tsx` → "should render the JSON view instead of the grid when JSON view is on"; "should render the grid not the JSON view when JSON view is off" (key-fire = manual smoke) |
| AC-007 | `json-view.test.tsx` → "should auto-stage the parsed edited rows after an edit"; "should show an inline error and not stage when the buffer is invalid JSON"; `json-edit.test.ts` → the `jsonMutationId` block (deterministic ids, insert keyed by PK => no duplicate on re-fire) + diff spine; `LiveTable.saveJson` upsert/discard wiring = manual smoke |
| AC-008 | `command-palette-json.test.tsx` → "should offer the View rows as JSON command with the default-binding hint"; "should show the JSON-view hint derived from an override binding" |
