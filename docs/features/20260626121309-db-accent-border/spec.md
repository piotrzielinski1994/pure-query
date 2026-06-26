# Per-database accent color (border)

## Overview

Let the user assign a per-database **accent color** in the database Settings tab as a
safety/orientation cue ("this is prod -> red, this is test -> blue"). The color **recolors the
existing borders** of the whole workspace shell (sidebar, tabs, inputs, splits, grid) whenever
the active tab belongs to that database - it adds no new border and changes no border width; it
only overrides the `--border`/`--input` theme tokens. A table inherits its parent database's
accent. The value is persisted per database in `workspace.json`.

Presets: **None** (default border, no override), **Green**, **Blue**, **Red**. Plus a native
color picker + hex field for any custom color.

## Acceptance Criteria

- AC-001: The database Settings tab shows an **Accent color** control: a swatch row
  (None / Green / Blue / Red), a native `<input type="color">`, and a hex text field.
- AC-002: Picking a preset or custom color sets that database's accent; picking **None**
  clears it (back to the default, uncolored border).
- AC-003: The accent color persists per database in `workspace.json` and survives reload.
- AC-004: When the active tab belongs to a colored database, the workspace shell's existing
  **borders are recolored** to the accent (the `--border`/`--input` tokens are overridden on the
  shell root); no new border is added and no border width changes.
- AC-005: When the active tab belongs to an uncolored database (accent null), the shell keeps the
  default border tokens (no override).
- AC-006: Switching the active tab from a colored to an uncolored database clears the override.
- AC-007: A **table inherits** its parent database's accent: with a table tab active, the shell
  borders recolor to the parent database's accent.
- AC-008: A missing or malformed `accentColor` in persisted JSON is ignored - no override,
  no crash; the rest of the database loads normally.

## Test Cases

- TC-001 (happy, AC-001/002): open Settings -> click **Red** swatch -> the database's accent
  becomes red; the hex field shows the red hex. Maps to: AC-001, AC-002.
- TC-002 (clear, AC-002): a red database -> click **None** -> accent cleared (null). AC-002.
- TC-003 (custom, AC-001/002): type/pick a custom hex -> accent becomes that hex. AC-001/002.
- TC-004 (persist, AC-003): set accent -> `dehydrate(hydrate(...))` round-trips the color;
  `mergeWorkspace` keeps a valid `accentColor`. AC-003.
- TC-005/006 (recolor, AC-004/005/006): active tab = colored database -> shell `--border` token
  overridden to the accent; switch to an uncolored database -> override cleared. AC-004/005/006.
- TC-008 (inherit, AC-007): active tab = a table whose parent database is colored -> shell
  `--border` token overridden to the parent's accent. AC-007.
- TC-009 (garbage, AC-008/E-2): `accentColor` = number / non-hex string -> dropped on merge,
  database otherwise intact. AC-008.

## UI States

| State              | Behavior                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| No accent (None)   | Default border tokens; shell borders keep their normal color.           |
| Preset accent      | Swatch highlighted; shell `--border`/`--input` recolored to the preset. |
| Custom accent      | Hex field + picker show the value; shell borders recolored to that hex. |
| Faint accent       | An `#rrggbbaa` hex with a low alpha pair -> borders read as a quiet tint. |
| Table of colored DB| Active table tab recolors the shell borders to the parent's accent.     |

## Data model

Add an optional presentation field to the database node + its persisted form:

- `DatabaseNodeBase.accentColor: string | null` (runtime) - lowercase `#rrggbb` or `#rrggbbaa`
  hex (the optional alpha pair is the user-chosen border opacity) or null.
- `PersistedNetworkDatabase` / `PersistedSqliteDatabase` gain optional `accentColor?: string`.
- `mergeDatabase` accepts `accentColor` only if it is a `#rrggbb`/`#rrggbbaa` hex string; else omits.
- `hydrate` -> `accentColor: node.accentColor ?? null`; `dehydrate` emits it only when non-null.
- Engine-agnostic: postgres / mysql / sqlite all support it.

## Edge cases

- E-1: `accentColor` absent -> no override (null).
- E-2: `accentColor` not a `#rrggbb`/`#rrggbbaa` hex (number, `"red"`, `"#ABC"`, `"#12345"`,
  `"#1234567"`) -> dropped.
- E-3: **None** selected -> stored as null; no frame/bar/tint.
- E-4: custom hex via native picker -> stored lowercase + rendered everywhere.
- E-5: sqlite / mysql databases also support the accent.
- E-6: table whose parent database has no accent -> default (no frame).
- E-7: round-trip `hydrate`/`dehydrate` keeps the accent.

## Dependencies

None. No new packages (native `<input type="color">`). Persistence reuses the existing
`workspace.json` store and merge/hydrate/dehydrate pipeline.
