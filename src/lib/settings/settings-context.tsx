import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsStore,
  type ThemeColors,
  type ThemeMode,
} from "@/lib/settings/settings";

type SettingsContextValue = {
  settings: Settings;
  persist: (next: Settings) => void;
  saveThemeMode: (mode: ThemeMode) => void;
  saveThemeColors: (colors: ThemeColors) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

type SettingsProviderProps = {
  store: SettingsStore;
  children: ReactNode;
};

export function SettingsProvider({ store, children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let isMounted = true;
    store.load().then((loaded) => {
      if (isMounted) {
        setSettings(loaded);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [store]);

  const persist = useCallback(
    (next: Settings) => {
      setSettings(next);
      store.save(next);
    },
    [store],
  );

  const update = useCallback(
    (mutate: (base: Settings) => Settings) => {
      setSettings((current) => {
        const next = mutate(current ?? DEFAULT_SETTINGS);
        store.save(next);
        return next;
      });
    },
    [store],
  );

  const saveThemeMode = useCallback(
    (mode: ThemeMode) =>
      update((base) => ({ ...base, theme: { ...base.theme, mode } })),
    [update],
  );

  const saveThemeColors = useCallback(
    (colors: ThemeColors) =>
      update((base) => ({ ...base, theme: { ...base.theme, colors } })),
    [update],
  );

  const value = useMemo<SettingsContextValue | null>(
    () =>
      settings === null
        ? null
        : { settings, persist, saveThemeMode, saveThemeColors },
    [settings, persist, saveThemeMode, saveThemeColors],
  );

  if (value === null) {
    return null;
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return value;
}
