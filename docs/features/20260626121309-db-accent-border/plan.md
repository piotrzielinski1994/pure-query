# Plan - Per-database accent color (border)

## Approach

Reuse the existing `workspace.json` persistence pipeline (mirrors requi's per-node JSON config).
The accent is **one optional presentation field** on the database node (`accentColor: string | null`),
threaded through merge/hydrate/dehydrate exactly like the existing connection fields.

Rendering does NOT add any new border/bar/frame and does NOT change any border width. It only
**recolors the existing borders**: every divider/input/grid border resolves from the `--border`/
`--input` theme tokens (see `@layer base * { border-color }` in src/index.css), so when the active
tab belongs to a colored database the workspace shell root overrides those two tokens to the
accent hex - tinting the whole shell at once. The accent for the active tab is resolved via a
single context helper `accentColorFor(nodeId)` (a **table inherits its parent database's** accent).

This is a deliberate, documented exception to design.md's "theme tokens not hard-coded colors"
rule, scoped to this feature; the 1px-divider/no-thickening rule still holds (we only recolor).

Presets: None = `null`, Green = `#16a34a`, Blue = `#2563eb`, Red = `#dc2626`.

## Files to modify

1. **`src/lib/workspace/model.ts`** - add `accentColor: string | null` to `DatabaseNodeBase`.
2. **`src/lib/workspace/workspace.ts`**:
   - `PersistedNetworkDatabase` / `PersistedSqliteDatabase` gain `accentColor?: string`.
   - `mergeDatabase`: accept `accentColor` only when it is a `#rrggbb` hex string (regex
     `^#[0-9a-f]{6}$` case-insensitive, stored lowercased); else omit.
   - `hydrate`: `accentColor: node.accentColor ?? null` on the runtime node.
   - `dehydrate`: include `accentColor` only when non-null.
3. **`src/components/workspace/workspace-context.tsx`**:
   - `newDatabaseNode` + `applyDatabaseConfig` carry `accentColor` (both reconstruct nodes - must
     not drop it).
   - new action `setDatabaseAccent(id, color: string | null)` (tree map, like `renameNode`).
   - new helper `accentColorFor(id): string | null` - database -> its `accentColor`; table ->
     parent database's `accentColor` (via `databaseIdByTableId` + `nodesById`).
   - expose both on the context type + value + deps.
4. **`src/components/workspace/settings-tab.tsx`** - **Accent color** field: swatch row
   (None / Green / Blue / Red, each `aria-pressed` when active), native `<input type="color">`,
   hex `<Input>`. Reads `node.accentColor`; writes via `setDatabaseAccent`. No rounded corners.
5. **`src/components/workspace/workspace-layout.tsx`** - override `--border` + `--input` CSS vars
   (inline `style` on the `ResizablePanelGroup` shell root) to `accentColorFor(activeTabId)` when
   set; this recolors every existing border in the shell. No new border, no width change.
6. **`docs/design.md`** - document the per-DB accent exception (token recolor, scoped).
9. **`README.md`** - one clause in the Settings blurb noting the accent color.

## Edge cases handled

- E-1 absent -> null (hydrate default). E-2 non-hex -> dropped in `mergeDatabase`.
- E-3 None -> null, no render. E-4 custom hex -> lowercased, rendered everywhere.
- E-5 sqlite/mysql -> field is engine-agnostic on `DatabaseNodeBase`. E-6 uncolored table -> null.
- E-7 round-trip -> dehydrate emits, merge re-accepts.

## Tests (red first)

- `workspace.test.ts` (lib): merge keeps valid `accentColor`; drops number / `"red"` / `#abc` /
  `#12345`; hydrate defaults null; dehydrate omits null + emits non-null; full round-trip. (TC-004, TC-009)
- `settings-tab.test.tsx`: click **Red** -> swatch pressed + hex field shows `#dc2626` (TC-001);
  click **None** on a red db -> cleared (TC-002); type custom hex -> reflected (TC-003).
- new `accent-border.test.tsx`: active colored db -> shell `--border` token = accent; uncolored ->
  no override; switching to uncolored clears it (TC-006); active table of colored db -> shell
  `--border` token = parent's accent (TC-008).

## Execution order

model -> workspace.ts (persistence, red/green) -> context (action+helper) -> settings UI ->
shell token override -> docs. One commit per AC group.

## Acceptance verification

Each AC has >=1 behavior test above. Gates: `npm run lint`, `npm run typecheck`, `npm test`.
Verifier subagent (fresh context) confirms AC->test mapping + gates.

### Result (verified)

Gates: typecheck clean, lint 0 errors (10 pre-existing warnings), `vitest run` 433 passed.

| AC     | Proving test                                                                                  |
| ------ | --------------------------------------------------------------------------------------------- |
| AC-001 | settings-tab.test.tsx "should render None / Green / Blue / Red accent swatch buttons" + "...native color input and a hex text field" |
| AC-002 | settings-tab.test.tsx "should set the accent to red..." + "should clear the accent when None is clicked..." |
| AC-003 | workspace.test.ts "should preserve a set accentColor through a hydrate/dehydrate round trip"   |
| AC-004 | accent-border.test.tsx "should override the --border token with the accent when the active tab is a colored database" |
| AC-005 | accent-border.test.tsx "should not override the --border token when the active tab is an uncolored database" |
| AC-006 | accent-border.test.tsx "should clear the --border override when the active tab switches to an uncolored database" |
| AC-007 | accent-border.test.tsx "should override the --border token with the parent database's accent when a table is active" |
| AC-008 | workspace.test.ts malformed-accent tests (number / "red" / #abc / #12345 / #1234567 dropped, db kept) |

### Decision log

| Date       | Decision | Rationale |
| ---------- | -------- | --------- |
| 2026-06-26 | Domain gate: neither pz-ddd nor pz-archetypes invoked | Pure UI + a persisted presentation field; no domain model, aggregate, consistency boundary, nor accounting/inventory/etc. shape. |
| 2026-06-26 | Accent recolors existing borders via `--border`/`--input` token override on the shell root, NOT new bars/frames | User requirement: change the color of existing borders, keep widths; "all borders", not just content. Overriding the theme tokens recolors the whole shell at once with zero new elements. (Superseded an initial wrong impl that added 2px bar/tint/frame.) |
| 2026-06-26 | Hex field synced via render-phase "adjust state on prop change", not useEffect | Lint rule forbids synchronous setState in an effect (cascading renders). |
| 2026-06-26 | Opacity is user-controlled via an `#rrggbbaa` alpha pair, not a forced blend | User wanted to decide how faint the borders are, not have 45% imposed. Accept 6- or 8-digit hex, use verbatim; native picker edits RGB only and preserves the typed alpha. Input/select borders moved off `border-input` to `border-border` so the `--border` override never tints input backgrounds (which read `--input`). |
