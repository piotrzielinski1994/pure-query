import type { ThemeMode } from "@/lib/settings/settings";

export type EffectiveMode = "light" | "dark";

// The effective mode is what actually gets applied to the DOM. It equals the
// chosen mode unless the mode is "system", in which case it follows the OS
// prefers-color-scheme flag.
export function resolveEffectiveMode(
  mode: ThemeMode,
  prefersDark: boolean,
): EffectiveMode {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }
  return mode;
}
