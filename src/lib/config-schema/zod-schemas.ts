import { z } from "zod";

// Theme color-override schema. `.strict()` -> unknown keys surface as editor warnings; `.describe()`
// text flows into the JSON-schema hover tooltips. Mirrors the AppTokenName / EditorTokenName unions
// in settings.ts.
const APP_TOKEN_NAMES = [
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
] as const;

const EDITOR_TOKEN_NAMES = [
  "caret",
  "selection",
  "gutter",
  "keyword",
  "string",
  "number",
  "property",
  "comment",
  "invalid",
] as const;

const overridesSchema = z
  .object({
    tokens: z
      .partialRecord(z.enum(APP_TOKEN_NAMES), z.string())
      .describe("App color tokens for this mode."),
    editor: z
      .partialRecord(z.enum(EDITOR_TOKEN_NAMES), z.string())
      .describe("Editor syntax/chrome color tokens for this mode."),
  })
  .strict();

export const themeColorsSchema = z
  .object({
    light: overridesSchema.describe("Color overrides for light mode."),
    dark: overridesSchema.describe("Color overrides for dark mode."),
  })
  .strict();

export type ThemeColorsSchema = z.infer<typeof themeColorsSchema>;
