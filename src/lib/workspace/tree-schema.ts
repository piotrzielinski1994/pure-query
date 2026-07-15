import type { TableNode } from "@/lib/workspace/model";

// The tables the sidebar shows for a database's default-schema setting. null = no filter (all
// tables, original order). A set schema is a STRICT filter: only tables whose `.schema` equals it
// (empty when none match - a stale/absent schema shows no rows, by design).
export function visibleTables(
  tables: TableNode[],
  defaultSchema: string | null,
): TableNode[] {
  if (defaultSchema === null) {
    return tables;
  }
  return tables.filter((table) => table.schema === defaultSchema);
}

// The distinct non-null schemas present in a database's catalog, sorted ascending - the options for
// the Default schema selector (alongside the "All schemas" null choice).
export function schemaOptions(tables: TableNode[]): string[] {
  const schemas = new Set(
    tables.flatMap((table) => (table.schema === null ? [] : [table.schema])),
  );
  return [...schemas].sort();
}
