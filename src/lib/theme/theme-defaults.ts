import type {
  AppTokenName,
  EditorTokenName,
  FullThemeColors,
} from "@/lib/settings/settings";

export const APP_TOKENS: AppTokenName[] = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
];

export const EDITOR_TOKENS: EditorTokenName[] = [
  "caret",
  "selection",
  "gutter",
  "keyword",
  "string",
  "number",
  "property",
  "comment",
  "invalid",
];

// Built-in (non-sparse) defaults. App-token values mirror index.css `:root`
// (light) and `.dark` (dark) verbatim - this table is the single TS source of
// truth so the color editor can seed swatches and "reset" has a target. Keep it
// in sync with index.css.
export const DEFAULT_THEME_COLORS: FullThemeColors = {
  light: {
    tokens: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      "card-foreground": "oklch(0.145 0 0)",
      popover: "oklch(1 0 0)",
      "popover-foreground": "oklch(0.145 0 0)",
      primary: "oklch(0.205 0 0)",
      "primary-foreground": "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      "secondary-foreground": "oklch(0.205 0 0)",
      muted: "oklch(0.97 0 0)",
      "muted-foreground": "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      "accent-foreground": "oklch(0.205 0 0)",
      destructive: "oklch(0.577 0.245 27.325)",
      border: "oklch(0.922 0 0)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.708 0 0)",
    },
    // Light editor scheme: readable syntax hues on the light pane (the chrome
    // background stays transparent, inheriting the pane).
    editor: {
      caret: "oklch(0.205 0 0)",
      selection: "oklch(0.85 0.05 250)",
      gutter: "oklch(0.6 0 0)",
      keyword: "oklch(0.5 0.18 30)",
      string: "oklch(0.5 0.13 145)",
      number: "oklch(0.5 0.15 250)",
      property: "oklch(0.45 0.18 300)",
      comment: "oklch(0.6 0 0)",
      invalid: "oklch(0.55 0.22 25)",
    },
  },
  dark: {
    tokens: {
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.205 0 0)",
      "card-foreground": "oklch(0.985 0 0)",
      popover: "oklch(0.205 0 0)",
      "popover-foreground": "oklch(0.985 0 0)",
      primary: "oklch(0.922 0 0)",
      "primary-foreground": "oklch(0.205 0 0)",
      secondary: "oklch(0.269 0 0)",
      "secondary-foreground": "oklch(0.985 0 0)",
      muted: "oklch(0.269 0 0)",
      "muted-foreground": "oklch(0.708 0 0)",
      accent: "oklch(0.269 0 0)",
      "accent-foreground": "oklch(0.985 0 0)",
      destructive: "oklch(0.704 0.191 22.216)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.556 0 0)",
    },
    // Dark editor scheme: the JetBrains Darcula hues the SQL editor shipped
    // hardcoded, expressed as oklch so they round-trip through the same store.
    editor: {
      caret: "oklch(0.78 0 0)",
      selection: "oklch(0.4 0.08 260)",
      gutter: "oklch(0.46 0 0)",
      keyword: "oklch(0.68 0.13 55)",
      string: "oklch(0.66 0.09 135)",
      number: "oklch(0.66 0.1 245)",
      property: "oklch(0.62 0.12 305)",
      comment: "oklch(0.6 0 0)",
      invalid: "oklch(0.55 0.18 25)",
    },
  },
};
