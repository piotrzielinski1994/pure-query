import { useWorkspace } from "@/components/workspace/workspace-context";
import { Tab, TabBar } from "@/components/workspace/tab-bar";
import { Database, Plus, Table, X } from "lucide-react";

export function ContentHeader() {
  const {
    openTabIds,
    activeTabId,
    nodesById,
    setActiveTab,
    closeTab,
    addDatabase,
  } = useWorkspace();

  return (
    <TabBar
      ariaLabel="Open tabs"
      trailing={
        <button
          type="button"
          aria-label="New database"
          onClick={addDatabase}
          className="shrink-0 px-2 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      }
    >
      {openTabIds.map((id) => {
        const node = nodesById.get(id);
        if (!node) {
          return null;
        }
        const Icon = node.kind === "database" ? Database : Table;
        return (
          <Tab
            key={id}
            isActive={id === activeTabId}
            onSelect={() => setActiveTab(id)}
            trailing={
              <button
                type="button"
                aria-label={`Close ${node.name}`}
                onClick={() => closeTab(id)}
                className="p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            }
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            {node.name}
          </Tab>
        );
      })}
    </TabBar>
  );
}
