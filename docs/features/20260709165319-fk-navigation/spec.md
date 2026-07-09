# F13 - FK navigation

Jump from a foreign-key value in the data grid to the referenced row in the target table.

**Status: implemented** (branch `20260709165319-fk-navigation`; NOT yet merged/pushed - awaiting
review). FE 1056 tests pass, backend 151 pass, tsc + lint clean. Post-review additions: composite-FK
cartesian bug fix (AC-012), second FK target in the seed (AC-010), back/forward history (AC-011).

## AC traceability

| AC | Test |
| -- | ---- |
| AC-001 | `fk-navigation.test.tsx` "should show a Go to item for a row with a non-null foreign-key value" |
| AC-002 | `fk-navigation.test.tsx` "should open the customers tab and apply the pinning filter when the Go to item is selected" |
| AC-003 | `foreign-key-nav.test.ts` "should return one entry listing both pairs for a composite FK" + `query-preview.test.ts` "should AND-join a composite referenced-column fragment" |
| AC-004 | `fk-navigation.test.tsx` "should show no Go to item for a row with a null foreign-key value" + `foreign-key-nav.test.ts` "should exclude an FK if its local value is null" |
| AC-005 | `fk-navigation.test.tsx` "should mark the foreign-key column with FK in the header" |
| AC-006 | `fk-navigation.test.tsx` "should error-toast and not navigate when the target table is not loaded" |
| AC-007 | `fk-navigation.test.tsx` "should show no Go to item and no FK marker for a MongoDB collection" |
| AC-008 | `db.rs` `should_build_the_postgres_foreign_key_query_over_information_schema` / MySQL / SQLite + `should_fold_composite_foreign_key_rows_...` + `foreign-key-nav.test.ts` target-id tests |
| AC-009 | `query-preview.test.ts` "should double an embedded single quote in the value" + "should backtick-quote identifiers for a mysql fragment" |
| AC-010 | `foreign-key-nav.test.ts` "should return one entry per foreign key when a row has two FKs to two tables" (+ seed: `shipment_items` FKs to `products` + `warehouses`) |
| AC-011 | `fk-nav-history.test.tsx` back-disabled / back-returns-to-source / forward-reapplies / forward-disabled + `nav-history.test.ts` (pure reducer, 9 cases) |
| AC-012 | `db.rs` `should_build_the_postgres_foreign_key_query_over_information_schema` (must not use `constraint_column_usage`, must correlate by `position_in_unique_constraint`) |
| AC-013 | `fk-navigation.test.tsx` "should render a non-null foreign-key value as a link" / "should not render a link for a null foreign-key value" / "should navigate ... when the link is Cmd/Ctrl-clicked" / "should not navigate on a plain click of an FK link" |

## Overview

When browsing a live SQL table, a row's foreign-key columns point at rows in other tables. Today
there is no way to follow that link - you must manually open the target table and type a filter.
This feature adds a **right-click "Go to `<referencedTable>` (`col = value`)"** action per outbound
FK on a row: it opens (or re-activates) the target table's content tab and applies a WHERE filter
pinning the referenced row(s). FK columns are also marked `FK` in the grid header so the link is
discoverable.

Navigation is tracked in a back/forward history (browser-style `(tableId, filter)` stack): Back
returns to the source table + its filter, Forward re-applies the jump. Buttons live in the content
header + `Mod+[` / `Mod+]` shortcuts. (This reverses the initial "rely on the tab bar" plan after
user feedback - see adr.md.)

**SQL engines only.** MongoDB has no foreign keys (`foreign_keys` is always empty), so no FK items
appear there.

## Non-goals (YAGNI)

- Following a FK from a cell click or a clickable-link cell (right-click menu only).
- Reverse navigation (find rows that reference THIS row).
- Persisting the navigation history across launches (in-memory only).
- MongoDB `$lookup`/manual-reference navigation.

## Acceptance Criteria

- AC-001: A right-click on a live SQL table row shows one "Go to `<referencedTable>` (`col = value`)"
  menu item per outbound foreign key whose local column value(s) are all non-null.
- AC-002: Selecting an FK item opens (or re-activates) the referenced table's content tab AND applies
  a WHERE filter matching the referenced row by the FK's referenced column(s) = the source row's FK
  value(s).
- AC-003: A composite foreign key (multiple columns) produces ONE menu item and a filter joining every
  `referencedColumn = value` pair with `AND`.
- AC-004: An FK whose local column value is `NULL` produces NO menu item (a null FK references nothing).
- AC-005: Foreign-key local columns are marked `FK` in the grid column header (alongside `PK`/`NN`).
- AC-006: Selecting an FK whose target table is not in the loaded catalog (e.g. references a table not
  introspected) shows an error toast and performs no navigation - it never crashes.
- AC-007: MongoDB tables show NO FK menu items and NO `FK` marker (foreign keys are always empty).
- AC-008: The backend `ForeignKey` (Rust struct + TS type) carries the referenced table's schema
  (`referencedSchema`), populated for Postgres and `null` for MySQL/SQLite, so a cross-schema Postgres
  FK resolves to the correct target node.
- AC-009: The filter fragment is built with engine-correct identifier quoting and value escaping (a
  value containing a quote does not break the SQL).
- AC-010: A row with two foreign keys to two different tables shows two separate "Go to" items, each
  navigating to its own target.
- AC-011: After an FK jump, Back returns to the source table (restoring its tab + filter) and Forward
  re-applies the jump; Back is disabled before any navigation and Forward at the newest entry.
- AC-012: A composite foreign key's PG introspection does not fan into a cartesian product - the "Go
  to" label and filter list each referenced column exactly once (no duplicated pairs).
- AC-013: A foreign-key cell with a non-null value renders as a link (underlined, accent color); a
  Cmd/Ctrl+click on it navigates to the referenced table (same as the menu item), a plain click does
  not navigate (it selects the row); a null FK value / non-FK cell is not a link.

## Test Cases

- TC-001 (happy path, AC-001/002): live PG table `orders` with FK `customer_id -> customers.id`;
  right-click a row where `customer_id = 42` -> "Go to customers (customer_id = 42)"; select ->
  `customers` tab active + filter `"id" = '42'`. Maps to AC-001, AC-002.
- TC-002 (composite, AC-003): FK `(a, b) -> t.(x, y)` on a row with `a=1, b=2` -> one item; filter
  `"x" = '1' AND "y" = '2'`. Maps to AC-003.
- TC-003 (null FK, AC-004): row with `customer_id = NULL` -> no "Go to" item for that FK. Maps to AC-004.
- TC-004 (marker, AC-005): a column that is an FK renders `FK` in its header subtext. Maps to AC-005.
- TC-005 (target not loaded, AC-006): FK references a table absent from `nodesById` -> error toast, no
  tab opened, no filter set. Maps to AC-006.
- TC-006 (mongo, AC-007): a MongoDB collection card shows no FK item and no `FK` marker. Maps to AC-007.
- TC-007 (backend PG schema, AC-008): `foreign_key_query(Postgres, _)` selects the referenced schema;
  `fold_foreign_keys` carries it onto each grouped FK. Maps to AC-008.
- TC-008 (backend MySQL/SQLite null schema, AC-008): `foreign_key_query(Mysql/Sqlite, _)` yields a
  null referenced schema so the target node id uses the schemaless form. Maps to AC-008.
- TC-009 (quoting/escaping, AC-009): `fkFilter` on a value `O'Brien` -> `"col" = 'O''Brien'`; MySQL
  uses backtick identifiers. Maps to AC-009.
- TC-010 (composite id resolution, AC-002): the resolved target tableId is
  `${databaseId}::${referencedSchema ?? ""}::${referencedTable}`. Maps to AC-002.

## UI States

| State                    | Behavior                                                                    |
| ------------------------ | --------------------------------------------------------------------------- |
| Row has navigable FK     | Row menu shows "Go to <refTable> ..." item(s); FK cells render as Cmd/Ctrl+click links |
| Row FK value is null     | That FK contributes no menu item; the cell is plain text (not a link)       |
| Table has no FKs / Mongo | No FK items, no `FK` header marker                                          |
| Target table not loaded  | Error toast "Table '<name>' is not loaded"; no navigation                   |
| Target tab already open  | Re-activated + filter replaced (navigation intent overrides prior filter)   |

### Row context menu (with FK items)

```
+-- row right-click ---------------+
| Edit document                    |   (mongo only)
| Clone                            |
| Copy CSV / Copy JSON / Copy SQL  |
+----------------------------------+
| Go to customers (customer_id=42) |   <- one per navigable outbound FK
| Go to regions (region_id=7)      |
+----------------------------------+
| Delete                           |
+----------------------------------+
```

### Grid header (FK marker)

```
+------------------+------------------+
| customer_id      | total            |
| int8 FK          | numeric NN       |   <- "FK" alongside PK/NN
+------------------+------------------+
```

## Data model

- `ForeignKey` (frontend `src/lib/workspace/model.ts`, backend `src-tauri/src/db.rs`): add
  `referencedSchema: string | null` (`referenced_schema: Option<String>` in Rust).
- No new persisted state. Navigation reuses the in-memory `tableFilters` map + `openNode`.

## Edge cases

1. Null FK value -> no item (AC-004).
2. Composite FK -> single item, AND-joined filter (AC-003).
3. Self-referential FK -> target = same table, re-applies filter (valid, refetches).
4. Target table not in catalog -> error toast, no-op (AC-006).
5. Value with a single quote -> escaped by `sqlLiteral` (AC-009).
6. Cross-schema Postgres FK -> resolved via `referencedSchema` (AC-008).
7. Read-only database -> navigation is a read (open + filter), allowed.
8. Target tab has unsaved pending edits -> filter change refetches (rowIndex edits go stale); a known,
   accepted minor gap (FK targets rarely carry unsaved edits; matches the direct-set behaviour the
   provider already exposes).

## Dependencies

None. Builds on existing `TableStructure.foreignKeys` introspection (F6), `tableFilters`/`openNode`
(WorkspaceProvider), and the shared `DataGrid` row context menu.

## Known gaps (documented, not addressed)

- Same-name-different-schema FK targets on MySQL (single-schema model) are not a concern (MySQL nodes
  are schemaless); on Postgres the added `referencedSchema` disambiguates them.
- Navigating does not prompt to discard unsaved edits on the target table (edge case 8).
