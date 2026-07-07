import { memo } from "react";
import { ContentHeader } from "@/components/workspace/content-header";
import { DatabaseCard } from "@/components/workspace/database-card";
import { TableCard } from "@/components/workspace/table-card";
import { useWorkspace } from "@/components/workspace/workspace-context";

function ActiveCard() {
  const { activeNode } = useWorkspace();

  if (!activeNode) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No tab open
      </div>
    );
  }

  if (activeNode.kind === "table") {
    return <TableCard />;
  }

  return <DatabaseCard />;
}

// Memoized (no props): a sidebar/console toggle re-renders WorkspaceLayout/Main, but this
// content subtree (incl. the heavy TableCard grid) must NOT re-render from that - it only changes
// when the active node/tab does (via ActiveCard's own workspace subscription).
export const Content = memo(function Content() {
  return (
    <div className="flex h-full flex-col">
      <ContentHeader />
      <div className="min-h-0 flex-1">
        <ActiveCard />
      </div>
    </div>
  );
});
