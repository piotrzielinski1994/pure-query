import { LazyStore } from "@tauri-apps/plugin-store";
import {
  DEFAULT_WORKSPACE,
  mergeWorkspace,
  type PersistedWorkspace,
  type WorkspaceStore,
} from "@/lib/workspace/workspace";

const WORKSPACE_FILE = "workspace.json";
const WORKSPACE_KEY = "workspace";

export function createTauriWorkspaceStore(): WorkspaceStore {
  const store = new LazyStore(WORKSPACE_FILE);

  const load = async (): Promise<PersistedWorkspace> => {
    const persisted = await store
      .get<unknown>(WORKSPACE_KEY)
      .catch(() => undefined);
    return mergeWorkspace(persisted);
  };

  const save = async (workspace: PersistedWorkspace): Promise<void> => {
    await store
      .set(WORKSPACE_KEY, workspace)
      .then(() => store.save())
      .catch((error) => {
        console.warn("Failed to persist workspace", error);
      });
  };

  return { load, save };
}

export { DEFAULT_WORKSPACE };
