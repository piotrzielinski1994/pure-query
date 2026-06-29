import { ChevronDown, ChevronRight, Table } from "lucide-react";
import { EngineIcon } from "@/components/workspace/engine-icon";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { useConnectionActions } from "@/components/workspace/use-connection";
import { useRequestDelete } from "@/components/workspace/delete-request-context";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  connectionOf,
  type ConnectionStatus,
  type DatabaseNode,
  type FolderNode,
  type TableNode,
  type TreeNode,
} from "@/lib/workspace/model";

function FolderRow({ node, depth }: { node: FolderNode; depth: number }) {
  const { expandedIds, toggleExpand } = useWorkspace();
  const requestDelete = useRequestDelete();
  const isExpanded = expandedIds.has(node.id);
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="treeitem"
            aria-expanded={isExpanded}
            tabIndex={0}
            onClick={() => toggleExpand(node.id)}
            style={{ paddingLeft: `${depth * 14 + 6}px` }}
            className="flex cursor-pointer items-center gap-1 py-1 pr-2 text-[13px] hover:bg-accent"
          >
            <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => requestDelete(node)}
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isExpanded ? (
        <ul role="group">
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

const STATUS_DOT_COLOR: Partial<Record<ConnectionStatus, string>> = {
  // Connecting pulses amber so an in-flight connect is visible (and the chevron's abort affordance
  // has a matching cue); connected/error are steady.
  connecting: "bg-amber-500 animate-pulse",
  connected: "bg-green-500",
  error: "bg-red-500",
};

// Whether a connected database spans more than one schema. When it does, every table leaf is shown
// schema-qualified (`schema.table`) so same-named tables across schemas are distinguishable; a
// single-schema database (and MySQL/SQLite, which have no schema at all) shows bare table names.
function isMultiSchema(tables: TableNode[]): boolean {
  const schemas = new Set(
    tables.flatMap((table) => (table.schema === null ? [] : [table.schema])),
  );
  return schemas.size > 1;
}

// The sidebar label for a table: schema-qualified only when the database spans multiple schemas.
function tableLabel(table: TableNode, multiSchema: boolean): string {
  return multiSchema && table.schema !== null
    ? `${table.schema}.${table.name}`
    : table.name;
}

function DatabaseRow({ node, depth }: { node: DatabaseNode; depth: number }) {
  const {
    expandedIds,
    activeTabId,
    toggleExpand,
    openNode,
    connectionStatus,
    setConnectionStatus,
    connections,
  } = useWorkspace();
  const { connect, disconnect, abortConnect } = useConnectionActions();
  const requestDelete = useRequestDelete();
  const isExpanded = expandedIds.has(node.id);
  const isSelected = activeTabId === node.id;
  const Chevron = isExpanded ? ChevronDown : ChevronRight;
  const status = connectionStatus.get(node.id) ?? "idle";
  const dotColor = STATUS_DOT_COLOR[status];
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const hasConnection = connections.has(node.id);

  const toggleConnection = () => {
    if (hasConnection) {
      disconnect(node.id);
      return;
    }
    connect(node.id, connectionOf(node));
  };

  // The chevron is first and foremost an expand/collapse toggle - it ALWAYS flips that. On top of
  // that, connection side effects keyed on the toggle DIRECTION:
  //  - expanding a database that isn't connected (idle/error) kicks off a connect so the live
  //    catalog populates instead of showing an empty list (error -> a retry);
  //  - collapsing while a connect is still in flight ABORTS it;
  //  - collapsing a database that isn't connected (a pending connect just aborted, or a failed
  //    one) clears the status back to idle, so the dot disappears - only a live (connected)
  //    database keeps its green dot when collapsed.
  const toggleTables = () => {
    const willExpand = !isExpanded;
    if (!willExpand && isConnecting) {
      abortConnect(node.id);
    }
    if (!willExpand && !isConnected) {
      setConnectionStatus(node.id, "idle");
    }
    toggleExpand(node.id);
    if (willExpand && (status === "idle" || status === "error")) {
      connect(node.id, connectionOf(node));
    }
  };

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="treeitem"
            aria-expanded={isExpanded}
            aria-selected={isSelected}
            aria-label={node.name}
            tabIndex={0}
            onClick={() => openNode(node.id)}
            style={{
              paddingLeft: `${depth * 14 + 6}px`,
              // Paint the accent bar as an inset shadow, not a border, so it sits on the row's left
              // edge without widening the box or shifting the label right.
              ...(node.accentColor
                ? { boxShadow: `inset 2px 0 0 0 ${node.accentColor}` }
                : {}),
            }}
            className={cn(
              "flex cursor-pointer items-center gap-1 py-1 pr-2 text-[13px] hover:bg-accent",
              isSelected && "bg-accent",
            )}
          >
            <button
              type="button"
              aria-label={`Toggle ${node.name} tables`}
              onClick={(event) => {
                event.stopPropagation();
                toggleTables();
              }}
              className="flex shrink-0 items-center rounded-sm text-muted-foreground hover:text-foreground"
            >
              <Chevron className="size-3.5" />
            </button>
            <EngineIcon
              engine={node.engine}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="truncate">{node.name}</span>
            {dotColor ? (
              <span
                role="img"
                aria-label={`${node.name} ${status}`}
                className={cn("ml-auto size-2 shrink-0 rounded-full", dotColor)}
              />
            ) : null}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={toggleConnection}>
            {hasConnection ? "Disconnect" : "Connect"}
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => requestDelete(node)}
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isExpanded && isConnected ? (
        <ul role="group">
          {(() => {
            const multiSchema = isMultiSchema(node.tables);
            return node.tables.map((table) => (
              <TableRow
                key={table.id}
                node={table}
                depth={depth + 1}
                label={tableLabel(table, multiSchema)}
              />
            ));
          })()}
        </ul>
      ) : null}
    </li>
  );
}

// `label` lets the database row pass a schema-qualified name (`schema.table`) for a multi-schema
// Postgres database; it defaults to the bare table name everywhere else.
function TableRow({
  node,
  depth,
  label = node.name,
}: {
  node: TableNode;
  depth: number;
  label?: string;
}) {
  const { activeTabId, openNode } = useWorkspace();
  const isSelected = activeTabId === node.id;

  return (
    <li>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-label={label}
        tabIndex={0}
        onClick={() => openNode(node.id)}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
        className={cn(
          "flex cursor-pointer items-center gap-2 py-1 pr-2 text-[13px] hover:bg-accent",
          isSelected && "bg-accent",
        )}
      >
        <Table className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </div>
    </li>
  );
}

export function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  if (node.kind === "folder") {
    return <FolderRow node={node} depth={depth} />;
  }
  if (node.kind === "database") {
    return <DatabaseRow node={node} depth={depth} />;
  }
  return <TableRow node={node} depth={depth} />;
}
