# F15 - Copy as SQL (grid row menu)

**Version:** 0.1.0
**Created:** 2026-07-09
**Status:** Implemented (branch `20260709120000-copy-as-sql`; verifier PASS, all gates green; live PG/MySQL/Mongo clipboard smoke pending user)
**Source:** `.pzielinski/todos.md` F15.

## AC traceability

| AC | Test(s) |
|----|---------|
| AC-001 | `query-preview.test.ts` "should build one schema-qualified INSERT per row...", "should preserve the column order..." |
| AC-002 | `query-preview.test.ts` postgres schema-qualified / no-schema / sqlite / mysql cases |
| AC-003 | `query-preview.test.ts` "should render NULL unquoted and double an embedded single quote" |
| AC-004 | `query-preview.test.ts` "should build a db.coll.insertOne per document..." |
| AC-005 | `grid-copy-sql.test.tsx` "should render a Copy SQL item when onCopySql is supplied", "should not render... when onCopySql is absent" |
| AC-006 | `grid-copy-sql.test.tsx` "should call onCopySql with every selected index and show a (N rows) suffix...", "should call onCopySql with just the clicked index and no suffix..." |
| AC-007 | `table-content.test.tsx` "should copy the selected rows to the clipboard as INSERT SQL from the row menu" (asserts clipboard text + success toast) |
| AC-008 | `grid-copy-sql.test.tsx` "should read Copy insert when copySqlLabel is Copy insert" |
| AC-009 | `npm run lint` / `npm run typecheck` / `npm test` all exit 0 (pre-existing CodeMirror jsdom teardown error only, no failed tests) |

## 1. Overview

The grid's row context menu already offers **Copy CSV** / **Copy JSON** for the current selection
(`DataGrid`, driven by `onCopyRows`). F15 adds a third item, **Copy SQL**, that serializes the
selected rows as engine-aware `INSERT` statements (one per row) and writes them to the clipboard.

Scope is deliberately narrow (the todo notes full `UPDATE`/`DELETE`/`MERGE` generation is a separate,
larger feature): **INSERT only, one statement per row**, reusing the existing engine-aware quoting /
qualification / literal-escaping already implemented in `queryPreview(engine, schema).insert`.

### Approved decisions (from grilling)

- **Placement: the existing row context menu** (next to Copy CSV / Copy JSON), NOT a new grid
  footer. The todo said "footer", but Copy CSV/JSON actually live in the row context menu today and
  there is no footer to extend - matching reality avoids a bigger, contradictory change.
- **Table card only.** Copy SQL appears only where a real table + schema + engine are known (the
  live table card). The **SQL result pane** runs arbitrary queries (joins, expressions) with no
  single target table, so it keeps CSV/JSON only. The static/mock path has no copy items at all.
- **MongoDB: `insertOne` per document.** A Mongo table card reuses `queryPreview("mongodb").insert`
  to emit `db.<coll>.insertOne({ ... })` per row, under an engine-aware label (**Copy insert**);
  SQL engines label it **Copy SQL**.
- **Reuses the engine seam.** All quoting (`"ident"` PG/SQLite, `` `ident` `` MySQL), schema
  qualification, and literal escaping (`'` doubled, `null` -> `NULL`) come from the existing
  `queryPreview` strategy - no new per-engine branching.

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | A pure `rowsToInsertSql(preview, table, columns, rows)` returns one statement per row, each built via `preview.insert(table, values)` with a trailing `;`, statements newline-joined; every column is included in each row's value object (column order preserved) | Must |
| AC-002 | For a Postgres/SQLite preview the output quotes identifiers with double-quotes and, when the preview was built with a schema, qualifies the table as `"schema"."table"`; for a MySQL preview identifiers use backticks | Must |
| AC-003 | Cell values are escaped by the preview's SQL-literal rule: a `null` cell becomes `NULL` (unquoted), a string is single-quoted with embedded `'` doubled | Must |
| AC-004 | For a MongoDB preview `rowsToInsertSql` emits `db.<coll>.insertOne({ ... });` per row (via `queryPreview("mongodb").insert`), one per document, newline-joined | Must |
| AC-005 | `DataGrid` renders a **Copy SQL** / **Copy insert** row-context-menu item ONLY when an `onCopySql` prop is supplied; the SQL result pane and the static/mock path (no `onCopySql`) show no such item | Must |
| AC-006 | The Copy SQL item acts on the **selection the user clicked into**: if the right-clicked row is part of the current multi-selection it copies the whole selection, else just that one row; a multi-row target renders the ` (N rows)` suffix, mirroring Copy CSV/JSON | Must |
| AC-007 | Selecting Copy SQL writes the built statements to the clipboard and fires a success toast `Copied N row(s) as SQL`; a clipboard failure fires the error toast `Could not copy to clipboard` (no throw) | Must |
| AC-008 | The menu label is engine-aware: **Copy SQL** for SQL engines, **Copy insert** for MongoDB | Must |
| AC-009 | `npm run lint`, `npm run typecheck`, and `npm test` all exit 0 (no backend/Rust change in this feature) | Must |

## 3. User Test Cases

- TC-001 (happy, PG): connect a Postgres db, open a table, select 2 rows, right-click -> **Copy SQL (2 rows)** -> clipboard holds two `INSERT INTO "public"."<table>" (...) VALUES (...);` lines, success toast shows "Copied 2 row(s) as SQL". Maps to: AC-001, AC-002, AC-006, AC-007.
- TC-002 (happy, single): right-click a single unselected row -> **Copy SQL** (no suffix) -> clipboard holds exactly one INSERT for that row. Maps to: AC-005, AC-006.
- TC-003 (edge, null + quote): a row with a `NULL` cell and a value containing `'` -> the copied SQL renders `NULL` unquoted and doubles the embedded quote. Maps to: AC-003.
- TC-004 (engine, MySQL): a MySQL table card -> copied SQL quotes identifiers with backticks. Maps to: AC-002.
- TC-005 (engine, Mongo): a MongoDB collection card -> the item reads **Copy insert** and the clipboard holds `db.<coll>.insertOne({ ... });` per document. Maps to: AC-004, AC-008.
- TC-006 (read-only pane): the SQL result grid's row menu shows Copy CSV / Copy JSON but NOT Copy SQL. Maps to: AC-005.

## 4. Data Model

No new persisted state, no IPC, no backend change. Reuses:
- `QueryPreview.insert(table, values: Record<string, Cell>): string` (engine-aware, schema-qualified).
- `DataGrid` row context menu + selection target rule (already used by Copy CSV/JSON).

New pure function `rowsToInsertSql(preview: QueryPreview, table: string, columns: string[], rows: Cell[][]): string` in `query-preview.ts` (co-located with the `insert` strategy it composes).

## 5. Edge Cases

- **Empty selection / no rows:** the menu item only renders on a row context menu; target is always >= 1 row. `rowsToInsertSql` of an empty rows array returns `""` (guarded, but not user-reachable).
- **NULL cell:** rendered `NULL` (unquoted) by `sqlLiteral`.
- **Embedded single quote:** doubled by `sqlLiteral`.
- **Structured cell (jsonb text):** copied verbatim as a single-quoted string literal (same as the existing insert preview - no re-serialization).
- **Clipboard denied:** `.writeText` rejection is caught -> error toast, never throws.
- **Draft (unsaved insert) row selected:** copyable as an INSERT like any other grid row (it indexes into the same `gridRows` array the grid renders).

## 6. Dependencies

None. Frontend-only. Builds on the existing `queryPreview` strategy and the `DataGrid` row menu.
