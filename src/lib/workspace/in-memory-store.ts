import {
  DEFAULT_WORKSPACE,
  type PersistedWorkspace,
  type WorkspaceStore,
} from "@/lib/workspace/workspace";

export function createInMemoryWorkspaceStore(
  initial: PersistedWorkspace = DEFAULT_WORKSPACE,
): WorkspaceStore {
  let current = initial;
  return {
    load: () => Promise.resolve(current),
    save: (workspace) => {
      current = workspace;
      return Promise.resolve();
    },
  };
}
