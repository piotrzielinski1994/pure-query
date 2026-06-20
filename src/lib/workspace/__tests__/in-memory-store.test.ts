import { describe, it, expect } from "vitest";

import { createInMemoryWorkspaceStore } from "@/lib/workspace/in-memory-store";
import {
  DEFAULT_WORKSPACE,
  type PersistedWorkspace,
} from "@/lib/workspace/workspace";

const nonEmptyWorkspace: PersistedWorkspace = {
  version: 1,
  tree: [
    {
      kind: "folder",
      id: "folder-prod",
      name: "prod",
      children: [
        {
          kind: "database",
          id: "db-admin",
          name: "admin_db",
          engine: "postgres",
          host: "db.internal",
          port: 5433,
          database: "admin",
          user: "seed_admin",
          password: "s3cr3t-pw",
        },
      ],
    },
  ],
};

describe("createInMemoryWorkspaceStore", () => {
  // AC-004 - behavior
  it("should return DEFAULT_WORKSPACE if the store was created empty", async () => {
    const store = createInMemoryWorkspaceStore();

    expect(await store.load()).toEqual(DEFAULT_WORKSPACE);
  });

  // AC-004 - behavior
  it("should return the seeded initial workspace if one was provided", async () => {
    const store = createInMemoryWorkspaceStore(nonEmptyWorkspace);

    expect(await store.load()).toEqual(nonEmptyWorkspace);
  });

  // AC-004, TC-005 - behavior
  it("should return the last-saved workspace on a subsequent load", async () => {
    const store = createInMemoryWorkspaceStore();

    await store.save(nonEmptyWorkspace);

    expect(await store.load()).toEqual(nonEmptyWorkspace);
  });

  // AC-004, TC-005 - behavior
  it("should overwrite the previous workspace if save is called again", async () => {
    const store = createInMemoryWorkspaceStore();

    await store.save(nonEmptyWorkspace);
    await store.save(DEFAULT_WORKSPACE);

    expect(await store.load()).toEqual(DEFAULT_WORKSPACE);
  });
});
