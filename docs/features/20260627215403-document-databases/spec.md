# F-Mongo - Document databases (MongoDB)

Feature folder: `docs/features/20260627215403-document-databases/`
Branch: `20260627215403-document-databases`
Source: user request ("Dodaj obsluge dokumentowych baz" + add a MongoDB to docker-compose)

## Overview

Add MongoDB as the first **document** database engine, alongside the three SQL engines
(Postgres/MySQL/SQLite). This is the first engine the existing backend cannot serve: the whole
SQL path is `sqlx`'s `Any` driver, which has no MongoDB support. MongoDB therefore gets its own
backend module (`mongo.rs`, the official `mongodb` crate) with its own connection registry,
dispatched per connection id from `lib.rs`. The existing `db.rs` is untouched.

Crucially, the Mongo path **reuses the existing IPC result structs** (`TableRef`, `TableRows`,
`TableColumn`, `QueryOutcome`, `RowMutation`) so the frontend renders documents through the
**one** `DataGrid` unchanged - collections look like tables, documents like rows, top-level
fields like columns (DBeaver-style flatten). No second grid is forked (CLAUDE.md invariant).

Scope (user chose "full CRUD + query, one branch"): connect + list collections + browse
documents + JSON find/aggregate query + document CRUD (insert/update/delete + full-document
replace) + a seeded MongoDB in the docker test-stack.

## Why

MongoDB is the most common document database and the user asked for document-DB support
directly. It also forces the backend to stop assuming "a connection is a `sqlx` pool" and grow a
real **data-source dispatch** seam, which any future non-SQL engine (Redis, DynamoDB, ...) will
reuse.

## Acceptance criteria

### Connection
- AC-001: A user can pick **MongoDB** as the engine in the Settings tab "Type" select.
- AC-002: With MongoDB selected, the form shows Host / Port (default 27017) / Database / User /
  Password **plus** a "Connection string (URI)" field; a non-empty URI overrides the discrete
  fields at connect time.
- AC-003: With MongoDB selected, **Connect** is enabled when the URI is non-empty **or** (Host
  and Database are both non-empty).
- AC-004: Connecting a MongoDB database opens a real `mongodb` client to the chosen database and
  replaces that database's sidebar tables with the live **collection** list (flat - no schema
  level, like MySQL/SQLite).
- AC-005: A MongoDB connection config persists in `workspace.json` (host/port/database/user/
  password + optional uri) and restores on reload, like the other engines.

### Browse
- AC-006: Opening a collection fetches its first 200 documents and renders them in the **same
  `DataGrid`**: columns = the union of top-level field names sampled from the fetched page, with
  `_id` first; a nested object/array field is shown as compact JSON text in its cell; a field
  absent or null in a document shows `[NULL]`.
- AC-007: Each column header shows its BSON type label; the `_id` column carries the `PK` marker.
  Clicking a header sorts the whole collection server-side (asc -> desc -> none). The status bar
  shows `<loaded> of <total>` documents (unbounded count) and a **Load more** footer pages in the
  next documents (skip/limit), identical to the SQL table card.
- AC-008: The filter row for a collection accepts a **MongoDB find filter as JSON** (e.g.
  `{"age": {"$gt": 30}}`). Invalid JSON surfaces a clear error (no crash); a valid filter narrows
  both the document list and the total count.

### Query
- AC-009: A connected MongoDB database's card shows a **Query** tab (in place of the SQL tab): a
  collection picker, a Find/Aggregate mode toggle, and a JSON editor. **Find** (a JSON object
  filter) lists matching documents; **Aggregate** (a JSON array pipeline) runs `aggregate` and
  lists the resulting documents - both rendered through the identical `DataGrid` result pane.
- AC-010: For a MongoDB database the **Views** and **Script** sub-tabs are hidden; only **Query**
  and **Settings** show.

### CRUD
- AC-011: Editing a top-level **scalar** cell stages an update; on **Save** it issues
  `updateOne({_id}, {$set: {field: value}})` with the entered text parsed as a JSON literal
  (number / boolean / null / quoted-string inferred; bare text falls back to a string) so BSON
  types are preserved. The `_id` cell is not editable.
- AC-012: Adding a row stages a new document (`insertOne` on Save); deleting a row issues
  `deleteOne({_id})`. Pending Mongo changes flow through the same Changes-tab + Save/Discard
  pipeline as SQL tables.
- AC-013: A nested **object/array** cell is not inline-editable; the row's context menu **Edit
  document** opens a full-document JSON editor whose Save issues `replaceOne({_id}, document)`.

### Dispatch / infra
- AC-014: Every connection-addressed command (`disconnect`, `fetch_table`, `count_table`,
  `apply_mutations`, `execute_*`, `fetch_schema`) dispatches to the Mongo path when the
  connection id is a held Mongo client and to the SQL path otherwise; existing SQL behaviour and
  all current tests are unchanged.
- AC-015: The docker test-stack gains a seeded **mongo** service on a non-default host port, with
  collections exercising nested documents, arrays, and heterogeneous shapes; the test-stack
  README documents its credentials.

## Test cases

- TC-001 (AC-001/002, FE): select engine MongoDB -> form shows Host/Port/Database/User/Password
  + a Connection string field; default port is 27017. Maps to: AC-001, AC-002.
- TC-002 (AC-003, FE): MongoDB + empty URI + empty Host -> Connect disabled; Host+Database set ->
  enabled; URI set alone -> enabled. Maps to: AC-003.
- TC-003 (AC-005, FE): a MongoDB database round-trips through `mergeWorkspace`/`hydrate`/
  `dehydrate` keeping its fields + uri; a Postgres database keeps its network fields. Maps to:
  AC-005.
- TC-004 (AC-002, BE): `mongo_uri` for a fields config builds `mongodb://user:pass@host:port/db`
  (credentials percent-encoded); a config with an explicit uri returns that uri verbatim. Maps
  to: AC-002.
- TC-005 (AC-006, BE): flattening a set of sample documents yields the union of top-level keys
  with `_id` first; a nested object/array value becomes compact JSON text; a scalar becomes its
  JSON-literal text; a missing key becomes `None`. Maps to: AC-006.
- TC-006 (AC-007, BE): the per-column BSON type label is derived from the sampled value
  (objectId/string/int/double/bool/null/document/array/date), and `_id` is marked primary key.
  Maps to: AC-007.
- TC-007 (AC-008, BE): a valid JSON filter string parses to a BSON find document; an invalid JSON
  filter returns an `Err` (not a panic). Maps to: AC-008.
- TC-008 (AC-011, BE): a `cell` RowMutation for Mongo builds an `updateOne({_id}, {$set:{...}})`
  with the value parsed as a JSON literal (e.g. `42` -> int, `"x"` -> string, `null` -> null,
  `true` -> bool, bare `foo` -> string); an `_id` cell mutation is rejected. Maps to: AC-011.
- TC-009 (AC-012, BE): an `insert` RowMutation builds `insertOne(doc)` from the parsed values; a
  `delete` builds `deleteOne({_id})` with the `_id` resolved to ObjectId when it parses as one,
  else matched as the raw value. Maps to: AC-012.
- TC-010 (AC-013, BE): a `replace` RowMutation builds `replaceOne({_id}, document)` from the
  edited JSON document. Maps to: AC-013.
- TC-011 (AC-009, FE): the Mongo Query tab renders a collection picker + Find/Aggregate toggle +
  JSON editor; submitting a Find invokes the mongo execute command with the filter; submitting a
  malformed pipeline shows an error. Maps to: AC-009.
- TC-012 (AC-010, FE): a MongoDB database card shows only Query + Settings tabs (no Views, no
  Script); a Postgres database card is unchanged. Maps to: AC-010.
- TC-013 (AC-006/007, FE): given a `TableRows` payload with mixed/nested columns, the table card
  renders the columns (with `_id` first + PK marker) and the nested cell shows compact JSON -
  through the shared `DataGrid`. Maps to: AC-006, AC-007.
- TC-014 (AC-014, BE): the dispatcher routes a held-Mongo id to the Mongo path and any other id to
  the SQL path; a not-connected id returns the existing not-connected error. Maps to: AC-014.

## UI States

| State                         | Behavior                                                           |
| ----------------------------- | ------------------------------------------------------------------ |
| Engine = MongoDB (Settings)   | Host/Port/Database/User/Password + Connection string field         |
| Mongo, no URI + no host       | Connect disabled                                                   |
| Mongo, host+db OR uri set     | Connect enabled                                                    |
| Connecting                    | Button "Connecting..."; on success sidebar lists collections       |
| Connect error                 | Error toast (auth/host/db); status dot red                         |
| Collection, loading           | "Loading..." in the grid area                                      |
| Collection, empty             | Grid headers (sampled columns) + "No rows."                        |
| Collection, filter invalid    | Error toast "Filter must be valid JSON"; prior rows stay           |
| Query tab, Find empty `{}`    | Lists all documents (capped at the page limit)                     |
| Query tab, bad JSON           | Error in the result status header (no grid wipe)                   |
| Doc editor, invalid JSON      | Save disabled / inline error; no replaceOne issued                 |

### Wireframe - Settings tab, engine = MongoDB

```
+--------------------------------------------+
| Name                                       |
| [ orders_mongo                           ] |
| Accent color                               |
| [/][G][B][R][picker][ #rrggbb(aa)        ] |
| Type                                       |
| [ MongoDB                               v] |
| Host                                       |
| [ localhost                              ] |
| Port           Database                    |
| [ 27017 ]      [ shop                    ] |
| User                                       |
| [ app_user                               ] |
| Password                                   |
| [ ********                            eye ]|
| Connection string (overrides fields)       |
| [ mongodb+srv://...                      ] |
|                                            |
|                                 [ Connect ]|
+--------------------------------------------+
```

### Wireframe - MongoDB database card, Query tab

```
+----------------------------------------------------------+
| [ Query ] [ Settings ]                                   |
+----------------------------------------------------------+
| Collection [ orders        v]   Mode [ Find ][Aggregate] |
| +------------------------------------------------------+ |
| | { "status": "paid", "total": { "$gt": 100 } }        | |
| |                                                      | |
| +------------------------------------------------------+ |
| [ Run ]                                                  |
+----------------------------------------------------------+
| _id (PK)  | status | total | items        | ...          |
| 65f..a1   | paid   | 120   | [{"sku":...}] | ...          |  <- DataGrid
+----------------------------------------------------------+
| 12 of 348 documents          [ Load more ] [Copy CSV/JSON]|
+----------------------------------------------------------+
```

### Wireframe - Collection table card (browse + filter)

```
+----------------------------------------------------------+
| { "age": { "$gt": 30 } }                          [ search ]| <- JSON find filter
+----------------------------------------------------------+
| _id (PK)  | name   | age | address          | tags        |
| 65f..a1   | Ada    | 36  | {"city":"Wwa"}   | ["x","y"]   |  <- nested = compact JSON
| 65f..b2   | Lin    | 41  | [NULL]           | []          |
+----------------------------------------------------------+
| 2 of 2 documents   [page size 200] [+] [Copy CSV/JSON]   |
+----------------------------------------------------------+
```

## Data model

`DbEngine` gains `"mongodb"`. `ConnectionConfig` gains a `MongoConnection`:
`{ engine: "mongodb"; host; port; database; user; password; uri?: string }`. A non-empty `uri`
overrides the discrete fields when building the connection string.

Backend: a new `mongo.rs` module holds a `static LazyLock<Mutex<HashMap<id, MongoConnection>>>`
client registry (mirroring `db.rs`'s `POOLS`). `lib.rs` becomes a thin dispatcher: each
connection-addressed command checks `mongo::is_connected(id)` and routes to the Mongo path or the
existing SQL path. The Mongo path produces the **same** `TableRef` / `TableRows` / `QueryOutcome`
structs (documents flattened: top-level keys -> columns, `_id` first + primary key; nested values
-> compact JSON text; scalars -> JSON-literal text; missing -> `None`).

`RowMutation` (shared) gains a `Replace { pk_value, document }` variant for the full-document
edit; the SQL path rejects it (`Err`), the Mongo path interprets cell/insert/delete/replace as
`updateOne $set` / `insertOne` / `deleteOne` / `replaceOne`. Cell/insert values are parsed as
JSON literals to preserve BSON scalar types; `_id` is matched as ObjectId when it parses as one.

## Edge cases

- E-1: Mongo connect with bad host/auth/db -> client ping/list fails -> error toast + red dot
  (no crash). Connect is cancellable like the SQL connect (reuse the cancel registry).
- E-2: A collection where documents have **disjoint** field sets -> the page's column union
  covers every key seen; a doc missing a column shows `[NULL]` for it (the grid cannot
  distinguish "field absent" from "field = null" - documented limitation).
- E-3: Empty collection -> browse returns zero rows; the grid still shows the sampled column
  headers if any could be derived, else just `_id`.
- E-4: A document whose `_id` is **not** an ObjectId (string, int, compound) -> CRUD matches the
  `_id` by its parsed JSON value, not assuming ObjectId.
- E-5: Editing a scalar cell to a value that is not valid JSON (bare `hello`) -> treated as a
  string `"hello"`; editing a date/objectId field inline is lossy and should use the document
  editor (documented; `_id` itself is locked).
- E-6: Filter / Find / pipeline JSON is malformed -> parse error surfaced in the UI, no DB call.
- E-7: Credentials/URI with special characters -> percent-encoded when building the URI from
  fields; an explicit `uri` is passed through verbatim (the user owns it).
- E-8: A connection id present in neither registry -> the existing "not connected" error.

## Dependencies

- New Rust crate: `mongodb` (official driver, async, tokio runtime - matches the app's tokio
  runtime). Adds compile time + binary size; recorded in the ADR.
- Reuses the existing `@codemirror/lang-json` (added by the multi-theme feature) for the Query
  tab and document-editor JSON editing - no new frontend dependency.
- Touches `ConnectionConfig` / `DatabaseNode` / `workspace.json` (new mongo shape) and the
  database-card tab set.
- docker: `mongo:7` image + an init script in the test-stack.

## Out of scope

- Field-name autocomplete in the Query/filter editors (no schema introspection for Mongo).
- Mongo views, indexes, GridFS, change streams, transactions/sessions.
- `mongosh` command-string parsing (the Query tab is JSON: find filter / aggregation pipeline).
- Editing BSON-only types (ObjectId, Date, Decimal128, Binary) via inline cells - use the
  full-document editor; inline scalar edits cover JSON-expressible types only.
- Server-side query cancellation for Mongo (best-effort token abort only, like the SQL path).
</content>
</invoke>
