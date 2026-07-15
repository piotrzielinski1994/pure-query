# Plan: Per-database default schema

Full breakdown in `.pzielinski/default-schema.md` (`## Solution Plan`).

## Execution order (TDD)

1. **T1** model + persist - `defaultSchema` on node; `mergeDefaultSchema` + hydrate/dehydrate mirror of `readOnly` (workspace.ts, model.ts).
2. **T2** provider - `setDefaultSchema` tree map + `setDatabaseDefaultSchema` action + `newDatabaseNode` default (workspace-context.tsx).
3. **T3** pure lib - `visibleTables` + `schemaOptions` (tree-schema.ts, new).
4. **T4** tree render - DatabaseRow filters through `visibleTables`; bare label when set (tree-row.tsx).
5. **T5** settings UI - `DefaultSchemaField` Select under Manual commit (settings-tab.tsx).

## File changes

| File | Change |
| ---- | ------ |
| src/lib/workspace/model.ts | + `defaultSchema` on DatabaseNodeBase |
| src/lib/workspace/workspace.ts | + persist (types x3, merge, hydrate, dehydrate x3) |
| src/components/workspace/workspace-context.tsx | + setDefaultSchema/setDatabaseDefaultSchema + default |
| src/lib/workspace/tree-schema.ts | new pure module |
| src/components/workspace/tree-row.tsx | filter + bare label |
| src/components/workspace/settings-tab.tsx | + DefaultSchemaField |

## Acceptance verification

Per-task RED->GREEN->REFACTOR; fresh verifier subagent runs tsc + lint + full vitest + AC->test map.
