# Spec: Per-database default schema

## Overview

A per-database **Default schema** selector in the Settings tab. Setting it (1) hides every other schema's tables in the sidebar tree (strict filter) and (2) renders visible table leaves with the bare `table` name instead of `schema.table`. Tree DISPLAY only - the SQL editor, autocomplete, FK-nav, and quick-open are unchanged. Postgres-only in effect (MySQL/SQLite/Mongo tables carry no schema).

## Acceptance Criteria

Canonical AC-001..AC-007 in `.pzielinski/default-schema.md`.

## User Test Cases

Canonical TC-001..TC-007 in `.pzielinski/default-schema.md`.

## Data Model

New field `defaultSchema: string | null` on `DatabaseNodeBase` (default null), persisted in `workspace.json` mirroring `readOnly`: `mergeDefaultSchema` keeps only a non-empty string, `hydrate` defaults null, `dehydrate` omits null/empty.

## Edge Cases

- Saved schema no longer in the live catalog -> strict empty (no table rows); selector still shows the saved value.
- Disconnected / no schemas -> selector shows saved value + "All schemas" only.
- MySQL/SQLite/Mongo (schema null) -> selector effectively only "All schemas"; filter is a no-op.

## Dependencies

None. Schemas already arrive via `TableRef.schema` in the connect catalog.
