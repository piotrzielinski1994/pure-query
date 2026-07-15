import { describe, it, expect } from "vitest";

import {
  dehydrate,
  hydrate,
  mergeWorkspace,
  type PersistedDatabase,
  type PersistedWorkspace,
} from "@/lib/workspace/workspace";
import type { DatabaseNode } from "@/lib/workspace/model";

// Per-database "Default schema" (sidebar filter + bare label). A `defaultSchema: string | null` on
// the database node, persisted as an OPTIONAL string on the three Persisted* shapes (mirrors
// readOnly/accentColor): mergeDefaultSchema keeps only a NON-EMPTY string, hydrate defaults null,
// dehydrate OMITS null/empty.
const validDatabase: PersistedDatabase = {
  kind: "database",
  id: "db-admin",
  name: "admin_db",
  engine: "postgres",
  host: "db.internal",
  port: 5433,
  database: "admin",
  user: "seed_admin",
  password: "s3cr3t-pw",
};

// The runtime node type does not (yet) declare `defaultSchema`; read it through a widened cast so
// the tests observe behaviour without depending on the type edit landing first.
type WithDefaultSchema = DatabaseNode & { defaultSchema?: string | null };

describe("mergeWorkspace defaultSchema (AC-001, TC-001)", () => {
  // AC-001 - behavior (a non-empty string defaultSchema survives merge). RED anchor: today an
  // unrecognised `defaultSchema` is dropped like any unknown field, so "public" is NOT preserved.
  it("should keep a non-empty string defaultSchema on a database", () => {
    const merged = mergeWorkspace({
      version: 1,
      tree: [{ ...validDatabase, defaultSchema: "public" }],
    });

    expect(merged.tree).toEqual([{ ...validDatabase, defaultSchema: "public" }]);
  });

  // AC-001, TC-001 - behavior (an empty-string defaultSchema is dropped, database otherwise intact)
  it("should drop an empty-string defaultSchema but keep the rest of the database", () => {
    const merged = mergeWorkspace({
      version: 1,
      tree: [{ ...validDatabase, defaultSchema: "" }],
    });

    expect(merged.tree).toEqual([validDatabase]);
    expect(merged.tree[0]).not.toHaveProperty("defaultSchema");
  });

  // AC-001, TC-001 - behavior (a null defaultSchema is dropped, database otherwise intact)
  it("should drop a null defaultSchema but keep the rest of the database", () => {
    const merged = mergeWorkspace({
      version: 1,
      tree: [{ ...validDatabase, defaultSchema: null }],
    });

    expect(merged.tree).toEqual([validDatabase]);
    expect(merged.tree[0]).not.toHaveProperty("defaultSchema");
  });

  // AC-001, TC-001 - behavior (a non-string defaultSchema is dropped, database otherwise intact)
  it("should drop a numeric defaultSchema but keep the rest of the database", () => {
    const merged = mergeWorkspace({
      version: 1,
      tree: [{ ...validDatabase, defaultSchema: 42 }],
    });

    expect(merged.tree).toEqual([validDatabase]);
    expect(merged.tree[0]).not.toHaveProperty("defaultSchema");
  });
});

describe("hydrate defaultSchema (AC-001, TC-001)", () => {
  // AC-001, TC-001 - behavior (a persisted db with no defaultSchema hydrates to null). RED anchor:
  // today the runtime node carries no defaultSchema at all (undefined, not null).
  it("should default a missing defaultSchema to null when hydrating", () => {
    const [node] = hydrate([validDatabase]);

    expect((node as WithDefaultSchema).defaultSchema).toBeNull();
  });

  // AC-001 - behavior (a persisted defaultSchema hydrates to that string on the runtime node)
  it("should hydrate a persisted defaultSchema to that string", () => {
    const [node] = hydrate([
      { ...validDatabase, defaultSchema: "quartz" } as PersistedDatabase,
    ]);

    expect((node as WithDefaultSchema).defaultSchema).toBe("quartz");
  });

  // AC-001, TC-001 - behavior (a dropped garbage defaultSchema hydrates to null without throwing)
  it("should hydrate a merged non-string defaultSchema to null without throwing", () => {
    const merged = mergeWorkspace({
      version: 1,
      tree: [{ ...validDatabase, defaultSchema: 42 }],
    });

    let node: DatabaseNode | undefined;
    expect(() => {
      node = hydrate(merged.tree)[0] as DatabaseNode;
    }).not.toThrow();
    expect((node as WithDefaultSchema).defaultSchema).toBeNull();
  });
});

describe("dehydrate defaultSchema (AC-001, TC-001)", () => {
  // AC-001, TC-001 - behavior (a set defaultSchema is persisted; a null one is omitted). RED anchor
  // for the "include" half: today dehydrate emits no defaultSchema field at all.
  it("should include defaultSchema when set and omit it when null", () => {
    const base = hydrate([validDatabase])[0] as DatabaseNode;

    const withSchema = { ...base, defaultSchema: "public" } as DatabaseNode;
    expect(dehydrate([withSchema]).tree[0]).toMatchObject({
      defaultSchema: "public",
    });

    const withNull = { ...base, defaultSchema: null } as DatabaseNode;
    expect(dehydrate([withNull]).tree[0]).not.toHaveProperty("defaultSchema");
  });

  // AC-001, TC-001 - behavior (a database with a defaultSchema survives a full merge/hydrate/
  // dehydrate round trip). RED anchor: the schema is lost somewhere in the pipeline today.
  it("should round-trip a defaultSchema database through merge, hydrate and dehydrate", () => {
    const persisted: PersistedWorkspace = {
      version: 1,
      tree: [{ ...validDatabase, defaultSchema: "quartz" } as PersistedDatabase],
    };

    expect(dehydrate(hydrate(mergeWorkspace(persisted).tree))).toEqual(
      persisted,
    );
  });
});
