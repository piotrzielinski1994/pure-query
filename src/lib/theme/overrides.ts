import type {
  AppTokenName,
  EditorTokenName,
  ThemeColorOverrides,
  ThemeColors,
} from "@/lib/settings/settings";
import { APP_TOKENS, EDITOR_TOKENS } from "@/lib/theme/theme-defaults";

const APP_TOKEN_SET = new Set<string>(APP_TOKENS);
const EDITOR_TOKEN_SET = new Set<string>(EDITOR_TOKENS);

// Whitespace-insensitive compare so a re-formatted-but-equal oklch string is
// treated as equal (and therefore dropped from the diff = a per-token reset).
function sameColor(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
}

function mergeSection(
  overrides: ThemeColorOverrides,
  defaults: ThemeColorOverrides,
): ThemeColorOverrides {
  return {
    tokens: { ...defaults.tokens, ...overrides.tokens },
    editor: { ...defaults.editor, ...overrides.editor },
  };
}

// The full effective set: every default token, with the sparse overrides layered
// on top. Used to seed the editor and to apply to the DOM.
export function applyDefaults(
  overrides: ThemeColors,
  defaults: ThemeColors,
): ThemeColors {
  return {
    light: mergeSection(overrides.light, defaults.light),
    dark: mergeSection(overrides.dark, defaults.dark),
  };
}

function diffSection(
  edited: ThemeColorOverrides,
  defaults: ThemeColorOverrides,
): ThemeColorOverrides {
  const tokens: Partial<Record<AppTokenName, string>> = {};
  for (const [key, value] of Object.entries(edited.tokens)) {
    const name = key as AppTokenName;
    if (
      APP_TOKEN_SET.has(key) &&
      value !== undefined &&
      !sameColor(value, defaults.tokens[name])
    ) {
      tokens[name] = value;
    }
  }
  const editor: Partial<Record<EditorTokenName, string>> = {};
  for (const [key, value] of Object.entries(edited.editor)) {
    const name = key as EditorTokenName;
    if (
      EDITOR_TOKEN_SET.has(key) &&
      value !== undefined &&
      !sameColor(value, defaults.editor[name])
    ) {
      editor[name] = value;
    }
  }
  return { tokens, editor };
}

// The sparse diff: only entries differing from the built-in default survive, so
// an un-customized token tracks the default and a token edited back to default
// drops out.
export function diffOverrides(
  edited: ThemeColors,
  defaults: ThemeColors,
): ThemeColors {
  return {
    light: diffSection(edited.light, defaults.light),
    dark: diffSection(edited.dark, defaults.dark),
  };
}
