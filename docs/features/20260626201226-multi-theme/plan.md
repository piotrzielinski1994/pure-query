# Multi-theme support - PLAN

Spec: `docs/features/20260626201226-multi-theme/spec.md`.
Branch: `20260626201226-multi-theme`.

Coverage threshold: none (no `thresholds` in vitest.config / package.json).

## Chosen approach

Mirror requi's theme subsystem file-for-file, adapting only where purequery's surrounding infra differs.
requi decomposes "multi-theme" into **mode** (`light|dark|system`) + **sparse per-mode color
overrides** (raw-JSON edited, zod-schema validated), persisted across `settings.json` (mode) +
`theme.json` (colors), applied to the DOM as `.dark` class + inline CSS vars, and fed to CodeMirror
via theme-token-driven extension factories. purequery already has the dormant `:root`/`.dark` CSS blocks,
so Part A is mostly wiring; Part B brings the JSON-editor + zod + active-editor-save infra purequery
lacks.

Domain gate (recorded in Decision Log): neither `pz-ddd` nor `pz-archetypes` applies - UI + settings
persistence, no domain aggregate/consistency boundary or accounting/inventory/etc archetype.

**Build order: settings/types -> theme pure helpers -> theme context+DOM -> persistence split ->
editor-theme reactive -> JSON-editor+zod -> active-editor seam -> UI surfaces (settings + palette +
shortcut).** Each layer testable in isolation.

### New npm deps (via npm)

`zod` (v4: `z.toJSONSchema`, `z.partialRecord`), `@codemirror/lang-json`, `@codemirror/lint`,
`codemirror-json-schema`, `@types/json-schema` (dev). Pin to the versions requi resolved
(zod 4.x, codemirror-json-schema 0.8.x, lang-json 6.0.x, lint 6.9.x).

## File changes

### Slice A - settings types + tolerant merge (AC-003, AC-008)

`src/lib/settings/settings.ts`:
- Add theme types verbatim from requi: `ThemeMode`, `AppTokenName` (18), `EditorTokenName` (9),
  `ThemeColorOverrides`, `ThemeColors`, `FullThemeColorOverrides`, `FullThemeColors`,
  `ThemeSettings`.
- `Settings` gains `theme: ThemeSettings`. `DEFAULT_SETTINGS.theme = { mode: "system", colors:
  emptyThemeColors() }`. Keep `version: 1` (tolerant merge handles a missing `theme`).
- Add `emptyThemeColors()`, `isThemeMode`, `APP_TOKEN_NAMES`/`EDITOR_TOKEN_NAMES` sets,
  `mergeTokenMap`, `mergeOverrides`, `mergeThemeColors`, `mergeTheme`; call `theme: mergeTheme(...)`
  in `mergeSettings`.
- Update the two hard-coded `DEFAULT_SETTINGS` `toEqual` shape assertions in `settings.test.ts`.

### Slice B - theme pure helpers (AC-002, AC-005, AC-006, AC-007, AC-010)

New `src/lib/theme/`:
- `theme-defaults.ts` - `APP_TOKENS`, `EDITOR_TOKENS`, `DEFAULT_THEME_COLORS` (exact oklch values
  from requi, app tokens mirroring purequery `index.css` `:root`/`.dark`).
- `effective-mode.ts` - `resolveEffectiveMode(mode, prefersDark)`.
- `cycle-mode.ts` - `cycleThemeMode` (light->dark->system).
- `toggle-message.ts` - `themeToggleMessage(mode, prefersDark)`.
- `apply-vars.ts` - `applyThemeVars(el, mode, overrides)` (inline `--token` vars, app tokens only).
- `overrides.ts` - `applyDefaults`, `diffOverrides` (sparse<->full).

### Slice C - theme context + DOM apply (AC-001, AC-002, AC-005, AC-007)

`src/lib/theme/theme-context.tsx` - port requi verbatim: reads `useSettings()`, `ThemeProvider`
toggles `.dark` + `applyThemeVars` in `useLayoutEffect`, matchMedia listener, `useTheme` +
`useThemeOptional`. Mount in `src/routes/__root.tsx` **inside** `SettingsProvider`, **outside**
`WorkspaceStoreProvider`.

### Slice D - persistence split settings.json / theme.json (AC-003, AC-006, AC-008)

`src/lib/settings/tauri-store.ts` - add a second `LazyStore("theme.json")`; on load read+merge
colors from `theme.json` (key `colors`), mode stays in `settings.json`; on save strip colors out of
the settings payload + write them to `theme.json`. Mirror requi's `load`/`save`/`persist`.
`src/lib/settings/settings-context.tsx` - add `saveThemeMode`, `saveThemeColors` via an `update()`
mutator (refactor `persist` into a functional `update` like requi, keeping `persist` for callers).

### Slice E - SQL editor theme-reactive (AC-009)

`src/components/workspace/sql-editor-theme.ts` - convert the hardcoded `darculaChrome`/
`darculaHighlight` into **factories** `makeSqlChrome(colors: EditorColors, isDark)` /
`makeSqlHighlight(colors)` taking the 9 editor tokens (keep the autocomplete-popup-uses-app-vars
trick). Add a `useSqlEditorExtensions()`-style read: `sql-editor.tsx` calls `useThemeOptional()`,
derives `effectiveColors[effectiveMode].editor` + `isDark`, and adds them to the extensions
`useMemo` deps **keyed on the color VALUES + mode** (stringified) so CodeMirror reconfigures in place
(document preserved), never remounts.

### Slice F - zod schema + JSON-schema + schema-intellisense (AC-004, AC-012)

- `src/lib/config-schema/zod-schemas.ts` - `themeColorsSchema` (`.strict()`, `z.partialRecord` over
  the token enums, `.describe()` hovers).
- `src/lib/config-schema/json-schemas.ts` - `themeColorsJsonSchema = toJsonSchema(themeColorsSchema)`
  via `z.toJSONSchema(..., {target:"draft-7"})`, throw-guarded to `undefined`.
- `src/components/workspace/schema-intellisense.ts` - `makeSchemaExtensions(schema, colors, isDark)`
  (json() + empty-tolerant syntax linter (errors) + schema lint downgraded to warnings + completion
  + hover + themed chrome/highlight). Port requi.
- `src/components/workspace/editor-theme.ts` - the shared JSON-editor factories
  (`makeChrome`/`makeHighlight`/`makeEditorExtensions`/`emptyTolerantJsonLinter`/`EditorColors`).
  (Adapted: purequery's SQL editor already has its own chrome; this is the JSON-editor variant.)

### Slice G - active-editor save seam (1:1 port, load-bearing subset) (AC-012)

`src/components/workspace/workspace-context.tsx` - port requi's seam verbatim in shape:
- Types `EditorScope = { kind: "config"; id: string } | { kind: "env" }`, `ActiveEditor = { scope,
  isDirty, canSave, save, commitToTree? }`.
- State `activeEditor` + `registerActiveEditor(editor|null)` (stable useCallback).
- Derived `editorDirty`, `popupCanSave`; actions `saveActive`, `saveActiveEditor`.
- `commitToTree` kept on the type (no-op for the theme editor, as in requi) but the close-confirm /
  PendingClose / dirtyRequestIds machinery is NOT ported - purequery has no request/config/tab-close
  consumers, and requi's own theme editor uses a no-op commit and the Mod+S `saveActive` path only.
  (Recorded as a deliberate scope decision.)
- `RawJsonEditor` (new `src/components/workspace/config-editor.tsx`, theme-only shape): `behaviorRef`
  + re-seed-on-`saved`-change + register-descriptor effects, exactly requi's shape; `Mod-s` reaches
  `saveActive` via the existing `workspace-layout.tsx` keydown (add an `s`+meta branch -> a new
  context `saveActive`), and an explicit **Save** button calls `saveActiveEditor`.

### Slice H - UI surfaces (AC-001, AC-004, AC-010, AC-011)

- `src/components/settings/theme-section.tsx` - port requi: mode button group (Light/Dark/System) +
  `ColorEditor` (seeds `RawJsonEditor` with `applyDefaults(...)`, saves `diffOverrides(...)`,
  `themeColorsJsonSchema`). New `src/components/settings/` dir.
- `src/routes/settings.tsx` - replace the stub body with `<ThemeSection />`; add a nav link to
  `/settings` (a palette command "Open settings" or a sidebar/header affordance - minimal).
- `src/components/workspace/command-registry.ts` + `command-palette.tsx` - add `toggle-theme` id +
  entry + handler (calls a theme cycle: `setMode(cycleThemeMode(mode))` + toast).
- `src/components/workspace/workspace-layout.tsx` - add `Cmd/Ctrl+Shift+L` branch -> theme cycle +
  toast; add Mod+S branch -> `saveActive`.

## Edge cases handled

(see spec §6) matchMedia absent -> light; invalid JSON -> save blocked; unknown token -> merged out;
mode isolation; default-edit drops from diff; no ThemeProvider -> default light; editor recolor
preserves doc (value-keyed memo).

## Tests (RED first, one+ per AC)

- `settings.test.ts` (+) - mergeTheme: default theme, unknown-token drop, non-string drop, bad shape,
  mode validation. [AC-003/008]
- `src/lib/theme/__tests__/` - `effective-mode`, `cycle-mode`, `toggle-message`, `overrides`
  (applyDefaults/diffOverrides incl. reset-drops), `apply-vars` (set/clear), `theme-defaults`
  (every token present both modes). [AC-006/007/010]
- `theme-context.test.tsx` - `.dark` toggle on mode (AC-001), live matchMedia flip (AC-002), inline
  `--primary` set when light+overridden (AC-005), cleared when dark effective + light-only (AC-007).
- `settings-context-theme.test.tsx` - `saveThemeMode`/`saveThemeColors` write through + persist.
  [AC-003]
- `tauri-store-theme.test.ts` - mode->settings.json, colors->theme.json split; load recombines;
  malformed theme.json tolerated. [AC-003/006/008]
- `theme-section.test.tsx` - mode buttons call saveThemeMode (AC-001); JSON editor seeds full set
  (AC-004); save persists sparse diff (AC-006); invalid JSON blocks save (AC-012).
- `sql-editor-theme.test.ts` + `sql-editor-theme-follow.test.tsx` - factories emit the given token
  colors (sentinel oklch presence); editor recolors on mode swap, document preserved. [AC-009]
- `toggle-theme-shortcut.test.tsx` - Cmd+Shift+L cycles + toast (AC-010); palette "Toggle theme"
  (AC-011).

## Risks

- **CodeMirror global injected styles**: theme/highlight rules are deduped global `<style>` in
  document.head -> tests assert PRESENCE of unique sentinel oklch values, never absence. (requi
  gotcha; mirror it.)
- **zod v4 API**: `z.toJSONSchema`/`z.partialRecord` are v4-only; ensure `zod@^4` installs cleanly.
- **Editor remount on recolor**: must memoize on color VALUES+mode, not object identity, or the SQL
  doc resets - covered by AC-009 test.
- **Scope creep from porting the full active-editor seam**: mitigated by porting only the
  load-bearing subset (no close-confirm/PendingClose/dirtyRequestIds); recorded in Decision Log.
- **Two hard-coded settings.test.ts shape assertions**: will break on the new `theme` field - update
  them in Slice A.

## Acceptance verification

`npm test` green incl. new suites + untouched ones; `npm run typecheck` clean (no `any`);
`npm run lint` clean; manual: toggle modes, edit a color, reload, confirm persisted + editor
recolors.

## Result (implemented)

Vitest 572 green (54 files), typecheck clean, lint 0 errors (13 pre-existing/accepted react-refresh
warnings, 3 of them from the new theme-context exporting hooks beside the provider), `npm run build`
succeeds. Fresh verifier subagent: PASS on all 12 ACs, all gates, requi-fidelity (split / DOM apply /
reconfigure-not-remount) holds, no design.md violation. Two verifier flags closed post-verify with
RED-proven tests: Mod+S save in the color editor, and HomePage `persistChrome` theme-preservation.

### AC -> test traceability

| AC | Test |
| --- | --- |
| AC-001 | theme-context.test.tsx "should put/NOT put the dark class…if mode is dark/light"; theme-section.test.tsx "should apply dark live…"; effective-mode.test.ts |
| AC-002 | theme-context.test.tsx "should flip the dark class live if the OS preference changes while system" |
| AC-003 | settings-theme.test.ts (mode merge); settings-context-theme.test.tsx (save-through + round-trip); tauri-store-theme.test.ts |
| AC-004 | theme-section-colors.test.tsx "should seed the editor with the full effective color set"; overrides.test.ts |
| AC-005 | theme-context-colors.test.tsx "should set --primary…"; apply-vars.test.ts |
| AC-006 | theme-section-colors.test.tsx "should persist the sparse diff…" + "should drop an override edited back to the default…"; overrides.test.ts |
| AC-007 | theme-context-colors.test.tsx "should NOT set --primary if the effective mode is dark…"; apply-vars.test.ts (clear-on-omit) |
| AC-008 | settings-theme.test.ts + settings-theme-colors.test.ts (tolerant merge, no-throw); tauri-store-theme.test.ts (garbage theme.json) |
| AC-009 | sql-editor-theme-follow.test.tsx "should apply a custom dark editor keyword color…" + "should preserve the open document when the mode flips dark -> light" |
| AC-010 | toggle-theme.test.tsx "should cycle from light to dark…on Ctrl+Shift+L" + "should show a toast…"; cycle-mode.test.ts; toggle-message.test.ts |
| AC-011 | toggle-theme.test.tsx "should offer a Toggle theme command…" + "should cycle the mode when…selected" |
| AC-012 | theme-section-colors.test.tsx "should block saving if the color JSON is malformed/wrong shape" + "should persist the sparse diff on Cmd/Ctrl+S in the editor" |
| (regression) | home-persist-theme.test.tsx "should keep theme.colors when a chrome toggle (Cmd/Ctrl+B) persists settings" |

### Decision Log

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026-06-26 | Domain gate: neither pz-ddd nor pz-archetypes applies | UI + settings persistence; no domain aggregate/consistency boundary or accounting/inventory/etc archetype |
| 2026-06-26 | Full mirror of requi (mode A + color-override editor B), both UI surfaces | User choice (Full mirror A+B; /settings + palette + shortcut) |
| 2026-06-26 | Persistence split: theme.mode -> settings.json, theme.colors -> theme.json (key "colors") | Mirror requi - a color scheme is device-syncable on its own; tolerant merge drops garbage per-token |
| 2026-06-26 | Did NOT port requi's full active-editor seam (registerActiveEditor / PendingClose / close-confirm) | purequery has no request/config/tab-close consumers; the color editor saves self-contained via a Save button + Mod+S keymap. Same Cmd+S feel, no dead subsystem |
| 2026-06-26 | New deps: zod v4, @codemirror/lang-json, @codemirror/lint, codemirror-json-schema, @types/json-schema | requi's exact JSON-schema-IntelliSense stack; zod v4's built-in z.toJSONSchema (no zod-to-json-schema) |
| 2026-06-26 | vitest.config server.deps.inline: ["codemirror-json-schema"] | The pkg ships ESM with extensionless relative imports Vitest's externalized resolver can't follow (mirror requi's config) |
| 2026-06-26 | HomePage onPersist folds current theme back into chrome writes (persistChrome) | The workspace persists only the UI-chrome slice; without the fold a chrome toggle clobbers theme.colors to default. onPersist typed `Omit<Settings,"theme">` so the omission is explicit |
