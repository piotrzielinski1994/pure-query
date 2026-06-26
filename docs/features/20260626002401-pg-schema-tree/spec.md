# Spec: Postgres schema in the sidebar tree

**Version:** 0.2.0
**Created:** 2026-06-26
**Status:** Implemented

## Revision history

- **0.2.0** - **Schema render is FLAT, not a nested level.** User feedback after trying the nested
  `Connection > Schema > Table` tree: the extra expand level was noise. Replaced with flat,
  schema-qualified table leaves - a multi-schema Postgres database shows `schema.table` leaves
  directly under the connection; a single-schema database (and MySQL/SQLite) shows bare table
  names. The backend (qualified addressing, `TableRef`, schema-pinned introspection) is unchanged
  - this is a sidebar-rendering change only. Also fixed the SQL autocomplete: it now builds a
  nested `schema -> table -> columns` namespace with `defaultSchema = public`, so completion offers
  the schema before the table and `vehicle_listing.users` no longer overwrites `public.users` (the
  prior flat name-keyed map collided and suggested an unqualified table that failed to resolve).
- **0.1.0** - Initial: nested `Connection > Schema > Table` tree + full schema-qualified addressing.

## 1. Overview

Originally the sidebar tree is flat: a connected database lists its tables directly
(`Connection > Table`). For Postgres this is wrong - a Postgres database has many **schemas**
(`public`, plus any user schema), and tables live inside them. The original catalog query flattened
every user schema into one table list, so two tables that share a name across schemas
(`public.users` and `analytics.users`) collapsed into one ambiguous leaf, and every downstream
command (fetch rows, columns, PK, edits, autocomplete) addressed a table by its **bare name** -
which silently hit whichever one the server's `search_path` resolved first.

This feature makes table addressing **schema-qualified end-to-end** so the right table is always
the target, and surfaces the schema in the sidebar **as a flat qualifier** (not a nested level).

- **Postgres:** the catalog returns `(schema, table)`; tables are addressed as `("schema", "table")`
  in every table command. In the sidebar, a database that spans **multiple schemas** shows flat
  `schema.table` leaves; a **single-schema** database shows bare table names.
- **MySQL / SQLite:** unchanged. They stay flat with bare names; MySQL's "schema" is its database
  (already the connection), SQLite has no schemas. Their table refs carry no schema and every query
  keeps using the bare name.

### User Story

As a developer browsing a Postgres database, I want each table opened/edited by its real
`schema.table` identity (and labelled that way in the sidebar when schemas would otherwise
collide), so multi-schema databases are navigable and I never read or edit the wrong table when two
schemas share a name.

### Approved decisions

- **Postgres-only schema awareness** (not uniform across engines, not cross-database browse).
- **Full schema-qualified addressing** (not display-only labelling). `(schema, table)` flows through
  catalog, row fetch, column/PK/type introspection, row mutations, and autocomplete.
- **Flat sidebar render** (0.2.0, supersedes the nested tree): schema is a leaf-label qualifier when
  a database spans >1 schema, never a separate expandable row.

### Approved layout (ASCII)

```
v  prod (Postgres, multi-schema) (o)       <- connected
     public.orders                         <- flat, schema-qualified
     public.users
     analytics.users                       <- distinct from public.users
     analytics.events
v  app (Postgres, single-schema) (o)
     users                                 <- bare name (only `public`)
     products
v  shop (MySQL)                  (o)
     products                              <- flat, no schema level
     customers
   local.sqlite                 (o)
     migrations                            <- flat, no schema level
```

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | (Rust) The Postgres catalog query returns `(schema, table)` pairs for every base table in every non-system schema (`pg_catalog`, `information_schema` excluded), ordered by schema then table | Must |
| AC-002 | (Rust) MySQL and SQLite catalog queries are unchanged and their table refs carry **no** schema | Must |
| AC-003 | `connect_database` returns a list of table refs `{ schema: string \| null, name: string }` (was `string[]`); the frontend builds the tree from these | Must |
| AC-004 | For a Postgres connection spanning **multiple schemas**, the sidebar renders flat, schema-qualified table leaves (`schema.table`) directly under the database (no nested schema row); a **single-schema** Postgres database renders bare table names | Must |
| AC-005 | For MySQL / SQLite connections, the sidebar renders bare table names (`Database > Table`) - no schema qualifier | Must |
| AC-006 | The flat render adds no new expand level or persisted state - table leaves sit directly under the database row, ordered by the catalog (schema then table) | Must |
| AC-007 | (Rust) When a `schema` is supplied, every table command qualifies the table as `"schema"."table"` (Postgres quoting): row fetch, count, column list, column types, nullability, primary key, and all row mutations (cell update / insert / delete) | Must |
| AC-008 | (Rust) When no `schema` is supplied (MySQL / SQLite), every table command behaves exactly as today (bare quoted name, schema-scoped introspection) | Must |
| AC-009 | Opening a Postgres table fetches **that schema's** table (introspection filtered by `table_schema = $schema`), so `public.users` and `analytics.users` are independent | Must |
| AC-010 | Editing (cell / insert / delete) a Postgres table targets the schema-qualified table | Must |
| AC-011 | Autocomplete schema data (`fetch_schema`) carries each table's Postgres schema so completion is unambiguous; MySQL/SQLite unchanged | Should |
| AC-012 | `npm run lint`, `npm run typecheck`, `npm test`, and `cargo test` all exit 0 | Must |

## 3. User Test Cases

### TC-001 (Postgres happy path): Multi-schema flat labels
Connect a Postgres database with tables in `public` and `analytics`.
**Expected:** sidebar lists flat leaves `public.orders`, `analytics.events`, ... directly under the database; no schema row to expand. **Maps to:** AC-001, AC-003, AC-004.

### TC-002 (name collision): Same table name in two schemas
`public.users` and `analytics.users` both exist; open each.
**Expected:** two distinct leaves `public.users` / `analytics.users`; each opens its own rows/columns; editing one never touches the other. **Maps to:** AC-004, AC-007, AC-009, AC-010.

### TC-003 (MySQL/SQLite unchanged): Bare names
Connect a MySQL database and a SQLite file.
**Expected:** tables listed directly under the connection with bare names; open/browse/edit work as before. **Maps to:** AC-002, AC-005, AC-008.

### TC-004 (single-schema): Bare names on Postgres
Connect a Postgres database whose tables are all in `public`.
**Expected:** bare table names (no `public.` prefix). **Maps to:** AC-004.

### TC-005 (Rust): Qualified vs bare query building
Unit-test the query builders with and without a schema.
**Expected:** with schema -> `"schema"."table"`; without -> `"table"`; introspection adds `table_schema = $schema` only when schema present. **Maps to:** AC-007, AC-008.

## 4. UI States

| State | Behavior |
| ----- | -------- |
| Postgres connected, multi-schema | Database expands directly to flat `schema.table` leaves |
| Postgres connected, single-schema | Database expands directly to bare table-name leaves |
| MySQL/SQLite connected | Database expands directly to bare table-name leaves |
| Collapsed database | Table leaves hidden; chevron right |
| Expanded database | Table leaves shown; chevron down |

## 5. Data Model

### Backend (`db.rs`)

- New serde struct `TableRef { schema: Option<String>, name: String }` (camelCase: `schema`,
  `name`). `connect_database` returns `Vec<TableRef>`.
  - Postgres catalog query selects `table_schema, table_name` -> `schema: Some(..)`.
  - MySQL / SQLite catalog queries unchanged -> `schema: None`.
- Table-addressing commands gain an optional `schema: Option<String>` parameter:
  `fetch_table`, `count_table`, `apply_mutations`.
- A qualifier helper builds the table reference: `Some(schema)` ->
  `quote_identifier(engine, schema) + "." + quote_identifier(engine, table)`; `None` ->
  `quote_identifier(engine, table)`. Used by `build_rows_query`, `build_count_query`,
  `build_update_query_value`, `build_insert_query`, `build_delete_query`.
- Introspection queries (`columns_query`, `column_types_query`, `nullable_query`,
  `primary_key_query`) gain a schema-filtered Postgres variant: when a schema is supplied add
  `AND table_schema = $2` (and bind it); when not, keep today's
  `NOT IN ('pg_catalog','information_schema')`. MySQL/SQLite ignore schema (always None).
- `fetch_schema` (autocomplete) returns each table's schema. `TableSchema` gains
  `schema: Option<String>`; `schema_query`/`group_schema` carry it for Postgres.

### Frontend (`model.ts`)

- `TableNode` gains `schema: string | null` so it carries its own schema for command calls + the
  sidebar label. **No** `SchemaNode`, no `TreeNode` change - the data model stays `Database > Table`.
- The sidebar (`tree-row.tsx`) renders flat: `isMultiSchema(tables)` (>1 distinct non-null schema)
  -> each leaf labelled `schema.table`; otherwise bare `table`. No new expandable row, no extra
  `expandedIds` entry.
- Autocomplete (`sql-editor.tsx`) builds a nested `schema -> table -> columns` namespace for
  `schemaCompletionSource` with `defaultSchema = "public"` when any table carries a schema;
  otherwise the flat `table -> columns` map. (A flat name-keyed map collides when two schemas share
  a table name.)
- `tauri.ts`: `connectDatabase` returns `TableRef[]`; `fetchTable`/`countTable`/`applyRowMutations`
  take an optional `schema`.

### Wire contract (`lib.rs` + `tauri.ts`)

- `connect_database` -> `Result<Vec<TableRef>, String>`.
- `fetch_table` / `count_table` / `apply_mutations` accept `schema: Option<String>`.
- `fetch_schema` -> `Vec<TableSchema>` with `schema` populated for Postgres.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | Two schemas share a table name | Distinct `schema.table` leaves; qualified addressing keeps them independent (AC-009); autocomplete nests them under their schema |
| E-2 | MySQL/SQLite (no schemas) | `schema: None` end-to-end; bare-name leaves; bare-name queries unchanged |
| E-3 | Single-schema Postgres (only `public`) | Bare table-name leaves (no `public.` prefix); `isMultiSchema` is false |
| E-4 | Schema/table identifier with quotes | `quote_identifier` doubles embedded quotes for both parts |
| E-5 | Postgres table opened before schema known | Not possible - connect returns schema with the catalog before any table opens |
| E-6 | `search_path`-dependent old behavior | Removed for Postgres: introspection is now schema-pinned, not search_path-pinned |

## 7. Dependencies

- No new crates or npm packages. Pure extension of existing `sqlx`/Tauri/React surface.
- Requires a reachable multi-schema Postgres for end-to-end manual verification (unit tests cover
  query building + tree grouping without a live DB).

## 8. Out of Scope

- Uniform schema level for MySQL/SQLite.
- Cross-database browse (listing other databases on a MySQL/Postgres server as schemas).
- Views grouped by schema (views fetch is still mock/unchanged).
- Schema-level context-menu actions (create/drop schema), schema search/filter.
- Changing the held-pool / connection model.
