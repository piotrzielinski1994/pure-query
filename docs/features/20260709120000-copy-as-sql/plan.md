# F15 - Copy as SQL - Implementation Plan

Spec: [spec.md](spec.md). Frontend-only, TDD.

## Approach

Add a pure `rowsToInsertSql` that composes the existing `QueryPreview.insert` per row, then surface a
**Copy SQL** / **Copy insert** item in the `DataGrid` row context menu behind a new optional
`onCopySql` prop. Only the live table card (which knows `preview` + `tableName` + engine) wires it;
the SQL result pane and static path leave it undefined, so no item appears there.

Reuses the engine seam entirely - no new quoting/escaping, no `engine === ...` branching, no backend.

## File changes

1. **`src/components/workspace/query-preview.ts`** - add pure
   `rowsToInsertSql(preview, table, columns, rows)`: map each row to a `Record<string, Cell>` (zip
   `columns` with row cells), call `preview.insert(table, values)`, append `;`, `\n`-join. Empty rows
   -> `""`. Export it. Also export an `engine`-aware `copySqlLabel(engine)` -> `"Copy insert"` for
   `mongodb`, else `"Copy SQL"` (or compute label at the grid from a passed flag - see step 3).

2. **`src/components/workspace/data-grid.tsx`** - add optional prop
   `onCopySql?: (rowIndices: number[]) => void` and `copySqlLabel?: string` (defaults `"Copy SQL"`).
   In the row menu, after the Copy JSON item, render a `Copy SQL`/`{copySqlLabel}` item (with the
   same ` (N rows)` suffix + same selection-target rule) ONLY when `onCopySql` is set. Include
   `onCopySql` in the `hasRowMenu` OR-guard so a card with only copy (no delete) still shows the menu.

3. **`src/components/workspace/table-card.tsx`** -
   - In `LiveTable`, build `copySql = useCallback((indices) => { pick rows; text = rowsToInsertSql(preview, tableName, columnNames, picked); copyTextToClipboard(text, picked.length, "SQL") }, [...])`.
     Reuse the existing clipboard+toast path: extend `copyRowsToClipboard` OR add a small
     `copySqlToClipboard(text, count)` in data-grid.ts that toasts `Copied N row(s) as SQL`. Prefer
     reusing one clipboard helper - refactor `copyRowsToClipboard` to delegate to a private
     `writeToClipboard(text, successMsg)`.
   - Pass `onCopySql={copySql}` + `copySqlLabel={isMongo ? "Copy insert" : "Copy SQL"}` from
     `LiveTable` -> `TableView` -> `DataGrid`. Add the two optional props to `TableView`'s signature
     and forward them; the static `TableCard` path and SQL result pane omit them.

4. **`src/components/workspace/sql-tab.tsx`** - no change (deliberately: no `onCopySql`, so no item).

## Tests (RED first)

- `query-preview.test.ts` (extend or new): `rowsToInsertSql` for PG (double-quote + schema qualify),
  MySQL (backticks), null/quote escaping, MongoDB (`insertOne` per doc), empty rows -> `""`.
  Maps AC-001..004.
- `grid-multi-select.test.tsx` (extend): grid renders **Copy SQL** with `onCopySql` set + ` (N rows)`
  suffix on multi-select; single unselected row -> no suffix, one index; NOT rendered without the
  prop; Mongo label = **Copy insert**. Maps AC-005, AC-006, AC-008.
- clipboard/toast: on select, `onCopySql` called with the target indices; a table-card-level test (or
  the existing `table-content.test.tsx`) asserts the success toast copy. Maps AC-007.

## Execution order

1. RED: spawn test-writer for the ACs above.
2. GREEN: `rowsToInsertSql` -> `DataGrid` prop + item -> `table-card` wiring.
3. REFACTOR: fold clipboard helpers to one writer; confirm no `any`, guards over nesting.
4. VERIFY: fresh verifier; then `npm run lint`, `npm run typecheck`, `npm test`.

## Acceptance verification

Each AC -> its test above; AC-009 -> the three npm gates green. Live smoke (real PG/MySQL/Mongo copy)
is a manual user check, not automated (jsdom clipboard is mocked).
