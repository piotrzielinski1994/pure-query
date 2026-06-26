# Spec: Multi-theme support (light / dark / system + per-mode color overrides)

**Version:** 0.1.0
**Created:** 2026-06-26
**Status:** Implemented

## 1. Overview

dbui ships a fixed dark-ish palette: `src/index.css` defines both a `:root` (light) and a `.dark`
token block, but nothing ever toggles `.dark`, so the `.dark` block and every `dark:` Tailwind
variant are dead, and the SQL editor is hardcoded to a Darcula theme. There is no way to choose an
appearance.

This feature mirrors the sibling **`requi`** app's theming exactly (full feature, both parts):

- **Part A - mode**: a 3-value appearance `light | dark | system`. `system` follows the OS
  `prefers-color-scheme` and live-updates. The chosen mode toggles the `.dark` class on `<html>`.
- **Part B - per-mode color overrides**: the user can override any of the 18 app color tokens + 9
  editor syntax tokens, **independently for light and dark**, edited as **raw JSON** (CodeMirror,
  zod-derived JSON-schema validated). Overrides are stored **sparsely** (only diffs from the
  built-in defaults) and applied as inline CSS vars on `<html>` for the active mode.

Both surfaces ship: a **Theme section on the global `/settings` route** (mode buttons + JSON color
editor) **and** a **command-palette "Toggle theme" command + `Cmd/Ctrl+Shift+L` shortcut** (cycle
mode, with a toast).

There is no registry of named palettes - "themes" = mode + the two (light/dark) override maps,
exactly as in requi (named presets are out of scope / YAGNI).

### User Story

As a dbui user, I want to switch the app between light, dark, and following my OS, and optionally
tweak individual colors per mode, so the client matches my environment and preferences - and so the
SQL editor recolors to match.

### Approved decisions

- **Full mirror of requi (A + B), both UI surfaces** (`/settings` Theme section + palette command +
  shortcut). (User choice.)
- **Mode**: `light | dark | system`; `system` resolves via `prefers-color-scheme`, live.
- **Color overrides**: sparse per-mode maps `{ light: {tokens, editor}, dark: {tokens, editor} }`,
  edited as raw JSON seeded with the full effective set, persisted as the sparse diff.
- **Persistence split (mirror requi)**: `theme.mode` -> `settings.json`; `theme.colors` ->
  separate **`theme.json`** (key `colors`). Tolerant merge drops unknown tokens / non-string values.
- **DOM application**: `.dark` class on `<html>` for the effective mode + inline `--<token>` CSS vars
  for the active mode's overridden app tokens only (defaults fall through to `:root`/`.dark`).
- **Editor recolor**: the SQL CodeMirror editor's chrome + syntax become **theme-token-driven**
  (factories `makeSqlChrome(colors,isDark)` / `makeSqlHighlight(colors)`), recomputed from the theme
  context; editor tokens flow through CodeMirror extensions, NOT the DOM.
- **Deviation from requi (flagged)**: requi's raw-JSON editor saves via its `registerActiveEditor`
  active-editor descriptor (`Mod+S`/close-confirm), a subsystem dbui does not have. dbui's color
  editor will save via a **self-contained `Mod/Ctrl+S` keymap inside the JSON editor** (same
  keyboard feel, no descriptor port) plus an explicit **Save** button. Invalid JSON blocks the save.

### Approved layout (ASCII)

`/settings` route - Theme section:

```
+-- Settings --------------------------------------------------+
|  Theme                                                       |
|  Choose the app appearance, or follow your OS preference.    |
|                                                              |
|  [ Light ][ Dark ][ System ]        <- flush button group    |
|                                                              |
|  Customize colors per mode. Edit a value to override it, or  |
|  set it back to the default to clear it. Cmd/Ctrl+S to save. |
|  +--------------------------------------------------+ [Save] |
|  | 1  {                                             |        |
|  | 2    "light": {                                  |        |
|  | 3      "tokens": { "primary": "oklch(...)" },    |        |
|  | 4      "editor": { "keyword": "oklch(...)" }     |        |
|  | 5    },                                          |        |
|  | 6    "dark": { "tokens": {}, "editor": {} }      |        |
|  | 7  }                                             |        |
|  +--------------------------------------------------+        |
+--------------------------------------------------------------+
```

Toggle toast (Cmd/Ctrl+Shift+L or palette "Toggle theme"):

```
+---------------------------+
|  Theme: Dark              |
+---------------------------+      (System resolves: "Theme: System (dark)")
```

## 2. Acceptance Criteria

- **AC-001**: Selecting a mode (Light / Dark / System) applies it immediately - the effective mode
  toggles the `.dark` class on `<html>` (dark -> present, light -> absent).
- **AC-002**: In `system` mode the effective appearance follows the OS `prefers-color-scheme` and
  **live-updates** when the OS preference changes (no reload).
- **AC-003**: The chosen mode **persists** (to `settings.json`) and is restored on reload.
- **AC-004**: The Theme section renders a raw-JSON color editor seeded with the **full effective
  color set** (defaults with the user's sparse overrides layered on).
- **AC-005**: Saving an override for the active mode applies it as an inline `--<token>` CSS var on
  `<html>` (e.g. a light `primary` override sets `--primary` while effective mode is light).
- **AC-006**: Color overrides persist **sparsely** to `theme.json` - only tokens differing from the
  built-in default survive; a token edited back to its default **drops out** of the stored diff.
- **AC-007**: A **light-only** override is NOT applied while the effective mode is dark (the
  `--token` var stays cleared), and vice-versa.
- **AC-008**: A malformed `theme.json` (unknown token key, non-string value, wrong shape, non-JSON)
  is **tolerantly merged** on load - bad entries dropped, valid ones kept, no crash.
- **AC-009**: The SQL CodeMirror editor **recolors live** (chrome + syntax) when the mode or colors
  change, with the editor document preserved (no remount/content loss).
- **AC-010**: `Cmd/Ctrl+Shift+L` **cycles** the mode `light -> dark -> system -> light` and shows a
  toast naming the new mode (`Theme: Dark`; for system `Theme: System (dark|light)`).
- **AC-011**: A command-palette **"Toggle theme"** entry cycles the mode (same effect as the
  shortcut).
- **AC-012**: Invalid JSON in the color editor **blocks the save** (no persist) and the editor shows
  a syntax-error indication; valid JSON with unknown tokens saves (unknowns dropped on the merge).

## 3. User Test Cases

- **TC-001** (mode apply): default `system` -> click **Dark** -> `<html>` has `.dark`; click
  **Light** -> `.dark` absent. Maps to: AC-001.
- **TC-002** (system live): mode `system`, OS light -> no `.dark`; OS flips to dark (matchMedia
  change) -> `.dark` appears, no reload. Maps to: AC-002.
- **TC-003** (mode persist): set Dark -> store.save called with `theme.mode==="dark"`; reload (fresh
  provider from same store) -> Dark active. Maps to: AC-003.
- **TC-004** (seed): overrides `{light:{tokens:{primary:X}}}` -> editor text contains the full set
  with `primary: X` under light and defaults elsewhere. Maps to: AC-004.
- **TC-005** (apply var): effective light, save light `primary` override -> `html.style --primary`
  equals the override. Maps to: AC-005.
- **TC-006** (sparse diff): edit `primary` then set it back to the default value + save -> stored
  `theme.colors.light.tokens` has no `primary`. Maps to: AC-006.
- **TC-007** (mode isolation): light-only `primary` override, effective mode dark -> `--primary` var
  is empty (cleared). Maps to: AC-007.
- **TC-008** (tolerant load): `theme.json` colors with a bogus token `{light:{tokens:{nope:1,
  primary:"oklch(..)"}}}` -> merged keeps `primary`, drops `nope`/non-string, no throw. Maps to:
  AC-008.
- **TC-009** (editor recolor): SQL editor mounted, switch mode dark->light -> the live EditorView's
  injected theme shows the light caret/keyword colors; the document text is unchanged. Maps to:
  AC-009.
- **TC-010** (shortcut cycle): press `Cmd/Ctrl+Shift+L` from `light` -> mode `dark` + toast
  `Theme: Dark`. Maps to: AC-010.
- **TC-011** (palette): open palette -> "Toggle theme" -> mode cycles. Maps to: AC-011.
- **TC-012** (invalid blocks save): type `{ not json` -> save is blocked (saveThemeColors not
  called), error shown. Maps to: AC-012.

## 4. UI States

| State                | Behavior                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| Light mode           | `<html>` no `.dark`; `:root` tokens; light editor syntax                |
| Dark mode            | `<html>` `.dark`; `.dark` tokens; dark (Darcula-oklch) editor syntax    |
| System mode          | Follows OS; flips live on `prefers-color-scheme` change                 |
| Override active      | Inline `--token` var on `<html>` for the active mode's overridden tokens |
| Override inactive    | A mode's override is cleared while the other mode is effective          |
| Color JSON invalid   | Save blocked; syntax error underline; no persist                        |
| theme.json malformed | Tolerant merge: drop bad tokens, keep valid, fall back to defaults       |
| No ThemeProvider     | Editors fall back to built-in light defaults (tests/isolated subtrees)   |

## 5. Data model

New theme types in `src/lib/settings/settings.ts` (mirror requi verbatim):

```ts
export type ThemeMode = "light" | "dark" | "system";
export type AppTokenName = "background" | ... | "ring";          // 18 tokens
export type EditorTokenName = "caret" | ... | "invalid";          // 9 tokens
export type ThemeColorOverrides = {
  tokens: Partial<Record<AppTokenName, string>>;
  editor: Partial<Record<EditorTokenName, string>>;
};
export type ThemeColors = { light: ThemeColorOverrides; dark: ThemeColorOverrides };
export type FullThemeColorOverrides = { tokens: Record<AppTokenName,string>; editor: Record<EditorTokenName,string> };
export type FullThemeColors = { light: FullThemeColorOverrides; dark: FullThemeColorOverrides };
export type ThemeSettings = { mode: ThemeMode; colors: ThemeColors };
// Settings gains: theme: ThemeSettings;   version stays 1 (tolerant merge handles absence)
```

`DEFAULT_SETTINGS.theme = { mode: "system", colors: emptyThemeColors() }`.

Persisted shapes: `settings.json` -> `{ ..., "theme": { "mode": "dark" } }` (colors zeroed out here);
`theme.json` -> `{ "colors": { "light": { "tokens": {...}, "editor": {...} }, "dark": {...} } }`.

The built-in defaults (the exact oklch values, mirroring `index.css` `:root`/`.dark` + requi's
editor hues) live in `src/lib/theme/theme-defaults.ts` (`APP_TOKENS`, `EDITOR_TOKENS`,
`DEFAULT_THEME_COLORS`).

## 6. Edge cases

- `window.matchMedia` absent (jsdom) -> `getPrefersDark()` returns false -> effective light. (AC-002 test stubs matchMedia.)
- Invalid JSON in editor -> parse returns null -> Save disabled / no persist (AC-012).
- Unknown token key / non-string value in `theme.json` -> dropped by tolerant merge (AC-008).
- Light-only override while dark effective -> var cleared, not applied (AC-007).
- Token edited back to default -> dropped from sparse diff (AC-006).
- No ThemeProvider (isolated editor / tests) -> `useThemeOptional` returns null -> default light colors.
- Editor recolor must NOT remount CodeMirror (preserve doc) - memoize extensions on color VALUES + mode (AC-009).

## 7. Dependencies (new npm, via npm)

- `zod` (v4 - provides `z.toJSONSchema` + `z.partialRecord`)
- `@codemirror/lang-json`, `@codemirror/lint`, `codemirror-json-schema`
- `@types/json-schema` (dev) for the `JSONSchema7` type
- Existing reused: `@uiw/react-codemirror`, `@codemirror/state/view/autocomplete`, `sonner` toast,
  `@tauri-apps/plugin-store`, TanStack Router (`/settings` route already stubbed).
