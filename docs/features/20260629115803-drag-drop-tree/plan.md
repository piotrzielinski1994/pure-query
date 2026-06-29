# Plan - Drag-and-drop tree reorganization

## Approach

Port requi's tree DnD almost verbatim, adapting node kinds. requi's tree uses only
`@dnd-kit/core` + two pure libs (`tree-locate.ts`, `move.ts`) + a tiny context (`tree-dnd.tsx`) +
draggable/droppable rows. dbui already has the recursive tree, immutable helpers, folders, and
auto-persistence; the gap is purely DnD wiring.

Key adaptation vs requi:
- requi node kinds: `folder | request`. dbui: `folder | database | table`.
- **Draggable**: `folder` and `database` rows. **Not draggable**: `table` leaves.
- **`inside` (reparent) target**: only `folder` (never `database`, never `table`).
- **`before`/`after` (reorder)**: any sibling row that is a persisted node (folder/database). A
  table row is never a drop target (tables only appear under a connected database and aren't
  reordered).
- Drop cues: **strict 1px** per design.md - `h-px`/`w-px` primary line for before/after, 1px inset
  primary ring for inside (NOT requi's 2px line).

No domain modeling (pz-ddd/pz-archetypes): pure UI plumbing on an existing tree model.

## Files

### Create

1. `src/lib/workspace/tree-edit.ts` - pure tree mutation primitives (extracted/mirrored from
   requi + dbui's inline helpers): `findNode`, `containsId`, `removeNode`, `insertNode`. (dbui's
   `workspace-context.tsx` already has private `findNode`/`removeNodeFromTree`; the new file is the
   shared, tested home so `moveNode` and the context can both use it. Keep `removeNodeFromTree`
   delegating to it or replace usage - minimal, no behavior change.)
2. `src/lib/workspace/move.ts` - `MoveTarget` type + `moveNode(tree, dragId, target)` with the
   folder-parent + cycle guards (AC-005, AC-006).
3. `src/lib/workspace/tree-locate.ts` - `NodeLocation`, `locateNode`, `findNode` (re-export),
   `DropPosition`, `emptyZoneId`/`parseEmptyZoneId`, `projectDropPosition`, `dropTarget`.
4. `src/components/workspace/tree-dnd.tsx` - `DropPosition`/`DropIndicator`/`TreeDndState` types,
   `TreeDndProvider`, `useTreeDnd`.
5. `src/lib/workspace/__tests__/move.test.ts` - mirror requi's move tests, dbui node kinds.
6. `src/lib/workspace/__tests__/tree-locate.test.ts` - mirror requi's tree-locate tests.
7. `src/lib/workspace/__tests__/tree-edit.test.ts` - cover the primitives (insert clamp, remove,
   containsId).

### Modify

8. `src/components/workspace/workspace-context.tsx`
   - Add `moveNode: (dragId: string, target: MoveTarget) => void` to `WorkspaceContextValue`.
   - Implement: `setTree((current) => moveNode(current, dragId, target))` (auto-persists via the
     existing `onTreeChange` effect).
   - Optionally route the private `findNode`/`removeNodeFromTree` through the new `tree-edit.ts`
     to avoid duplication (no behavior change).
   - Add `toggleExpand`-based auto-expand support is already present (`toggleExpand` exists);
     no new expand API needed - the sidebar uses `expandedIds` + `toggleExpand`.

9. `src/components/workspace/sidebar-tree.tsx`
   - Wrap the tree in `<DndContext>` (PointerSensor, `pointerWithin`, 5px activation) +
     `<TreeDndProvider>` + `<DragOverlay>`, mirroring requi's `SidebarTree`.
   - `handleDragStart/Over/End/Cancel`: compute `DropIndicator` via `projectDropPosition`, auto-
     expand hovered collapsed folders (AC-010), commit via `moveNode` on end with the no-op guard
     (AC-012). Keep the existing `DeleteRequestProvider`/`DeleteNodeDialog`/empty-state.
   - Use dbui's `expandedIds`/`toggleExpand` (requi's `expandedFolderIds`/`toggleFolder` equivalent).

10. `src/components/workspace/tree-row.tsx`
    - Add `useRowDnd(id)` hook (draggable + droppable + indicator flags), as requi.
    - `FolderRow`: become draggable + droppable; render before/after `DropLine`, `inside` ring,
      and an `EmptyDropZone` when expanded + empty + a drag is active.
    - `DatabaseRow`: become draggable + droppable for **before/after only** (no inside ring). Keep
      the chevron toggle button (its `onClick` stops propagation; pointer-down for drag must not
      hijack the chevron - guard like requi keeps listeners on the row, chevron stops propagation).
    - `TableRow`: unchanged - NOT draggable, NOT a drop target.
    - `DropLine`: 1px (`h-px bg-primary`), per design.md strict-1px decision (requi uses `h-0.5`).
    - Ring: `ring-1 ring-inset ring-primary` (1px, matches requi and design.md).

11. `package.json` - add `@dnd-kit/core` (^6.3.1). Run `npm install`.

## Execution order (TDD)

1. **RED**: spawn test-writer subagent -> writes failing tests for `move.ts`, `tree-locate.ts`,
   `tree-edit.ts` (pure, from ACs/TCs), plus a `sidebar-tree` DnD interaction test if jsdom allows
   (dnd-kit pointer simulation is flaky in jsdom; the pure libs carry the behavioral ACs, the
   component test asserts the wiring/affordances that ARE testable: draggable attrs present on
   folder/database rows, absent on table rows; indicator classes). Confirm red.
2. **GREEN**: `npm install @dnd-kit/core`; implement `tree-edit.ts`, `move.ts`, `tree-locate.ts`,
   `tree-dnd.tsx`; add `moveNode` to context; wire `sidebar-tree.tsx` + `tree-row.tsx`. One commit
   per AC cluster.
3. **REFACTOR**: dedupe `findNode`/`removeNodeFromTree` against `tree-edit.ts`; tighten types
   (no `any`, guard functions for array narrowing); keep tests green.

## Acceptance verification

| AC      | Test                                                                              |
| ------- | --------------------------------------------------------------------------------- |
| AC-001  | `move.test.ts` reparent database into folder; sidebar-tree drop test if feasible. |
| AC-002  | `move.test.ts` folder-with-subtree into folder.                                   |
| AC-003  | `move.test.ts` reorder siblings (root + nested).                                  |
| AC-004  | `tree-locate.test.ts` dropTarget before/after across parents; `move.test.ts`.     |
| AC-005  | `move.test.ts` into-descendant + into-self rejected.                              |
| AC-006  | `move.test.ts` parent-is-database rejected; `tree-locate` inside-database null.   |
| AC-007  | `sidebar-tree`/`tree-row` test: table row has no draggable attribute.             |
| AC-008  | `workspace-tree-persistence`-style test: dehydrate reflects new location.         |
| AC-009  | `tree-row` test: `drop-line`/ring classes appear for active indicator.            |
| AC-010  | `sidebar-tree` test: collapsed folder auto-expands on drag-over (if jsdom allows). |
| AC-011  | `tree-row`/`tree-locate` test: empty-zone id + EmptyDropZone rendering.           |
| AC-012  | `tree-locate`/`sidebar-tree` test: same-location target -> no-op.                 |

## Risks

- jsdom can't faithfully simulate `@dnd-kit` pointer drags: mitigate by putting all behavioral ACs
  in the pure libs (`move`/`tree-locate`), and limiting component tests to statically-assertable
  wiring (draggable attrs, indicator classes via the dnd context). Note any AC that's pure-lib-only.
- Chevron vs drag conflict on the database row: the chevron button must `stopPropagation` on
  pointerdown so a click toggles tables instead of starting a drag (requi pattern). Covered by
  keeping existing chevron tests green.
- design.md divider rule: drop cues are transient and 1px (decided), so they don't violate the
  1px-divider / no-thick-border rule.

## AC traceability (implemented)

| AC      | Proving test(s)                                                                       |
| ------- | ------------------------------------------------------------------------------------- |
| AC-001  | move.test.ts "should move a database into a folder…" + "should remove the node from its old parent…" |
| AC-002  | move.test.ts "should move a folder with its whole subtree intact…"                    |
| AC-003  | move.test.ts "should put the third child first…", "should reorder siblings inside a folder", "should evaluate the index after removal…" |
| AC-004  | move.test.ts "should land at the target index…across parents"; tree-locate.test.ts before/after-across-parents |
| AC-005  | move.test.ts into-self + into-descendant; tree-move-persistence.test.tsx "…unchanged when moveNode attempts a cycle" |
| AC-006  | move.test.ts parent-is-database + db-into-db; tree-locate.test.ts inside-database null + "never project inside for a database row"; tree-drop-cue.test.tsx "should not ring a database row…" |
| AC-007  | move.test.ts parent-is-table; tree-locate.test.ts inside-table null; tree-dnd-wiring.test.tsx "should not expose a drag affordance on a table leaf row" |
| AC-008  | tree-move-persistence.test.tsx "should fire onTreeChange with the reparented node…" + "should reparent the node in the tree…" |
| AC-009  | tree-drop-cue.test.tsx ring (inside), 1px drop-line (before/after, not h-0.5), no-indicator-no-cue; tree-locate.test.ts projectDropPosition bands. (opacity-50 dim = dnd-kit isDragging, jsdom-untestable.) |
| AC-010  | sidebar-tree.tsx handleDragOver auto-expand (jsdom can't drive pointer drag; wiring code-verified). |
| AC-011  | tree-locate.test.ts empty-zone id round-trip + dropTarget empty-zone; tree-drop-cue.test.tsx "Drop here" zone render + ring-on-hover + hidden-when-idle |
| AC-012  | move.test.ts "value-equal tree if dropped at own location"; sidebar-tree.tsx handleDragEnd same-location guard |

## Decision Log

| Date       | Decision | Rationale |
| ---------- | -------- | --------- |
| 2026-06-29 | Databases + folders draggable; tables static. | Tables are ephemeral live-catalog leaves, not persisted-movable nodes; moving them has no durable meaning. |
| 2026-06-29 | Full reparent + sibling reorder (mirror requi). | Free since we port requi's `dropTarget`/`projectDropPosition`; matches IDE expectation. |
| 2026-06-29 | Drop cues strict 1px (`h-px` line, `ring-1` inset). | design.md 1px-divider / no-thick-border rule; requi's 2px `h-0.5` line would violate it. |
| 2026-06-29 | Neither pz-ddd nor pz-archetypes apply. | Pure UI plumbing on an existing tree model; no new domain boundary or recurring domain shape. |
| 2026-06-29 | New dep `@dnd-kit/core` only (not sortable/utilities). | requi uses sortable only for its tab strip; the tree needs core's draggable/droppable + DndContext. |

## Doc drift (pre-commit)

- README: add `@dnd-kit/core` only if README lists deps (check); likely a CLAUDE/design note instead.
- design.md: add a short "Drag-and-drop drop cues" entry (1px primary line / 1px inset ring,
  transient, not a structural divider) so the next UI change doesn't "fix" it.
- CLAUDE.md: note the tree DnD lives in `tree-locate.ts`/`move.ts`/`tree-dnd.tsx` mirroring requi,
  and that tables are non-draggable, if it isn't obvious from the files.
