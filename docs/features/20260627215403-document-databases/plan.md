# F-Mongo - Plan

Spec: [spec.md](spec.md). Branch: `20260627215403-document-databases`.

## Chosen approach

**Separate backend module + dispatch seam, shared IPC structs.** `sqlx::Any` cannot drive
MongoDB, so a new `src-tauri/src/mongo.rs` owns the `mongodb` crate, its own client registry, and
its own per-command functions. `lib.rs` becomes a dispatcher: connection-addressed commands check
`mongo::is_connected(id)` and route to Mongo or the existing `db.rs` SQL path. `db.rs` is
**untouched** (all current Rust tests stay green).

The Mongo path emits the **same** `TableRef` / `TableRows` / `TableColumn` / `QueryOutcome` IPC
structs as the SQL path, so the frontend `DataGrid` renders documents identically to rows (ONE
grid invariant). Documents are flattened DBeaver-style: top-level keys -> columns (`_id` first +
`isPrimaryKey`), nested object/array -> compact JSON text in the cell, scalars -> JSON-literal
text, missing key -> `None` (`[NULL]`).

`RowMutation` gains a shared `Replace { pk_value, document }` variant for full-document edits.

### Alternatives rejected
- **Translate Mongo to SQL through `Any`** - impossible; Mongo is not SQL.
- **Fork a second document grid** - violates the ONE-DataGrid invariant (CLAUDE.md). Flattening
  reuses the existing grid instead.
- **Separate Tauri commands per engine on the frontend** (`mongo_connect`, ...) - rejected; the
  frontend would branch on engine at every call site. A backend dispatcher keeps the existing
  command names + TS wrappers, so most of `tauri.ts` and the table card are engine-agnostic.

## Execution order (TDD per slice; RED -> GREEN -> REFACTOR each)

Each step is its own red-green cycle and (where it maps to ACs) its own commit
`feat(mongo): <AC> <desc>`.

### Phase A - docker test-stack (AC-015)
1. Add `mongo:7` service to `.pzielinski/test-stack/docker-compose.yml` (port `27018:27017`,
   root user `dbui`/`dbui`, db `dbui_test`). Add `db-init/mongo/seed.js` seeding collections:
   `users` (nested address object + tags array), `orders` (items array of subdocs,
   heterogeneous), `events` (disjoint field sets across docs). Update test-stack `README.md`
   with the Mongo credentials. **Stop the running test-stack first**, then `up -d` (user
   instruction). No automated test; verified by connecting from the app.

### Phase B - data model + persistence (AC-001, AC-005)
2. `model.ts`: add `"mongodb"` to `DbEngine`; add `MongoConnection` type + include in
   `ConnectionConfig`; extend `connectionOf`. `tauri.ts`: add `replace` to `RowMutation` union.
3. `workspace.ts`: add `PersistedMongoDatabase`; `mergeDatabase`/`hydrate`/`dehydrate` mongo
   branch (host/port/database/user/password + optional `uri`). **Tests:** TC-003.

### Phase C - backend Mongo module (AC-002,004,006,007,008,011,012,013,014)
4. `Cargo.toml`: add `mongodb` crate. New `mongo.rs` with pure, unit-testable helpers first
   (no live DB needed for tests):
   - `mongo_uri(config) -> String` (fields -> percent-encoded `mongodb://`; explicit uri verbatim). TC-004.
   - `flatten_documents(&[Document]) -> (Vec<TableColumn>, Vec<Vec<Option<String>>>)` - `_id`
     first + PK, type label per sampled value, nested -> compact JSON, scalar -> JSON literal,
     missing -> None. TC-005, TC-006.
   - `parse_filter(&str) -> Result<Document,String>` (JSON -> BSON; err on bad JSON). TC-007.
   - `build_cell_update`/`build_insert`/`build_delete`/`build_replace` -> return the BSON
     `(filter, update/doc)` pair; cell value parsed as JSON literal; `_id` -> ObjectId when it
     parses; reject `_id` cell edits. TC-008, TC-009, TC-010.
5. Live-client fns (registry + connect/disconnect/list collections/fetch page/count/find/
   aggregate/apply mutations), mirroring `db.rs` shapes. Cancellable connect via the shared
   `db::CANCELS` registry. Returns the shared structs.

### Phase D - dispatch (AC-014)
6. `lib.rs`: for each connection-addressed command, branch on `mongo::is_connected(id)`.
   `connect_database` branches on `config` engine. New commands `execute_mongo_find` /
   `execute_mongo_aggregate` (collection + JSON). **Test:** TC-014 (dispatcher routing).

### Phase E - frontend Settings (AC-001,002,003)
7. `settings-tab.tsx`: add MongoDB to `ENGINE_LABELS` + select; mongo branch in
   `formFromNode`/`configFromForm`; render Host/Port(27017)/Database/User/Password + URI field
   when `engine === "mongodb"`; `isConnectable` for mongo = uri non-empty OR host+db. TC-001,
   TC-002.

### Phase F - frontend browse + grid (AC-006,007,008,013)
8. `table-card.tsx`: when `engine === "mongodb"`, the "preview SQL" strings become Mongo-shaped
   (the History log shows `db.coll.find(...)` / `updateOne(...)` etc.); the filter row's
   `hasStatementBreak` SQL guard is replaced by a JSON-validity check; nested cells render as
   compact JSON via the existing `renderCell` (backend already stringifies). The grid, paging,
   sort, count, Save/Discard pipeline are reused unchanged. TC-013.
9. `sql-editor.tsx`: add a `mongodb` mode using `@codemirror/lang-json` (no SQL dialect /
   autocomplete) so the filter + query editors highlight JSON.

### Phase G - frontend Query tab + doc editor (AC-009,010,012,013)
10. `database-card.tsx`: for `engine === "mongodb"` show tabs `["query", "settings"]` (hide
    views/script). New `mongo-query-tab.tsx`: collection picker + Find/Aggregate toggle + JSON
    editor + result `DataGrid` (read-only, `editable={false}`). TC-011, TC-012.
11. Document editor: a `data-grid.tsx` row context-menu item **Edit document** (shown only when a
    callback is passed) opens a dialog with a JSON editor; Save -> `replace` mutation. Wire from
    the Mongo table card only. TC-010 covers the backend; FE add a render test.

### Phase H - docs + verify
12. README.md: add MongoDB to the engine list + test-stack note. CLAUDE.md: note the SQL-vs-Mongo
    dispatch seam + that the Mongo path reuses the shared grid/structs. docs/adr.md: append the
    decisions below. docs/design.md: nested-JSON-cell rendering rule if it adds a visual
    convention. Run full `npm test` + `cd src-tauri && cargo test` + `npm run lint` +
    `npm run typecheck`. Verifier subagent (fresh context) per the skill.

## Files to create / modify

Create: `src-tauri/src/mongo.rs`, `src/components/workspace/mongo-query-tab.tsx`,
`.pzielinski/test-stack/db-init/mongo/seed.js`, FE test files per phase.
Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src/lib/workspace/model.ts`,
`src/lib/workspace/workspace.ts`, `src/lib/tauri.ts`, `src/components/workspace/settings-tab.tsx`,
`table-card.tsx`, `sql-editor.tsx`, `database-card.tsx`, `data-grid.tsx`,
`.pzielinski/test-stack/docker-compose.yml`, `.pzielinski/test-stack/README.md`, `README.md`,
`CLAUDE.md`.

## Edge cases to handle (from spec)
E-1 connect failure -> toast; E-2 disjoint fields -> column union, missing = `[NULL]`; E-3 empty
collection -> headers + No rows; E-4 non-ObjectId `_id` -> match by parsed value; E-5 inline
scalar JSON-literal parse, BSON types via doc editor; E-6 malformed JSON -> UI error, no DB call;
E-7 percent-encode field-built URI, pass explicit uri verbatim; E-8 unknown id -> not-connected.

## Risks
- `mongodb` crate version/runtime mismatch with the pinned tokio: mitigation - pin a release
  compatible with `tokio 1`/rustls; verify `cargo build` before wiring commands.
- Flatten heuristic surprises users (field-absent vs null indistinguishable): mitigation -
  documented limitation (E-2); `_id`-first ordering keeps the key column stable.
- Scope is large for one branch: mitigation - phased red-green commits; each phase is
  independently shippable/revertible.

## Decision Log

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026-06-27 | Domain-modeling gate: evaluated `pz-ddd` + `pz-archetypes`; **neither invoked** | Infra/adapter feature (new data-source driver + dispatch seam). No new domain model, aggregates, consistency boundaries, or accounting/inventory/ordering/etc. archetype shape - it mirrors the existing engine-adapter pattern. Structural backbone = the established `db.rs` per-engine layout, not a DDD/archetype model |
| 2026-06-27 | MongoDB gets a **separate** `mongo.rs` + dispatch seam, not a `db.rs` arm | `sqlx::Any` has no Mongo support; Mongo is not SQL. Isolating it keeps `db.rs` + all SQL tests untouched and gives a reusable non-SQL data-source seam |
| 2026-06-27 | Mongo path **reuses** the shared IPC structs + the one `DataGrid` (documents flattened: top-level keys -> columns, nested -> compact JSON) | Honors the ONE-DataGrid invariant (CLAUDE.md); the frontend table/grid/paging/CRUD pipeline stays engine-agnostic. Forking a document grid was rejected |
| 2026-06-27 | Query tab accepts **JSON** (find filter object / aggregation pipeline array), not mongosh strings | User choice; JSON parses with no JS engine and reuses `@codemirror/lang-json`. mongosh parsing deferred (out of scope) |
| 2026-06-27 | Cell edits parse the entered text as a **JSON literal** ($set), nested edits via a full-document `replaceOne` | User choice; preserves BSON scalar types (number/bool/null/string) instead of string-coercing. New shared `RowMutation::Replace` variant |
| 2026-06-27 | Mongo connection config = discrete fields **+** optional `uri` override (both) | User choice ("oba"); discrete fields cover the common case, the URI handles replica sets / Atlas / `mongodb+srv` |

## AC -> test traceability (implemented)

| AC | Test(s) |
| -- | ------- |
| AC-001/002/003 (settings) | `settings-tab.test.tsx` > "SettingsTab MongoDB engine" (fields + URI + Connect gating + engine select + connect payload) |
| AC-004 (list collections) | `mongo.rs` live `live_mongo_connects_lists_browses_and_counts`; FE connect flow shared with SQL (`settings-tab.test.tsx`) |
| AC-005 (persist) | `workspace.test.ts` > "MongoDB persistence (TC-003)" (merge/hydrate/dehydrate + uri round-trip, missing-host drop, non-string uri drop) |
| AC-006/007 (browse/flatten) | `mongo.rs` `should_flatten_documents_with_id_first_and_nested_as_compact_json`, `should_mark_id_as_primary_key_and_label_bson_types`; live browse asserts 200-cap/_id PK/columns; grid render via `query-preview.test.ts` + shared `DataGrid` |
| AC-008 (JSON filter) | `mongo.rs` `should_parse_a_valid_json_filter_and_reject_bad_json`; `query-preview.test.ts` "validate the mongo filter as a JSON object"; live vip-filter count |
| AC-009 (Query tab) | `database-card.test.tsx` > "render a collection picker, a Find/Aggregate toggle and a JSON editor" |
| AC-010 (tabs) | `database-card.test.tsx` > "expose only Query and Settings tabs for a mongodb database" |
| AC-011 (cell update) | `mongo.rs` `should_build_a_cell_update_parsing_the_value_as_a_json_literal`; `query-preview.test.ts` updateOne preview |
| AC-012 (insert/delete) | `mongo.rs` `should_build_insert_and_delete_resolving_object_ids`; `query-preview.test.ts` insertOne/deleteOne previews |
| AC-013 (replace) | `mongo.rs` `should_build_a_replace_from_the_document_json`; `mongo-document-edit.test.tsx` (Edit document menu -> callback) |
| AC-014 (dispatch) | `mongo.rs` `should_report_not_connected_for_an_unheld_id`; `lib.rs` dispatch branches |
| AC-015 (docker) | `.pzielinski/test-stack` mongo service + seed; verified by `docker compose ps` healthy + seed counts 500/300/4 |

## Verification (Phase H)

- `npm test` (Vitest): 611 passed / 58 files. `cargo test --lib`: 113 passed. Live `live_mongo` (--ignored): passed against the seeded container.
- `tsc --noEmit`: clean. `npm run lint`: 0 errors (13 pre-existing fast-refresh/library warnings, none new from this feature).
- Status: COMPLETE pending fresh-verifier sign-off + user review.
</content>
