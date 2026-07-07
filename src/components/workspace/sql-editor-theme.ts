import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { EditorTokenName } from "@/lib/settings/settings";

// The 9 editor syntax/chrome tokens, as resolved color strings for the active mode (i.e.
// effectiveColors[effectiveMode].editor). Theme-driven so the SQL editor recolors with the app.
export type EditorColors = Record<EditorTokenName, string>;

// Chrome (background, gutter, active line) stays transparent so the editor inherits the SQL pane
// behind it. Syntax coloring is the deliberate editor-internal exception to the app's monochrome
// chrome rule (see docs/design.md) - tokens genuinely need hue to read. The `caret`/`selection`/
// `gutter` come from the theme tokens; the autocomplete popup follows the app CSS vars so it tracks
// the app theme too.
export function makeSqlChrome(colors: EditorColors, isDark: boolean) {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "transparent",
        height: "100%",
      },
      ".cm-content": { caretColor: colors.caret },
      "&.cm-focused": { outline: "none" },
      "&.cm-focused .cm-cursor": { borderLeftColor: colors.caret },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        { backgroundColor: colors.selection },
      ".cm-activeLine": { backgroundColor: "transparent" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: colors.gutter,
        border: "none",
      },
      // Keep the fold gutter clickable but never show its arrows (incl. on hover), mirroring
      // requi - the JSON view folds, but the chevron chrome stays hidden.
      ".cm-foldGutter .cm-gutterElement": { opacity: "0" },
      ".cm-scroller": {
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
      },
      // Autocomplete popup follows the app theme tokens, not CodeMirror's default chrome:
      // popover background/foreground, 1px border-border, no rounded corners (design.md), accent
      // for the selected row, primary for the matched characters.
      ".cm-tooltip.cm-tooltip-autocomplete": {
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        border: "1px solid var(--border)",
        borderRadius: "0",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
      },
      ".cm-tooltip-autocomplete > ul": {
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
      },
      ".cm-tooltip-autocomplete > ul > li": {
        color: "var(--popover-foreground)",
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "var(--accent)",
        color: "var(--accent-foreground)",
      },
      ".cm-completionLabel": { color: "inherit" },
      ".cm-completionMatchedText": {
        color: "var(--primary)",
        textDecoration: "none",
        fontWeight: "600",
      },
      ".cm-completionIcon": { color: "var(--muted-foreground)", opacity: "1" },
      ".cm-completionDetail": {
        color: "var(--muted-foreground)",
        fontStyle: "normal",
      },
    },
    { dark: isDark },
  );
}

export function makeSqlHighlight(colors: EditorColors) {
  return HighlightStyle.define([
    { tag: [t.keyword, t.bool, t.null], color: colors.keyword },
    { tag: [t.string, t.special(t.string)], color: colors.string },
    { tag: [t.number], color: colors.number },
    { tag: [t.typeName, t.tagName], color: colors.property },
    { tag: [t.operator, t.punctuation], color: colors.gutter },
    { tag: [t.comment], color: colors.comment, fontStyle: "italic" },
    { tag: [t.invalid], color: colors.invalid },
  ]);
}
