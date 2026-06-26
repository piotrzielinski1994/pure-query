import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { QueryWrapper } from "@/test/query-wrapper";
import { SettingsProvider } from "@/lib/settings/settings-context";
import { ThemeProvider } from "@/lib/theme/theme-context";
import { WorkspaceStoreProvider } from "@/lib/workspace/workspace-store-context";
import { createInMemorySettingsStore } from "@/lib/settings/in-memory-store";
import { createInMemoryWorkspaceStore } from "@/lib/workspace/in-memory-store";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type ThemeColors,
} from "@/lib/settings/settings";
import { HomePage } from "@/routes/index";

// Regression: HomePage's onPersist (persistChrome) must FOLD the current theme back into every
// UI-chrome write, so toggling the sidebar/console doesn't clobber theme.colors to a theme-less
// (default) object. Without the fold, a chrome toggle would drop the user's saved color overrides.

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }));

function stubMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  // @ts-expect-error - drop the stub between tests.
  delete window.matchMedia;
});

const colors: ThemeColors = {
  light: { tokens: { primary: "oklch(0.55 0.22 27)" }, editor: {} },
  dark: { tokens: {}, editor: {} },
};

describe("HomePage chrome persist preserves theme", () => {
  it("should keep theme.colors when a chrome toggle (Cmd/Ctrl+B) persists settings", async () => {
    stubMatchMedia();
    const seeded: Settings = {
      ...DEFAULT_SETTINGS,
      theme: { mode: "light", colors },
    };
    const inner = createInMemorySettingsStore(seeded);
    const saved: Settings[] = [];
    const settingsStore = {
      load: inner.load,
      save: (s: Settings) => {
        saved.push(s);
        return inner.save(s);
      },
    };
    const workspaceStore = createInMemoryWorkspaceStore();

    render(
      <QueryWrapper>
        <SettingsProvider store={settingsStore}>
          <ThemeProvider>
            <WorkspaceStoreProvider store={workspaceStore}>
              <HomePage />
            </WorkspaceStoreProvider>
          </ThemeProvider>
        </SettingsProvider>
      </QueryWrapper>,
    );

    await screen.findByRole("region", { name: /console/i });

    // Toggle the sidebar (a chrome change) - this fires onPersist -> persistChrome -> store.save.
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    await waitFor(() => {
      const last = saved.at(-1);
      expect(last).toBeDefined();
      // the chrome change landed AND the theme colors survived the write.
      expect(last!.theme.colors.light.tokens.primary).toBe("oklch(0.55 0.22 27)");
    });
  });
});
