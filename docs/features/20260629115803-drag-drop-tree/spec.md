# Drag-and-drop tree reorganization

## Overview

Let the user reorganize the sidebar tree by dragging. A **database** or a **folder** can be
dragged and dropped:

- **into a folder** (reparent), including a folder into another folder (arbitrary nesting), and
- **before/after a sibling** at the same level (reorder).

Tables are NOT draggable - they are ephemeral catalog leaves loaded from a live connection and
belong to their database; they are never persisted as movable tree nodes.

The move updates the in-memory `tree` immutably and auto-persists through the existing
`onTreeChange` -> `dehydrate` -> Tauri-store path (folders + databases are persisted nodes; tables
are stripped on dehydrate). No new persistence wiring.

This mirrors the proven implementation in the `requi` repo (`@dnd-kit/core`, `tree-locate.ts`,
`move.ts`, `tree-dnd.tsx`), adapted to purequery's node kinds (folder / database / table) and its
React-context store.

## Why

The tree already supports folders and nesting, but the only way to place a database in a folder
today is... there is none - `addFolder` appends an empty folder and `addDatabase` appends a database
at root. Users cannot organize connections after creating them. Drag-and-drop is the expected,
direct-manipulation way to do this in an IDE-like sidebar.

## Acceptance criteria

- AC-001: A database row can be dragged and dropped **inside** a folder; afterwards it renders as a
  child of that folder and is removed from its previous parent.
- AC-002: A folder row can be dragged and dropped **inside** another folder; its entire subtree
  (child folders + databases) moves intact.
- AC-003: A node dropped **before** or **after** a sibling at the same level is reordered to that
  position (sibling reordering at root and inside folders).
- AC-004: A node dragged across parents and dropped before/after a target lands in the **target's**
  parent at the correct index (reparent + position in one drop).
- AC-005: Dropping a folder **into itself or into one of its own descendants** is rejected - the
  tree is unchanged (no cycle).
- AC-006: Dropping a node **onto/into a database** as if it were a container is rejected - a database
  is not a folder; only `before`/`after` a database (reorder) is allowed, never `inside`.
- AC-007: **Tables are not draggable** and are not valid drop targets for reparenting (a table row
  exposes no drag handle / `inside` a table is impossible).
- AC-008: A move **persists**: after a drop, the dehydrated workspace reflects the new parent/order,
  so a reload restores the reorganized tree.
- AC-009: During a drag, the target shows a **drop indicator**: a 1px primary inset ring when the
  drop is `inside` a folder, and a 1px primary line between rows when the drop is `before`/`after`.
  The dragged row dims (`opacity-50`). (Visual rule, asserted via class/test-id where unit-testable;
  exact pixels per design.md.)
- AC-010: Hovering a **collapsed folder** during a drag auto-expands it so its children (or its
  empty-drop zone) become reachable drop targets.
- AC-011: An **empty folder** exposes a dedicated "Drop here" zone while a drag is active, so a node
  can be dropped inside it even though it has no child rows.
- AC-012: A drop whose computed target equals the node's current location is a **no-op** (no tree
  change, no spurious persist).

## User test cases

- TC-001 (happy path, reparent): Given root has database `scratch_db` and folder `staging`; drag
  `scratch_db` onto the middle of `staging` -> `scratch_db` becomes a child of `staging`, gone from
  root. Maps to: AC-001, AC-008.
- TC-002 (happy path, folder into folder): Given folders `prod` and `staging` at root; drag
  `staging` into `prod` -> `prod.children` contains `staging` with its `admin_db` subtree intact.
  Maps to: AC-002.
- TC-003 (reorder siblings): Given root order `[prod, staging, scratch_db]`; drag `scratch_db`
  before `prod` -> root order `[scratch_db, prod, staging]`. Maps to: AC-003.
- TC-004 (reparent + position): Given `app_db` nested in `prod/team` and folder `staging` at root;
  drag `app_db` to after `admin_db` inside `staging` -> `app_db` is the last child of `staging`,
  removed from `team`. Maps to: AC-004.
- TC-005 (cycle rejected): Drag folder `prod` into its descendant folder `team` -> tree unchanged.
  Maps to: AC-005.
- TC-006 (database is not a container): Drag `staging` onto the middle of database `scratch_db` ->
  the only legal projection is reorder (before/after), never `inside`; no reparent into the
  database. Maps to: AC-006.
- TC-007 (table not draggable): A table leaf has no drag affordance and cannot be a reparent target.
  Maps to: AC-007.
- TC-008 (empty folder): Given an empty folder; while dragging a database, a "Drop here" zone
  appears inside the empty folder and dropping on it nests the database. Maps to: AC-011.
- TC-009 (no-op): Drag a node and drop it exactly where it already sits -> no tree change. Maps to:
  AC-012.

## UI States

| State            | Behavior                                                                     |
| ---------------- | ---------------------------------------------------------------------------- |
| Idle             | Tree renders as today; rows draggable (database/folder), tables static.      |
| Dragging         | Dragged row dims (`opacity-50`); a drag overlay shows the node name.         |
| Drop inside      | Target folder row gets a 1px primary inset ring.                             |
| Drop before/after| A 1px primary line renders above/below the target row at its indent.         |
| Empty folder drop| Expanded empty folder shows a "Drop here" zone, ringed when hovered.         |
| Drop rejected    | Illegal target (cycle, into-database, onto-self) -> no indicator commit / no move. |

### ASCII wireframes

Idle (today):

```
+-----------------------------+
| purequery                        |
+-----------------------------+
| v prod                      |
|   v team                    |
|       app_db                |
| v staging                   |
|     admin_db                |
|   scratch_db                |
+-----------------------------+
```

Dragging `scratch_db`, hovering middle of `staging` (drop = inside):

```
+-----------------------------+
| purequery                        |
+-----------------------------+
| v prod                      |
|   v team                    |
|       app_db                |
| #v staging################# |   <- 1px primary inset ring (drop inside)
|     admin_db                |
|   scratch_db   (opacity-50) |   <- dragged row dimmed
+-----------------------------+
        [scratch_db]              <- drag overlay follows pointer
```

Dragging `scratch_db`, hovering top edge of `prod` (drop = before):

```
+-----------------------------+
| purequery                        |
+-----------------------------+
| --------------------------- |   <- 1px primary line (drop before prod)
| v prod                      |
|   v team                    |
|       app_db                |
| v staging                   |
|     admin_db                |
|   scratch_db   (opacity-50) |
+-----------------------------+
```

Dragging into an empty (expanded) folder:

```
+-----------------------------+
| purequery                        |
+-----------------------------+
| v reports                   |
|   #Drop here################|   <- empty-drop zone, ringed when hovered
| v staging                   |
|     admin_db   (opacity-50) |
+-----------------------------+
```

## Data model

No model change. Reuses existing types in [src/lib/workspace/model.ts](../../../src/lib/workspace/model.ts):

- `TreeNode = FolderNode | DatabaseNode | TableNode`
- `FolderNode.children: TreeNode[]` (recursive nesting already supported)

New library types (mirroring requi), in new files under `src/lib/workspace/`:

- `MoveTarget = { parentId: string | null; index: number }`
- `NodeLocation = { parentId: string | null; index: number }`
- `DropPosition = "before" | "after" | "inside"`
- `DropIndicator = { overId: string; position: DropPosition }`

Move semantics (`moveNode(tree, dragId, target)`):

1. find dragged node; unknown -> return tree.
2. if `target.parentId` set: parent must exist AND be a folder (rejects into-database, AC-006); and
   dragged must not contain the target parent (rejects cycle, AC-005).
3. remove dragged from current location, insert at `target.parentId`/`target.index` (index clamped).

Persistence: unchanged. `setTree` triggers the existing `onTreeChange` effect; tables are
ephemeral and stripped by `dehydrate`, so a reparented database persists by config + new position.

## Edge cases

- E-1: Drop a folder into its own descendant -> rejected, tree unchanged (AC-005).
- E-2: Drop a folder into itself (`parentId === dragId`) -> rejected.
- E-3: Drop onto a database with `inside` projection -> projection never yields `inside` for a
  database (only collapsed/expanded **folders** get an inside band); a stray inside target is
  rejected by `moveNode` anyway.
- E-4: Same-parent reorder, dragging a node **down** past a later sibling -> index compensated for
  the post-removal shift (drop one slot lower), mirroring requi's `dropTarget`.
- E-5: Out-of-range index -> clamped to the end of the target siblings.
- E-6: Drop exactly where the node already is -> no-op, no persist (AC-012).
- E-7: Dragging a connected database does not drop/abort its live connection or tables - the
  connection map is keyed by node id, which is unchanged by a move.
- E-8: Table rows are not draggable and the empty-zone / inside logic never targets a table.
- E-9: Drag canceled (Esc / dropped on nothing) -> indicator cleared, no move.

## Dependencies

- New runtime dep: `@dnd-kit/core` (^6.3.1, same as requi). `@dnd-kit/sortable`/`utilities` are NOT
  needed for the tree (requi uses those only for its tab strip).
- No backend / Rust change. No Tauri command change.
- Reuses existing `WorkspaceProvider` store, `onTreeChange` persistence, `ScrollArea`, context menus.
