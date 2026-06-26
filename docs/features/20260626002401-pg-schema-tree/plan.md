# Postgres schema in the sidebar tree - PLAN

Spec: `docs/features/20260626002401-pg-schema-tree/spec.md`. Branch: `20260626002401-pg-schema-tree`.

Coverage threshold: none (no `thresholds` in vitest.config / package.json).

> **Post-implementation revision (0.2.0):** the sidebar render below was first built as a nested
> `Connection > Schema > Table` tree (`groupBySchema` + a `SchemaRow`). User feedback dropped that
> for a **flat** render - schema-qualified leaves (`schema.table`) when a database spans >1 schema,
> bare names otherwise (`isMultiSchema` + a `tableLabel` passed to `TableRow`; no `SchemaRow`, no
> synthetic schema id). Autocomplete was also fixed to a nested `schema->table->columns` namespace
> with `defaultSchema=public`. Slice A/B (backend + addressing) are unchanged. See the spec
> revision history + ADR.

## Chosen approach

Two key design choices (both reduce churn vs. the naive read of the spec):

1. **Render-derived schema label, not a persisted `SchemaNode`.** `TableNode` gains
   `schema: string | null`. The sidebar `DatabaseRow` renders its existing `node.tables` flat; when
   the database spans >1 distinct schema (`isMultiSchema`) each leaf is labelled `schema.table`,
   otherwise the bare name (MySQL/SQLite + single-schema Postgres). This leaves `indexNodes`,
   `indexTableParents`, `replaceDatabaseTables`, `DatabaseNode` shape, and the whole grid path
   untouched - the tree data model is still `Database > Table` (flat list with a tag), only the
   leaf *label* varies. No synthetic schema-row id, no new `expandedIds` entry.

2. **Schema-qualified addressing via an optional `schema` arg threaded through the existing
   commands.** No new commands. `TableRef { schema, name }` replaces the bare `String` catalog
   payload; `TableNode` carries `schema`; the three table commands (`fetch_table`, `count_table`,
   `apply_mutations`) take `schema: Option<String>`; the Rust query builders qualify the table when
   a schema is present and pin introspection to that schema.

Built backend-up so each layer is independently testable without a live DB.

### Slice A - Rust: TableRef catalog + qualified addressing (AC-001/002/003/007/008/009/010)

`src-tauri/src/db.rs`:

- New `#[derive(Serialize)] TableRef { schema: Option<String>, name: String }` (camelCase).
- `catalog_query` Postgres variant selects `table_schema::text, table_name::text` ordered by
  `table_schema, table_name`; MySQL/SQLite unchanged (one column). Split the row-mapping in
  `open_and_catalog`: Postgres reads two columns -> `schema: Some`, others read one ->
  `schema: None`. `connect_database`/`open_and_catalog` return `Vec<TableRef>`.
- New helper `qualified_table(engine, schema: Option<&str>, table) -> String`:
  `Some` -> `quote_identifier(engine, schema) + "." + quote_identifier(engine, table)`;
  `None` -> `quote_identifier(engine, table)`. Thread `schema` into `build_rows_query`,
  `build_count_query`, `build_update_query_value`, `build_insert_query`, `build_delete_query`
  (replace their internal `quote_identifier(engine, table)` with `qualified_table`).
- Introspection (`columns_query`, `column_types_query`, `nullable_query`, `primary_key_query`):
  add a Postgres **schema-pinned** form. Cleanest: change each from a `&'static str` to a builder
  `fn xxx_query(engine, has_schema: bool) -> String` (or a `Cow`), where the Postgres branch emits
  `AND table_schema = $2` when `has_schema` (and the caller binds schema as the 2nd param) and the
  current `NOT IN (...)` filter otherwise. MySQL keeps `table_schema = DATABASE()` (schema ignored);
  SQLite `pragma_table_info` (no schema concept). PG primary-key query uses `$1::regclass` - qualify
  the regclass literal as `schema.table` when schema present (regclass parses the qualified name),
  so no `$2` needed there.
- `read_table_rows`, `count_table_rows`, `fetch_table_rows`, `apply_row_mutations`,
  `apply_mutations`, `build_mutation` gain a `schema: Option<&str>` / `Option<String>` param,
  threaded to the builders + bound where the query has a schema placeholder.
- `fetch_schema` / `schema_query` / `group_schema` / `TableSchema`: `TableSchema` gains
  `schema: Option<String>`; Postgres `schema_query` selects `table_schema` as a leading column and
  `group_schema` keys groups by `(schema, table)` and stamps each `TableSchema.schema`. MySQL/SQLite
  select no schema -> `None`.

`src-tauri/src/lib.rs`:

- `connect_database` -> `Result<Vec<TableRef>, String>` (import `TableRef`).
- `fetch_table`, `count_table`, `apply_mutations` gain `schema: Option<String>`, passed through.
- No new handlers; signatures only.

### Slice B - Frontend model + wire (AC-003/011)

`src/lib/workspace/model.ts`:

- `TableNode` gains `schema: string | null`.
- `TableSchema` gains `schema: string | null` (autocomplete carries it).
- New `export type TableRef = { schema: string | null; name: string }`.
- No `SchemaNode` in `TreeNode` (render-derived). `TreeNode` union unchanged.

`src/lib/tauri.ts`:

- `connectDatabase` -> `Promise<TableRef[]>`.
- `fetchTable`/`countTable` add `schema?: string | null` (sent as `schema: ... ?? null`).
- `applyRowMutations(connectionId, schema, table, mutations)` - add `schema` param.
- `fetchSchema` return type already `TableSchema[]` (now schema-bearing).

`src/components/workspace/workspace-context.tsx`:

- `tablesFromNames(databaseId, refs: TableRef[])` builds `TableNode` with `schema` + id
  `${databaseId}::${schema ?? ""}::${name}` (schema in the id so collisions are distinct keys).
- `setDatabaseTables(id, refs: TableRef[])` signature change (was `string[]`).
- `indexNodes` / `indexTableParents` unchanged (still walk `node.tables`).

`src/components/workspace/use-connection.ts`:

- `connect`: `result.value` is now `TableRef[]`; `setDatabaseTables(id, refs)`;
  toast count = `refs.length`.

### Slice C - Sidebar render: schema grouping (AC-004/005/006)

`src/components/workspace/tree-row.tsx`:

- In `DatabaseRow`, when expanded+connected, group `node.tables` by `schema`:
  - all `schema === null` -> render `TableRow`s directly (flat, unchanged).
  - else -> for each distinct schema (sorted), render a **`SchemaRow`** (new local component:
    Folder-like chevron, `Folder`/`Database`-style icon, synthetic id
    `${node.id}::schema::${name}`, toggles via `toggleExpand`, indents children +1) that renders
    its `TableRow`s when expanded.
- `SchemaRow` is local to tree-row (single use) per the no-helper-unless-reused rule applied to
  components too; mirrors `FolderRow` minus context menu.

### Slice D - Table commands pass schema (AC-007/009/010)

`src/components/workspace/table-card.tsx`:

- `TableCard` already resolves `activeNode` (a `TableNode`) -> read `activeNode.schema`. Thread it
  into `TableCardInner` props (`schema: string | null`) alongside `tableName`/`connectionId`.
- `fetchTable(connectionId, tableName, { ..., schema })`,
  `countTable(connectionId, tableName, filter, schema)` (or via opts),
  `applyRowMutations(connectionId, schema, tableName, payload)`.
- `fetchSql(...)` display string (History): qualify with `schema.` prefix when present so the
  logged SQL matches what ran. Add `tableId`/`queryKey` already unique via id; include schema in
  the key only if needed (id already carries it).
- Autocomplete (`databaseSchemas`) unchanged in shape; `sql-tab.tsx`/`sql-editor.tsx` keep reading
  `TableSchema[]` (now schema-bearing - completion can show `schema.table` later, not required by
  this feature beyond carrying the field; AC-011 satisfied by the field existing on the payload).

## Files to change

Backend:
- `src-tauri/src/db.rs` - `TableRef`; PG catalog two-column + ordered; `qualified_table`;
  schema-param on row/count/mutation builders + introspection query builders; `read_table_rows`,
  `count_table_rows`, `apply_mutations`, `build_mutation` thread schema; `TableSchema.schema` +
  `schema_query`/`group_schema`; new + updated tests.
- `src-tauri/src/lib.rs` - `connect_database` -> `Vec<TableRef>`; `schema` param on `fetch_table`,
  `count_table`, `apply_mutations`.

Frontend:
- `src/lib/workspace/model.ts` - `TableNode.schema`, `TableSchema.schema`, `TableRef`.
- `src/lib/tauri.ts` - `connectDatabase: TableRef[]`; `schema` on `fetchTable`/`countTable`/
  `applyRowMutations`.
- `src/components/workspace/workspace-context.tsx` - `tablesFromNames`/`setDatabaseTables` take
  `TableRef[]`; ids carry schema.
- `src/components/workspace/use-connection.ts` - `TableRef[]` handling.
- `src/components/workspace/tree-row.tsx` - `SchemaRow` + grouping in `DatabaseRow`.
- `src/components/workspace/table-card.tsx` - thread `schema` into the three commands + History SQL.

Tests:
- Rust (db.rs): PG catalog returns `(schema, table)` + ordering (AC-001); MySQL/SQLite one-column
  unchanged (AC-002); `qualified_table` PG `"s"."t"` vs `None` `"t"` + embedded-quote doubling
  (E-4, TC-005); each builder qualifies when schema present (rows/count/update/insert/delete);
  introspection query adds `table_schema = $2` only with schema (AC-007/008); PG pk regclass
  qualified; `group_schema` keys by (schema,table) + stamps schema (AC-011); MySQL/SQLite builders
  unchanged (regression).
- Frontend: `tablesFromNames` builds schema-bearing ids; sidebar renders schema rows for PG refs
  and flat list for null-schema refs (TC-001/003); schema row expand toggles `expandedIds`
  (TC-004); table-card passes `schema` to `fetchTable`/`countTable`/`applyRowMutations` (TC-002,
  AC-009/010). Update existing suites for the new signatures (`connectDatabase` payload shape,
  `setDatabaseTables`, command call args, `sidebar-tree`).

## Edge cases handled (from spec)

E-1 name collision -> schema-bearing TableNode ids + qualified queries keep them independent.
E-2 MySQL/SQLite -> `schema: null` end-to-end; flat render; bare-name queries unchanged.
E-3 empty schema -> group row with empty child list (only arises if a schema has 0 base tables;
won't appear since catalog only lists tables - documented, no special handling). E-4 quoted
identifiers -> `quote_identifier` doubles quotes for both parts. E-6 search_path -> PG introspection
now schema-pinned, not search_path-dependent.

## Tests to write (>= one per AC)

Mapped above; minimum one non-tautological test per AC-001..011, AC-012 = the four gate commands.

## Acceptance verification

Verifier subagent (fresh context): `npm test`, `cargo test` (in `src-tauri`), `npm run lint`,
`npm run typecheck`; confirms each AC has a real test; checks UI states + edge cases. Live smoke
(user): connect a multi-schema Postgres -> schema rows appear; open `public.x` and `analytics.x`
(same name) -> independent rows; edit one -> other untouched; connect MySQL/SQLite -> flat, browse
+ edit still work.

## Risks

- **Introspection query signature churn** (`&'static str` -> builder `String`): wide but mechanical;
  one pass, lean on tests. Mitigate by keeping the non-schema branch byte-identical so MySQL/SQLite
  + non-schema Postgres regress cleanly.
- **PG regclass qualification**: `$1::regclass` with a qualified `schema.table` literal must parse;
  verify the bound value is the qualified string (`analytics.users`), not pre-quoted - regclass
  wants the SQL name. Test the bound value shape.
- **No live DB in CI**: query-building + grouping are pure-unit-tested; real multi-schema behavior is
  the user's live smoke (same constraint as every prior backend slice).
- **Render-grouping vs persisted node**: a table whose `schema` is null mixed with non-null in one
  DB would render some flat + some grouped - can't happen (a connection is one engine), but the
  group fn must treat "any non-null" as "group all" and never silently drop a null-schema table.
