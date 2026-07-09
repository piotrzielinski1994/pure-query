import type { ForeignKey } from "@/lib/workspace/model";

type Cell = string | null;

export type NavigableForeignKey = {
  fk: ForeignKey;
  label: string;
  values: Cell[];
};

// The local column values of an FK, in fk.columns order, read from a row by column name. Returns
// null for a column the grid doesn't carry (indexOf === -1), which then fails the all-non-null test.
function localValues(fk: ForeignKey, columns: string[], row: Cell[]): Cell[] {
  return fk.columns.map((column) => {
    const index = columns.indexOf(column);
    return index >= 0 ? (row[index] ?? null) : null;
  });
}

// The outbound FKs of a row that can be navigated: every local column value must be non-null (a null
// FK references nothing). One entry per FK, with its "Go to <table> (col=value, ...)" label.
export function navigableForeignKeys(
  foreignKeys: ForeignKey[],
  columns: string[],
  row: Cell[],
): NavigableForeignKey[] {
  return foreignKeys
    .map((fk) => ({ fk, values: localValues(fk, columns, row) }))
    .filter(({ values }) => values.every((value) => value !== null))
    .map(({ fk, values }) => {
      const pairs = fk.columns
        .map((column, index) => `${column}=${values[index]}`)
        .join(", ");
      return { fk, values, label: `Go to ${fk.referencedTable} (${pairs})` };
    });
}

// The foreign key a given column participates in (a column is at most one FK's member in practice),
// or null. Used to render an FK cell as a navigable link; a composite FK is returned for each of its
// member columns, so every part of the key links to the same target.
export function foreignKeyForColumn(
  foreignKeys: ForeignKey[],
  column: string,
): ForeignKey | null {
  return foreignKeys.find((fk) => fk.columns.includes(column)) ?? null;
}

// True when every local column of `fk` has a non-null value in the row (so the FK actually points at
// a target row - the same test `navigableForeignKeys` applies, exposed per-fk for the link cell).
export function isForeignKeyNavigable(
  fk: ForeignKey,
  columns: string[],
  row: Cell[],
): boolean {
  return localValues(fk, columns, row).every((value) => value !== null);
}

// The target table node id for an FK, matching WorkspaceProvider's `${databaseId}::${schema}::${name}`
// id formula (empty schema segment when the FK carries no referenced schema - MySQL/SQLite).
export function fkTargetTableId(databaseId: string, fk: ForeignKey): string {
  return `${databaseId}::${fk.referencedSchema ?? ""}::${fk.referencedTable}`;
}
