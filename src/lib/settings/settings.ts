import type { SplitOrientation } from "@/components/workspace/workspace-context";

export type PanelLayout = Record<string, number>;

export type PanelGroupKey = "workspace" | "main" | "sql";

export type Settings = {
  version: 1;
  sidebarHidden: boolean;
  consoleHidden: boolean;
  splitOrientation: SplitOrientation;
  layouts: Partial<Record<PanelGroupKey, PanelLayout>>;
  expandedIds: string[];
  openTabIds: string[];
  activeTabId: string | null;
};

export type SettingsStore = {
  load: () => Promise<Settings>;
  save: (settings: Settings) => Promise<void>;
};

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  sidebarHidden: false,
  consoleHidden: false,
  splitOrientation: "horizontal",
  layouts: {},
  expandedIds: [],
  openTabIds: [],
  activeTabId: null,
};

const GROUP_KEYS: PanelGroupKey[] = ["workspace", "main", "sql"];

const SPLIT_ORIENTATIONS = new Set<SplitOrientation>([
  "horizontal",
  "vertical",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function isPanelLayout(value: unknown): value is PanelLayout {
  return (
    isRecord(value) &&
    Object.values(value).every((size) => typeof size === "number")
  );
}

function mergeLayouts(value: unknown): Settings["layouts"] {
  if (!isRecord(value)) {
    return {};
  }
  return GROUP_KEYS.reduce<Settings["layouts"]>((acc, key) => {
    const layout = value[key];
    return isPanelLayout(layout) ? { ...acc, [key]: layout } : acc;
  }, {});
}

function mergeSplitOrientation(
  value: unknown,
  fallback: SplitOrientation,
): SplitOrientation {
  return typeof value === "string" && SPLIT_ORIENTATIONS.has(value as SplitOrientation)
    ? (value as SplitOrientation)
    : fallback;
}

export function mergeSettings(defaults: Settings, partial: unknown): Settings {
  if (!isRecord(partial)) {
    return defaults;
  }
  const openTabIds = isStringArray(partial.openTabIds);
  const activeTabId =
    typeof partial.activeTabId === "string" &&
    openTabIds.includes(partial.activeTabId)
      ? partial.activeTabId
      : null;
  return {
    version: defaults.version,
    sidebarHidden:
      typeof partial.sidebarHidden === "boolean"
        ? partial.sidebarHidden
        : defaults.sidebarHidden,
    consoleHidden:
      typeof partial.consoleHidden === "boolean"
        ? partial.consoleHidden
        : defaults.consoleHidden,
    splitOrientation: mergeSplitOrientation(
      partial.splitOrientation,
      defaults.splitOrientation,
    ),
    layouts: mergeLayouts(partial.layouts),
    expandedIds: isStringArray(partial.expandedIds),
    openTabIds,
    activeTabId,
  };
}
