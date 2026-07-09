import { useWorkspace } from "@/components/workspace/workspace-context";
import { Tab, TabBar } from "@/components/workspace/tab-bar";
import { EngineIcon } from "@/components/workspace/engine-icon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ArrowLeft, ArrowRight, Plus, Table, X } from "lucide-react";

export function ContentHeader() {
  const {
    openTabIds,
    activeTabId,
    nodesById,
    setActiveTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    addDatabase,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  } = useWorkspace();
  const hasMultipleTabs = openTabIds.length > 1;

  return (
    <TabBar
      ariaLabel="Open tabs"
      leading={
        <div className="flex shrink-0 items-stretch border-r">
          <button
            type="button"
            aria-label="Navigate back"
            onClick={goBack}
            disabled={!canGoBack}
            className="px-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Navigate forward"
            onClick={goForward}
            disabled={!canGoForward}
            className="px-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      }
      trailing={
        <button
          type="button"
          aria-label="New database"
          onClick={() => addDatabase()}
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
        return (
          <ContextMenu key={id}>
            <ContextMenuTrigger asChild>
              <Tab
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
                {node.kind === "database" ? (
                  <EngineIcon
                    engine={node.engine}
                    className="size-3.5 shrink-0"
                  />
                ) : (
                  <Table aria-hidden="true" className="size-3.5 shrink-0" />
                )}
                {node.name}
              </Tab>
            </ContextMenuTrigger>
            <ContextMenuContent
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <ContextMenuItem onSelect={() => closeTab(id)}>
                Close
              </ContextMenuItem>
              <ContextMenuItem
                disabled={!hasMultipleTabs}
                onSelect={() => closeOtherTabs(id)}
              >
                Close other tabs
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => closeAllTabs()}>
                Close all
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </TabBar>
  );
}
